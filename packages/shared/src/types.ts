/**
 * TRACE domain model — strongly typed investigation objects.
 * Observations (what was seen) and inferences (what is concluded) are
 * distinct: every EvidenceItem carries `provenance: "observation" | "inference"`.
 */

export type TraceMode = "demo" | "live" | "test";

export type InvestigationStatus =
  | "CREATED"
  | "INGESTING"
  | "ANALYZING"
  | "SEARCHING"
  | "CORRELATING"
  | "TIMELINE_BUILDING"
  | "GRAPH_BUILDING"
  | "READY_TO_SEAL"
  | "SEALED"
  | "ANCHORING"
  | "ANCHORED"
  | "PARTIAL"
  | "FAILED";

export interface StatusTransition {
  from: InvestigationStatus;
  to: InvestigationStatus;
  at: string;
}

export interface InvestigationError {
  code: string;
  message: string;
  phase: string;
  retryable: boolean;
}

export interface Investigation {
  id: string;
  mode: TraceMode;
  status: InvestigationStatus;
  createdAt: string;
  updatedAt: string;
  label: string;
  assetId: string | null;
  provider: string;
  errors: InvestigationError[];
  history: StatusTransition[];
}

export interface Asset {
  id: string;
  investigationId: string;
  mime: string;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  storedAt: string;
  /** Content-addressed storage key. Raw bytes never leave the server. */
  storageKey: string;
}

export interface FaceBox {
  /** Normalized 0..1 coordinates relative to image dimensions. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FaceQuality = "low" | "medium" | "high";

export interface FaceObservation {
  id: string;
  assetId: string;
  box: FaceBox;
  quality: FaceQuality;
  qualityScore: number;
  /** SHA-256 of the embedding bytes — the embedding itself is never persisted. */
  embeddingHash: string | null;
  warnings: string[];
}

export interface FaceAnalysis {
  detected: boolean;
  count: number;
  quality: FaceQuality;
  embeddingAvailable: boolean;
  faces: FaceObservation[];
  /** Cosine similarity against a reference embedding, when comparing. */
  similarity: number | null;
  warnings: string[];
  detector: string;
}

export interface ImageFingerprint {
  sha256: string;
  /** 64-bit perceptual hash (DCT), hex-encoded. */
  phash: string;
  /** 64-bit difference hash, hex-encoded. */
  dhash: string;
  width: number;
  height: number;
  mime: string;
  byteSize: number;
  /** Mean color-histogram signature used for crop/color-robust comparison. */
  colorSignature: number[];
  sharpness: number;
}

export interface C2paObservation {
  present: boolean;
  markers: string[];
  note: string;
}

export interface MetadataObservation {
  exif: Record<string, string>;
  c2pa: C2paObservation;
  containerNotes: string[];
}

export type TimestampQuality =
  | "EXACT"
  | "PROVIDER_REPORTED"
  | "PAGE_METADATA"
  | "INFERRED"
  | "UNKNOWN";

export interface TimestampEvidence {
  value: string | null;
  quality: TimestampQuality;
  source: string;
}

export type ReverseProviderId = "demo" | "tineye" | "serpapi";

export interface ProviderRun {
  provider: string;
  mode: TraceMode;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  status: "ok" | "failed";
  errorCode: string | null;
  resultCount: number;
}

export interface SearchCandidate {
  id: string;
  url: string;
  canonicalUrl: string;
  domain: string;
  platform: string;
  title: string | null;
  imageUrl: string | null;
  pageTimestamp: TimestampEvidence;
  retrievedAt: string;
  provider: string;
  providerResultId: string | null;
  exactHashMatch: boolean;
  perceptualSimilarity: number | null;
  faceSimilarity: number | null;
}

export interface AccountEvidence {
  id: string;
  candidateId: string;
  platform: string;
  handle: string | null;
  profileUrl: string | null;
  evidenceType:
    | "public-post"
    | "profile-metadata"
    | "account-control-challenge"
    | "signed-message"
    | "verified-credential"
    | "external-identity";
  detail: string;
  confidence: number;
}

export type TransformationKind =
  | "unchanged"
  | "recompressed"
  | "resized"
  | "cropped"
  | "screenshot"
  | "text-overlay"
  | "color-adjusted"
  | "watermark"
  | "unknown";

export interface Transformation {
  id: string;
  candidateId: string;
  kind: TransformationKind;
  confidence: number;
  evidence: string[];
}

