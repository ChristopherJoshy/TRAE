import type { ReverseProviderId, TimestampQuality, TraceMode } from "./types.js";
import { normalizeTimestamp } from "./time.js";
import { normalizeUrl, domainOf, platformOf } from "./url.js";

/**
 * Reverse-image provider abstraction. Implementations are isolated;
 * credentials come exclusively from environment variables.
 */
export interface ReverseImageInput {
  bytes: Uint8Array;
  mime: string;
}

export interface RawCandidate {
  url: string;
  title?: string | null;
  imageUrl?: string | null;
  pageTimestamp?: string | number | null;
  timestampQuality?: TimestampQuality;
  providerResultId?: string | null;
}

export interface ReverseSearchResponse {
  provider: string;
  results: RawCandidate[];
  latencyMs: number;
}

export type ProviderErrorCode =
  | "timeout"
  | "rate-limit"
  | "invalid-key"
  | "provider-unavailable"
  | "malformed-response"
  | "network-error"
  | "unsupported-operation";

export class ProviderError extends Error {
  code: ProviderErrorCode;
  retryable: boolean;
  constructor(code: ProviderErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

export interface ReverseSearchProvider {
  readonly id: string;
  search(image: ReverseImageInput): Promise<ReverseSearchResponse>;
  searchByUrl(url: string): Promise<ReverseSearchResponse>;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
}

export interface LiveProviderEnv {
  tineyeApiKey?: string | undefined;
  tineyeApiUrl?: string | undefined;
  serpapiApiKey?: string | undefined;
  serpapiApiUrl?: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

function toError(e: unknown, provider: string): ProviderError {
  if (e instanceof ProviderError) return e;
  if (e instanceof DOMException && e.name === "AbortError")
    return new ProviderError("timeout", `${provider}: request timed out.`, true);
  if (e instanceof TypeError)
    return new ProviderError("network-error", `${provider}: network error (${e.message}).`, true);
  return new ProviderError("provider-unavailable", `${provider}: ${e instanceof Error ? e.message : "unknown failure"}.`, true);
}

function statusToError(status: number, provider: string, body: string): ProviderError {
  if (status === 401 || status === 403)
    return new ProviderError("invalid-key", `${provider}: rejected credentials (HTTP ${status}).`);
  if (status === 429)
    return new ProviderError("rate-limit", `${provider}: rate limited (HTTP 429).`, true);
  if (status >= 500)
    return new ProviderError("provider-unavailable", `${provider}: server error (HTTP ${status}).`, true);
  return new ProviderError("malformed-response", `${provider}: unexpected response (HTTP ${status}): ${body.slice(0, 160)}.`);
}

/**
 * TinEye API adapter (live). Sends the image as multipart `image_upload`
 * with the API key from TINEYE_API_KEY. Verify field names against the
 * current official TinEye API docs when configuring.
 * Docs: https://services.tineye.com/developers
 */
export class TinEyeProvider implements ReverseSearchProvider {
  readonly id = "tineye";
  private key: string;
  private apiUrl: string;
  private fetchImpl: typeof fetch;
  private timeoutMs: number;

  constructor(env: LiveProviderEnv) {
    if (!env.tineyeApiKey) throw new ProviderError("invalid-key", "tineye: TINEYE_API_KEY is not configured.");
    this.key = env.tineyeApiKey;
    this.apiUrl = env.tineyeApiUrl ?? "https://api.tineye.com/api/v1/result_json/";
    this.fetchImpl = env.fetchImpl ?? fetch;
    this.timeoutMs = env.timeoutMs ?? 20000;
  }

  async search(image: ReverseImageInput): Promise<ReverseSearchResponse> {
    const started = Date.now();
    const { signal, done } = withTimeout(this.timeoutMs);
    try {
      const form = new FormData();
      form.append("api_key", this.key);
      form.append("image_upload", new Blob([toArrayBuffer(image.bytes)], { type: image.mime }), "query");
      const res = await this.fetchImpl(this.apiUrl, { method: "POST", body: form, signal });
      const text = await res.text();
      if (!res.ok) throw statusToError(res.status, "tineye", text);
      return { provider: "tineye", results: normalizeTinEye(text), latencyMs: Date.now() - started };
    } catch (e) {
      throw toError(e, "tineye");
    } finally {
      done();
    }
  }

  async searchByUrl(url: string): Promise<ReverseSearchResponse> {
    const started = Date.now();
    const { signal, done } = withTimeout(this.timeoutMs);
    try {
      const u = new URL(this.apiUrl);
      u.searchParams.set("api_key", this.key);
      u.searchParams.set("url", url);
      const res = await this.fetchImpl(u.toString(), { signal });
      const text = await res.text();
      if (!res.ok) throw statusToError(res.status, "tineye", text);
      return { provider: "tineye", results: normalizeTinEye(text), latencyMs: Date.now() - started };
    } catch (e) {
      throw toError(e, "tineye");
    } finally {
      done();
    }
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: "tineye: configured (key present, masked). Live calls are metered." };
  }
}

/** Defensive TinEye response normalization — rejects malformed entries. */
export function normalizeTinEye(text: string): RawCandidate[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ProviderError("malformed-response", "tineye: response is not valid JSON.");
  }
  const root = json as Record<string, unknown>;
  const results = root["results"];
  const matches = (results as Record<string, unknown> | undefined)?.["matches"] ?? root["matches"];
  if (!Array.isArray(matches)) {
    if (Array.isArray(results)) return normalizeGenericList(results);
    throw new ProviderError("malformed-response", "tineye: missing results/matches array.");
  }
  return normalizeGenericList(matches);
}

/**
 * SerpApi Google Lens adapter (live). Uses engine=google_lens with the
 * image page URL from SERPAPI_API_KEY. Docs: https://serpapi.com/google-lens-api
 */
export class SerpApiLensProvider implements ReverseSearchProvider {
  readonly id = "serpapi";
  private key: string;
  private apiUrl: string;
  private fetchImpl: typeof fetch;
  private timeoutMs: number;

