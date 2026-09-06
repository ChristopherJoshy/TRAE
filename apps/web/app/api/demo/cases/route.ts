import { NextResponse } from "next/server";
import { DEMO_CASE_IDS, getDemoCase } from "@trace/shared";
import { ensureServer } from "@/lib/server";

export async function GET() {
  ensureServer();
  return NextResponse.json({
    mode: "demo" as const,
    notice: "Deterministic local evidence fixtures. No external reverse-image provider was queried.",
    cases: DEMO_CASE_IDS.map((id) => {
      const c = getDemoCase(id);
      return { id: c.id, title: c.title, narrative: c.narrative, candidates: c.candidates.length, providerFailed: c.providerFailed };
    }),
  });
}
