const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);
const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/;
const NON_PROFILE_SEGMENTS = new Set(["p", "reel", "reels", "stories", "explore", "tv"]);

/** Profile handle from an instagram.com url or `@handle`; null for post urls and other hosts. */
export function parseInstagramHandle(input: string): string | null {
  const value = input.trim();
  if (value.startsWith("@")) {
    const handle = value.slice(1);
    return HANDLE_RE.test(handle) ? handle : null;
  }
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!INSTAGRAM_HOSTS.has(url.host.toLowerCase())) return null;
  const [segment] = url.pathname.split("/").filter(Boolean);
  if (!segment || NON_PROFILE_SEGMENTS.has(segment) || !HANDLE_RE.test(segment)) return null;
  return segment;
}
