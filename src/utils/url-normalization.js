export function getUrlParts(url) {
  const parsed = new URL(url);

  return {
    normalizedUrl: parsed.href,
    domain: parsed.hostname.replace(/^www\./, ""),
    path: parsed.pathname || "/",
  };
}
