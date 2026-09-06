import { createHash } from "node:crypto";
import type { DecodedImage } from "./image.js";
import type {
  FaceAnalysis,
  FaceBox,
  FaceIntegrity,
  FaceObservation,
  FaceQuality,
} from "./types.js";
export const DETECTOR_ID = "heuristic-baseline-v1";
const HEURISTIC_NOTICE =
  "Heuristic baseline only — no ML face model is bundled. Regions are skin-tone/geometry estimates, not detections.";

interface Region {
  box: FaceBox;
  pixels: number;
  symmetry: number;
}

/** Skin-tone test (classic RGB heuristic) on a single pixel. */
function isSkin(r: number, g: number, b: number): boolean {
  if (r <= 95 || g <= 40 || b <= 20) return false;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx - mn <= 15) return false;
  if (Math.abs(r - g) <= 15) return false;
  return r > g && r > b;
}

/**
 * Heuristic face-region estimator: skin-tone mask + connected components +
 * aspect/symmetry filtering, computed on a 64×64 grid for determinism.
 * Honest about its limits — see HEURISTIC_NOTICE.
 */
export function estimateFaceRegions(img: DecodedImage): Region[] {
  const GW = 64;
  const GH = 64;
  const mask = new Uint8Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const x0 = Math.floor((gx * img.width) / GW);
      const x1 = Math.floor(((gx + 1) * img.width) / GW);
      const y0 = Math.floor((gy * img.height) / GH);
      const y1 = Math.floor(((gy + 1) * img.height) / GH);
      let skin = 0;
      let total = 0;
      for (let y = y0; y < Math.max(y0 + 1, y1); y += 2) {
        for (let x = x0; x < Math.max(x0 + 1, x1); x += 2) {
          const si = (Math.min(y, img.height - 1) * img.width + Math.min(x, img.width - 1)) * 4;
          total++;
          if (isSkin(img.pixels[si] as number, img.pixels[si + 1] as number, img.pixels[si + 2] as number)) skin++;
        }
      }
      if (total > 0 && skin / total > 0.35) mask[gy * GW + gx] = 1;
    }
  }

  // Connected components (4-neighbourhood BFS).
  const seen = new Uint8Array(GW * GH);
  const regions: Region[] = [];
  for (let i = 0; i < GW * GH; i++) {
    if (!mask[i] || seen[i]) continue;
    let minX = GW, maxX = -1, minY = GH, maxY = -1, count = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length > 0) {
      const cur = stack.pop() as number;
      const cx = cur % GW;
      const cy = Math.floor(cur / GW);
      count++;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      const nb: Array<[number, number]> = [
        [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1],
      ];
      for (const [nx, ny] of nb) {
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const ni = ny * GW + nx;
        if (mask[ni] && !seen[ni]) {
          seen[ni] = 1;
          stack.push(ni);
        }
      }
    }
    const areaFrac = count / (GW * GH);
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const aspect = bw / Math.max(1, bh);
    // Plausible face blob: 0.4%..45% of frame, roughly square-ish.
    if (areaFrac < 0.004 || areaFrac > 0.45) continue;
    if (aspect < 0.45 || aspect > 2.2) continue;
    // Horizontal symmetry of the mask inside the bbox.
    let sym = 0;
    let symTotal = 0;
    for (let y = minY; y <= maxY; y++) {
      for (let x = 0; x < Math.floor(bw / 2); x++) {
        const l = y * GW + minX + x;
        const r = y * GW + maxX - x;
        symTotal++;
        if (!!mask[l] === !!mask[r]) sym++;
      }
    }
    const symmetry = symTotal > 0 ? sym / symTotal : 0;
    if (symmetry < 0.55) continue;
    regions.push({
      box: {
        x: Math.max(0, minX / GW),
        y: Math.max(0, minY / GH),
        w: Math.min(1, bw / GW),
        h: Math.min(1, bh / GH),
      },
      pixels: count,
      symmetry,
    });
  }
  regions.sort((a, b) => b.pixels - a.pixels);
  return regions.slice(0, 5);
}

/** Deterministic visual descriptor of a face region (NOT a biometric embedding). */
export function describeRegion(img: DecodedImage, box: FaceBox): number[] {
  const n = 8;
  const desc: number[] = [];
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      const x = Math.min(img.width - 1, Math.floor((box.x + ((cx + 0.5) / n) * box.w) * img.width));
      const y = Math.min(img.height - 1, Math.floor((box.y + ((cy + 0.5) / n) * box.h) * img.height));
      const si = (y * img.width + x) * 4;
      desc.push(
        (img.pixels[si] as number) / 255,
        (img.pixels[si + 1] as number) / 255,
        (img.pixels[si + 2] as number) / 255,
      );
    }
  }
  return desc;
}

export function descriptorSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] as number) * (b[i] as number);
    na += (a[i] as number) * (a[i] as number);
    nb += (b[i] as number) * (b[i] as number);
  }
  if (na === 0 || nb === 0) return 0;
  return Math.max(0, Math.min(1, Math.round((dot / Math.sqrt(na * nb)) * 1000) / 1000));
}

