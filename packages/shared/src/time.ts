import type { TimestampEvidence, TimestampQuality } from "./types.js";

function toIso(d: Date): string | null {
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

/**
 * Normalize a timestamp into UTC ISO form with an explicit quality label.
 * Inferred/unknown values are never upgraded to exact.
 */
export function normalizeTimestamp(
  input: string | number | Date | null | undefined,
  source: string,
  quality: TimestampQuality = "PROVIDER_REPORTED",
): TimestampEvidence {
  if (input === null || input === undefined || input === "") {
    return { value: null, quality: "UNKNOWN", source };
  }
  let iso: string | null = null;
  if (input instanceof Date) iso = toIso(input);
  else if (typeof input === "number") iso = toIso(new Date(input > 1e12 ? input : input * 1000));
  else {
    const s = input.trim();
    if (/^\d{10}$/.test(s)) iso = toIso(new Date(Number(s) * 1000));
    else if (/^\d{13}$/.test(s)) iso = toIso(new Date(Number(s)));
    else iso = toIso(new Date(s));
  }
  if (iso === null) return { value: null, quality: "UNKNOWN", source };
  // Clamp absurd far-future dates instead of failing: keep value, mark inferred.
  if (iso > "2100-01-01T00:00:00.000Z") return { value: iso, quality: "INFERRED", source };
  return { value: iso, quality, source };
}

export function compareTimestamps(
  a: TimestampEvidence,
  b: TimestampEvidence,
): number | null {
  if (a.value === null || b.value === null) return null;
  if (a.value < b.value) return -1;
  if (a.value > b.value) return 1;
  return 0;
}
