import type {
  AccountEvidence,
  InvestigationStatus,
  SearchCandidate,
  VerificationClaim,
} from "./types.js";

/**
 * Explicit claim/evidence engine. Claims are only "supported" when at least
 * one evidence item backs them; face similarity alone never supports an
 * account-ownership claim.
 */
export function buildClaims(input: {
  candidates: SearchCandidate[];
  accounts: AccountEvidence[];
  strongestSourceId: string | null;
  providerFailed: boolean;
}): VerificationClaim[] {
  const claims: VerificationClaim[] = [];
  const ev = (id: string) => `candidate:${id}`;

  for (const c of input.candidates) {
    claims.push({
      id: `claim-appears-${c.id}`,
      statement: `This image appears at ${c.domain}.`,
      evidenceIds: [ev(c.id)],
      status: (c.perceptualSimilarity ?? 0) >= 0.5 || c.exactHashMatch ? "supported" : "insufficient",
      explanation:
        c.exactHashMatch
          ? "Exact hash match observed at this URL."
          : (c.perceptualSimilarity ?? 0) >= 0.5
            ? `Perceptual similarity ${((c.perceptualSimilarity ?? 0) * 100).toFixed(1)}% supports visual derivation.`
            : "Similarity too weak to support an appearance claim.",
    });
  }

  const timed = input.candidates.filter((c) => c.pageTimestamp.value !== null);
  if (timed.length >= 2 && input.strongestSourceId) {
    const s = timed.find((c) => c.id === input.strongestSourceId);
    if (s) {
      claims.push({
        id: "claim-earliest",
        statement: `${s.domain} is the strongest observed origin candidate.`,
        evidenceIds: timed.map((c) => ev(c.id)),
        status: "supported",
        explanation:
          "Ranked first by combined visual similarity and timestamp evidence. " +
          "This is an inference from observed evidence, not a verified fact.",
      });
    }
  }

  for (const a of input.accounts) {
    const ownership =
      a.evidenceType === "account-control-challenge" ||
      a.evidenceType === "signed-message" ||
      a.evidenceType === "verified-credential";
    claims.push({
      id: `claim-account-${a.id}`,
      statement: a.handle
        ? `Account @${a.handle} is associated with this image.`
        : `An account on ${a.platform} is associated with this image.`,
      evidenceIds: [ev(a.candidateId), `account:${a.id}`],
      status: ownership ? "supported" : "insufficient",
      explanation: ownership
        ? `Explicit ${a.evidenceType} evidence observed.`
        : "Only a public post is observed. Face similarity alone never establishes account ownership.",
    });
  }

  if (input.providerFailed) {
    claims.push({
      id: "claim-coverage",
      statement: "Reverse-image coverage is incomplete for this investigation.",
      evidenceIds: [],
      status: "supported",
      explanation:
        "The reverse-image provider failed; absence of further matches proves nothing.",
    });
  }

  return claims;
}

/** Deterministic human-readable explanation generated from evidence objects. */
export function explainVerdict(input: {
  strongestDomain: string | null;
  matchCount: number;
  contradictions: number;
  providerFailed: boolean;
}): { conclusion: string; notProven: string[]; limitations: string[] } {
  const conclusion = input.strongestDomain
    ? `Most consistent with the earliest observed source (${input.strongestDomain}), ` +
      `across ${input.matchCount} observed candidate(s).`
    : "Insufficient evidence to identify a strongest observed source.";
  const notProven = [
    "That the strongest observed source is the true original — indexes are incomplete.",
    "That any depicted person controls any associated account — face similarity is not identity proof.",
    "That observed timestamps reflect actual publication — metadata can be edited.",
  ];
  const limitations = [
    "Reverse-image indexes are incomplete and may miss earlier sources.",
    "Timestamps can be unreliable, missing, or falsified.",
    "Metadata (EXIF/C2PA) can be edited or stripped.",
    "Face similarity is not identity proof.",
    "Social account ownership may be unresolved.",
    "Transformations (heavy crop, screenshots) may evade matching.",
    "Provider outages affect result coverage.",
    "Provenance is evaluated evidence, not absolute truth.",
  ];
  if (input.contradictions > 0)
    limitations.push(`${input.contradictions} temporal contradiction(s) preserved — evidence is ambiguous.`);
  if (input.providerFailed)
    limitations.push("Reverse-image provider failed; coverage is partial.");
  return { conclusion, notProven, limitations };
}

/** Explicit investigation state machine. Invalid transitions throw. */
const TRANSITIONS: Record<InvestigationStatus, InvestigationStatus[]> = {
  CREATED: ["INGESTING", "FAILED"],
  INGESTING: ["ANALYZING", "FAILED"],
  ANALYZING: ["SEARCHING", "FAILED"],
  SEARCHING: ["CORRELATING", "PARTIAL", "FAILED"],
  CORRELATING: ["TIMELINE_BUILDING", "PARTIAL", "FAILED"],
  TIMELINE_BUILDING: ["GRAPH_BUILDING", "PARTIAL", "FAILED"],
  GRAPH_BUILDING: ["READY_TO_SEAL", "PARTIAL", "FAILED"],
  READY_TO_SEAL: ["SEALED", "FAILED"],
  SEALED: ["ANCHORING", "READY_TO_SEAL"],
  ANCHORING: ["ANCHORED", "PARTIAL", "FAILED"],
  ANCHORED: [],
  PARTIAL: ["READY_TO_SEAL", "SEALED", "FAILED"],
  FAILED: [],
};

export function canTransition(from: InvestigationStatus, to: InvestigationStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: InvestigationStatus, to: InvestigationStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid investigation transition ${from} -> ${to}.`);
  }
}
