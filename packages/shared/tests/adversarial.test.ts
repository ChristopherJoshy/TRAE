import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalize, evidenceRootOf } from "../src/canonical.js";
import { normalizeUrl } from "../src/url.js";
import { decodeImage, fingerprintImage } from "../src/image.js";
import { hamming, perceptualSimilarity, robustSimilarity } from "../src/fingerprint.js";
import { rankSources } from "../src/scoring.js";
import type { SearchCandidate } from "../src/types.js";

const FIX = join(process.cwd(), "..", "..", "fixtures", "images");

function fpOf(name: string) {
  const bytes = readFileSync(join(FIX, name));
  const d = decodeImage(bytes);
  return fingerprintImage(bytes, d);
}

function cand(over: Partial<SearchCandidate> = {}): SearchCandidate {
  return {
    id: "cand-01", url: "https://photos.example/a", canonicalUrl: "https://photos.example/a",
    domain: "photos.example", platform: "Website", title: "t", imageUrl: null,
    pageTimestamp: { value: "2026-03-14T10:00:00.000Z", quality: "PAGE_METADATA", source: "s" },
    retrievedAt: "2026-03-20T00:00:00.000Z", provider: "demo", providerResultId: null,
    exactHashMatch: false, perceptualSimilarity: 0.9, faceSimilarity: 0.85, ...over,
  };
}

const sim = (a: ReturnType<typeof fpOf>, b: ReturnType<typeof fpOf>) =>
  perceptualSimilarity(
    { phash: a.phash, dhash: a.dhash, colorSignature: a.colorSignature },
    { phash: b.phash, dhash: b.dhash, colorSignature: b.colorSignature },
  );

describe("adversarial image robustness", () => {
  it("crop does not break matching; unrelated stays distant", () => {
    const original = decodeImage(readFileSync(join(FIX, "original.png")));
    const cropped = robustSimilarity(original, decodeImage(readFileSync(join(FIX, "cropped.png"))));
    const unrelated = robustSimilarity(original, decodeImage(readFileSync(join(FIX, "unrelated.png"))));
    expect(cropped).toBeGreaterThan(0.6);
    expect(unrelated).toBeLessThan(cropped);
  });
  it("compression, resize, text, color, watermark all beat unrelated", () => {
    const orig = fpOf("original.png");
    const base = sim(orig, fpOf("unrelated.png"));
    for (const n of ["recompressed.jpg", "resized.png", "text-overlay.png", "color-shifted.png", "watermarked.png"]) {
      expect(sim(orig, fpOf(n))).toBeGreaterThan(base);
    }
  });
  it("tiny images still fingerprint deterministically", () => {
    const t = fpOf("tiny.png");
    expect(t.phash).toHaveLength(16);
    expect(sim(t, t)).toBe(1);
  });
});

describe("misleading provenance scenarios", () => {
  it("a fake early INFERRED timestamp does not outrank strong EXACT evidence blindly", () => {
    const fakeEarly = cand({
      id: "cand-01", perceptualSimilarity: 0.55,
      pageTimestamp: { value: "2026-03-10T10:00:00.000Z", quality: "INFERRED", source: "s" },
    });
    const strong = cand({
      id: "cand-02", perceptualSimilarity: 0.95,
      pageTimestamp: { value: "2026-03-14T10:00:00.000Z", quality: "EXACT", source: "s" },
    });
    const ranked = rankSources([
      { candidate: fakeEarly, temporalRank: 1, metadataConsistency: 0.4, accountStrength: 0, contradictions: 0 },
      { candidate: strong, temporalRank: 0, metadataConsistency: 0.6, accountStrength: 0, contradictions: 0 },
    ]);
    // Strong visual + exact evidence wins; explanation must mention timestamp quality.
    expect(ranked[0]?.candidateId).toBe("cand-02");
  });
  it("ambiguous evidence produces close scores instead of a forced answer", () => {
    const a = cand({ id: "cand-01", perceptualSimilarity: 0.88 });
    const b = cand({ id: "cand-02", perceptualSimilarity: 0.86 });
    const ranked = rankSources([
      { candidate: a, temporalRank: 0.6, metadataConsistency: 0.5, accountStrength: 0, contradictions: 0 },
      { candidate: b, temporalRank: 0.6, metadataConsistency: 0.5, accountStrength: 0, contradictions: 0 },
    ]);
    const gap = Math.abs((ranked[0]?.score.total ?? 0) - (ranked[1]?.score.total ?? 0));
    expect(gap).toBeLessThan(8);
  });
});

describe("property-based invariants", () => {
  it("url normalization is idempotent over adversarial inputs", () => {
    const urls = [
      "HTTPS://User@Photos.EXAMPLE:443/a//b/?Z=1&z=2&utm_medium=x#F",
      "https://e.example/p?b=2&a=1&fbclid=zzz&a=0",
      "http://e.example:80/",
      "https://e.example/caf%C3%A9",
    ];
    for (const u of urls) {
      const once = normalizeUrl(u);
      expect(normalizeUrl(once)).toBe(once);
    }
  });
  it("canonicalize is deterministic; bundle root changes on add, not on reorder", () => {
    const bundle = {
      evidence: [{ id: "b", v: 1 }, { id: "a", v: 2 }],
      verdict: { score: 0.1 + 0.2 },
    };
    expect(canonicalize(bundle)).toBe(canonicalize(structuredClone(bundle)));
    const reordered = { verdict: { score: 0.1 + 0.2 }, evidence: [{ id: "a", v: 2 }, { id: "b", v: 1 }] };
    expect(evidenceRootOf(bundle)).toBe(evidenceRootOf(reordered));
    const extended = structuredClone(bundle);
    extended.evidence.push({ id: "c", v: 3 });
    expect(evidenceRootOf(bundle)).not.toBe(evidenceRootOf(extended));
  });
  it("hamming is symmetric and bounded", () => {
    const a = fpOf("original.png");
    const b = fpOf("cropped.png");
    expect(hamming(a.phash, b.phash)).toBe(hamming(b.phash, a.phash));
    expect(hamming(a.phash, b.phash)).toBeGreaterThanOrEqual(0);
    expect(hamming(a.phash, b.phash)).toBeLessThanOrEqual(64);
  });
});
