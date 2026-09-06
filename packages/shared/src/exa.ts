import type { SearchCandidate } from "./types.js";

/**
 * Exa corroboration leg: given candidate page URLs discovered by visual
 * search, pull real page evidence (title, published date, text highlights)
 * via Exa `/contents`, and optionally find related coverage via `/search`.
 * Requires EXA_API_KEY. All calls are metered and recorded; absence of a key
 * is reported honestly — never faked.
 */
export interface ExaCorroboration {
  url: string;
  title: string | null;
  publishedDate: string | null;
  author: string | null;
  highlights: string[];
  corroborated: boolean;
  error: string | null;
}

export interface ExaRun {
  status: "ok" | "skipped" | "failed";
  reason: string | null;
  latencyMs: number;
  results: ExaCorroboration[];
}

function apiKey(): string | null {
  const k = process.env["EXA_API_KEY"];
  return k && k.trim() !== "" ? k.trim() : null;
}

async function exaFetch(path: string, key: string, body: unknown, timeoutMs = 30000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.exa.ai${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`Exa ${path} HTTP ${res.status}: ${text.slice(0, 200)}`);
      (err as { code?: string }).code = res.status === 401 || res.status === 403 ? "invalid-key" : res.status === 429 ? "rate-limit" : "exa-error";
      throw err;
    }
    return JSON.parse(text) as unknown;
  } finally {
    clearTimeout(t);
  }
}

/** Corroborate discovered URLs with real extracted page evidence. */
export async function corroborateWithExa(candidates: SearchCandidate[]): Promise<ExaRun> {
  const started = Date.now();
  const key = apiKey();
  if (!key) {
    return {
      status: "skipped",
      reason: "EXA_API_KEY not configured — page corroboration skipped, visual matches stand on their own.",
      latencyMs: Date.now() - started,
      results: [],
    };
  }
  const urls = [...new Set(candidates.map((c) => c.url))].slice(0, 10);
  if (urls.length === 0) {
    return { status: "ok", reason: "No candidate URLs to corroborate.", latencyMs: Date.now() - started, results: [] };
  }
  try {
    const raw = (await exaFetch("/contents", key, { urls, highlights: true })) as {
      results?: Array<{
        url: string; title?: string | null; publishedDate?: string | null;
        author?: string | null; highlights?: string[] | null;
      }>;
    };
    const results: ExaCorroboration[] = (raw.results ?? []).map((r) => ({
      url: r.url,
      title: r.title ?? null,
      publishedDate: r.publishedDate ?? null,
      author: r.author ?? null,
      highlights: r.highlights ?? [],
      corroborated: true,
      error: null,
    }));
    return { status: "ok", reason: null, latencyMs: Date.now() - started, results };
  } catch (e) {
    return {
      status: "failed",
      reason: e instanceof Error ? e.message.slice(0, 300) : "Exa contents failed.",
      latencyMs: Date.now() - started,
      results: [],
    };
  }
}

/** Related-coverage search: real Exa neural search over the discovered story. */
export async function relatedCoverageSearch(query: string): Promise<{ status: string; reason: string | null; urls: string[] }> {
  const key = apiKey();
  if (!key) return { status: "skipped", reason: "EXA_API_KEY not configured.", urls: [] };
  try {
    const raw = (await exaFetch("/search", key, { query, contents: { highlights: true } })) as {
      results?: Array<{ url: string }>;
    };
    return { status: "ok", reason: null, urls: (raw.results ?? []).map((r) => r.url) };
  } catch (e) {
    return { status: "failed", reason: e instanceof Error ? e.message.slice(0, 200) : "search failed", urls: [] };
  }
}

export function exaConfigured(): boolean {
  return apiKey() !== null;
}