export type ProvenanceNodeKind =
  | "IMAGE"
  | "PERSON_EVIDENCE"
  | "POST"
  | "ACCOUNT"
  | "WEBSITE"
  | "ARTICLE"
  | "SOURCE"
  | "TRANSFORMATION"
  | "CLAIM"
  | "EVIDENCE";

export interface ProvenanceNode {
  id: string;
  kind: ProvenanceNodeKind;
  label: string;
  refId: string | null;
}

export type ProvenanceEdgeKind =
  | "DEPICTS"
  | "PUBLISHED_BY"
  | "DERIVED_FROM"
  | "REPOST_OF"
  | "MATCHES"
  | "TEMPORALLY_PRECEDES"
  | "ASSOCIATED_WITH"
  | "SUPPORTED_BY"
  | "CONTRADICTED_BY";

export interface ProvenanceEdge {
  id: string;
  from: string;
  to: string;
  kind: ProvenanceEdgeKind;
  confidence: number;
  description: string;
  evidence: string[];
}

export interface ProvenanceGraph {
  nodes: ProvenanceNode[];
  edges: ProvenanceEdge[];
}

export interface TimelineEvent {
  id: string;
  at: TimestampEvidence;
  kind: string;
  label: string;
  candidateId: string | null;
  confidence: number;
  evidence: string[];
}

export interface TimelineContradiction {
  id: string;
  description: string;
  eventIds: string[];
}

export interface ProvenanceTimeline {
  events: TimelineEvent[];
  contradictions: TimelineContradiction[];
}

export interface EvidenceItem {
  id: string;
  type: string;
  source: string;
  observedAt: string | null;
  confidence: number;
  provenance: "observation" | "inference";
  description: string;
  explanation: string;
  payload: Record<string, unknown>;
}

export interface EvidenceCollection {
  items: EvidenceItem[];
}

export interface ScoreComponent {
  key: string;
  label: string;
  points: number;
  maxPoints: number;
  detail: string;
}

export interface ConfidenceScore {
  total: number;
  max: number;
  components: ScoreComponent[];
}

export interface RankedSource {
  candidateId: string;
  rank: number;
  score: ConfidenceScore;
  explanation: string[];
}

export type ClaimStatus = "supported" | "contradicted" | "insufficient";

export interface VerificationClaim {
  id: string;
  statement: string;
  evidenceIds: string[];
  status: ClaimStatus;
  explanation: string;
}

export interface InvestigationVerdict {
  sourceConfidence: number;
  identityEvidence: number;
  imageMatch: number;
  temporalConsistency: number;
  manipulationRisk: number;
  conclusion: string;
  whatNotProven: string[];
  limitations: string[];
}

export interface FaceIntegrity {
  naturalness: "LOW" | "MEDIUM" | "HIGH";
  naturalnessConfidence: number;
  warnings: string[];
  reasoning: string[];
  heuristicOnly: true;
}

export interface EvidenceBundle {
  schemaVersion: string;
  investigationId: string;
  mode: TraceMode;
  provider: string;
  createdAt: string;
  asset: Pick<Asset, "id" | "mime" | "byteSize" | "width" | "height" | "sha256">;
  fingerprint: ImageFingerprint;
  face: FaceAnalysis;
  faceIntegrity: FaceIntegrity;
  metadata: MetadataObservation;
  providerRuns: ProviderRun[];
  candidates: SearchCandidate[];
  accounts: AccountEvidence[];
  transformations: Transformation[];
  rankedSources: RankedSource[];
  timeline: ProvenanceTimeline;
  graph: ProvenanceGraph;
  claims: VerificationClaim[];
  evidence: EvidenceCollection;
  verdict: InvestigationVerdict;
}

export interface SealedBundle {
  bundle: EvidenceBundle;
  /** SHA-256 over the canonical serialization — the Evidence Root. */
  evidenceRoot: string;
  sealedAt: string;
}

export type AnchorStatus = "ANCHORED" | "NOT_CONFIGURED" | "FAILED";

export interface BlockchainAnchor {
  evidenceRoot: string;
  investigationIdHash: string;
  schemaVersion: string;
  appVersion: string;
  chainId: number | null;
  contractAddress: string | null;
  txHash: string | null;
  blockNumber: number | null;
  anchoredAt: string | null;
  status: AnchorStatus;
  error: string | null;
}

export interface VerificationResult {
  expectedRoot: string;
  actualRoot: string;
  match: boolean;
  checkedAt: string;
  failures: string[];
}
