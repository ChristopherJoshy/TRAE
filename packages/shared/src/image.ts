import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import exifr from "exifr";
import type {
  ImageFingerprint,
  MetadataObservation,
} from "./types.js";
import {
  colorSignature,
  dhash,
  phash,
  sharpness,
} from "./fingerprint.js";

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_PIXELS = 60_000_000;
export const MIN_DIMENSION = 8;

export type ImageFormat = "png" | "jpeg" | "webp" | null;

export function detectFormat(bytes: Uint8Array): ImageFormat {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
    bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a &&
    bytes[6] === 0x1a && bytes[7] === 0x0a
  )
    return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "jpeg";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  )
    return "webp";
  return null;
}

export interface ValidationResult {
  ok: boolean;
  format: ImageFormat;
  mime: string | null;
  errorCode: string | null;
  error: string | null;
}

const MIME_BY_FORMAT: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** Validate before decoding: type, size, magic bytes, bomb resistance. */
export function validateImage(bytes: Uint8Array, claimedMime?: string): ValidationResult {
  if (bytes.length === 0)
    return { ok: false, format: null, mime: null, errorCode: "empty-file", error: "File is empty." };
  if (bytes.length > MAX_IMAGE_BYTES)
    return {
      ok: false, format: null, mime: null, errorCode: "file-too-large",
      error: `File is ${(bytes.length / 1048576).toFixed(1)} MB; limit is 15 MB.`,
    };
  const format = detectFormat(bytes);
  if (format === null)
    return {
      ok: false, format: null, mime: null, errorCode: "unsupported-format",
      error: "Unsupported image format. JPG, PNG, and WEBP container signatures are accepted.",
    };
  if (claimedMime && claimedMime !== MIME_BY_FORMAT[format])
    return {
      ok: false, format, mime: MIME_BY_FORMAT[format] as string, errorCode: "mime-mismatch",
      error: `Declared type ${claimedMime} does not match file signature (${MIME_BY_FORMAT[format]}).`,
    };
  if (format === "png") {
    // Decompression-bomb pre-check from IHDR before full decode.
    try {
      const w = readU32BE(bytes, 16);
      const h = readU32BE(bytes, 20);
      if (w < MIN_DIMENSION || h < MIN_DIMENSION)
        return fail(format, "image-too-small", `Image is ${w}×${h}; minimum dimension is ${MIN_DIMENSION}px.`);
      if (w * h > MAX_PIXELS)
        return fail(format, "decompression-bomb", "Image dimensions exceed the pixel budget.");
    } catch {
      return fail(format, "corrupt-file", "PNG header is unreadable.");
    }
  }
  return { ok: true, format, mime: MIME_BY_FORMAT[format] as string, errorCode: null, error: null };
}

function fail(format: ImageFormat, errorCode: string, error: string): ValidationResult {
  return { ok: false, format, mime: format ? (MIME_BY_FORMAT[format] as string) : null, errorCode, error };
}

function readU32BE(b: Uint8Array, o: number): number {
  return (
    ((b[o] as number) * 0x1000000) +
    (((b[o + 1] as number) << 16) | ((b[o + 2] as number) << 8) | (b[o + 3] as number))
  ) >>> 0;
}

export interface DecodedImage {
  width: number;
  height: number;
  pixels: Buffer;
  mime: string;
}

