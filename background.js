import {
  DEFAULT_SETTINGS,
  eligibleFutureMinutesToday,
  isDateExcluded,
  isValidTargetUrl,
  localDateKey,
  nextLocalMidnight,
  normalizeSettings,
  selectRandomUnique,
} from "./lib/core.js";

const AMBUSH_PREFIX = "drafted:ambush:";
const MIDNIGHT_ALARM = "drafted:midnight";
let correctiveActivation = false;
let reopenInProgress = false;
let keystrokeChain = Promise.resolve();

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

  return undefined;
});

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  if (correctiveActivation) return;
  const session = await getActiveSession();
  if (!session || windowId !== session.windowId || tabId === session.tabId) return;

  correctiveActivation = true;
  try {
    await chrome.tabs.update(session.tabId, { active: true });
    await safeSendToTab(session.tabId, { type: "SHOW_WARNING", remaining: session.remaining });
  } catch (error) {
    console.warn("DRAFTED could not reactivate drafted tab", error);
  } finally {
    setTimeout(() => { correctiveActivation = false; }, 100);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const session = await getActiveSession();
  if (!session || session.tabId !== tabId || reopenInProgress) return;

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
    await chrome.storage.session.remove("activeSession");
    await safeSendToTab(session.tabId, { type: "SESSION_ENDED" });
  }
  await reconcileTodaySchedule();
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

  if (!settings.enabled || !isValidTargetUrl(settings.targetUrl) || isDateExcluded(new Date(), settings.excludedRanges)) {
    await reconcileTodaySchedule();
    return;
  }

  if (await getActiveSession()) {
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

  if (!settings.enabled || !isValidTargetUrl(settings.targetUrl)) {
    dailyState.pendingTimes = [];
    await chrome.storage.local.set({ dailyState });
    return;
  }

  const remainingNeeded = Math.max(0, settings.ambushesPerDay - dailyState.started - dailyState.pendingTimes.length);
  if (remainingNeeded > 0) {
    const existing = new Set(dailyState.pendingTimes);
    const candidates = eligibleFutureMinutesToday(now, settings.excludedRanges).filter((time) => !existing.has(time));
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
