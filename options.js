import {
  DEFAULT_SETTINGS,
  isValidTargetUrl,
  normalizeSettings,
  toOriginPattern,
  validateSettings,
} from "./lib/core.js";

const form = document.querySelector("#settings-form");
const targetUrl = document.querySelector("#target-url");
const quota = document.querySelector("#quota");
const ambushes = document.querySelector("#ambushes");
const enabled = document.querySelector("#enabled");
const ranges = document.querySelector("#excluded-ranges");
const rangeTemplate = document.querySelector("#range-template");
const message = document.querySelector("#message");
const status = document.querySelector("#status");
const addRange = document.querySelector("#add-range");
const testNow = document.querySelector("#test-now");
let lastSavedSettings = DEFAULT_SETTINGS;

await loadSettings();
await refreshStatus();

addRange.addEventListener("click", () => appendRange({ start: "22:00", end: "08:00" }));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");

  const raw = {
    enabled: enabled.checked,
    targetUrl: targetUrl.value,
    keystrokeQuota: Number(quota.value),
    ambushesPerDay: Number(ambushes.value),
    excludedRanges: readRanges(),
  };
  const { settings, errors } = validateSettings(raw);
  if (errors.length) {
    setMessage(errors.join(" "), true);
    return;
  }

  if (settings.enabled) {
    const granted = await chrome.permissions.request({ origins: [toOriginPattern(settings.targetUrl)] });
    if (!granted) {
      setMessage("Host permission was not granted. DRAFTED remains unchanged.", true);
      return;
    }
  }

  const oldOrigin = isValidTargetUrl(lastSavedSettings.targetUrl) ? toOriginPattern(lastSavedSettings.targetUrl) : null;
  const newOrigin = toOriginPattern(settings.targetUrl);
  if (oldOrigin && (!settings.enabled || oldOrigin !== newOrigin)) {
    await chrome.permissions.remove({ origins: [oldOrigin] });
  }

  await chrome.storage.local.set({ settings });
  lastSavedSettings = settings;
  await chrome.runtime.sendMessage({ type: "SETTINGS_CHANGED" });
  setMessage("ORDERS FILED.");
  await refreshStatus();
});

testNow.addEventListener("click", async () => {
  setMessage("");
  const response = await chrome.runtime.sendMessage({ type: "TEST_DRAFT_NOW" });
  if (!response?.ok) {
    setMessage(response?.error ?? "Could not start a test draft.", true);
    return;
  }
  setMessage("TEST DRAFT ISSUED.");
  await refreshStatus();
});

async function loadSettings() {
  const stored = await chrome.storage.local.get("settings");
  const settings = normalizeSettings(stored.settings ?? DEFAULT_SETTINGS);
  lastSavedSettings = settings;
  targetUrl.value = settings.targetUrl;
  quota.value = settings.keystrokeQuota;
  ambushes.value = settings.ambushesPerDay;
  enabled.checked = settings.targetUrl ? settings.enabled : true;
  ranges.replaceChildren();
  settings.excludedRanges.forEach(appendRange);
}

function appendRange(range = { start: "", end: "" }) {
  const fragment = rangeTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".range-row");
  row.querySelector(".range-start").value = range.start;
  row.querySelector(".range-end").value = range.end;
  row.querySelector(".remove-range").addEventListener("click", () => row.remove());
  ranges.appendChild(fragment);
}

function readRanges() {
  return [...ranges.querySelectorAll(".range-row")].map((row) => ({
    start: row.querySelector(".range-start").value,
    end: row.querySelector(".range-end").value,
  }));
}

async function refreshStatus() {
  const [{ settings }, { activeSession }] = await Promise.all([
    chrome.storage.local.get("settings"),
    chrome.storage.session.get("activeSession"),
  ]);
  const current = normalizeSettings(settings ?? DEFAULT_SETTINGS);

  if (activeSession) status.textContent = "DRAFTED";
  else if (!isValidTargetUrl(current.targetUrl)) status.textContent = "UNCONFIGURED";
  else if (!current.enabled) status.textContent = "DISARMED";
  else status.textContent = "ARMED";
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}
