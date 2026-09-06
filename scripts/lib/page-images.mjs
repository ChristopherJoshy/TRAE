// Page image matcher: download a discovered page (SSRF-gated), extract its
// images, and hash-compare each against the input face crop with a real
// perceptual matcher. A "match" means measured similarity — never asserted.
import { lookup } from "node:dns/promises";
import { decodeImage, fingerprintImage, robustSimilarity } from "@trace/shared";

function isPrivateIP(ip) {
  if (ip.includes(":")) {
    const l = ip.toLowerCase();
    return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80");
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0;
}

async function assertPublicHttp(raw, label) {
  let u;
  try { u = new URL(raw); } catch { throw coded("bad-url", `${label}: malformed URL.`); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw coded("bad-scheme", `${label}: only http(s).`);
  if (u.username || u.password) throw coded("bad-url", `${label}: credentials in URL refused.`);
  let addrs;
  try {
    addrs = await Promise.race([
      lookup(u.hostname, { all: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("dns-timeout")), 8000)),
    ]);
  } catch { throw coded("dns-failed", `${label}: hostname does not resolve.`); }
  if (addrs.length === 0 || addrs.some((a) => isPrivateIP(a.address))) {
    throw coded("private-target", `${label}: private network target refused.`);
  }
  return u;
}

function coded(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

async function fetchCapped(u, { timeoutMs = 25000, maxBytes = 8 * 1024 * 1024, accept = null } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal, redirect: "follow",
      headers: { "User-Agent": "TRACE-pipeline/0.1 (+research prototype)" },
    });
    if (!res.ok) throw coded("fetch-failed", `HTTP ${res.status} for ${u.hostname}.`);
    const ct = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (accept && !accept.some((a) => ct.startsWith(a))) throw coded("not-an-image", `Unexpected content-type ${ct}.`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw coded("file-too-large", `Remote object exceeds size cap.`);
    return { bytes: new Uint8Array(buf), contentType: ct };
  } finally {
    clearTimeout(t);
  }
}

function absolutize(src, base) {
  try {
    if (src.startsWith("data:") || src.startsWith("blob:")) return null;
    const u = new URL(src, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch { return null; }
}

/** Extract candidate image URLs from page HTML (img/srcset/meta/link). */
export function extractImageUrls(html, base) {
  const found = [];
  const push = (s) => {
    if (!s) return;
    const abs = absolutize(s.split(" ")[0], base);
    if (abs && !found.includes(abs)) found.push(abs);
  };
  const pushFront = (s) => {
    if (!s) return;
    const abs = absolutize(s.split(" ")[0], base);
    if (abs && !found.includes(abs)) found.unshift(abs);
  };
  // Primary image first — usually the article/post visual.
  for (const m of html.matchAll(/<meta[^>]+property\s*=\s*["']og:image["'][^>]+content\s*=\s*["']([^"']+)["']/gi)) pushFront(m[1]);
  for (const m of html.matchAll(/<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+property\s*=\s*["']og:image["']/gi)) pushFront(m[1]);
  for (const m of html.matchAll(/<img[^>]+src\s*=\s*["']([^"']+)["']/gi)) push(m[1]);
  for (const m of html.matchAll(/<img[^>]+(?:data-src|data-lazy-src|data-original)\s*=\s*["']([^"']+)["']/gi)) push(m[1]);
  for (const m of html.matchAll(/<img[^>]+srcset\s*=\s*["']([^"']+)["']/gi)) {
    for (const part of m[1].split(",")) push(part.trim());
  }
  return found.filter((u) => /\.(jpe?g|png|webp)(\?|#|$)/i.test(u)).slice(0, 12);
}
export async function matchPageImages(pageUrl, inputDecoded, { threshold = 0.6, perImageTimeoutMs = 12000, maxImages = 5, imageLinks = [] } = {}) {
  const seeded = [...new Set((imageLinks ?? []).filter((u) => typeof u === "string" && /^https?:\/\//.test(u)))].slice(0, maxImages);
  let imgUrls = seeded;
  if (imgUrls.length === 0) {
    const page = await assertPublicHttp(pageUrl, "page");
    const { bytes } = await fetchCapped(page, { accept: ["text/html"], maxBytes: 4 * 1024 * 1024, timeoutMs: 20000 });
    const html = Buffer.from(bytes).toString("utf8");
    imgUrls = extractImageUrls(html, page.toString());
  }
  const scored = [];
  for (const imgUrl of imgUrls.slice(0, maxImages)) {
    try {
      const iu = await assertPublicHttp(imgUrl, "page-image");
      const { bytes: ib } = await fetchCapped(iu, { accept: ["image/"], maxBytes: 5 * 1024 * 1024, timeoutMs: perImageTimeoutMs });
      const dec = decodeImage(ib);
      const sim = robustSimilarity(inputDecoded, dec);
      scored.push({ imageUrl: imgUrl, width: dec.width, height: dec.height, similarity: sim, match: sim >= threshold });
    } catch (e) {
      scored.push({ imageUrl: imgUrl, error: e.code ?? "download-failed", similarity: 0, match: false });
    }
  }
  scored.sort((a, b) => b.similarity - a.similarity);
  return { pageUrl, imageCount: imgUrls.length, scored, threshold };
}

export { decodeImage, fingerprintImage };
