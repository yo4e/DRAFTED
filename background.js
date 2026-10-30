import {
  DEFAULT_SETTINGS,
  eligibleFutureMinutesToday,
  isDateActive,
  isDateExcluded,
  isValidTargetUrl,
  localDateKey,
  matchesAllowedUrl,
  nextLocalMidnight,
  normalizeSettings,
  selectRandomUnique,
} from "./lib/core.js";
import { matchesTargetUrl } from "./lib/target.js";

const AMBUSH_PREFIX = "drafted:ambush:";
const MIDNIGHT_ALARM = "drafted:midnight";
const TAB_RETURN_RETRY_MS = 100;
const TAB_RETURN_MAX_RETRY_MS = 2_000;
let reopenInProgress = false;
let keystrokeChain = Promise.resolve();
let tabReturnChain = Promise.resolve();
let tabReturnTimer;
let tabReturnGeneration = 0;

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") {
    const { settings } = await chrome.storage.local.get("settings");
    if (!settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    await chrome.runtime.openOptionsPage();
  }
  await reconcileTodaySchedule();
});

chrome.runtime.onStartup.addListener(() => {
  reconcileTodaySchedule();
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === MIDNIGHT_ALARM) {
    reconcileTodaySchedule({ forceNewDay: true });
    return;
  }
  if (alarm.name.startsWith(AMBUSH_PREFIX)) {
    handleAmbushAlarm(alarm).catch(console.error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return undefined;

  if (message.type === "KEYSTROKE") {
    keystrokeChain = keystrokeChain.then(() => handleKeystroke(sender)).catch(console.error);
    return undefined;
  }

  if (message.type === "DRAFTED_READY") {
    handleContentReady(sender).catch(console.error);
    return undefined;
  }

  if (message.type === "SETTINGS_CHANGED") {
    reconcileAfterSettingsChange().then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "TEST_DRAFT_NOW") {
    startTestDraft().then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "EMERGENCY_EXIT") {
    endCurrentSession(sender).catch(console.error);
    return undefined;
  }

  return undefined;
});

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  const session = await getActiveSession();
  if (!session || windowId !== session.windowId || tabId === session.tabId) return;

  cancelTabReturn();
  queueTabReturn(session, tabReturnGeneration);
});

function cancelTabReturn() {
  clearTimeout(tabReturnTimer);
  tabReturnTimer = undefined;
  tabReturnGeneration += 1;
}

function queueTabReturn(session, generation, failureDelay = TAB_RETURN_RETRY_MS) {
  // Coalesce rapid activations and never overlap Chrome tab-edit requests.
  tabReturnChain = tabReturnChain
    .then(() => returnToDraftedTab(session, generation, failureDelay))
    .catch(console.error);
}

function isSameSession(session, expected) {
  return session && session.startedAt === expected.startedAt
    && session.tabId === expected.tabId && session.windowId === expected.windowId;
}

async function returnToDraftedTab(expected, generation, failureDelay) {
  if (generation !== tabReturnGeneration) return;
  let delay = TAB_RETURN_RETRY_MS;
  let nextFailureDelay = TAB_RETURN_RETRY_MS;
  try {
    if (!isSameSession(await getActiveSession(), expected)) return;
    const draftedTab = await chrome.tabs.get(expected.tabId);
    const [activeTab] = await chrome.tabs.query({ active: true, windowId: expected.windowId });
    const session = await getActiveSession();
    if (generation !== tabReturnGeneration || !isSameSession(session, expected)) return;
    // Recheck the current destination, not the tab from an earlier click. A
    // detached manuscript must not pull the writer into another window.
    if (draftedTab.windowId !== session.windowId || !activeTab || activeTab.id === session.tabId) return;
    if (matchesAllowedUrl(activeTab.pendingUrl || activeTab.url || "", session.allowedUrls ?? [])) return;
    await chrome.tabs.update(session.tabId, { active: true });
    const latest = await getActiveSession();
    if (generation !== tabReturnGeneration || !isSameSession(latest, expected)) return;
    await safeSendToTab(latest.tabId, { type: "SHOW_WARNING", remaining: latest.remaining });
  } catch (error) {
    // Chrome temporarily rejects tab edits while the tab strip is held or
    // dragged. Back off prolonged contention without giving up on a long hold.
    if (!String(error?.message ?? error).includes("Tabs cannot be edited right now")) {
      console.warn("DRAFTED could not reactivate drafted tab", error);
      return;
    }
    delay = failureDelay;
    nextFailureDelay = Math.min(failureDelay * 2, TAB_RETURN_MAX_RETRY_MS);
  }
  if (generation === tabReturnGeneration) {
    // Also verify once after success in case another activation raced the edit.
    tabReturnTimer = setTimeout(() => queueTabReturn(expected, generation, nextFailureDelay), delay);
  }
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const session = await getActiveSession();
  if (!session || session.tabId !== tabId || reopenInProgress) return;

  cancelTabReturn();
  reopenInProgress = true;
  try {
    const tab = await chrome.tabs.create({ url: session.targetUrl, active: true });
    const updated = { ...session, tabId: tab.id, windowId: tab.windowId };
    await setActiveSession(updated);
    await tryInject(tab.id);
  } catch (error) {
    console.error("DRAFTED could not reopen drafted tab", error);
  } finally {
    reopenInProgress = false;
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  const session = await getActiveSession();
  if (!session || session.tabId !== tabId) return;
  await tryInject(tabId);
});

