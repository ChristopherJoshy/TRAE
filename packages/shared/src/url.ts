/** URL normalization + deduplication. Idempotent by construction. */

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "utm_id", "fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid",
  "igshid", "si", "ref", "ref_src", "ref_url", "spm", "scm",
]);

const PLATFORM_HOSTS: Array<[RegExp, string]> = [
  [/(^|\.)x\.com$/, "X"],
  [/(^|\.)twitter\.com$/, "X"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)facebook\.com$/, "Facebook"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)youtube\.com$/, "YouTube"],
  [/(^|\.)youtu\.be$/, "YouTube"],
  [/(^|\.)reddit\.com$/, "Reddit"],
  [/(^|\.)news\./, "News"],
  [/(^|\.)bbc\./, "News"],
  [/(^|\.)nytimes\.com$/, "News"],
  [/(^|\.)theguardian\.com$/, "News"],
];

export function normalizeUrl(raw: string): string {
  const input = raw.normalize("NFC").trim();
  const u = new URL(input);
  u.protocol = u.protocol.toLowerCase();
  u.hostname = u.hostname.toLowerCase();
  if ((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) {
    u.port = "";
  }
  // Strip tracking parameters, keep the rest sorted for determinism.
  const kept: Array<[string, string]> = [];
  u.searchParams.forEach((value, key) => {
    const k = key.toLowerCase();
    if (!TRACKING_PARAMS.has(k) && !k.startsWith("utm_")) kept.push([k, value]);
  });
  kept.sort(([a, av], [b, bv]) => (a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0));
  u.search = "";
  for (const [k, v] of kept) u.searchParams.append(k, v);
  u.hash = "";
  let out = u.toString();
  // Drop trailing slash except for bare origins.
  if (u.pathname !== "/" && out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

export function safeNormalizeUrl(raw: string): string | null {
  try {
    const n = normalizeUrl(raw);
    if (n !== raw.normalize("NFC").trim()) return n;
    return n;
  } catch {
    return null;
  }
}

export function domainOf(normalizedUrl: string): string {
  try {
    return new URL(normalizedUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function platformOf(normalizedUrl: string): string {
  const host = domainOf(normalizedUrl);
  for (const [re, name] of PLATFORM_HOSTS) {
    if (re.test(host)) return name;
  }
  return host === "" ? "Unknown" : "Website";
}

/** Deduplicate candidates by canonical URL (first occurrence wins). */
export function dedupeByCanonicalUrl<T extends { canonicalUrl: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.canonicalUrl;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
