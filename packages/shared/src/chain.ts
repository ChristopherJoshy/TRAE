import { createHash } from "node:crypto";
import type { BlockchainAnchor } from "./types.js";
import { assertChainSafe } from "./bundle.js";

/** Minimal anchor contract ABI (see contracts/TraceAnchor.sol). */
export const TRACE_ANCHOR_ABI = [
  {
    type: "function",
    name: "anchorEvidence",
    stateMutability: "nonpayable",
    inputs: [
      { name: "evidenceRoot", type: "bytes32" },
      { name: "investigationIdHash", type: "bytes32" },
      { name: "schemaVersion", type: "string" },
      { name: "appVersion", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getAnchor",
    stateMutability: "view",
    inputs: [{ name: "evidenceRoot", type: "bytes32" }],
    outputs: [
      { name: "investigationIdHash", type: "bytes32" },
      { name: "timestamp", type: "uint64" },
      { name: "schemaVersion", type: "string" },
      { name: "appVersion", type: "string" },
      { name: "exists", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "verifyAnchor",
    stateMutability: "view",
    inputs: [
      { name: "evidenceRoot", type: "bytes32" },
      { name: "investigationIdHash", type: "bytes32" },
    ],
    outputs: [{ name: "anchored", type: "bool" }],
  },
  {
    type: "event",
    name: "EvidenceAnchored",
    inputs: [
      { name: "evidenceRoot", type: "bytes32", indexed: true },
      { name: "investigationIdHash", type: "bytes32", indexed: true },
      { name: "timestamp", type: "uint64", indexed: false },
    ],
  },
] as const;

export interface ChainConfig {
  rpcUrl: string | null;
  privateKey: string | null;
  chainId: number | null;
  contractAddress: string | null;
  appVersion: string;
}

export function chainConfigFromEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>): ChainConfig {
  const pick = (k: string) => {
    const v = env[k];
    return v && v.trim() !== "" ? v.trim() : null;
  };
  const chainIdRaw = pick("BLOCKCHAIN_CHAIN_ID");
  return {
    rpcUrl: pick("BLOCKCHAIN_RPC_URL"),
    privateKey: pick("BLOCKCHAIN_PRIVATE_KEY"),
    chainId: chainIdRaw ? Number(chainIdRaw) : null,
    contractAddress: pick("BLOCKCHAIN_CONTRACT_ADDRESS"),
    appVersion: pick("BLOCKCHAIN_APP_VERSION") ?? "0.1.0",
  };
}

export function chainStatusOf(cfg: ChainConfig): "CONFIGURED" | "NOT_CONFIGURED" {
  return cfg.rpcUrl && cfg.privateKey && cfg.contractAddress ? "CONFIGURED" : "NOT_CONFIGURED";
}

export function investigationIdHash(investigationId: string): string {
  return `0x${createHash("sha256").update(`trace:investigation:${investigationId}`).digest("hex")}`;
}

export interface AnchorPayload {
  evidenceRoot: `0x${string}`;
  investigationIdHash: `0x${string}`;
  schemaVersion: string;
  appVersion: string;
}

/** Build the on-chain payload: commitments only — never images or biometrics. */
export function buildAnchorPayload(
  evidenceRoot: string,
  investigationId: string,
  schemaVersion: string,
  appVersion: string,
): AnchorPayload {
  if (!/^0x[0-9a-fA-F]{64}$/.test(evidenceRoot))
    throw new Error("Invalid evidence root: expected 0x-prefixed 32-byte hex.");
  const payload: AnchorPayload = {
    evidenceRoot: evidenceRoot as `0x${string}`,
    investigationIdHash: investigationIdHash(investigationId) as `0x${string}`,
    schemaVersion,
    appVersion,
  };
  const leaks = assertChainSafe(payload);
  if (leaks.length > 0) throw new Error(`Anchor payload failed privacy gate: ${leaks.join("; ")}`);
  return payload;
}

/**
 * Live anchor via viem. Only called when chain config is complete; callers
 * surface NOT_CONFIGURED / FAILED honestly — success is never pretended.
 */
export async function anchorLive(
  cfg: ChainConfig,
  payload: AnchorPayload,
): Promise<BlockchainAnchor> {
  const { createWalletClient, createPublicClient, http } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  if (!cfg.rpcUrl || !cfg.privateKey || !cfg.contractAddress || !cfg.chainId) {
    return {
      ...payload,
      evidenceRoot: payload.evidenceRoot,
      chainId: cfg.chainId,
      contractAddress: cfg.contractAddress,
      txHash: null,
      blockNumber: null,
      anchoredAt: null,
      status: "NOT_CONFIGURED",
      error: "Blockchain credentials not configured. Evidence root remains verifiable locally.",
    };
  }
  try {
    const account = privateKeyToAccount(cfg.privateKey as `0x${string}`);
    const chain = {
      id: cfg.chainId,
      name: `trace-${cfg.chainId}`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [cfg.rpcUrl] } },
    };
    const wallet = createWalletClient({ account, chain, transport: http(cfg.rpcUrl) });
    const pub = createPublicClient({ chain, transport: http(cfg.rpcUrl) });
    const hash = await wallet.writeContract({
      address: cfg.contractAddress as `0x${string}`,
      abi: TRACE_ANCHOR_ABI,
      functionName: "anchorEvidence",
      args: [payload.evidenceRoot, payload.investigationIdHash, payload.schemaVersion, payload.appVersion],
    });
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
    return {
      ...payload,
      chainId: cfg.chainId,
      contractAddress: cfg.contractAddress,
      txHash: receipt.transactionHash,
      blockNumber: Number(receipt.blockNumber),
      anchoredAt: new Date().toISOString(),
      status: "ANCHORED",
      error: null,
    };
  } catch (e) {
    return {
      ...payload,
      chainId: cfg.chainId,
      contractAddress: cfg.contractAddress,
      txHash: null,
      blockNumber: null,
      anchoredAt: null,
      status: "FAILED",
      error: e instanceof Error ? e.message.slice(0, 300) : "Unknown anchoring failure.",
    };
  }
}

/** Local deterministic anchor log for TEST mode — explicitly simulated, never chain state. */
const localAnchors = new Map<string, { txHash: string; at: string }>();

export function anchorLocalTestOnly(evidenceRoot: string, investigationId: string): {
  txHash: string;
  simulated: true;
} {
  const txHash = `0x${createHash("sha256").update(`trace:test-anchor:${evidenceRoot}:${investigationId}`).digest("hex").slice(0, 64)}`;
  localAnchors.set(evidenceRoot, { txHash, at: new Date().toISOString() });
  return { txHash, simulated: true };
}

export function getLocalTestAnchor(evidenceRoot: string): { txHash: string; at: string } | null {
  return localAnchors.get(evidenceRoot) ?? null;
}