async function reconcileAfterSettingsChange() {
  const settings = await getSettings();
  const session = await getActiveSession();
  if (session && (!settings.enabled || settings.targetUrl !== session.targetUrl)) {
    cancelTabReturn();
    await chrome.storage.session.remove("activeSession");
    await safeSendToTab(session.tabId, { type: "SESSION_ENDED" });
  } else if (session) {
    await setActiveSession({ ...session, allowedUrls: settings.allowedUrls });
  }
  await reconcileTodaySchedule();
}

async function endCurrentSession(sender) {
  if (!sender.tab?.id) return;
  const session = await getActiveSession();
  if (!session || sender.tab.id !== session.tabId) return;

  cancelTabReturn();
  await chrome.storage.session.remove("activeSession");
  await safeSendToTab(session.tabId, { type: "SESSION_ENDED" });
}

async function startTestDraft() {
  const settings = await getSettings();
  if (!settings.enabled || !isValidTargetUrl(settings.targetUrl)) {
    return { ok: false, error: "Save a valid target URL and arm DRAFTED first." };
  }
  if (await getActiveSession()) {
    return { ok: false, error: "A drafting session is already active." };
  }
  await startDraftingSession(settings);
  return { ok: true };
}

async function handleAmbushAlarm(alarm) {
  const settings = await getSettings();
  let dailyState = await getDailyState();
  const alarmTime = Number(alarm.name.slice(AMBUSH_PREFIX.length));
  dailyState.pendingTimes = dailyState.pendingTimes.filter((time) => time !== alarmTime);
  await chrome.storage.local.set({ dailyState });

  if (!settings.enabled || !isValidTargetUrl(settings.targetUrl) || !isDateActive(new Date(), settings.activeDays) || isDateExcluded(new Date(), settings.excludedRanges)) {
    await reconcileTodaySchedule();
    return;
  }

  if (await getActiveSession()) {
    await reconcileTodaySchedule();
    return;
  }

  if (await isTargetActiveInFocusedChromeWindow(settings.targetUrl)) {
    dailyState.started += 1;
    await chrome.storage.local.set({ dailyState });
    await reconcileTodaySchedule();
    return;
  }

  dailyState = await getDailyState();
  dailyState.started += 1;
  await chrome.storage.local.set({ dailyState });
  await startDraftingSession(settings);
  await reconcileTodaySchedule();
}

async function startDraftingSession(settings) {
  const tab = await chrome.tabs.create({ url: settings.targetUrl, active: true });
  const session = {
    tabId: tab.id,
    windowId: tab.windowId,
    targetUrl: settings.targetUrl,
    allowedUrls: settings.allowedUrls,
    quota: settings.keystrokeQuota,
    count: 0,
    remaining: settings.keystrokeQuota,
    startedAt: Date.now(),
  };
  await setActiveSession(session);
  await tryInject(tab.id);
}

async function handleContentReady(sender) {
  if (!sender.tab?.id) return;
  const session = await getActiveSession();
  if (!session || sender.tab.id !== session.tabId) return;
  const type = session.count === 0 ? "SHOW_INTRO" : "SHOW_WARNING";
  await safeSendToTab(session.tabId, { type, remaining: session.remaining });
}

