import { describe, expect, it } from "vitest";
import { assertBundlePrivacy, assertChainSafe } from "../src/bundle.js";
import {
  TRACE_ANCHOR_ABI,
  anchorLocalTestOnly,
  buildAnchorPayload,
  chainConfigFromEnv,
  chainStatusOf,
  getLocalTestAnchor,
  investigationIdHash,
} from "../src/chain.js";
import type { EvidenceBundle } from "../src/types.js";

const ROOT = "0xabc1230000000000000000000000000000000000000000000000000000000000";

describe("privacy gates", () => {
  it("chain payloads reject embeddings, images, and secrets", () => {
    expect(assertChainSafe({ evidenceRoot: ROOT, note: "ok" })).toEqual([]);
    expect(
      assertChainSafe({ embedding: Array.from({ length: 128 }, (_, i) => i / 128) }),
    ).not.toEqual([]);
    expect(assertChainSafe({ pixels: "x".repeat(5000) })).not.toEqual([]);
    expect(assertChainSafe({ apiKey: "secret-value" })).not.toEqual([]);
  });
  it("bundles must not carry forbidden keys", () => {
    const bundle = {
      face: { faces: [{ embeddingHash: "abc", descriptor: [0.1, 0.2] }] },
    } as unknown as EvidenceBundle;
    expect(assertBundlePrivacy(bundle).length).toBeGreaterThan(0);
  });
});

describe("chain commitments", () => {
  it("builds minimal payloads and rejects malformed roots", () => {
    const p = buildAnchorPayload(ROOT, "inv-123", "trace.bundle/v1", "0.1.0");
    expect(Object.keys(p).sort()).toEqual(["appVersion", "evidenceRoot", "investigationIdHash", "schemaVersion"]);
    expect(() => buildAnchorPayload("not-a-root", "inv-123", "v", "v")).toThrow();
  });
  it("investigation id hashes are deterministic and distinct", () => {
    expect(investigationIdHash("a")).toBe(investigationIdHash("a"));
    expect(investigationIdHash("a")).not.toBe(investigationIdHash("b"));
  });
  it("missing config reports NOT_CONFIGURED without secrets", () => {
    const cfg = chainConfigFromEnv({});
    expect(chainStatusOf(cfg)).toBe("NOT_CONFIGURED");
    const full = chainConfigFromEnv({
      BLOCKCHAIN_RPC_URL: "https://rpc.example",
      BLOCKCHAIN_PRIVATE_KEY: "0xdead",
      BLOCKCHAIN_CHAIN_ID: "11155111",
      BLOCKCHAIN_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
    });
    expect(chainStatusOf(full)).toBe("CONFIGURED");
  });
  it("contract ABI exposes anchor/get/verify + event", () => {
    const names = TRACE_ANCHOR_ABI.map((e) => (e as { name?: string }).name ?? (e as { type: string }).type);
    expect(names).toContain("anchorEvidence");
    expect(names).toContain("getAnchor");
    expect(names).toContain("verifyAnchor");
    expect(names).toContain("EvidenceAnchored");
  });
  it("local test anchors are explicitly simulated", () => {
    const a = anchorLocalTestOnly(ROOT, "inv-123");
    expect(a.simulated).toBe(true);
    expect(getLocalTestAnchor(ROOT)?.txHash).toBe(a.txHash);
  });
});
