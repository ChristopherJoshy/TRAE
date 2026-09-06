import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fixtureDir } from "@/lib/server";

const ALLOWED = new Set([".png", ".jpg", ".jpeg"]);

/** Serve synthetic demo fixture bytes (test data only, never live evidence). */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const safe = basename(name);
  const ext = safe.slice(safe.lastIndexOf(".")).toLowerCase();
  if (safe !== name || !ALLOWED.has(ext)) {
    return NextResponse.json({ error: "Unknown fixture." }, { status: 404 });
  }
  const p = join(fixtureDir(), safe);
  if (!existsSync(p)) return NextResponse.json({ error: "Unknown fixture." }, { status: 404 });
  const bytes = readFileSync(p);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": ext === ".png" ? "image/png" : "image/jpeg",
      "Cache-Control": "public, max-age=3600",
      "X-Trace-Fixture": "synthetic-test-data",
    },
  });
}
