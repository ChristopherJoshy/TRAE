import { NextResponse } from "next/server";
import { modeLabel } from "@trace/shared";
import { chainInfo, ensureServer, providerStatus, serverMode } from "@/lib/server";

export async function GET() {
  ensureServer();
  const mode = serverMode();
  return NextResponse.json({
    ok: true,
    service: "trace-api",
    version: "0.1.0",
    mode,
    modeLabel: modeLabel(mode),
    providers: providerStatus(),
    chain: chainInfo(),
    time: new Date().toISOString(),
  });
}