async function handleKeystroke(sender) {
  if (!sender.tab?.id) return;
  const session = await getActiveSession();
  if (!session || sender.tab.id !== session.tabId || session.remaining <= 0) return;

  const count = Math.min(session.quota, session.count + 1);
  const remaining = Math.max(0, session.quota - count);
  const updated = { ...session, count, remaining };
  await setActiveSession(updated);

  if (remaining === 0) {
    cancelTabReturn();
    await chrome.storage.session.remove("activeSession");
    await safeSendToTab(session.tabId, { type: "DISCHARGED" });
    return;
  }

  await safeSendToTab(session.tabId, { type: "UPDATE_REMAINING", remaining });
}

async function tryInject(tabId) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId, allFrames: true }, files: ["content.css"] });
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["content.js"] });
  } catch (error) {
    console.warn("DRAFTED injection deferred or unavailable", error);
  }
}

async function reconcileTodaySchedule({ forceNewDay = false } = {}) {
  const settings = await getSettings();
  const now = new Date();
  const today = localDateKey(now);
  let dailyState = await getDailyState();

  if (forceNewDay || dailyState.date !== today) {
    dailyState = { date: today, started: 0, pendingTimes: [] };
  } else {
    const maxPending = Math.max(0, settings.ambushesPerDay - dailyState.started);
    dailyState.pendingTimes = dailyState.pendingTimes
      .filter((time) => time > Date.now() && !isDateExcluded(new Date(time), settings.excludedRanges))
      .sort((a, b) => a - b)
      .slice(0, maxPending);
  }

  await clearAmbushAlarms();
  await scheduleMidnightAlarm(now);

  if (!settings.enabled || !isValidTargetUrl(settings.targetUrl) || !isDateActive(now, settings.activeDays)) {
    dailyState.pendingTimes = [];
    await chrome.storage.local.set({ dailyState });
    return;
  }

  const remainingNeeded = Math.max(0, settings.ambushesPerDay - dailyState.started - dailyState.pendingTimes.length);
  if (remainingNeeded > 0) {
    const existing = new Set(dailyState.pendingTimes);
    const candidates = eligibleFutureMinutesToday(now, settings.excludedRanges, settings.activeDays).filter((time) => !existing.has(time));
    dailyState.pendingTimes.push(...selectRandomUnique(candidates, remainingNeeded));
    dailyState.pendingTimes.sort((a, b) => a - b);
  }

  await chrome.storage.local.set({ dailyState });
  await Promise.all(dailyState.pendingTimes.map((when) => chrome.alarms.create(`${AMBUSH_PREFIX}${when}`, { when })));
}

async function scheduleMidnightAlarm(now) {
  await chrome.alarms.clear(MIDNIGHT_ALARM);
  await chrome.alarms.create(MIDNIGHT_ALARM, { when: nextLocalMidnight(now) + 1_000 });
}

async function clearAmbushAlarms() {
  const alarms = await chrome.alarms.getAll();
  await Promise.all(alarms.filter(({ name }) => name.startsWith(AMBUSH_PREFIX)).map(({ name }) => chrome.alarms.clear(name)));
}

async function isTargetActiveInFocusedChromeWindow(targetUrl) {
  try {
    const focusedWindow = await chrome.windows.getLastFocused({ populate: true });
    if (!focusedWindow?.focused) return false;
    const activeTab = focusedWindow.tabs?.find((tab) => tab.active);
    return matchesTargetUrl(activeTab?.url ?? "", targetUrl);
  } catch (error) {
    console.warn("DRAFTED could not inspect the focused manuscript tab", error);
    return false;
  }
}

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return normalizeSettings(settings ?? DEFAULT_SETTINGS);
}

async function getDailyState() {
  const { dailyState } = await chrome.storage.local.get("dailyState");
  if (!dailyState || dailyState.date !== localDateKey(new Date())) {
    return { date: localDateKey(new Date()), started: 0, pendingTimes: [] };
  }
  return {
    date: dailyState.date,
    started: Number.isInteger(dailyState.started) ? Math.max(0, dailyState.started) : 0,
    pendingTimes: Array.isArray(dailyState.pendingTimes) ? dailyState.pendingTimes.filter(Number.isFinite) : [],
  };
}

async function getActiveSession() {
  const { activeSession } = await chrome.storage.session.get("activeSession");
  return activeSession ?? null;
}

async function setActiveSession(activeSession) {
  await chrome.storage.session.set({ activeSession });
}

async function safeSendToTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Content script may be between navigations. onUpdated will reinject it.
  }
}
