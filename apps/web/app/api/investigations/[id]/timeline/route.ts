import { NextResponse } from "next/server";
import { loadStored } from "@trace/shared";
import { ensureServer } from "@/lib/server";

async function slice(req: Request, ctx: { params: Promise<{ id: string }> }, key: "timeline" | "graph" | "evidence") {
  ensureServer();
  const { id } = await ctx.params;
  const stored = loadStored(id);
  if (!stored?.seal) return NextResponse.json({ error: "Investigation or seal not found." }, { status: 404 });
  return NextResponse.json(stored.seal.bundle[key]);
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const url = new URL(req.url);
  const kind = url.pathname.endsWith("/graph") ? "graph" : url.pathname.endsWith("/evidence") ? "evidence" : "timeline";
  return slice(req, ctx, kind);
}
