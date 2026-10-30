import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../content.js", import.meta.url), "utf8");

// The fixture only models the DOM operations used by the overlay and HUD.
// Real layout, pointer hit-testing, and native tab gestures need a browser.
class Element extends EventTarget {
  children = [];
  attributes = {};
  style = {};
  classList = { add() {}, remove() {} };
  constructor(tag) { super(); this.tagName = tag; }
  appendChild(child) { child.parent = this; this.children.push(child); }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  setAttribute(name, value) { this.attributes[name] = value; }
  remove() { this.parent.children = this.parent.children.filter((child) => child !== this); }
  find(id) { return this.id === id ? this : this.children.map((child) => child.find(id)).find(Boolean); }
}

function setup({ topFrame = true } = {}) {
  const root = new Element("html");
  const window = new EventTarget();
  window.top = topFrame ? window : {};
  const messages = [], listeners = [], timers = new Map();
  let timerId = 0;
  const context = vm.createContext({
    window,
    document: { documentElement: root, createElement: (tag) => new Element(tag) },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    chrome: {
      runtime: {
        onMessage: { addListener: (callback) => listeners.push(callback) },
        sendMessage: (message) => messages.push(message.type),
      },
      storage: { local: { get: async () => ({}), set: async () => {} } },
    },
  });
  vm.runInContext(source, context);
  return {
    root, messages, timers,
    receive: (type, remaining = 3) => listeners.forEach((listener) => listener({ type, remaining })),
    reinject: () => vm.runInContext(source, context),
  };
}

for (const type of ["SHOW_INTRO", "SHOW_WARNING"]) {
  test(`${type} exposes an accessible exit that ends only the session`, () => {
    const h = setup();
    h.receive(type);
    const exit = h.root.find("drafted-emergency-exit");
    assert.ok(exit);
    assert.equal(exit.tagName, "button");
    assert.equal(exit.attributes["aria-label"], "Emergency exit — end this drafting session now");
    assert.equal(h.root.find("drafted-hud").textContent, "3 TO DISCHARGE");
    const click = new Event("click", { cancelable: true });
    exit.dispatchEvent(click);
    assert.equal(click.defaultPrevented, true);
    assert.equal(exit.attributes.disabled, "");
    assert.deepEqual(h.messages, ["DRAFTED_READY", "EMERGENCY_EXIT"]);
    h.receive("SESSION_ENDED");
    assert.equal(h.root.find("drafted-overlay"), undefined);
    assert.equal(h.root.find("drafted-hud"), undefined);
    assert.equal(h.timers.size, 0);
    exit.dispatchEvent(new Event("click"));
    assert.equal(h.messages.length, 2, "removed buttons must lose their click listener");
  });
}

test("repeated overlays replace the exit and retain the existing timeout", () => {
  const h = setup();
  h.receive("SHOW_INTRO");
  const first = h.root.find("drafted-emergency-exit");
  h.receive("SHOW_WARNING");
  assert.notEqual(h.root.find("drafted-emergency-exit"), first);
  first.dispatchEvent(new Event("click"));
  assert.deepEqual(h.messages, ["DRAFTED_READY"]);
  assert.equal(h.timers.size, 1);
  const timer = [...h.timers.values()][0];
  assert.equal(timer.delay, 1800);
  timer.callback();
  assert.equal(h.root.find("drafted-emergency-exit"), undefined);
  assert.ok(h.root.find("drafted-hud"));
});

test("discharge removes the exit and fades out the HUD", () => {
  const h = setup();
  h.receive("SHOW_INTRO");
  h.receive("DISCHARGED");
  assert.equal(h.root.find("drafted-emergency-exit"), undefined);
  assert.equal(h.root.find("drafted-hud").textContent, "DISCHARGED.");
  const fade = [...h.timers.values()].find((timer) => timer.delay === 420);
  fade.callback();
  const remove = [...h.timers.values()].find((timer) => timer.delay === 220);
  remove.callback();
  assert.equal(h.root.find("drafted-hud"), undefined);
});

test("iframes and repeated injection do not duplicate the overlay or exit", () => {
  const frame = setup({ topFrame: false });
  frame.receive("SHOW_INTRO");
  assert.equal(frame.root.children.length, 0);
  const top = setup();
  top.reinject();
  top.receive("SHOW_INTRO");
  assert.deepEqual(top.messages, ["DRAFTED_READY"]);
  assert.equal(top.root.children.length, 2, "one overlay and one HUD");
});
