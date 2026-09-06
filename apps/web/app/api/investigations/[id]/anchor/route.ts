import { NextResponse } from "next/server";
import {
  anchorLive,
  buildAnchorPayload,
  chainConfigFromEnv,
  loadStored,
  saveStored,
} from "@trace/shared";
import { ensureServer } from "@/lib/server";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  ensureServer();
  const { id } = await ctx.params;
  const stored = loadStored(id);
  if (!stored?.seal) return NextResponse.json({ error: "Investigation or seal not found." }, { status: 404 });

  const cfg = chainConfigFromEnv(process.env);
  const inv = stored.investigation;
  if (inv.status === "SEALED" || inv.status === "PARTIAL") {
    inv.history.push({ from: inv.status, to: "ANCHORING", at: new Date().toISOString() });
    inv.status = "ANCHORING";
  }
  try {
    const payload = buildAnchorPayload(
      stored.seal.evidenceRoot,
      stored.investigation.id,
      stored.seal.bundle.schemaVersion,
      cfg.appVersion,
    );
    const anchor = await anchorLive(cfg, payload);
    stored.anchor = anchor;
    inv.updatedAt = new Date().toISOString();
    if (anchor.status === "ANCHORED") {
      inv.history.push({ from: inv.status, to: "ANCHORED", at: new Date().toISOString() });
      inv.status = "ANCHORED";
    } else {
      inv.errors.push({
        code: anchor.status === "NOT_CONFIGURED" ? "chain-not-configured" : "anchor-failed",
        message: anchor.error ?? "Anchor unavailable.",
        phase: "anchor",
        retryable: anchor.status !== "NOT_CONFIGURED",
      });
      if (inv.status === "ANCHORING") {
        inv.history.push({ from: inv.status, to: "PARTIAL", at: new Date().toISOString() });
        inv.status = "PARTIAL";
      }
    }
  } catch (e) {
    stored.anchor = {
      evidenceRoot: stored.seal.evidenceRoot,
      investigationIdHash: "",
      schemaVersion: stored.seal.bundle.schemaVersion,
      appVersion: cfg.appVersion,
      chainId: cfg.chainId,
      contractAddress: cfg.contractAddress,
      txHash: null,
      blockNumber: null,
      anchoredAt: null,
      status: "FAILED",
      error: e instanceof Error ? e.message.slice(0, 300) : "Anchor failed.",
    };
    if (inv.status === "ANCHORING") {
      inv.history.push({ from: inv.status, to: "PARTIAL", at: new Date().toISOString() });
      inv.status = "PARTIAL";
    }
  }
  saveStored(stored);
  return NextResponse.json({ investigation: inv, anchor: stored.anchor });
}
