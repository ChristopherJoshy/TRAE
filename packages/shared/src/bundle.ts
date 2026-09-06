import type {
  AccountEvidence,
  EvidenceBundle,
  EvidenceItem,
  InvestigationVerdict,
  ProvenanceGraph,
  ProvenanceTimeline,
  RankedSource,
  SealedBundle,
  SearchCandidate,
  Transformation,
  VerificationResult,
} from "./types.js";
import { evidenceRootOf } from "./canonical.js";

export const BUNDLE_SCHEMA_VERSION = "trace.bundle/v1";

export interface BundleInput {
  investigationId: string;
  mode: "demo" | "live" | "test";
  provider: string;
  createdAt: string;
  asset: EvidenceBundle["asset"];
  fingerprint: EvidenceBundle["fingerprint"];
  face: EvidenceBundle["face"];
  faceIntegrity: EvidenceBundle["faceIntegrity"];
  metadata: EvidenceBundle["metadata"];
  providerRuns: EvidenceBundle["providerRuns"];
  candidates: SearchCandidate[];
  accounts: AccountEvidence[];
  transformations: Transformation[];
  rankedSources: RankedSource[];
  timeline: ProvenanceTimeline;
  graph: ProvenanceGraph;
  claims: EvidenceBundle["claims"];
  evidence: EvidenceItem[];
  verdict: InvestigationVerdict;
}

export function buildEvidenceBundle(input: BundleInput): EvidenceBundle {
  if (input.candidates.length === 0 && input.providerRuns.every((r) => r.status === "ok")) {
    // Zero remote results with healthy providers is valid (no matches observed).
  }
  for (const c of input.candidates) {
    if (!c.id || !c.canonicalUrl) throw new Error("Malformed evidence: candidate missing id/canonicalUrl.");
  }
  return {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    investigationId: input.investigationId,
    mode: input.mode,
    provider: input.provider,
    createdAt: input.createdAt,
    asset: input.asset,
    fingerprint: input.fingerprint,
    face: input.face,
    faceIntegrity: input.faceIntegrity,
    metadata: input.metadata,
    providerRuns: input.providerRuns,
    candidates: input.candidates,
    accounts: input.accounts,
    transformations: input.transformations,
    rankedSources: input.rankedSources,
    timeline: input.timeline,
    graph: input.graph,
    claims: input.claims,
    evidence: { items: input.evidence },
    verdict: input.verdict,
  };
}

/** Seal: canonicalize + hash. Same evidence always yields the same root. */
export function sealBundle(bundle: EvidenceBundle, sealedAt: string): SealedBundle {
  return { bundle, evidenceRoot: evidenceRootOf(bundle), sealedAt };
}

/** Verify: recompute the root and compare. Any field change fails. */
export function verifyBundle(bundle: EvidenceBundle, expectedRoot: string): VerificationResult {
  const actualRoot = evidenceRootOf(bundle);
  const failures: string[] =
    actualRoot === expectedRoot
      ? []
      : ["Evidence root mismatch: bundle differs from the sealed version (EVIDENCE MODIFIED)."];
  return { expectedRoot, actualRoot, match: failures.length === 0, checkedAt: new Date().toISOString(), failures };
}

/**
 * Privacy gate: the bundle (and therefore anything derived for-chain) must
 * never contain raw pixels, biometric descriptors/embeddings, or secrets.
 * Descriptors live only in ephemeral analysis memory, never in this object.
 */
const FORBIDDEN_KEYS = new Set([
  "descriptor", "descriptors", "embedding", "embeddings", "pixels",
  "imageBytes", "privateKey", "apiKey", "api_key", "secret", "credential",
]);

export function assertBundlePrivacy(bundle: EvidenceBundle): string[] {
  const hits: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`));
      return;
    }
    if (typeof v === "object" && v !== null) {
      for (const [k, val] of Object.entries(v)) {
        if (FORBIDDEN_KEYS.has(k)) hits.push(`forbidden key "${k}" at ${path}`);
        if (/api[_-]?key|private[_-]?key|secret|token/i.test(k) && typeof val === "string" && val.length > 0)
          hits.push(`possible credential at ${path}.${k}`);
        walk(val, `${path}.${k}`);
      }
    }
  };
  walk(bundle, "bundle");
  return hits;
}

/** Assert a value is safe to include in chain payloads/logging. */
export function assertChainSafe(value: unknown): string[] {
  const hits: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") {
      if (v.length > 4096) hits.push(`oversized string at ${path} (possible raw data leak)`);
      return;
    }
    if (Array.isArray(v)) {
      // Long float arrays smell like embeddings.
      if (v.length > 32 && v.every((x) => typeof x === "number")) {
        hits.push(`numeric vector at ${path} (possible embedding leak)`);
        return;
      }
      v.forEach((x, i) => walk(x, `${path}[${i}]`));
      return;
    }
    if (typeof v === "object" && v !== null) {
      for (const [k, val] of Object.entries(v)) {
        if (FORBIDDEN_KEYS.has(k)) hits.push(`forbidden key "${k}" at ${path}`);
        walk(val, `${path}.${k}`);
      }
    }
  };
  walk(value, "payload");
  return hits;
}
