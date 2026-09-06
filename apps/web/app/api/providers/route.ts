import { NextResponse } from "next/server";
import { ensureServer, liveEnv, providerStatus, serverMode } from "@/lib/server";

export async function GET() {
  ensureServer();
  const mode = serverMode();
  const def = mode === "live" ? (process.env["REVERSE_SEARCH_PROVIDER"] ?? "tineye") : "demo";
  return NextResponse.json({ mode, defaultProvider: def, liveEnvPresent: !!liveEnv().tineyeApiKey || !!liveEnv().serpapiApiKey, providers: providerStatus() });
}
