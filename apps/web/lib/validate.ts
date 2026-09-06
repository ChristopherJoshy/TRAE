import { lookup } from "node:dns/promises";
import { z } from "zod";

export const DemoCaseSchema = z.enum(["case-a", "case-b", "case-c", "case-d", "case-e"]);

export const CreateInvestigationSchema = z.object({
  label: z.string().max(120).optional(),
  demoCaseId: DemoCaseSchema.optional(),
  imageUrl: z.string().url().max(2048).optional(),
  provider: z.enum(["demo", "tineye", "serpapi"]).optional(),
});

export const VerifySchema = z.object({
  investigationId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
  bundle: z.record(z.unknown()).optional(),
  expectedRoot: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
}).refine(
  (v) => v.investigationId !== undefined || (v.bundle !== undefined && v.expectedRoot !== undefined),
  { message: "Provide investigationId, or bundle + expectedRoot." },
);

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p as [number, number, number, number];
  return (
    a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0
  );
}

function isPrivateIP(ip: string): boolean {
  if (ip.includes(":")) {
    const l = ip.toLowerCase();
    return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80");
  }
  return isPrivateIPv4(ip);
}

/**
 * SSRF gate for server-side URL fetching: http(s) only, no credentials in
 * URL, hostname resolves to a public IP. Throws a coded error otherwise.
 */
export async function assertFetchableUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    const e = new Error("URL is malformed.");
    (e as { code?: string }).code = "bad-url";
    throw e;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    const e = new Error("Only http(s) URLs are accepted.");
    (e as { code?: string }).code = "bad-scheme";
    throw e;
  }
  if (u.username !== "" || u.password !== "") {
    const e = new Error("URLs with credentials are rejected.");
    (e as { code?: string }).code = "bad-url";
    throw e;
  }
  let addrs;
  try {
    addrs = await lookup(u.hostname, { all: true });
  } catch {
    const e = new Error("Hostname does not resolve.");
    (e as { code?: string }).code = "dns-failed";
    throw e;
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateIP(a.address))) {
    const e = new Error("URL targets a private or unresolvable network address; refused.");
    (e as { code?: string }).code = "private-target";
    throw e;
  }
  return u;
}

/** Fetch an image with timeout, size cap, and content-type enforcement. */
export async function fetchImageBytes(
  u: URL,
  timeoutMs = 20000,
  maxBytes = 15 * 1024 * 1024,
): Promise<{ bytes: Uint8Array; mime: string | undefined }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "TRACE-forensics/0.1 (+research prototype)" },
    });
    if (!res.ok) {
      const e = new Error(`Image URL returned HTTP ${res.status}.`);
      (e as { code?: string }).code = "fetch-failed";
      throw e;
    }
    const ct = res.headers.get("content-type")?.split(";")[0]?.trim();
    if (ct && !["image/png", "image/jpeg", "image/webp"].includes(ct)) {
      const e = new Error(`URL did not return an image (content-type ${ct}).`);
      (e as { code?: string }).code = "not-an-image";
      throw e;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > maxBytes) {
      const e = new Error("Remote image exceeds the 15 MB limit.");
      (e as { code?: string }).code = "file-too-large";
      throw e;
    }
    return { bytes: buf, mime: ct ?? undefined };
  } finally {
    clearTimeout(t);
  }
}

export function isPrivateIPExport(ip: string): boolean {
  return isPrivateIP(ip);
}
