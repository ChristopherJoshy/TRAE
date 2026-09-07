// Evidence re-verification, two layers:
//   1. Offline (default): recompute the Evidence Root from a saved bundle and
//      compare. Tamper lab: --tamper flips one field to show MISMATCH.
//   2. On-chain (--onchain): for sepolia-testnet bundles, re-query the chain
//      over public RPC (reads need no key) and compare live getAnchor +
//      verifyAnchor + event state against the file. Local-evm chains are
//      ephemeral per run, so --onchain on those explains and verifies root only.
// Usage:
//   node scripts/verify-evidence.mjs --evidence evidence/evidence-sepolia.json
//   node scripts/verify-evidence.mjs --evidence evidence/evidence-sepolia.json --onchain
//   node scripts/verify-evidence.mjs --evidence evidence/x.json --tamper
import { readFileSync } from "node:fs";
import { evidenceRootOf } from "@trace/shared";

const argv = process.argv.slice(2);
const get = (k) => argv[argv.indexOf(`--${k}`) + 1];
const file = get("evidence");
if (!file) {
  console.error("Usage: node scripts/verify-evidence.mjs --evidence <file> [--tamper] [--onchain]");
  process.exit(2);
}
const saved = JSON.parse(readFileSync(file, "utf8"));
const { evidenceRoot, chain, faceDescriptorCosineSelfCheck, ...record } = saved;
if (argv.includes("--tamper")) {
  record.matches[0].similarity = 0.5;
  console.log("(tamper lab: edited matches[0].similarity → 0.5)");
}
const actual = evidenceRootOf(record);
console.log("EXPECTED ROOT", evidenceRoot);
console.log("CURRENT ROOT ", actual);
if (actual !== evidenceRoot) {
  console.log("EVIDENCE INTEGRITY FAILED — EVIDENCE MODIFIED");
  process.exitCode = 1;
} else {
  console.log("EVIDENCE INTEGRITY VERIFIED");
}

if (argv.includes("--onchain")) {
  if (!chain || chain.kind !== "sepolia-testnet" || !chain.contractAddress) {
    console.log("ON-CHAIN RE-VERIFY: not a sepolia bundle (local-evm chains are ephemeral per run) — root check above is the verification.");
  } else {
    const { compileAnchor, verifyOnChain } = await import("./lib/local-chain.mjs");
    const { createPublicClient, http } = await import("viem");
    const rpcUrl = "https://ethereum-sepolia-rpc.publicnode.com";
    const sepolia = {
      id: 11155111, name: "sepolia",
      nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    };
    const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
    const { abi } = compileAnchor();
    const storedIdHash = saved.chain?.verification?.storedIdHash;
    if (!storedIdHash) throw new Error("Evidence file lacks chain.verification.storedIdHash.");
    const payload = {
      evidenceRoot,
      investigationIdHash: storedIdHash,
      schemaVersion: record.schemaVersion,
      appVersion: "0.1.0",
    };
    const check = await verifyOnChain(publicClient, chain.contractAddress, abi, payload, {
      fromBlock: BigInt(chain.deployBlock ?? 0),
    });
    const idOk = String(check.storedIdHash).toLowerCase() === String(storedIdHash).toLowerCase();
    console.log(`ON-CHAIN: exists=${check.exists} anchored=${check.anchored} events=${check.eventCount} idHashMatch=${idOk}`);
    console.log(`ON-CHAIN: https://sepolia.etherscan.io/address/${chain.contractAddress}#readContract`);
    if (check.exists && check.anchored && check.eventCount > 0 && idOk && actual === evidenceRoot) {
      console.log("ON-CHAIN RE-VERIFIED — live chain state matches the sealed bundle");
    } else {
      console.log("ON-CHAIN RE-VERIFY FAILED — live state differs from the file");
      process.exitCode = 1;
    }
  }
} else if (chain) {
  console.log(`chain ref: ${chain.kind} ${chain.contractAddress} anchorTx ${chain.anchorTx}`);
}
