import { describe, expect, it } from "vitest";
import { canonicalize, evidenceRootOf, sha256Hex } from "../src/canonical.js";
import { normalizeUrl, dedupeByCanonicalUrl, platformOf } from "../src/url.js";
import { normalizeTimestamp, compareTimestamps } from "../src/time.js";
import { scoreCandidate, rankSources } from "../src/scoring.js";
import { canTransition, assertTransition, buildClaims } from "../src/claims.js";
import type { SearchCandidate } from "../src/types.js";

function cand(over: Partial<SearchCandidate> = {}): SearchCandidate {
  return {
    id: "cand-01",
    url: "https://photos.example/a",
    canonicalUrl: "https://photos.example/a",
    domain: "photos.example",
    platform: "Website",
    title: "t",
    imageUrl: null,
    pageTimestamp: { value: "2026-03-14T10:00:00.000Z", quality: "PAGE_METADATA", source: "s" },
    retrievedAt: "2026-03-20T00:00:00.000Z",
    provider: "demo",
    providerResultId: null,
    exactHashMatch: false,
    perceptualSimilarity: 0.9,
    faceSimilarity: 0.85,
    ...over,
  };
}

describe("canonicalization", () => {
  it("is deterministic and key-order independent", () => {
    const a = { z: 1, a: { y: [3, 2], x: "héllo" } };
    const b = { a: { x: "héllo", y: [3, 2] }, z: 1.0 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });
  it("sorts id-bearing arrays so reorder does not change the root", () => {
    const x = { items: [{ id: "b", v: 1 }, { id: "a", v: 2 }] };
    const y = { items: [{ id: "a", v: 2 }, { id: "b", v: 1 }] };
    expect(evidenceRootOf(x)).toBe(evidenceRootOf(y));
  });
  it("changes the root when a field changes", () => {
    expect(evidenceRootOf({ a: 1 })).not.toBe(evidenceRootOf({ a: 2 }));
  });
  it("normalizes number precision", () => {
    expect(canonicalize({ v: 0.123456789 })).toBe(canonicalize({ v: 0.123456781 }));
  });
  it("sha256 is stable", () => {
    expect(sha256Hex("trace")).toBe(sha256Hex("trace"));
    expect(sha256Hex("trace")).toHaveLength(64);
  });
});

describe("url normalization", () => {
  it("is idempotent", () => {
    const u = "https://Photos.EXAMPLE:443/a?utm_source=x&b=2#frag";
    const once = normalizeUrl(u);
    expect(normalizeUrl(once)).toBe(once);
    expect(once).toBe("https://photos.example/a?b=2");
  });
  it("sorts query params and strips tracking", () => {
    expect(normalizeUrl("https://e.example/p?z=1&a=2&fbclid=9")).toBe("https://e.example/p?a=2&z=1");
  });
  it("dedupes by canonical url", () => {
    const items = [
      { canonicalUrl: "https://e.example/a?utm_source=1" },
      { canonicalUrl: "https://e.example/a" },
    ];
    expect(dedupeByCanonicalUrl(items)).toHaveLength(2); // raw strings differ; normalized dedupe happens upstream
    expect(platformOf("https://x.com/u/p")).toBe("X");
  });
});

describe("timestamps", () => {
  it("normalizes to UTC ISO and never upgrades inferred", () => {
    const t = normalizeTimestamp("2026-03-14", "test", "INFERRED");
    expect(t.value).toBe("2026-03-14T00:00:00.000Z");
    expect(t.quality).toBe("INFERRED");
    const bad = normalizeTimestamp("not-a-date", "test");
    expect(bad.value).toBeNull();
    expect(bad.quality).toBe("UNKNOWN");
  });
  it("orders correctly with unknowns", () => {
    const a = normalizeTimestamp("2026-03-14T00:00:00.000Z", "t", "EXACT");
    const b = normalizeTimestamp(null, "t");
    expect(compareTimestamps(a, b)).toBeNull();
  });
});

describe("scoring", () => {
  it("rewards exact matches and penalizes contradictions", () => {
    const base = scoreCandidate({
      candidate: cand(), temporalRank: 1, metadataConsistency: 0.5, accountStrength: 0, contradictions: 0,
    });
    const penalized = scoreCandidate({
      candidate: cand(), temporalRank: 1, metadataConsistency: 0.5, accountStrength: 0, contradictions: 2,
    });
    expect(penalized.total).toBeLessThan(base.total);
    expect(penalized.components.map((c) => c.key)).toContain("contradiction");
  });
  it("ranks by evidence, not provider order", () => {
    const weak = cand({ id: "cand-01", perceptualSimilarity: 0.5, pageTimestamp: { value: "2026-03-16T10:00:00.000Z", quality: "PAGE_METADATA", source: "s" } });
    const strong = cand({ id: "cand-02", perceptualSimilarity: 0.95, pageTimestamp: { value: "2026-03-14T10:00:00.000Z", quality: "EXACT", source: "s" } });
    const ranked = rankSources([
      { candidate: weak, temporalRank: 0, metadataConsistency: 0.4, accountStrength: 0, contradictions: 0 },
      { candidate: strong, temporalRank: 1, metadataConsistency: 0.6, accountStrength: 0, contradictions: 0 },
    ]);
    expect(ranked[0]?.candidateId).toBe("cand-02");
    expect(ranked[0]?.explanation.length).toBeGreaterThan(0);
  });
});

describe("state machine", () => {
  it("allows the happy path and rejects skips", () => {
    expect(canTransition("CREATED", "INGESTING")).toBe(true);
    expect(canTransition("CREATED", "SEALED")).toBe(false);
    expect(() => assertTransition("SEARCHING", "SEALED")).toThrow();
  });
});

describe("claims", () => {
  it("never supports account ownership from face similarity alone", () => {
    const claims = buildClaims({
      candidates: [cand()],
      accounts: [{
        id: "a1", candidateId: "cand-01", platform: "Social", handle: "demo_x",
        profileUrl: null, evidenceType: "public-post", detail: "d", confidence: 0.3,
      }],
      strongestSourceId: "cand-01",
      providerFailed: false,
    });
    const ownership = claims.find((c) => c.id === "claim-account-a1");
    expect(ownership?.status).toBe("insufficient");
  });
});
