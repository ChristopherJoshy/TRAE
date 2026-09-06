import type {
  ProvenanceEdge,
  ProvenanceGraph,
  ProvenanceNode,
  SearchCandidate,
  TimelineContradiction,
  TimelineEvent,
  Transformation,
  ProvenanceTimeline,
} from "./types.js";
import { compareTimestamps } from "./time.js";

/** Build the observed timeline (what timestamps say) separately from inference. */
export function buildTimeline(
  candidates: SearchCandidate[],
  transformations: Transformation[],
): ProvenanceTimeline {
  const events: TimelineEvent[] = candidates
    .filter((c) => c.pageTimestamp.value !== null)
    .map((c) => ({
      id: `evt-${c.id}`,
      at: c.pageTimestamp,
      kind: "OBSERVED_SOURCE",
      label: `Observed at ${c.domain}`,
      candidateId: c.id,
      confidence:
        c.pageTimestamp.quality === "UNKNOWN"
          ? 0.1
          : c.pageTimestamp.quality === "INFERRED"
            ? 0.4
            : 0.8,
      evidence: [`page-timestamp:${c.id}`],
    }));

  for (const t of transformations) {
    const c = candidates.find((x) => x.id === t.candidateId);
    events.push({
      id: `evt-${t.id}`,
      at: c?.pageTimestamp ?? { value: null, quality: "UNKNOWN", source: "none" },
      kind: "TRANSFORMATION",
      label: `${t.kind} detected`,
      candidateId: t.candidateId,
      confidence: t.confidence,
      evidence: t.evidence,
    });
  }

  events.sort((a, b) => {
    const cmp = compareTimestamps(a.at, b.at);
    if (cmp !== null && cmp !== 0) return cmp;
    if (a.at.value === null && b.at.value !== null) return 1;
    if (b.at.value === null && a.at.value !== null) return -1;
    return a.id < b.id ? -1 : 1;
  });

  const contradictions: TimelineContradiction[] = [];
  // A candidate that is visually derived from another candidate but carries an
  // earlier timestamp contradicts a naive chronological reading.
  const derived = transformations.filter(
    (t) => t.kind !== "unchanged" && t.kind !== "unknown",
  );
  for (const t of derived) {
    const self = candidates.find((x) => x.id === t.candidateId);
    if (!self?.pageTimestamp.value) continue;
    for (const other of candidates) {
      if (other.id === self.id || !other.pageTimestamp.value) continue;
      if (
        (other.perceptualSimilarity ?? 0) >= (self.perceptualSimilarity ?? 0) &&
        other.pageTimestamp.value > self.pageTimestamp.value
      ) {
        contradictions.push({
          id: `contra-${t.id}`,
          description:
            `Candidate ${self.id} shows a ${t.kind} transformation but an earlier ` +
            `observed timestamp than the more similar candidate ${other.id}. ` +
            `Chronology alone cannot decide origin; preserved as a conflict.`,
          eventIds: [`evt-${self.id}`, `evt-${other.id}`],
        });
        break;
      }
    }
  }

  return { events, contradictions };
}

