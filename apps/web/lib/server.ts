import { join } from "node:path";
import {
  chainConfigFromEnv,
  chainStatusOf,
  configureStore,
  resolveMode,
} from "@trace/shared";

let configured = false;

/** Repo root: two levels above apps/web (or TRACE_REPO_ROOT override). */
export function repoRoot(): string {
  return process.env["TRACE_REPO_ROOT"] ?? join(process.cwd(), "..", "..");
}

export function ensureServer(): void {
  if (configured) return;
  configureStore(process.env["TRACE_DATA_DIR"] ?? join(repoRoot(), "data"));
  configured = true;
}

export function fixtureDir(): string {
  return process.env["TRACE_FIXTURE_DIR"] ?? join(repoRoot(), "fixtures", "images");
}

export function serverMode() {
  return resolveMode(process.env["TRACE_MODE"]);
}

export function liveEnv() {
  return {
    tineyeApiKey: process.env["TINEYE_API_KEY"] || undefined,
    tineyeApiUrl: process.env["TINEYE_API_URL"] || undefined,
    serpapiApiKey: process.env["SERPAPI_API_KEY"] || undefined,
    serpapiApiUrl: process.env["SERPAPI_API_URL"] || undefined,
  };
}

export function providerStatus(): Array<{ id: string; configured: boolean; note: string }> {
  const e = liveEnv();
  return [
    {
      id: "demo",
      configured: true,
      note: "Deterministic local fixtures. No external query.",
    },
    {
      id: "tineye",
      configured: !!e.tineyeApiKey,
      note: e.tineyeApiKey ? "API key present." : "Set TINEYE_API_KEY to enable.",
    },
    {
      id: "serpapi",
      configured: !!e.serpapiApiKey,
      note: e.serpapiApiKey ? "API key present." : "Set SERPAPI_API_KEY to enable.",
    },
  ];
}

export function chainInfo() {
  const cfg = chainConfigFromEnv(process.env);
  const status = chainStatusOf(cfg);
  return {
    status: status === "CONFIGURED" ? "CONFIGURED" : "NOT_CONFIGURED",
    chainId: cfg.chainId,
    // Never leak addresses/keys beyond presence: contract address is public
    // on-chain data, safe to expose; private key and RPC URL never leave.
    contractAddress: cfg.contractAddress,
    appVersion: cfg.appVersion,
  };
}
