"use client";
import { useMemo, useState } from "react";
import type { ProvenanceEdge, ProvenanceGraph, ProvenanceNode, RankedSource, SearchCandidate } from "@trace/shared";

const KIND_COLOR: Record<string, string> = {
  IMAGE: "var(--trace-accent)",
  PERSON_EVIDENCE: "#c9a7ff",
  SOURCE: "var(--trace-support)",
  POST: "#7cc7ff",
  ARTICLE: "#7cc7ff",
  ACCOUNT: "#ffb224",
  TRANSFORMATION: "#ff9d5d",
  CLAIM: "#a3a099",
  EVIDENCE: "#a3a099",
  WEBSITE: "var(--trace-support)",
};

/** Provenance Constellation: interactive evidence graph, not decoration. */
export function Constellation(props: {
  graph: ProvenanceGraph;
  ranked: RankedSource[];
  candidates: SearchCandidate[];
  focusCandidateId: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);

  const layout = useMemo(() => layoutGraph(props.graph, props.ranked), [props.graph, props.ranked]);
  const selectedNode: ProvenanceNode | null = props.graph.nodes.find((n) => n.id === selected) ?? null;
  const selectedEdges: ProvenanceEdge[] = props.graph.edges.filter(
    (e) => e.from === selected || e.to === selected,
  );
  const focusEdges = props.graph.edges.filter(
    (e) =>
      props.focusCandidateId &&
      (e.from === `src:${props.focusCandidateId}` || e.to === `src:${props.focusCandidateId}`),
  );

  return (
    <section aria-label="Provenance constellation" className="trace-panel p-4">
      <h2 className="trace-mono text-xs tracking-[0.2em]" style={{ color: "var(--trace-dim)" }}>
        PROVENANCE CONSTELLATION — {props.graph.nodes.length} NODES · {props.graph.edges.length} EDGES
      </h2>
      {props.graph.nodes.length === 0 ? (
        <p className="mt-3 text-sm">No provenance graph — no candidates observed.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <svg
            viewBox="-360 -260 720 520"
            className="col-span-1 w-full lg:col-span-2"
            role="img"
            aria-label="Provenance graph. Use the node list for keyboard navigation."
            style={{ minHeight: 320 }}
          >
            {props.graph.edges.map((e) => {
              const a = layout.get(e.from);
              const b = layout.get(e.to);
              if (!a || !b) return null;
              const hot = e.id === hoverEdge || (props.focusCandidateId !== null && focusEdges.some((f) => f.id === e.id));
              return (
                <g key={e.id}>
                  <title>{`${e.kind} · confidence ${(e.confidence * 100).toFixed(0)}% — ${e.description}`}</title>
                  <line
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={hot ? "var(--trace-accent)" : "var(--trace-line)"}
                    strokeWidth={hot ? 2.5 : 1.2}
                    onMouseEnter={() => setHoverEdge(e.id)}
                    onMouseLeave={() => setHoverEdge(null)}
                    style={{ cursor: "pointer" }}
                  />
                </g>
              );
            })}
            {props.graph.nodes.map((n, i) => {
              const p = layout.get(n.id);
              if (!p) return null;
              const focused = props.focusCandidateId !== null && n.refId === props.focusCandidateId;
              return (
                <g
                  key={n.id}
                  onClick={() => setSelected(n.id)}
                  style={{ cursor: "pointer", animation: "trace-node 300ms ease-out backwards", animationDelay: `${Math.min(i * 40, 800)}ms` }}
                >
                  <title>{`${n.kind}: ${n.label}`}</title>
                  <circle
                    cx={p.x} cy={p.y} r={n.id === "img:input" ? 16 : focused || n.id === selected ? 12 : 9}
                    fill="var(--trace-bg)"
                    stroke={KIND_COLOR[n.kind] ?? "var(--trace-dim)"}
                    strokeWidth={n.id === selected || focused ? 3 : 1.5}
                  />
                  <text
                    x={p.x} y={p.y + 24} textAnchor="middle" fontSize={11}
                    fill={n.id === selected ? "var(--trace-accent)" : "var(--trace-dim)"}
                    fontFamily="ui-monospace, monospace"
                  >
                    {shortLabel(n)}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="border p-3 text-[13px]" style={{ borderColor: "var(--trace-line)" }} aria-live="polite">
            <h3 className="trace-mono text-[11px] tracking-[0.18em]" style={{ color: "var(--trace-dim)" }}>
              EVIDENCE INSPECTOR
            </h3>
            {selectedNode ? (
              <div className="mt-2">
                <p className="trace-mono" style={{ color: KIND_COLOR[selectedNode.kind] ?? "var(--trace-ink)" }}>
                  {selectedNode.kind}
                </p>
                <p className="mt-1">{selectedNode.label}</p>
                {selectedEdges.map((e) => (
                  <p key={e.id} className="mt-2 border-t pt-2" style={{ borderColor: "var(--trace-line)" }}>
                    <span className="trace-mono text-[11px]" style={{ color: "var(--trace-accent)" }}>
                      {e.kind} · {(e.confidence * 100).toFixed(0)}%
                    </span>
                    <br />
                    {e.description}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-2" style={{ color: "var(--trace-dim)" }}>
                Select a node to inspect its evidence relationships. Hover an edge for confidence.
              </p>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-[12px]">Node list (keyboard access)</summary>
              <ul className="mt-1 max-h-40 space-y-1 overflow-auto">
                {props.graph.nodes.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => setSelected(n.id)}
                      className="text-left text-[12px] underline"
                      style={{ color: "var(--trace-dim)" }}
                    >
                      {n.kind}: {n.label}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      )}
      <style>{`@keyframes trace-node { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </section>
  );
}

function shortLabel(n: ProvenanceNode): string {
  if (n.id === "img:input") return "IMAGE";
  if (n.id === "person:observed") return "FACE";
  const s = n.label;
  return s.length > 18 ? `${s.slice(0, 17)}…` : s;
}

function layoutGraph(graph: ProvenanceGraph, ranked: RankedSource[]): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  pos.set("img:input", { x: 0, y: 0 });
  pos.set("person:observed", { x: 0, y: -190 });
  const sources = graph.nodes.filter((n) => n.kind === "SOURCE");
  const rankIdx = new Map(ranked.map((r, i) => [r.candidateId, i]));
  sources.sort((a, b) => (rankIdx.get(a.refId ?? "") ?? 99) - (rankIdx.get(b.refId ?? "") ?? 99));
  sources.forEach((s, i) => {
    const ang = (-60 + (i * 240) / Math.max(1, sources.length - 1)) * (Math.PI / 180);
    const x = Math.round(210 * Math.cos(ang - Math.PI / 2));
    const y = Math.round(150 * Math.sin(ang - Math.PI / 2)) + 30;
    pos.set(s.id, { x, y });
    const post = graph.nodes.find((n) => n.refId === s.refId && (n.kind === "POST" || n.kind === "ARTICLE"));
    if (post) pos.set(post.id, { x: Math.round(x * 1.45), y: Math.round(y * 1.6) });
  });
  const rest = graph.nodes.filter(
    (n) => !pos.has(n.id) && (n.kind === "TRANSFORMATION" || n.kind === "ACCOUNT"),
  );
  rest.forEach((n, i) => {
    pos.set(n.id, { x: -300 + (i % 6) * 120, y: 200 - Math.floor(i / 6) * 60 });
  });
  graph.nodes
    .filter((n) => !pos.has(n.id))
    .forEach((n, i) => pos.set(n.id, { x: -240 + i * 120, y: -240 }));
  return pos;
}
