import { NextResponse } from "next/server";
import { loadAssetBytes, loadStored } from "@trace/shared";
import { ensureServer } from "@/lib/server";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  ensureServer();
  const { id } = await ctx.params;
  const stored = loadStored(id);
  if (!stored?.asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  const bytes = loadAssetBytes(stored.asset.storageKey);
  if (!bytes) return NextResponse.json({ error: "Asset bytes missing." }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": stored.asset.mime,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
