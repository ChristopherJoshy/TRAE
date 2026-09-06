"use client";
import type { EvidenceCollection } from "@trace/shared";

/** Evidence inspector: observations and inferences visually separated. */
export function EvidenceList({ evidence }: { evidence: EvidenceCollection }) {
  const obs = evidence.items.filter((i) => i.provenance === "observation");
  const inf = evidence.items.filter((i) => i.provenance === "inference");
  return (
    <section aria-label="Evidence" className="trace-panel p-4">
      <h2 className="trace-mono text-xs tracking-[0.2em]" style={{ color: "var(--trace-dim)" }}>
        EVIDENCE — {evidence.items.length} ITEMS
      </h2>
      <Group title="◉ OBSERVATIONS (what was seen)" items={obs} />
      <Group title="◎ INFERENCES (what is concluded)" items={inf} />
      {evidence.items.length === 0 && <p className="mt-3 text-sm">Insufficient evidence.</p>}
    </section>
  );
}

function Group({ title, items }: { title: string; items: EvidenceCollection["items"] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <h3 className="trace-mono text-[11px] tracking-[0.18em]" style={{ color: "var(--trace-ink)" }}>
        {title}
      </h3>
      <ul className="mt-2 space-y-2">
        {items.map((i) => (
          <li key={i.id} className="border p-3 text-[13px]" style={{ borderColor: "var(--trace-line)" }}>
            <div className="flex items-center justify-between gap-2">
              <span className="trace-mono text-[11px]" style={{ color: "var(--trace-accent)" }}>
                {i.type}
              </span>
              <span className="trace-mono text-[11px]" style={{ color: "var(--trace-dim)" }}>
                conf {(i.confidence * 100).toFixed(0)} · {i.source}
              </span>
            </div>
            <p className="mt-1">{i.description}</p>
            <p className="mt-1" style={{ color: "var(--trace-dim)" }}>
              Why: {i.explanation}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
