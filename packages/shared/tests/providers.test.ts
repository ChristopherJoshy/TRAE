import { describe, expect, it } from "vitest";
import {
  ProviderError,
  SerpApiLensProvider,
  TinEyeProvider,
  normalizeRawCandidates,
  normalizeSerpApi,
  normalizeTinEye,
} from "../src/providers.js";

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): typeof fetch {
  return ((url: string, init?: RequestInit) => handler(url, init)) as typeof fetch;
}

describe("provider normalization", () => {
  it("tineye: parses matches, skips url-less entries", () => {
    const out = normalizeTinEye(JSON.stringify({
      results: { matches: [
        { backlink: "https://a.example/p?utm_source=x", title: "A", image_url: "https://a.example/i.png", timestamp: "2026-03-14T10:00:00Z" },
        { title: "no url here" },
        "garbage",
      ] },
    }));
    expect(out).toHaveLength(1);
    expect(out[0]?.url).toBe("https://a.example/p?utm_source=x");
  });
  it("tineye: rejects non-JSON and missing arrays", () => {
    expect(() => normalizeTinEye("nope")).toThrowError(/not valid JSON/);
    expect(() => normalizeTinEye(JSON.stringify({ results: {} }))).toThrowError(/missing results/);
  });
  it("serpapi: parses visual_matches, tolerates missing thumbnails", () => {
    const out = normalizeSerpApi(JSON.stringify({
      visual_matches: [
        { link: "https://b.example/p", title: "B", thumbnail: "https://b.example/t.jpg", position: 1 },
        { source: "https://c.example/p", title: "C" },
        { title: "dropped" },
      ],
    }));
    expect(out).toHaveLength(2);
    expect(out[1]?.timestampQuality).toBe("UNKNOWN");
  });
  it("normalization rejects bad schemes and keeps provider attribution", () => {
    const seeds = normalizeRawCandidates(
      [
        { url: "https://a.example/p?utm_source=1", providerResultId: null },
        { url: "javascript:alert(1)", providerResultId: null },
        { url: "https://a.example/other", providerResultId: null },
      ],
      "tineye",
      "2026-03-20T00:00:00.000Z",
    );
    expect(seeds.map((s) => s.url)).toEqual(["https://a.example/p?utm_source=1", "https://a.example/other"]);
    expect(seeds[0]?.provider).toBe("tineye");
  });
});

describe("provider errors", () => {
  it("missing credentials fail fast with invalid-key", () => {
    expect(() => new TinEyeProvider({})).toThrowError(ProviderError);
    expect(() => new SerpApiLensProvider({})).toThrowError(ProviderError);
  });
  it("maps HTTP statuses to coded errors", async () => {
    const p429 = new TinEyeProvider({
      tineyeApiKey: "k",
      fetchImpl: mockFetch(async () => new Response("limited", { status: 429 })),
    });
    await expect(p429.search({ bytes: new Uint8Array([1]), mime: "image/png" })).rejects.toMatchObject({ code: "rate-limit" });
    const p401 = new TinEyeProvider({
      tineyeApiKey: "k",
      fetchImpl: mockFetch(async () => new Response("no", { status: 401 })),
    });
    await expect(p401.searchByUrl("https://e.example/x")).rejects.toMatchObject({ code: "invalid-key" });
  });
  it("maps aborts to timeout and DNS-type failures to network-error", async () => {
    const pTimeout = new TinEyeProvider({
      tineyeApiKey: "k",
      timeoutMs: 5,
      fetchImpl: mockFetch(async (_u, init) => {
        await new Promise((_, rej) => {
          init?.signal?.addEventListener("abort", () => {
            const d = new DOMException("aborted", "AbortError");
            rej(d);
          });
        });
        return new Response("{}", { status: 200 });
      }),
    });
    await expect(pTimeout.search({ bytes: new Uint8Array([1]), mime: "image/png" })).rejects.toMatchObject({ code: "timeout" });
    const pNet = new SerpApiLensProvider({
      serpapiApiKey: "k",
      fetchImpl: mockFetch(async () => { throw new TypeError("fetch failed"); }),
    });
    await expect(pNet.searchByUrl("https://e.example/x")).rejects.toMatchObject({ code: "network-error" });
  });
  it("zero and oversized result sets are handled", async () => {
    const empty = new TinEyeProvider({
      tineyeApiKey: "k",
      fetchImpl: mockFetch(async () => new Response(JSON.stringify({ results: { matches: [] } }), { status: 200 })),
    });
    const r = await empty.search({ bytes: new Uint8Array([1]), mime: "image/png" });
    expect(r.results).toEqual([]);
    const many = new TinEyeProvider({
      tineyeApiKey: "k",
      fetchImpl: mockFetch(async () =>
        new Response(JSON.stringify({
          results: { matches: Array.from({ length: 120 }, (_, i) => ({ backlink: `https://e.example/p${i}` })) },
        }), { status: 200 }),
      ),
    });
    const r2 = await many.search({ bytes: new Uint8Array([1]), mime: "image/png" });
    expect(r2.results).toHaveLength(120);
  });

  it("live contract tests run only with RUN_LIVE_PROVIDER_TESTS=true", async () => {
    if (process.env["RUN_LIVE_PROVIDER_TESTS"] !== "true") {
      expect(true).toBe(true);
      return;
    }
    // Real metered calls — never part of the default suite.
    const key = process.env["TINEYE_API_KEY"];
    if (!key) throw new Error("RUN_LIVE_PROVIDER_TESTS=true but TINEYE_API_KEY missing.");
    const p = new TinEyeProvider({ tineyeApiKey: key });
    const h = await p.healthCheck();
    expect(h.ok).toBe(true);
  });
});
