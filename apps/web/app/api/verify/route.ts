import { NextResponse } from "next/server";
import { loadStored, verifyBundle, type EvidenceBundle } from "@trace/shared";
import { ensureServer } from "@/lib/server";
import { VerifySchema } from "@/lib/validate";

export async function POST(req: Request) {
  ensureServer();
  try {
    const body = VerifySchema.parse(await req.json());
    if (body.investigationId) {
      const stored = loadStored(body.investigationId);
      if (!stored?.seal) return NextResponse.json({ error: "Investigation or seal not found." }, { status: 404 });
      const result = verifyBundle(stored.seal.bundle, stored.seal.evidenceRoot);
      return NextResponse.json({ ...result, investigationId: stored.investigation.id, mode: stored.seal.bundle.mode });
    }
    const result = verifyBundle(body.bundle as unknown as EvidenceBundle, body.expectedRoot as string);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Verification failed." },
      { status: 400 },
    );
  }
}
