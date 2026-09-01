export const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  targetUrl: "",
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
  const keystrokeQuota = clampInteger(raw.keystrokeQuota, 1, 10000, 300);
  const ambushesPerDay = clampInteger(raw.ambushesPerDay, 1, 24, 3);
  const excludedRanges = Array.isArray(raw.excludedRanges)
    ? raw.excludedRanges.filter(isTimeRange).map(({ start, end }) => ({ start, end }))
    : [];

  return {
    enabled: Boolean(raw.enabled) && isValidTargetUrl(targetUrl),
    targetUrl,
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

export function eligibleFutureMinutesToday(now = new Date(), ranges = []) {
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

function isTimeRange(range) {
  return Boolean(range) && parseTimeToMinute(range.start) !== null && parseTimeToMinute(range.end) !== null;
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
