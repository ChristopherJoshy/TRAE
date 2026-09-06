"use client";
import type { InvestigationVerdict } from "@trace/shared";

function Gauge({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  const good = invert ? value < 40 : value >= 70;
  const mid = !good && (invert ? value < 70 : value >= 40);
  const color = good
    ? invert
      ? "var(--trace-support)"
      : "var(--trace-support)"
    : mid
      ? "var(--trace-warn)"
      : "var(--trace-bad)";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="trace-mono text-[11px] tracking-[0.15em]" style={{ color: "var(--trace-dim)" }}>
          {label}
        </span>
        <span className="trace-mono text-xl font-bold" style={{ color }}>
          {value}
        </span>
      </div>
      <div
        className="mt-1 h-1.5 w-full"
        style={{ background: "var(--trace-line)" }}
        role="img"
        aria-label={`${label} ${value} of 100`}
      >
        <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
    </div>
  );
}

/** Verdict UI: evidence dimensions, never a bare REAL/FAKE stamp. */
export function VerdictPanel({ verdict }: { verdict: InvestigationVerdict }) {
  return (
    <section aria-label="Investigation verdict" className="trace-panel p-4">
      <h2 className="trace-mono text-xs tracking-[0.2em]" style={{ color: "var(--trace-dim)" }}>
        CURRENT CONCLUSION — EVIDENCE, NOT TRUTH
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-5">
        <Gauge label="SOURCE CONFIDENCE" value={verdict.sourceConfidence} />
        <Gauge label="IDENTITY EVIDENCE" value={verdict.identityEvidence} />
        <Gauge label="IMAGE MATCH" value={verdict.imageMatch} />
        <Gauge label="TEMPORAL CONSISTENCY" value={verdict.temporalConsistency} />
        <Gauge label="MANIPULATION RISK" value={verdict.manipulationRisk} invert />
      </div>
      <p className="mt-4 text-sm leading-relaxed">{verdict.conclusion}</p>
      <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--trace-line)" }}>
        <h3 className="trace-mono text-[11px] tracking-[0.2em]" style={{ color: "var(--trace-warn)" }}>
          ▲ WHAT THIS DOES NOT PROVE
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px]" style={{ color: "var(--trace-dim)" }}>
          {verdict.whatNotProven.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
