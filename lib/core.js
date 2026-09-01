export const ALL_DAYS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  targetUrl: "",
  allowedUrls: [],
  activeDays: ALL_DAYS,
  keystrokeQuota: 300,
  ambushesPerDay: 3,
  excludedRanges: [],
});

const MODIFIER_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
  "Fn",
  "FnLock",
  "NumLock",
  "ScrollLock",
  "Symbol",
  "SymbolLock",
  "Hyper",
  "Super",
]);

export function isQualifyingKeydown(event) {
  return Boolean(event) && event.repeat === false && !MODIFIER_KEYS.has(event.key);
}

export function isValidTargetUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function toOriginPattern(value) {
  if (!isValidTargetUrl(value)) {
    throw new TypeError("Target URL must use http or https.");
  }
  const url = new URL(value);
  return `${url.protocol}//${url.host}/*`;
}

export function normalizeSettings(raw = {}) {
  const targetUrl = typeof raw.targetUrl === "string" ? raw.targetUrl.trim() : "";
  const allowedUrls = Array.isArray(raw.allowedUrls)
    ? uniqueValidUrls(raw.allowedUrls)
    : [];
  const activeDays = normalizeDays(raw.activeDays);
  const keystrokeQuota = clampInteger(raw.keystrokeQuota, 1, 10000, 300);
  const ambushesPerDay = clampInteger(raw.ambushesPerDay, 1, 24, 3);
  const excludedRanges = Array.isArray(raw.excludedRanges)
    ? raw.excludedRanges.filter(isTimeRange).map(({ start, end }) => ({ start, end }))
    : [];

  return {
    enabled: Boolean(raw.enabled) && isValidTargetUrl(targetUrl),
    targetUrl,
    allowedUrls,
    activeDays,
    keystrokeQuota,
    ambushesPerDay,
    excludedRanges,
  };
}

export function validateSettings(raw = {}) {
  const settings = normalizeSettings(raw);
  const errors = [];

  if (!isValidTargetUrl(settings.targetUrl)) {
    errors.push("Enter a valid http(s) target URL.");
  }
  if (Array.isArray(raw.allowedUrls) && raw.allowedUrls.some((value) => String(value ?? "").trim() && !isValidTargetUrl(value))) {
    errors.push("Every allowed URL must be a valid http(s) URL.");
  }
  if (Array.isArray(raw.activeDays) && raw.activeDays.some((value) => !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 6)) {
    errors.push("Active days contain an invalid day.");
  }
  if (!Number.isInteger(Number(raw.keystrokeQuota)) || Number(raw.keystrokeQuota) < 1 || Number(raw.keystrokeQuota) > 10000) {
    errors.push("Keystroke quota must be an integer from 1 to 10000.");
  }
  if (!Number.isInteger(Number(raw.ambushesPerDay)) || Number(raw.ambushesPerDay) < 1 || Number(raw.ambushesPerDay) > 24) {
    errors.push("Ambushes per day must be an integer from 1 to 24.");
  }
  if (Array.isArray(raw.excludedRanges) && raw.excludedRanges.some((range) => !isTimeRange(range))) {
    errors.push("Every excluded range needs valid start and end times.");
  }

  return { settings, errors };
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isDateActive(date, activeDays = ALL_DAYS) {
  return normalizeDays(activeDays).includes(date.getDay());
}

export function parseTimeToMinute(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isMinuteExcluded(minuteOfDay, ranges = []) {
  return ranges.some(({ start, end }) => {
    const startMinute = parseTimeToMinute(start);
    const endMinute = parseTimeToMinute(end);
    if (startMinute === null || endMinute === null) return false;
    if (startMinute === endMinute) return true;
    if (startMinute < endMinute) {
      return minuteOfDay >= startMinute && minuteOfDay < endMinute;
    }
    return minuteOfDay >= startMinute || minuteOfDay < endMinute;
  });
}

export function isDateExcluded(date, ranges = []) {
  return isMinuteExcluded(date.getHours() * 60 + date.getMinutes(), ranges);
}

export function eligibleFutureMinutesToday(now = new Date(), ranges = [], activeDays = ALL_DAYS) {
  if (!isDateActive(now, activeDays)) return [];

  const first = new Date(now);
  first.setSeconds(0, 0);
  first.setMinutes(first.getMinutes() + 1);

  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);

  const result = [];
  for (let cursor = first.getTime(); cursor < tomorrow.getTime(); cursor += 60_000) {
    const candidate = new Date(cursor);
    if (!isDateExcluded(candidate, ranges)) result.push(cursor);
  }
  return result;
}

export function selectRandomUnique(values, count, rng = Math.random) {
  const pool = [...new Set(values)];
  const wanted = Math.max(0, Math.min(Math.trunc(count), pool.length));

  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, wanted).sort((a, b) => a - b);
}

export function nextLocalMidnight(date = new Date()) {
  const next = new Date(date);
  next.setHours(24, 0, 0, 0);
  return next.getTime();
}

export function matchesAllowedUrl(candidate, allowedUrls = []) {
  if (!isValidTargetUrl(candidate)) return false;

  const candidateUrl = new URL(candidate);
  candidateUrl.hash = "";

  return allowedUrls.some((value) => matchesSingleAllowedUrl(candidateUrl, value));
}

function matchesSingleAllowedUrl(candidateUrl, value) {
  if (!isValidTargetUrl(value)) return false;

  const allowedUrl = new URL(value);
  allowedUrl.hash = "";

  if (candidateUrl.origin !== allowedUrl.origin) return false;

  const candidatePath = candidateUrl.pathname;
  const allowedPath = allowedUrl.pathname;
  const samePath = candidatePath === allowedPath;
  const childPath = allowedPath.endsWith("/")
    ? candidatePath.startsWith(allowedPath)
    : candidatePath.startsWith(`${allowedPath}/`);

  return samePath || childPath;
}

function normalizeDays(values) {
  if (!Array.isArray(values)) return [...ALL_DAYS];
  return [...new Set(values.map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))].sort((a, b) => a - b);
}

function uniqueValidUrls(values) {
  const seen = new Set();
  const normalized = [];

  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed || !isValidTargetUrl(trimmed)) continue;
    const url = new URL(trimmed);
    url.hash = "";
    const href = url.href;
    if (seen.has(href)) continue;
    seen.add(href);
    normalized.push(href);
  }

  return normalized;
}

function isTimeRange(range) {
  return Boolean(range) && parseTimeToMinute(range.start) !== null && parseTimeToMinute(range.end) !== null;
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
