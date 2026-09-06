import type {
  ConfidenceScore,
  RankedSource,
  ScoreComponent,
  SearchCandidate,
  TimestampQuality,
} from "./types.js";

/**
 * Source Confidence — a transparent, inspectable evidence score.
 * Never called a "truth score". Weights are configurable and every
 * component carries a human-readable justification.
 */
export interface SourceWeights {
  imageMatch: number;
  faceMatch: number;
  temporal: number;
  metadata: number;
  account: number;
  contradictionPenalty: number;
}

export const DEFAULT_WEIGHTS: SourceWeights = {
  imageMatch: 30,
  faceMatch: 20,
  temporal: 25,
  metadata: 10,
  account: 12,
  contradictionPenalty: 5,
};

const QUALITY_BONUS: Record<TimestampQuality, number> = {
  EXACT: 1,
  PROVIDER_REPORTED: 0.8,
  PAGE_METADATA: 0.6,
  INFERRED: 0.3,
  UNKNOWN: 0,
};

export interface ScoringContext {
  candidate: SearchCandidate;
  /** 0..1 — earliest timestamp among all candidates gets full credit. */
  temporalRank: number;
  /** 0..1 metadata consistency signal for this candidate. */
  metadataConsistency: number;
  /** 0..1 account evidence strength for this candidate. */
  accountStrength: number;
  /** Number of contradictions implicating this candidate. */
  contradictions: number;
  weights?: Partial<SourceWeights> | undefined;
}

export function scoreCandidate(ctx: ScoringContext): ConfidenceScore {
  const w: SourceWeights = { ...DEFAULT_WEIGHTS, ...ctx.weights };
  const c = ctx.candidate;
  const components: ScoreComponent[] = [];

  const img = c.perceptualSimilarity ?? (c.exactHashMatch ? 1 : 0);
  components.push({
    key: "image-match",
    label: "Image match",
    points: round1(img * w.imageMatch),
    maxPoints: w.imageMatch,
    detail:
      c.exactHashMatch
        ? "Exact cryptographic hash match."
        : c.perceptualSimilarity !== null && c.perceptualSimilarity !== undefined
          ? `Perceptual similarity ${(img * 100).toFixed(1)}%.`
          : "No visual similarity signal available.",
  });

  const face = c.faceSimilarity ?? 0;
  const faceKnown = c.faceSimilarity !== null && c.faceSimilarity !== undefined;
  components.push({
    key: "face-match",
    label: "Face match",
    points: round1(face * w.faceMatch),
    maxPoints: w.faceMatch,
    detail: faceKnown
      ? `Face similarity ${(face * 100).toFixed(1)}% — evidence only, not identity proof.`
      : "No face comparison available. Face similarity is evidence, never identity proof.",
  });

  const q = QUALITY_BONUS[c.pageTimestamp.quality] ?? 0;
  const temporal = ctx.temporalRank * q;
  components.push({
    key: "temporal",
    label: "Temporal evidence",
    points: round1(temporal * w.temporal),
    maxPoints: w.temporal,
    detail:
      c.pageTimestamp.value === null
        ? "No timestamp observed; no temporal credit given."
        : `Observed ${c.pageTimestamp.value} (${c.pageTimestamp.quality}). Inferred dates are never treated as exact.`,
  });

  components.push({
    key: "metadata",
    label: "Metadata consistency",
    points: round1(ctx.metadataConsistency * w.metadata),
    maxPoints: w.metadata,
    detail: `Metadata consistency ${(ctx.metadataConsistency * 100).toFixed(0)}%.`,
  });

  components.push({
    key: "account",
    label: "Account evidence",
    points: round1(ctx.accountStrength * w.account),
    maxPoints: w.account,
    detail:
      ctx.accountStrength > 0
        ? "Supporting public account evidence observed."
        : "No account-control evidence. Face match alone never establishes ownership.",
  });

  if (ctx.contradictions > 0) {
    components.push({
      key: "contradiction",
      label: "Contradiction penalty",
      points: -Math.min(ctx.contradictions, 3) * w.contradictionPenalty,
      maxPoints: 0,
      detail: `${ctx.contradictions} contradiction(s) implicate this candidate.`,
    });
  }

  const total = Math.max(
    0,
    Math.round(components.reduce((s, x) => s + x.points, 0)),
  );
  const max =
    w.imageMatch + w.faceMatch + w.temporal + w.metadata + w.account;
  return { total: Math.min(total, max), max, components };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface RankingInput {
  candidate: SearchCandidate;
  temporalRank: number;
  metadataConsistency: number;
  accountStrength: number;
  contradictions: number;
}

/** Rank candidates by evidence — never by raw provider order. */
export function rankSources(
  inputs: RankingInput[],
  weights?: Partial<SourceWeights>,
): RankedSource[] {
  const scored = inputs.map((i) => ({
    candidateId: i.candidate.id,
    score: scoreCandidate({ ...i, weights }),
    candidate: i.candidate,
  }));
  scored.sort((a, b) => {
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    // Tie-break: earlier observed timestamp wins; stable by id.
    const ta = a.candidate.pageTimestamp.value ?? "";
    const tb = b.candidate.pageTimestamp.value ?? "";
    if (ta !== tb) {
      if (ta === "") return 1;
      if (tb === "") return -1;
      return ta < tb ? -1 : 1;
    }
    return a.candidate.id < b.candidate.id ? -1 : 1;
  });
  return scored.map((s, idx) => ({
    candidateId: s.candidateId,
    rank: idx + 1,
    score: s.score,
    explanation: explainRank(s.candidate, s.score, idx),
  }));
}

function explainRank(
  c: SearchCandidate,
  score: ConfidenceScore,
  index: number,
): string[] {
  const out: string[] = [];
  const byKey = new Map(score.components.map((x) => [x.key, x]));
  const img = byKey.get("image-match");
  const face = byKey.get("face-match");
  const temp = byKey.get("temporal");
  if (index === 0) {
    if ((img?.points ?? 0) >= (img?.maxPoints ?? 1) * 0.7)
      out.push("Strongest visual similarity among observed candidates.");
    if ((temp?.points ?? 0) >= (temp?.maxPoints ?? 1) * 0.5)
      out.push("Earliest credible observed timestamp.");
    if ((face?.points ?? 0) > 0)
      out.push("Supporting face similarity (evidence only, not identity proof).");
    if (out.length === 0)
      out.push("Highest aggregate evidence score, but evidence is weak overall.");
  } else {
    if ((img?.points ?? 0) < (img?.maxPoints ?? 1) * 0.5)
      out.push("Weaker visual similarity than higher-ranked candidates.");
    if (c.pageTimestamp.value === null)
      out.push("No observed timestamp; cannot support an origin claim.");
    else out.push(`Later or lower-quality timestamp (${c.pageTimestamp.quality}).`);
    const contra = byKey.get("contradiction");
    if (contra) out.push("Penalized by observed contradictions.");
  }
  return out;
}
