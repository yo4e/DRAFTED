import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { DEFAULT_SETTINGS } from "../lib/core.js";

const DRAG_ERROR = "Tabs cannot be edited right now (user may be dragging a tab).";
let moduleId = 0;

function event() {
  const listeners = [];
  return {
    addListener: (listener) => listeners.push(listener),
    emit: async (...args) => { await Promise.all(listeners.map((listener) => listener(...args))); },
  };
}

async function setup(t) {
  const state = {
    activeSession: {
      tabId: 1, windowId: 10, targetUrl: "https://example.com/draft",
      allowedUrls: ["https://example.com/notes"], quota: 3, count: 0, remaining: 3, startedAt: 1000,
    },
    settings: { ...DEFAULT_SETTINGS, enabled: true, targetUrl: "https://example.com/draft", allowedUrls: ["https://example.com/notes"], keystrokeQuota: 3 },
  };
  const tabs = new Map([
    [1, { id: 1, windowId: 10, url: state.settings.targetUrl, active: true }],
    [2, { id: 2, windowId: 10, url: "https://elsewhere.example/", active: false }],
    [3, { id: 3, windowId: 10, url: "https://example.com/notes", active: false }],
    [4, { id: 4, windowId: 20, url: "https://elsewhere.example/", active: true }],
  ]);
  const timers = new Map();
  const messages = [], edits = [], warnings = [], creates = [];
  let nextTimer = 0;
  const storage = {
    get: async (key) => structuredClone({ [key]: state[key] }),
    set: async (values) => Object.assign(state, structuredClone(values)),
    remove: async (key) => { delete state[key]; },
  };
  const chrome = {
    runtime: { onInstalled: event(), onStartup: event(), onMessage: event(), openOptionsPage: async () => {} },
    action: { onClicked: event() },
    storage: { local: storage, session: storage },
    scripting: { insertCSS: async () => {}, executeScript: async () => {} },
    alarms: { onAlarm: event(), getAll: async () => [], clear: async () => {}, create: async () => {} },
    windows: { getLastFocused: async () => ({ focused: false }) },
    tabs: {
      onActivated: event(), onRemoved: event(), onUpdated: event(),
      get: async (id) => {
        if (!tabs.has(id)) throw new Error(`No tab with id: ${id}.`);
        return { ...tabs.get(id) };
      },
      query: async ({ windowId }) => [...tabs.values()].filter((tab) => tab.windowId === windowId && tab.active).map((tab) => ({ ...tab })),
      update: async (id, options) => {
        edits.push({ id, ...options });
        await activate(id);
        return { ...tabs.get(id) };
      },
      create: async ({ url }) => {
        const tab = { id: tabs.size + 1, windowId: 10, url, active: false };
        creates.push(tab);
        tabs.set(tab.id, tab);
        await activate(tab.id);
        return { ...tab };
      },
      sendMessage: async (id, message) => { messages.push({ id, ...message }); },
    },
  };
  const previousChrome = globalThis.chrome;
  globalThis.chrome = chrome;
  t.after(() => { globalThis.chrome = previousChrome; });
  t.mock.method(globalThis, "setTimeout", (callback, delay) => {
    const id = ++nextTimer;
    timers.set(id, { callback, delay });
    return id;
  });
  t.mock.method(globalThis, "clearTimeout", (id) => timers.delete(id));
  t.mock.method(console, "warn", (...args) => warnings.push(args));
  await import(`../background.js?test=${moduleId++}`);

  async function activate(id) {
    const tab = tabs.get(id);
    for (const candidate of tabs.values()) {
      if (candidate.windowId === tab.windowId) candidate.active = candidate.id === id;
    }
    await chrome.tabs.onActivated.emit({ tabId: id, windowId: tab.windowId });
  }
  async function message(type, tabId = 1) {
    let response;
    await chrome.runtime.onMessage.emit({ type }, { tab: { id: tabId } }, (value) => { response = value; });
    await setImmediate();
    return response;
  }
  async function tick(expectedDelay) {
    const pending = [...timers.values()];
    timers.clear();
    for (const timer of pending) {
      if (expectedDelay !== undefined) assert.equal(timer.delay, expectedDelay);
      assert.ok(timer.delay >= 100 && timer.delay <= 2000);
      timer.callback();
    }
    await setImmediate();
  }
  return { state, tabs, timers, messages, edits, warnings, creates, chrome, activate, message, tick, flush: setImmediate };
}

test("normal switches return once, preserve progress, and do not loop", async (t) => {
  const h = await setup(t);
  await h.activate(2);
  await h.flush();
  assert.equal(h.tabs.get(1).active, true);
  assert.deepEqual(h.edits, [{ id: 1, active: true }]);
  assert.deepEqual(h.messages, [{ id: 1, type: "SHOW_WARNING", remaining: 3 }]);
  await h.tick();
  assert.equal(h.timers.size, 0);
  assert.equal(h.edits.length, 1);
  assert.equal(h.creates.length, 0);
});