function qualityOf(areaFrac: number, sharp: number, symmetry: number): { q: FaceQuality; score: number } {
  const score = Math.max(
    0,
    Math.min(1, areaFrac * 8 * 0.5 + Math.min(1, sharp / 400) * 0.3 + symmetry * 0.2),
  );
  return { q: score >= 0.55 ? "high" : score >= 0.3 ? "medium" : "low", score: Math.round(score * 100) / 100 };
}

export function analyzeFaces(
  img: DecodedImage,
  assetId: string,
  sharp: number,
  reference?: { descriptor: number[] } | null,
): { analysis: FaceAnalysis; descriptors: Map<string, number[]> } {
  const regions = estimateFaceRegions(img);
  const warnings: string[] = [HEURISTIC_NOTICE];
  if (img.width < 64 || img.height < 64) warnings.push("Very low resolution: face regions unreliable.");
  if (regions.length > 1) warnings.push(`Multiple face-like regions (${regions.length}): identity is ambiguous.`);

  const faces: FaceObservation[] = [];
  const descriptors = new Map<string, number[]>();
  let bestSim: number | null = null;
  regions.forEach((r, i) => {
    const id = `face-${i + 1}`;
    const descriptor = describeRegion(img, r.box);
    descriptors.set(id, descriptor);
    const areaFrac = r.box.w * r.box.h;
    const { q, score } = qualityOf(areaFrac, sharp, r.symmetry);
    if (q === "low") warnings.push(`Region ${id} is low quality (small/soft/asymmetric).`);
    let sim: number | null = null;
    if (reference) {
      sim = descriptorSimilarity(descriptor, reference.descriptor);
      if (bestSim === null || sim > bestSim) bestSim = sim;
    }
    void sim;
    faces.push({
      id,
      assetId,
      box: {
        x: Math.round(r.box.x * 1000) / 1000,
        y: Math.round(r.box.y * 1000) / 1000,
        w: Math.round(r.box.w * 1000) / 1000,
        h: Math.round(r.box.h * 1000) / 1000,
      },
      quality: q,
      qualityScore: score,
      embeddingHash: createHash("sha256").update(JSON.stringify(descriptor)).digest("hex"),
      warnings: q === "low" ? ["Low-quality region."] : [],
    });
  });

  if (regions.length === 0) warnings.push("No face-like region found.");
  const overall: FaceQuality =
    faces.length === 0 ? "low" : faces.some((f) => f.quality === "high") ? "high" : faces.some((f) => f.quality === "medium") ? "medium" : "low";

  return {
    analysis: {
      detected: faces.length > 0,
      count: faces.length,
      quality: overall,
      embeddingAvailable: false,
      faces,
      similarity: bestSim,
      warnings,
      detector: DETECTOR_ID,
    },
    descriptors,
  };
}

/**
 * Modular heuristic integrity screen. Output is explicitly labeled
 * heuristic — never a proven forensic detector.
 */
export function analyzeFaceIntegrity(input: {
  analysis: FaceAnalysis;
  sharpness: number;
  mime: string;
  byteSize: number;
  pixelCount: number;
}): FaceIntegrity {
  const warnings: string[] = [];
  const reasoning: string[] = [];
  let suspicious = 0;

  if (!input.analysis.detected) {
    return {
      naturalness: "MEDIUM",
      naturalnessConfidence: 0.4,
      warnings: ["No face region to assess."],
      reasoning: ["Integrity screen requires an observed face region."],
      heuristicOnly: true,
    };
  }
  const bytesPerPixel = input.byteSize / Math.max(1, input.pixelCount);
  if (input.mime === "image/jpeg" && bytesPerPixel < 0.15) {
    suspicious += 2;
    warnings.push("Extreme JPEG compression: fine manipulation traces may be hidden.");
    reasoning.push(`Low bytes-per-pixel (${bytesPerPixel.toFixed(3)}) suggests heavy recompression.`);
  }
  if (input.sharpness < 20) {
    suspicious += 1;
    warnings.push("Unusually soft face region: possible blur, downscale, or recapture.");
    reasoning.push(`Sharpness score ${input.sharpness.toFixed(1)} is below the softness threshold.`);
  }
  for (const f of input.analysis.faces) {
    const aspect = f.box.w / Math.max(1e-6, f.box.h);
    if (aspect < 0.5 || aspect > 1.9) {
      suspicious += 1;
      warnings.push(`Face region ${f.id} has unusual geometry (aspect ${aspect.toFixed(2)}).`);
      reasoning.push(`Region ${f.id} bounding-box aspect is outside the plausible portrait band.`);
    }
    if (f.quality === "low") {
      suspicious += 1;
      warnings.push(`Face region ${f.id} is low quality; geometry checks are weak here.`);
    }
  }
  if (input.analysis.count > 1) {
    suspicious += 1;
    warnings.push("Multiple face-like regions: composite/morph screening is ambiguous.");
    reasoning.push("Multi-region images defeat single-face consistency checks.");
  }
  reasoning.push("Heuristic baseline only: not a trained morph/attack detector.");

  const naturalness = suspicious >= 3 ? "LOW" : suspicious >= 1 ? "MEDIUM" : "HIGH";
  const naturalnessConfidence =
    naturalness === "HIGH" ? 0.7 : naturalness === "MEDIUM" ? 0.55 : 0.6;
  return { naturalness, naturalnessConfidence, warnings, reasoning, heuristicOnly: true };
}
