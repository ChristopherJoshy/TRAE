import { NextResponse } from "next/server";
import { loadStored } from "@trace/shared";
import { ensureServer } from "@/lib/server";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  ensureServer();
  const { id } = await ctx.params;
  const stored = loadStored(id);
  if (!stored) return NextResponse.json({ error: "Investigation not found." }, { status: 404 });
  return NextResponse.json(stored);
}
