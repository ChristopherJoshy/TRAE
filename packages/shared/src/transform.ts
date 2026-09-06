import type { Transformation, TransformationKind } from "./types.js";

export interface TransformSignals {
  exactHashMatch: boolean;
  /** 0..64 hamming distance of perceptual hashes. */
  phashDistance: number;
  /** 0..1 color signature distance. */
  colorDistance: number;
  widthRatio: number;
  heightRatio: number;
  sharpnessRatio: number;
  candidateIsJpeg: boolean;
  /** Demo/test ground truth only — recorded as fixture evidence, never silently. */
  hint?: TransformationKind;
  hintLabel?: string;
}

/**
 * Transformation classification from measurable signals. Uncertain cases
 * return "unknown" with evidence rather than a forced answer.
 */
export function classifyTransformation(
  signals: TransformSignals,
): { kind: TransformationKind; confidence: number; evidence: string[] } {
  const evidence: string[] = [];
  if (signals.exactHashMatch) {
    return { kind: "unchanged", confidence: 0.99, evidence: ["exact-sha256-match"] };
  }
  const aspectBase = 1;
  void aspectBase;
  const dimChanged =
    Math.abs(signals.widthRatio - 1) > 0.02 || Math.abs(signals.heightRatio - 1) > 0.02;
  const aspectChanged =
    Math.abs(signals.widthRatio / Math.max(1e-6, signals.heightRatio) - 1) > 0.05;

  if (signals.phashDistance <= 6 && !dimChanged && signals.colorDistance < 0.08) {
    const out = { kind: "recompressed" as TransformationKind, confidence: 0.7, evidence: ["near-identical-phash"] };
    if (signals.candidateIsJpeg && signals.sharpnessRatio < 0.85) {
      out.evidence.push("sharpness-drop-consistent-with-recompression");
      out.confidence = 0.8;
    }
    return maybeHint(out, signals);
  }
  if (aspectChanged && signals.phashDistance <= 14) {
    return maybeHint(
      { kind: "cropped", confidence: 0.75, evidence: ["aspect-ratio-change", `phash-distance:${signals.phashDistance}`] },
      signals,
    );
  }
  if (dimChanged && signals.phashDistance <= 10) {
    return maybeHint(
      { kind: "resized", confidence: 0.78, evidence: ["dimension-change-same-aspect", `phash-distance:${signals.phashDistance}`] },
      signals,
    );
  }
  if (signals.colorDistance >= 0.18 && signals.phashDistance <= 16) {
    return maybeHint(
      { kind: "color-adjusted", confidence: 0.62, evidence: [`color-distance:${signals.colorDistance.toFixed(3)}`] },
      signals,
    );
  }
  if (signals.phashDistance <= 20) {
    return maybeHint(
      { kind: "unknown", confidence: 0.4, evidence: [`partial-match-phash-distance:${signals.phashDistance}`] },
      signals,
    );
  }
  return { kind: "unknown", confidence: 0.2, evidence: [`weak-match-phash-distance:${signals.phashDistance}`] };
}

function maybeHint(
  base: { kind: TransformationKind; confidence: number; evidence: string[] },
  signals: TransformSignals,
): { kind: TransformationKind; confidence: number; evidence: string[] } {
  if (signals.hint && (base.kind === "unknown" || base.confidence < 0.9)) {
    return {
      kind: signals.hint,
      confidence: Math.max(base.confidence, 0.85),
      evidence: [...base.evidence, `fixture-ground-truth(demo):${signals.hintLabel ?? signals.hint}`],
    };
  }
  return base;
}

export function withIds(
  items: Array<{ kind: TransformationKind; confidence: number; evidence: string[] }>,
  candidateIds: string[],
): Transformation[] {
  return items.map((t, i) => ({
    id: `tr-${candidateIds[i] ?? i}`,
    candidateId: candidateIds[i] as string,
    kind: t.kind,
    confidence: t.confidence,
    evidence: t.evidence,
  }));
}