test("tab-strip contention retries until a long hold ends, with one timer", async (t) => {
  const h = await setup(t);
  const update = h.chrome.tabs.update;
  let held = true, attempts = 0;
  h.chrome.tabs.update = async (...args) => {
    attempts += 1;
    if (held) throw new Error(DRAG_ERROR);
    return update(...args);
  };
  await h.activate(2);
  await h.flush();
  for (let i = 0; i < 40; i += 1) {
    assert.equal(h.timers.size, 1);
    await h.tick(Math.min(100 * (2 ** i), 2000));
  }
  assert.equal(h.tabs.get(2).active, true);
  assert.equal(h.messages.length, 0);
  held = false;
  await h.tick(2000);
  assert.equal(attempts, 42);
  assert.equal(h.tabs.get(1).active, true);
  await h.tick(100);
  assert.equal(h.timers.size, 0);
  assert.equal(h.warnings.length, 0);
});

test("persistent contention reduces retry frequency over a simulated minute", async (t) => {
  const h = await setup(t);
  let attempts = 0;
  h.chrome.tabs.update = async () => { attempts += 1; throw new Error(DRAG_ERROR); };
  await h.activate(2);
  await h.flush();
  let elapsed = 0;
  while (elapsed + [...h.timers.values()][0].delay <= 60_000) {
    assert.equal(h.timers.size, 1);
    elapsed += [...h.timers.values()][0].delay;
    await h.tick();
  }
  assert.equal(attempts, 34, "one immediate attempt, five short retries, then one per two seconds");
  assert.equal([...h.timers.values()][0].delay, 2000);
  assert.equal(h.messages.length, 0);
});

test("a new activation starts with a fresh delay and replaces the old backoff timer", async (t) => {
  const h = await setup(t);
  h.chrome.tabs.update = async () => { throw new Error(DRAG_ERROR); };
  await h.activate(2);
  await h.flush();
  for (const delay of [100, 200, 400, 800, 1600]) await h.tick(delay);
  assert.equal([...h.timers.values()][0].delay, 2000);
  await h.activate(2);
  await h.flush();
  assert.equal(h.timers.size, 1);
  await h.tick(100);
  assert.equal([...h.timers.values()][0].delay, 200);
});

test("rapid repeated activations coalesce and do not overlap tab edits", async (t) => {
  const h = await setup(t);
  const update = h.chrome.tabs.update;
  let finish, inFlight = 0, maximum = 0;
  h.chrome.tabs.update = async (...args) => {
    maximum = Math.max(maximum, ++inFlight);
    await new Promise((resolve) => { finish = resolve; });
    inFlight -= 1;
    return update(...args);
  };
  await h.activate(2);
  await h.flush();
  for (let i = 0; i < 10; i += 1) await h.activate(2);
  finish();
  await h.flush();
  assert.equal(maximum, 1);
  assert.equal(h.edits.length, 1);
  assert.equal(h.timers.size, 0);
});

test("a second activation after a successful return is still enforced", async (t) => {
  const h = await setup(t);
  await h.activate(2);
  await h.flush();
  await h.activate(2);
  await h.flush();
  await h.tick();
  assert.equal(h.edits.length, 2);
  assert.equal(h.tabs.get(1).active, true);
  assert.equal(h.timers.size, 0);
});

for (const destination of ["reference", "pending reference", "manuscript", "detached manuscript"]) {
  test(`retry stops when the current destination becomes ${destination}`, async (t) => {
    const h = await setup(t);
    const update = h.chrome.tabs.update;
    h.chrome.tabs.update = async () => { throw new Error(DRAG_ERROR); };
    await h.activate(2);
    await h.flush();
    for (const delay of [100, 200, 400, 800, 1600]) await h.tick(delay);
    h.chrome.tabs.update = update;
    if (destination === "reference") h.tabs.get(2).url = "https://example.com/notes/chapter";
    if (destination === "pending reference") h.tabs.get(2).pendingUrl = "https://example.com/notes";
    if (destination === "manuscript") await h.activate(1);
    if (destination === "detached manuscript") h.tabs.get(1).windowId = 20;
    await h.tick();
    assert.equal(h.edits.length, 0);
    assert.equal(h.messages.length, 0);
    assert.equal(h.timers.size, 0);
  });
}

test("allowed references and other windows are left alone", async (t) => {
  const h = await setup(t);
  await h.activate(3);
  await h.activate(4);
  await h.flush();
  assert.equal(h.edits.length, 0);
  assert.equal(h.timers.size, 0);
});