  constructor(env: LiveProviderEnv) {
    if (!env.serpapiApiKey) throw new ProviderError("invalid-key", "serpapi: SERPAPI_API_KEY is not configured.");
    this.key = env.serpapiApiKey;
    this.apiUrl = env.serpapiApiUrl ?? "https://serpapi.com/search.json";
    this.fetchImpl = env.fetchImpl ?? fetch;
    this.timeoutMs = env.timeoutMs ?? 20000;
  }

  async search(_image: ReverseImageInput): Promise<ReverseSearchResponse> {
    throw new ProviderError(
      "unsupported-operation",
      "serpapi: direct byte upload is not supported by the Google Lens endpoint — host the image and use searchByUrl.",
    );
  }

  async searchByUrl(url: string): Promise<ReverseSearchResponse> {
    const started = Date.now();
    const { signal, done } = withTimeout(this.timeoutMs);
    try {
      const u = new URL(this.apiUrl);
      u.searchParams.set("engine", "google_lens");
      u.searchParams.set("url", url);
      u.searchParams.set("api_key", this.key);
      const res = await this.fetchImpl(u.toString(), { signal });
      const text = await res.text();
      if (!res.ok) throw statusToError(res.status, "serpapi", text);
      return { provider: "serpapi", results: normalizeSerpApi(text), latencyMs: Date.now() - started };
    } catch (e) {
      throw toError(e, "serpapi");
    } finally {
      done();
    }
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: "serpapi: configured (key present, masked). Live calls are metered." };
  }
}

/** Defensive SerpApi Lens normalization — rejects malformed entries. */
export function normalizeSerpApi(text: string): RawCandidate[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ProviderError("malformed-response", "serpapi: response is not valid JSON.");
  }
  const root = json as Record<string, unknown>;
  const matches = root["visual_matches"];
  if (!Array.isArray(matches))
    throw new ProviderError("malformed-response", "serpapi: missing visual_matches array.");
  const out: RawCandidate[] = [];
  for (const m of matches) {
    if (typeof m !== "object" || m === null) continue;
    const r = m as Record<string, unknown>;
    const link = typeof r["link"] === "string" ? r["link"] : typeof r["source"] === "string" ? r["source"] : null;
    if (!link) continue; // missing URL: reject entry, keep the rest
    out.push({
      url: link,
      title: typeof r["title"] === "string" ? r["title"] : null,
      imageUrl: typeof r["thumbnail"] === "string" ? r["thumbnail"] : null,
      pageTimestamp: null,
      timestampQuality: "UNKNOWN",
      providerResultId: typeof r["position"] === "number" ? `pos-${r["position"]}` : null,
    });
  }
  return out;
}

