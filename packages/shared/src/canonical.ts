import { createHash } from "node:crypto";

/**
 * Deterministic canonicalization for evidence bundles.
 * - Object keys sorted recursively.
 * - Strings NFC-normalized.
 * - Numbers rounded to 6 decimal places (normalized precision).
 * - Arrays of objects carrying a string `id` are sorted by `id`, so
 *   semantically identical evidence in different order hashes identically.
 * - `undefined` values are dropped; NaN/Infinity become null.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(canonicalForm(value));
}

function canonicalForm(value: unknown): unknown {
  if (value === null || value === undefined) return value === undefined ? undefined : null;
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 1e6) / 1e6;
  }
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const items = value.map(canonicalForm);
    if (items.length > 0 && items.every(isIdObject)) {
      items.sort((a, b) =>
        (a as { id: string }).id < (b as { id: string }).id ? -1 : 1,
      );
    }
    return items;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = canonicalForm((value as Record<string, unknown>)[key]);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }
  return null;
}

function isIdObject(v: unknown): v is { id: string } {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { id: unknown }).id === "string"
  );
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Evidence Root = SHA-256 over the canonical serialization, 0x-prefixed. */
export function evidenceRootOf(bundle: unknown): string {
  return `0x${sha256Hex(canonicalize(bundle))}`;
}
