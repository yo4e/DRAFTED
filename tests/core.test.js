import test from "node:test";
import assert from "node:assert/strict";
import {
  eligibleFutureMinutesToday,
  isDateActive,
  isMinuteExcluded,
  isQualifyingKeydown,
  localDateKey,
  matchesAllowedUrl,
  normalizeSettings,
  selectRandomUnique,
  toOriginPattern,
} from "../lib/core.js";

test("defaults and bounds are normalized", () => {
  assert.deepEqual(normalizeSettings({}), {
    enabled: false,
    targetUrl: "",
    allowedUrls: [],
    activeDays: [0, 1, 2, 3, 4, 5, 6],
    keystrokeQuota: 300,
    ambushesPerDay: 3,
    excludedRanges: [],
  });
  assert.equal(normalizeSettings({ keystrokeQuota: 50000 }).keystrokeQuota, 10000);
  assert.equal(normalizeSettings({ ambushesPerDay: 0 }).ambushesPerDay, 1);
});

test("enabled is only retained for a valid http(s) target", () => {
  assert.equal(normalizeSettings({ enabled: true, targetUrl: "javascript:alert(1)" }).enabled, false);
  assert.equal(normalizeSettings({ enabled: true, targetUrl: "https://docs.google.com/document/d/abc/edit" }).enabled, true);
  assert.equal(toOriginPattern("https://docs.google.com/document/d/abc/edit"), "https://docs.google.com/*");
});

test("allowed URLs are normalized, deduplicated, and hash-agnostic", () => {
  assert.deepEqual(normalizeSettings({
    allowedUrls: [
      " https://example.com/plot#part-1 ",
      "https://example.com/plot#part-2",
      "notaurl",
      "",
    ],
  }).allowedUrls, ["https://example.com/plot"]);
});

test("allowed URL matching supports exact pages and child paths while ignoring query/hash noise", () => {
  assert.equal(matchesAllowedUrl("https://example.com/plot", ["https://example.com/plot"]), true);
  assert.equal(matchesAllowedUrl("https://example.com/plot/chapter-2", ["https://example.com/plot"]), true);
  assert.equal(matchesAllowedUrl("https://example.com/plot?mode=outline", ["https://example.com/plot"]), true);
  assert.equal(matchesAllowedUrl("https://example.com/plot?mode=outline", ["https://example.com/plot?mode=outline"]), true);
  assert.equal(matchesAllowedUrl("https://example.com/plot?mode=draft#scene-4", ["https://example.com/plot?mode=outline"]), true);
  assert.equal(matchesAllowedUrl("https://example.com/plot-twist", ["https://example.com/plot"]), false);
  assert.equal(matchesAllowedUrl("https://elsewhere.com/plot", ["https://example.com/plot"]), false);
});

test("active days default to every day and can disable weekends", () => {
  assert.deepEqual(normalizeSettings({ activeDays: [1, 2, 3, 4, 5] }).activeDays, [1, 2, 3, 4, 5]);
  assert.equal(isDateActive(new Date(2026, 8, 5), [1, 2, 3, 4, 5]), false);
  assert.equal(isDateActive(new Date(2026, 8, 7), [1, 2, 3, 4, 5]), true);
  assert.equal(isDateActive(new Date(2026, 8, 7), []), false);
  assert.deepEqual(eligibleFutureMinutesToday(new Date(2026, 8, 5, 12, 0), [], [1, 2, 3, 4, 5]), []);
});

test("excluded ranges support normal, overnight, and full-day ranges", () => {
  assert.equal(isMinuteExcluded(9 * 60, [{ start: "08:00", end: "10:00" }]), true);
  assert.equal(isMinuteExcluded(10 * 60, [{ start: "08:00", end: "10:00" }]), false);
  assert.equal(isMinuteExcluded(23 * 60, [{ start: "22:00", end: "07:00" }]), true);
  assert.equal(isMinuteExcluded(6 * 60, [{ start: "22:00", end: "07:00" }]), true);
  assert.equal(isMinuteExcluded(12 * 60, [{ start: "00:00", end: "00:00" }]), true);
});

test("eligible times are future whole minutes from the same local day", () => {
  const now = new Date(2026, 8, 1, 23, 57, 40);
  const result = eligibleFutureMinutesToday(now, [{ start: "23:59", end: "00:00" }]);
  assert.deepEqual(result.map((value) => new Date(value).getMinutes()), [58]);
  assert.equal(localDateKey(new Date(result[0])), "2026-09-01");
});

test("random selection is unique, sorted, and bounded", () => {
  const values = [1, 2, 2, 3, 4];
  const selected = selectRandomUnique(values, 3, () => 0.25);
  assert.equal(selected.length, 3);
  assert.deepEqual(selected, [...new Set(selected)].sort((a, b) => a - b));
});

test("keydown qualification ignores repeat and pure modifiers only", () => {
  assert.equal(isQualifyingKeydown({ repeat: false, key: " " }), true);
  assert.equal(isQualifyingKeydown({ repeat: false, key: "Backspace" }), true);
  assert.equal(isQualifyingKeydown({ repeat: true, key: "a" }), false);
  assert.equal(isQualifyingKeydown({ repeat: false, key: "Shift" }), false);
});