test("retry only activates the drafted window without focusing another window", async (t) => {
  const h = await setup(t);
  const update = h.chrome.tabs.update;
  h.chrome.tabs.update = async () => { throw new Error(DRAG_ERROR); };
  await h.activate(2);
  await h.flush();
  for (const delay of [100, 200, 400, 800, 1600]) await h.tick(delay);
  await h.activate(4);
  h.chrome.tabs.update = update;
  await h.tick();
  assert.deepEqual(h.edits, [{ id: 1, active: true }]);
  assert.equal(h.tabs.get(4).active, true);
});

for (const reason of ["emergency", "quota", "disabled", "target changed"]) {
  test(`${reason} cancels a pending return and prevents late warnings`, async (t) => {
    const h = await setup(t);
    h.chrome.tabs.update = async () => { throw new Error(DRAG_ERROR); };
    await h.activate(2);
    await h.flush();
    for (const delay of [100, 200, 400, 800, 1600]) await h.tick(delay);
    if (reason === "emergency") await h.message("EMERGENCY_EXIT");
    if (reason === "quota") {
      for (let i = 0; i < 3; i += 1) await h.message("KEYSTROKE");
    }
    if (reason === "disabled" || reason === "target changed") {
      if (reason === "disabled") h.state.settings.enabled = false;
      else h.state.settings.targetUrl = "https://example.com/another-draft";
      assert.equal((await h.message("SETTINGS_CHANGED")).ok, true);
    }
    assert.equal(h.state.activeSession, undefined);
    assert.equal(h.timers.size, 0);
    await h.tick();
    assert.equal(h.messages.some((message) => message.type === "SHOW_WARNING"), false);
    if (reason === "emergency") assert.equal(h.state.settings.enabled, true);
  });
}

test("ending while a tab read is in flight prevents the eventual edit", async (t) => {
  const h = await setup(t);
  const query = h.chrome.tabs.query;
  let finish;
  h.chrome.tabs.query = async (...args) => {
    await new Promise((resolve) => { finish = resolve; });
    return query(...args);
  };
  await h.activate(2);
  await h.flush();
  await h.message("EMERGENCY_EXIT");
  finish();
  await h.flush();
  assert.equal(h.edits.length, 0);
  assert.equal(h.timers.size, 0);
});

test("a failed in-flight edit cannot requeue after emergency exit", async (t) => {
  const h = await setup(t);
  let fail;
  h.chrome.tabs.update = () => new Promise((resolve, reject) => { fail = reject; });
  await h.activate(2);
  await h.flush();
  await h.message("EMERGENCY_EXIT");
  fail(new Error(DRAG_ERROR));
  await h.flush();
  assert.equal(h.timers.size, 0);
});

test("retry uses updated allowed URLs and never follows a replacement session", async (t) => {
  const h = await setup(t);
  const update = h.chrome.tabs.update;
  h.chrome.tabs.update = async () => { throw new Error(DRAG_ERROR); };
  await h.activate(2);
  await h.flush();
  h.state.settings.allowedUrls = [h.tabs.get(2).url];
  await h.message("SETTINGS_CHANGED");
  h.chrome.tabs.update = update;
  await h.tick();
  assert.equal(h.edits.length, 0);
  h.state.settings.allowedUrls = [];
  await h.message("SETTINGS_CHANGED");
  h.chrome.tabs.update = async () => { throw new Error(DRAG_ERROR); };
  await h.activate(2);
  await h.flush();
  h.state.activeSession.startedAt += 1;
  h.chrome.tabs.update = update;
  await h.tick();
  assert.equal(h.edits.length, 0);
  assert.equal(h.timers.size, 0);
});

test("permanent tab errors stop instead of creating an endless retry", async (t) => {
  const h = await setup(t);
  h.tabs.delete(1);
  await h.activate(2);
  await h.flush();
  assert.equal(h.timers.size, 0);
  assert.equal(h.warnings.length, 1);
});

for (const mode of ["manual", "scheduled"]) {
  test(`${mode} sessions use the same intro and retry path`, async (t) => {
    const h = await setup(t);
    delete h.state.activeSession;
    if (mode === "manual") assert.equal((await h.message("TEST_DRAFT_NOW")).ok, true);
    else {
      await h.chrome.alarms.onAlarm.emit({ name: "drafted:ambush:1000" });
      await h.flush();
    }
    const tabId = h.state.activeSession.tabId;
    await h.message("DRAFTED_READY", tabId);
    assert.deepEqual(h.messages, [{ id: tabId, type: "SHOW_INTRO", remaining: 3 }]);
    const update = h.chrome.tabs.update;
    h.chrome.tabs.update = async () => { throw new Error(DRAG_ERROR); };
    await h.activate(2);
    await h.flush();
    h.chrome.tabs.update = update;
    await h.tick();
    assert.equal(h.tabs.get(tabId).active, true);
    assert.equal(h.creates.length, 1);
  });
}
