export function matchesTargetUrl(candidate, target) {
  const candidateUrl = parseHttpUrl(candidate);
  const targetUrl = parseHttpUrl(target);
  if (!candidateUrl || !targetUrl) return false;

  return candidateUrl.origin === targetUrl.origin
    && normalizePath(candidateUrl.pathname) === normalizePath(targetUrl.pathname);
}

function parseHttpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

function normalizePath(pathname) {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}
