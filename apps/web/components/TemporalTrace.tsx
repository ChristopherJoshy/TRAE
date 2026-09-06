"use client";
import type { ProvenanceTimeline, SearchCandidate } from "@trace/shared";

/** Temporal Trace: observed timeline; selection drives lens + graph focus. */
export function TemporalTrace(props: {
  timeline: ProvenanceTimeline;
  candidates: SearchCandidate[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const domainOf = (id: string | null) => props.candidates.find((c) => c.id === id)?.domain ?? "—";
  return (
    <section aria-label="Temporal trace" className="trace-panel p-4">
      <h2 className="trace-mono text-xs tracking-[0.2em]" style={{ color: "var(--trace-dim)" }}>
        TEMPORAL TRACE — OBSERVED TIMELINE (NOT PROOF OF ORIGIN)
      </h2>
      {props.timeline.events.length === 0 ? (
        <p className="mt-3 text-sm">No timestamps observed. Absence of a timeline proves nothing.</p>
      ) : (
        <div
          className="mt-3 flex gap-0 overflow-x-auto pb-2"
          role="listbox"
          aria-label="Timeline events"
          tabIndex={0}
          onKeyDown={(e) => {
            const ids = props.timeline.events.map((x) => x.candidateId);
            const cur = props.selectedId ? ids.indexOf(props.selectedId) : -1;
            if (e.key === "ArrowRight") props.onSelect(ids[Math.min(ids.length - 1, cur + 1)] ?? null);
            if (e.key === "ArrowLeft") props.onSelect(ids[Math.max(0, cur - 1)] ?? null);
          }}
        >
          {props.timeline.events.map((ev, i) => (
            <button
              key={ev.id}
              role="option"
              aria-selected={ev.candidateId === props.selectedId}
              onClick={() => props.onSelect(ev.candidateId)}
              className="min-w-[170px] flex-1 border-t-2 px-3 py-2 text-left"
              style={{
                borderColor: ev.candidateId === props.selectedId ? "var(--trace-accent)" : "var(--trace-line)",
                background: ev.candidateId === props.selectedId ? "rgba(216,255,62,0.06)" : "transparent",
              }}
            >
              <div className="trace-mono text-[11px]" style={{ color: "var(--trace-accent)" }}>
                ● {ev.at.value ? ev.at.value.slice(0, 10) : "undated"}
              </div>
              <div className="mt-1 text-[13px] font-semibold">{ev.label}</div>
              <div className="trace-mono mt-1 text-[11px]" style={{ color: "var(--trace-dim)" }}>
                {ev.kind} · {ev.at.quality} · conf {(ev.confidence * 100).toFixed(0)}
              </div>
              {i < props.timeline.events.length - 1 && (
                <div className="trace-mono mt-1 text-[11px]" style={{ color: "var(--trace-dim)" }}>
                  │ {domainOf(ev.candidateId)}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      {props.timeline.contradictions.length > 0 && (
        <div className="mt-3 border p-3 text-[13px]" style={{ borderColor: "var(--trace-warn)" }}>
          <h3 className="trace-mono text-[11px] tracking-[0.18em]" style={{ color: "var(--trace-warn)" }}>
            ⚠ {props.timeline.contradictions.length} CONTRADICTION(S) PRESERVED
          </h3>
          {props.timeline.contradictions.map((c) => (
            <p key={c.id} className="mt-1">
              {c.description}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