function normalizeGenericList(list: unknown[]): RawCandidate[] {
  const out: RawCandidate[] = [];
  for (const m of list) {
    if (typeof m !== "object" || m === null) continue;
    const r = m as Record<string, unknown>;
    const url =
      typeof r["backlink"] === "string" ? r["backlink"]
      : typeof r["url"] === "string" ? r["url"]
      : typeof r["link"] === "string" ? r["link"]
      : null;
    if (!url) continue;
    const ts = r["timestamp"] ?? r["date"] ?? r["published"] ?? null;
    out.push({
      url,
      title: typeof r["title"] === "string" ? r["title"] : null,
      imageUrl: typeof r["image_url"] === "string" ? r["image_url"] : null,
      pageTimestamp: typeof ts === "string" || typeof ts === "number" ? ts : null,
      timestampQuality: "PROVIDER_REPORTED",
      providerResultId: typeof r["id"] === "string" ? r["id"] : null,
    });
  }
  return out;
}

function toArrayBuffer(b: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(b.length);
  new Uint8Array(ab).set(b);
  return ab;
}

export interface NormalizedCandidateSeed {
  url: string;
  title: string | null;
  imageUrl: string | null;
  pageTimestamp: string | number | null;
  timestampQuality: TimestampQuality;
  provider: string;
  providerResultId: string | null;
}

/** Normalize + validate raw provider output into candidate seeds. */
export function normalizeRawCandidates(
  raws: RawCandidate[],
  provider: string,
  retrievedAt: string,
): NormalizedCandidateSeed[] {
  const out: NormalizedCandidateSeed[] = [];
  for (const r of raws) {
    let normalized: string;
    try {
      normalized = normalizeUrl(r.url);
    } catch {
      continue; // malformed URL: reject entry
    }
    const proto = new URL(normalized).protocol;
    if (proto !== "http:" && proto !== "https:") continue;
    out.push({
      url: r.url,
      title: r.title ?? null,
      imageUrl: r.imageUrl ?? null,
      pageTimestamp: r.pageTimestamp ?? null,
      timestampQuality: r.timestampQuality ?? "PROVIDER_REPORTED",
      provider,
      providerResultId: r.providerResultId ?? null,
    });
    void retrievedAt;
  }
  return out;
}

export interface BuiltCandidate {
  id: string;
  url: string;
  canonicalUrl: string;
  domain: string;
  platform: string;
  title: string | null;
  imageUrl: string | null;
  pageTimestampValue: string | null;
  pageTimestampQuality: TimestampQuality;
  retrievedAt: string;
  provider: string;
  providerResultId: string | null;
}

export function toCandidateFields(
  seed: NormalizedCandidateSeed,
  id: string,
  retrievedAt: string,
): BuiltCandidate {
  const canonical = normalizeUrl(seed.url);
  return {
    id,
    url: seed.url,
    canonicalUrl: canonical,
    domain: domainOf(canonical),
    platform: platformOf(canonical),
    title: seed.title,
    imageUrl: seed.imageUrl,
    pageTimestampValue: normalizeTimestamp(seed.pageTimestamp, `${seed.provider}-response`, seed.timestampQuality).value,
    pageTimestampQuality: normalizeTimestamp(seed.pageTimestamp, `${seed.provider}-response`, seed.timestampQuality).quality,
    retrievedAt,
    provider: seed.provider,
    providerResultId: seed.providerResultId,
  };
}

export function providerFromEnv(
  name: string | undefined,
  env: LiveProviderEnv,
  mode: TraceMode,
): ReverseSearchProvider | null {
  if (mode !== "live") return null;
  const id = (name ?? "").toLowerCase() as ReverseProviderId;
  if (id === "tineye") return new TinEyeProvider(env);
  if (id === "serpapi") return new SerpApiLensProvider(env);
  return null;
}
