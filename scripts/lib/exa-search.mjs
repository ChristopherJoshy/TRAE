// Exa discovery leg: genuine neural web search for pages related to the
// input image, plus real page-evidence extraction via /contents.
// Key: EXA_API_KEY. Every call is live and metered — nothing is faked.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function loadEnvFile() {
  const p = join(process.cwd(), ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function key() {
  const k = process.env["EXA_API_KEY"];
  if (!k || !k.trim()) {
    const err = new Error("EXA_API_KEY is not configured.");
    err.code = "invalid-key";
    throw err;
  }
  return k.trim();
}

async function call(path, body, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(`https://api.exa.ai${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key() },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`Exa ${path} HTTP ${res.status}: ${text.slice(0, 160)}`);
      err.code = res.status === 401 || res.status === 403 ? "invalid-key" : res.status === 429 ? "rate-limit" : "exa-error";
      throw err;
    }
    return { json: JSON.parse(text), latencyMs: Date.now() - t0 };
  } finally {
    clearTimeout(t);
  }
}
export async function exaDiscover({ imageUrl = null, filename = null, hints = [] } = {}) {
  const queries = [];
  if (imageUrl) {
    queries.push(`web pages containing this image ${imageUrl}`);
    try {
      const u = new URL(imageUrl);
      const tail = u.pathname.split("/").filter(Boolean).pop() ?? "";
      // Distinctive tokens (photo IDs, long slugs) identify copies precisely.
      const tokens = tail.split(/[^A-Za-z0-9]+/).filter((t) => t.length >= 8);
      for (const t of tokens.slice(0, 2)) queries.push(`"${t}"`);
      if (tail.length > 3 && tokens.length === 0) queries.push(`"${tail}" image source page`);
    } catch { /* ignore */ }
  }
  if (filename) queries.push(`"${filename}" portrait photo source`);
  for (const h of hints.slice(0, 2)) queries.push(h);
  if (queries.length === 0) queries.push("portrait photo source page");
  const seen = new Map();
  let latencyMs = 0;
  for (const q of queries.slice(0, 3)) {
    const { json, latencyMs: ms } = await call("/search", { query: q, contents: { highlights: true, extras: { imageLinks: 5 } } });
    latencyMs += ms;
    for (const r of json.results ?? []) {
      if (!r.url || !r.url.startsWith("http")) continue;
      if (!seen.has(r.url)) {
        const extraLinks = Array.isArray(r.extras?.imageLinks)
          ? r.extras.imageLinks.filter((u) => typeof u === "string")
          : [];
        const seeded = [
          ...(typeof r.image === "string" ? [r.image] : []),
          ...extraLinks,
        ].filter((u) => /^https?:\/\//.test(u)).slice(0, 6);
        seen.set(r.url, {
          url: r.url, title: r.title ?? null, publishedDate: r.publishedDate ?? null,
          author: r.author ?? null, score: r.score ?? null, query: q,
          highlights: (r.highlights ?? []).slice(0, 3),
          imageLinks: seeded,
        });
      }
    }
  }
  return { queries, latencyMs, candidates: [...seen.values()].slice(0, 15) };
}

/** Pull real page evidence for discovered URLs. */
export async function exaContents(urls) {
  const list = [...new Set(urls)].filter((u) => u.startsWith("http")).slice(0, 10);
  if (list.length === 0) return { latencyMs: 0, pages: [] };
  const { json, latencyMs } = await call("/contents", { urls: list, highlights: true });
  return {
    latencyMs,
    pages: (json.results ?? []).map((r) => ({
      url: r.url, title: r.title ?? null, publishedDate: r.publishedDate ?? null,
      author: r.author ?? null, highlights: r.highlights ?? [],
    })),
  };
}
