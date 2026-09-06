"use client";

export function ModeBadge({ mode }: { mode: "demo" | "live" | "test" }) {
  const label = mode === "live" ? "LIVE MODE" : mode === "test" ? "TEST MODE" : "DEMO MODE";
  const color =
    mode === "live" ? "var(--trace-support)" : mode === "test" ? "var(--trace-warn)" : "var(--trace-warn)";
  const title =
    mode === "live"
      ? "Live external reverse-image provider was queried."
      : mode === "test"
        ? "Deterministic test harness. No external provider was queried."
        : "Deterministic local evidence fixtures. No external reverse-image provider was queried.";
  return (
    <span
      title={title}
      aria-label={label}
      className="trace-mono inline-flex items-center gap-2 border px-2 py-1 text-[11px] font-bold tracking-[0.18em]"
      style={{ borderColor: color, color }}
    >
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 9999, background: color }} />
      {label}
    </span>
  );
}

export function ChainBadge({ status }: { status: "ANCHORED" | "NOT_CONFIGURED" | "FAILED" | string }) {
  const map: Record<string, { label: string; color: string }> = {
    ANCHORED: { label: "BLOCKCHAIN ANCHORED", color: "var(--trace-support)" },
    NOT_CONFIGURED: { label: "CHAIN NOT CONFIGURED", color: "var(--trace-dim)" },
    FAILED: { label: "BLOCKCHAIN TRANSACTION FAILED", color: "var(--trace-bad)" },
  };
  const m = map[status] ?? { label: String(status), color: "var(--trace-dim)" };
  return (
    <span
      className="trace-mono inline-flex items-center gap-2 border px-2 py-1 text-[11px] font-bold tracking-[0.18em]"
      style={{ borderColor: m.color, color: m.color }}
      aria-label={m.label}
    >
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 9999, background: m.color }} />
      {m.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className="trace-mono border px-2 py-1 text-[11px] tracking-[0.18em]"
      style={{ borderColor: "var(--trace-line)", color: "var(--trace-dim)" }}
    >
      {status}
    </span>
  );
}
