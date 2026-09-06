import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeImage,
  detectFormat,
  extractMetadata,
  fingerprintImage,
  validateImage,
} from "../src/image.js";
import {
  colorDistance,
  dhash,
  hamming,
  perceptualSimilarity,
  phash,
} from "../src/fingerprint.js";
import { analyzeFaces, analyzeFaceIntegrity } from "../src/face.js";
import { classifyTransformation } from "../src/transform.js";

const FIX = join(process.cwd(), "..", "..", "fixtures", "images");
const load = (n: string) => readFileSync(join(FIX, n));

describe("ingestion", () => {
  it("detects formats by magic bytes", () => {
    expect(detectFormat(load("original.png"))).toBe("png");
    expect(detectFormat(load("recompressed.jpg"))).toBe("jpeg");
    expect(detectFormat(load("corrupt.bin"))).toBeNull();
  });
  it("rejects corrupt, oversized-claimed, and mime-mismatched input", () => {
    expect(validateImage(load("corrupt.bin")).ok).toBe(false);
    expect(validateImage(Buffer.alloc(0)).errorCode).toBe("empty-file");
    expect(validateImage(load("original.png"), "image/jpeg").errorCode).toBe("mime-mismatch");
    expect(() => decodeImage(load("corrupt.bin"))).toThrow();
  });
  it("decodes dimensions", () => {
    const d = decodeImage(load("original.png"));
    expect(d.width).toBe(256);
    expect(d.height).toBe(256);
  });
  it("extracts metadata without claiming truth", () => {
    const m = extractMetadata(load("original.png"));
    expect(m.c2pa.present).toBe(false);
    expect(m.containerNotes.length).toBeGreaterThan(0);
  });
});

describe("fingerprints", () => {
  it("identical bytes give identical hashes; derivatives stay close", () => {
    const a = decodeImage(load("original.png"));
    const b = decodeImage(load("original.png"));
    const fa = { ph: phash(a.pixels, a.width, a.height), dh: dhash(a.pixels, a.width, a.height) };
    const fb = { ph: phash(b.pixels, b.width, b.height), dh: dhash(b.pixels, b.width, b.height) };
    expect(hamming(fa.ph, fb.ph)).toBe(0);
    const c = decodeImage(load("recompressed.jpg"));
    const fc = { ph: phash(c.pixels, c.width, c.height), dh: dhash(c.pixels, c.width, c.height) };
    expect(hamming(fa.ph, fc.ph)).toBeLessThan(12);
    const u = decodeImage(load("unrelated.png"));
    const fu = { ph: phash(u.pixels, u.width, u.height), dh: dhash(u.pixels, u.width, u.height) };
    expect(hamming(fa.ph, fu.ph)).toBeGreaterThan(hamming(fa.ph, fc.ph));
  });
  it("perceptualSimilarity separates derivatives from unrelated images", () => {
    const fp = (n: string) => {
      const d = decodeImage(load(n));
      return fingerprintImage(load(n), d);
    };
    const orig = fp("original.png");
    const sim = (n: string) =>
      perceptualSimilarity(
        { phash: orig.phash, dhash: orig.dhash, colorSignature: orig.colorSignature },
        (() => { const f = fp(n); return { phash: f.phash, dhash: f.dhash, colorSignature: f.colorSignature }; })(),
      );
    expect(sim("recompressed.jpg")).toBeGreaterThan(0.8);
    expect(sim("resized.png")).toBeGreaterThan(0.7);
    expect(sim("unrelated.png")).toBeLessThan(sim("recompressed.jpg"));
    expect(colorDistance(orig.colorSignature, orig.colorSignature)).toBe(0);
  });
});

describe("face heuristic", () => {
  it("finds the portrait face, none in noface, two in multiface", () => {
    const one = analyzeFaces(decodeImage(load("original.png")), "a", 500);
    expect(one.analysis.detected).toBe(true);
    expect(one.analysis.count).toBe(1);
    expect(one.analysis.embeddingAvailable).toBe(false);
    expect(one.analysis.detector).toContain("heuristic");
    const none = analyzeFaces(decodeImage(load("noface.png")), "a", 500);
    expect(none.analysis.detected).toBe(false);
    const two = analyzeFaces(decodeImage(load("multiface.png")), "a", 500);
    expect(two.analysis.count).toBe(2);
    expect(two.analysis.warnings.join(" ")).toMatch(/ambiguous/i);
  });
  it("integrity screen is labeled heuristic and reacts to compression", () => {
    const { analysis } = analyzeFaces(decodeImage(load("original.png")), "a", 500);
    const integ = analyzeFaceIntegrity({
      analysis, sharpness: 5, mime: "image/jpeg", byteSize: 3000, pixelCount: 256 * 256,
    });
    expect(integ.heuristicOnly).toBe(true);
    expect(["LOW", "MEDIUM", "HIGH"] as string[]).toContain(integ.naturalness);
    expect(integ.reasoning.join(" ")).toMatch(/heuristic/i);
  });
});

describe("transformations", () => {
  it("classifies exact, crop, and unknown honestly", () => {
    expect(classifyTransformation({
      exactHashMatch: true, phashDistance: 0, colorDistance: 0,
      widthRatio: 1, heightRatio: 1, sharpnessRatio: 1, candidateIsJpeg: false,
    }).kind).toBe("unchanged");
    const crop = classifyTransformation({
      exactHashMatch: false, phashDistance: 8, colorDistance: 0.1,
      widthRatio: 1, heightRatio: 1.3, sharpnessRatio: 1, candidateIsJpeg: false,
    });
    expect(crop.kind).toBe("cropped");
    const weak = classifyTransformation({
      exactHashMatch: false, phashDistance: 40, colorDistance: 0.5,
      widthRatio: 1, heightRatio: 1, sharpnessRatio: 1, candidateIsJpeg: false,
    });
    expect(weak.kind).toBe("unknown");
  });
});