/** Decode PNG/JPEG to RGBA. Throws a coded error on corrupt input. */
export function decodeImage(bytes: Uint8Array): DecodedImage {
  const v = validateImage(bytes);
  if (!v.ok) {
    const err = new Error(v.error ?? "Invalid image.");
    (err as { code?: string }).code = v.errorCode ?? "invalid-image";
    throw err;
  }
  try {
    if (v.format === "png") {
      const png = PNG.sync.read(Buffer.from(bytes));
      return { width: png.width, height: png.height, pixels: png.data, mime: "image/png" };
    }
    if (v.format === "jpeg") {
      const jpg = jpeg.decode(Buffer.from(bytes), { maxMemoryUsageInMB: 256 });
      if (!jpg) throw new Error("decode-failed");
      return { width: jpg.width, height: jpg.height, pixels: jpg.data, mime: "image/jpeg" };
    }
    const err = new Error("WEBP decode is not supported in this build; convert to PNG or JPG.");
    (err as { code?: string }).code = "webp-unsupported";
    throw err;
  } catch (e) {
    if ((e as { code?: string }).code) throw e;
    const err = new Error("Image is corrupt or undecodable.");
    (err as { code?: string }).code = "corrupt-file";
    throw err;
  }
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function fingerprintImage(bytes: Uint8Array, decoded: DecodedImage): ImageFingerprint {
  return {
    sha256: sha256Bytes(bytes),
    phash: phash(decoded.pixels, decoded.width, decoded.height),
    dhash: dhash(decoded.pixels, decoded.width, decoded.height),
    width: decoded.width,
    height: decoded.height,
    mime: decoded.mime,
    byteSize: bytes.length,
    colorSignature: colorSignature(decoded.pixels, decoded.width, decoded.height),
    sharpness: Math.round(sharpness(decoded.pixels, decoded.width, decoded.height) * 100) / 100,
  };
}

/**
 * Real metadata extraction: full EXIF/IFD0/GPS/XMP parse via exifr plus a
 * JUMBF-marker scan for C2PA presence. Best-effort provenance evidence —
 * metadata can be edited or stripped, so it is never trusted blindly.
 */
export async function extractMetadataReal(bytes: Uint8Array): Promise<MetadataObservation> {
  const exif: Record<string, string> = {};
  const notes: string[] = [];
  try {
    const parsed = await exifr.parse(Buffer.from(bytes), true);
    if (parsed) {
      for (const [k, v] of Object.entries(parsed)) {
        if (v === null || v === undefined) continue;
        if (typeof v === "object" && !(v instanceof Date)) continue;
        const s = String(v);
        if (s.length > 0 && s.length <= 256) exif[k] = s;
      }
      const gps = await exifr.gps(Buffer.from(bytes)).catch(() => null);
      if (gps && typeof gps.latitude === "number") {
        exif["GPSLatitude"] = String(gps.latitude);
        exif["GPSLongitude"] = String(gps.longitude);
        notes.push("Embedded GPS coordinates recovered — verify independently before relying on them.");
      }
    }
  } catch {
    notes.push("EXIF parse produced no usable blocks.");
  }
  const text = Buffer.from(bytes).toString("latin1");
  const markers: string[] = [];
  if (text.includes("jumb") || text.includes("c2pa") || text.includes("C2PA")) {
    markers.push("jumb");
    if (text.includes("c2pa") || text.includes("C2PA")) markers.push("c2pa");
  }
  const c2paPresent = markers.length > 0;
  notes.push(
    c2paPresent
      ? "JUMBF/C2PA markers detected (presence scan only — full manifest validation not yet wired)."
      : "No C2PA/JUMBF provenance markers detected.",
  );
  if (Object.keys(exif).length === 0) notes.push("No EXIF tags recovered (stripped or never present).");
  else notes.push(`${Object.keys(exif).length} EXIF/XMP fields parsed with exifr.`);
  return { exif, c2pa: { present: c2paPresent, markers, note: notes[0] as string }, containerNotes: notes };
}

/** Sync legacy scan kept for offline/test contexts without async. */
export function extractMetadata(bytes: Uint8Array): MetadataObservation {
  const exif: Record<string, string> = {};
  const notes: string[] = [];
  const text = Buffer.from(bytes).toString("latin1");
  for (const tag of ["Make", "Model", "DateTime", "Software", "GPS"]) {
    const idx = text.indexOf(tag);
    if (idx !== -1) {
      const slice = text.slice(idx, idx + 64).replace(/[^\x20-\x7e]/g, " ").trim();
      if (slice.length > tag.length + 2) exif[tag] = slice.slice(0, 64);
    }
  }
  const markers: string[] = [];
  if (text.includes("jumb") || text.includes("c2pa") || text.includes("C2PA")) {
    markers.push("jumb");
    if (text.includes("c2pa") || text.includes("C2PA")) markers.push("c2pa");
  }
  const c2paPresent = markers.length > 0;
  notes.push(
    c2paPresent
      ? "Signed provenance markers detected; content still requires independent evaluation."
      : "No C2PA/JUMBF provenance markers detected.",
  );
  if (Object.keys(exif).length === 0) notes.push("No EXIF tags recovered (stripped or never present).");
  return { exif, c2pa: { present: c2paPresent, markers, note: notes[0] as string }, containerNotes: notes };
}