/** Build the provenance constellation graph with evidence on every edge. */
export function buildGraph(input: {
  investigationId: string;
  candidates: SearchCandidate[];
  transformations: Transformation[];
  rankedSourceIds: string[];
  claims: Array<{ id: string; statement: string }>;
}): ProvenanceGraph {
  const nodes: ProvenanceNode[] = [
    { id: "img:input", kind: "IMAGE", label: "Investigated image", refId: null },
    { id: "person:observed", kind: "PERSON_EVIDENCE", label: "Observed face evidence", refId: null },
  ];
  const edges: ProvenanceEdge[] = [
    {
      id: "e-depicts",
      from: "img:input",
      to: "person:observed",
      kind: "DEPICTS",
      confidence: 0.5,
      description: "Face region observed in the investigated image (evidence only).",
      evidence: ["face-analysis"],
    },
  ];

  const sorted = [...input.candidates].sort((a, b) =>
    a.canonicalUrl < b.canonicalUrl ? -1 : 1,
  );
  for (const c of sorted) {
    const sourceId = `src:${c.id}`;
    const postId = `post:${c.id}`;
    nodes.push(
      { id: sourceId, kind: "SOURCE", label: c.domain, refId: c.id },
      { id: postId, kind: c.platform === "Website" ? "ARTICLE" : "POST", label: c.title ?? c.domain, refId: c.id },
    );
    edges.push(
      {
        id: `e-match-${c.id}`,
        from: "img:input",
        to: sourceId,
        kind: "MATCHES",
        confidence: c.perceptualSimilarity ?? (c.exactHashMatch ? 1 : 0.2),
        description: c.exactHashMatch
          ? "Exact hash match observed."
          : "Visual similarity observed; strength varies.",
        evidence: [`candidate:${c.id}`],
      },
      {
        id: `e-pub-${c.id}`,
        from: postId,
        to: sourceId,
        kind: "PUBLISHED_BY",
        confidence: 0.6,
        description: `Candidate page observed on ${c.domain}. Publication is observed, not verified.`,
        evidence: [`candidate:${c.id}`],
      },
    );
  }

  // Temporal chain between consecutively observed sources.
  const withTime = sorted.filter((c) => c.pageTimestamp.value !== null);
  withTime.sort((a, b) =>
    (a.pageTimestamp.value as string) < (b.pageTimestamp.value as string) ? -1 : 1,
  );
  for (let i = 1; i < withTime.length; i++) {
    const prev = withTime[i - 1];
    const cur = withTime[i];
    if (!prev || !cur) continue;
    edges.push({
      id: `e-time-${prev.id}-${cur.id}`,
      from: `src:${prev.id}`,
      to: `src:${cur.id}`,
      kind: "TEMPORALLY_PRECEDES",
      confidence: 0.7,
      description: `Observed timestamps order ${prev.domain} before ${cur.domain}.`,
      evidence: [`page-timestamp:${prev.id}`, `page-timestamp:${cur.id}`],
    });
  }

  for (const t of input.transformations) {
    const tid = `tr:${t.id}`;
    nodes.push({ id: tid, kind: "TRANSFORMATION", label: t.kind, refId: t.id });
    edges.push({
      id: `e-der-${t.id}`,
      from: "img:input",
      to: tid,
      kind: "DERIVED_FROM",
      confidence: t.confidence,
      description: `${t.kind} transformation evidence.`,
      evidence: t.evidence,
    });
  }

  for (const claim of input.claims) {
    const cid = `claim:${claim.id}`;
    nodes.push({ id: cid, kind: "CLAIM", label: claim.statement, refId: claim.id });
    edges.push({
      id: `e-sup-${claim.id}`,
      from: cid,
      to: input.rankedSourceIds[0] ? `src:${input.rankedSourceIds[0]}` : "img:input",
      kind: "SUPPORTED_BY",
      confidence: 0.5,
      description: "Claim linked to supporting evidence items.",
      evidence: [`claim:${claim.id}`],
    });
  }

  return { nodes, edges };
}

/** Graph consistency: every edge must reference existing nodes, etc. */
export function validateGraph(graph: ProvenanceGraph): string[] {
  const errors: string[] = [];
  const ids = new Set(graph.nodes.map((n) => n.id));
  for (const e of graph.edges) {
    if (!ids.has(e.from)) errors.push(`Edge ${e.id} references missing node ${e.from}.`);
    if (!ids.has(e.to)) errors.push(`Edge ${e.id} references missing node ${e.to}.`);
    if (e.evidence.length === 0) errors.push(`Edge ${e.id} carries no evidence.`);
  }
  const seen = new Set<string>();
  for (const n of graph.nodes) {
    if (seen.has(n.id)) errors.push(`Duplicate node id ${n.id}.`);
    seen.add(n.id);
  }
  return errors;
}
