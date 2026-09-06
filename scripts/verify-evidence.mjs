// Offline evidence re-verification: recompute the Evidence Root from a saved
// bundle and compare. Tamper lab: --tamper flips one field to show MISMATCH.
// Usage: node scripts/verify-evidence.mjs --evidence evidence-final.json [--tamper]
import { readFileSync } from "node:fs";
import { evidenceRootOf } from "@trace/shared";

const argv = process.argv.slice(2);
const get = (k) => argv[argv.indexOf(`--${k}`) + 1];
const file = get("evidence");
if (!file) {
  console.error("Usage: node scripts/verify-evidence.mjs --evidence <file> [--tamper]");
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
if (actual === evidenceRoot) {
  console.log("EVIDENCE INTEGRITY VERIFIED");
  if (chain) console.log(`chain ref: ${chain.kind} ${chain.contractAddress} anchorTx ${chain.anchorTx}`);
} else {
  console.log("EVIDENCE INTEGRITY FAILED — EVIDENCE MODIFIED");
  process.exitCode = 1;
}
