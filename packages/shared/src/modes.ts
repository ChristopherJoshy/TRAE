import type { TraceMode } from "./types.js";

/** Resolve the runtime mode. Never silently fall back to demo for live work. */
export function resolveMode(raw: string | undefined | null): TraceMode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "live") return "live";
  if (v === "test") return "test";
  return "demo";
}

export function modeLabel(mode: TraceMode): string {
  return mode === "live" ? "LIVE MODE" : mode === "test" ? "TEST MODE" : "DEMO MODE";
}

export function modeExplanation(mode: TraceMode): string {
  if (mode === "live")
    return "Live external reverse-image provider was queried. Results reflect real provider responses.";
  if (mode === "test")
    return "Deterministic test harness. No external provider was queried.";
  return "Deterministic local evidence fixtures. No external reverse-image provider was queried.";
}
