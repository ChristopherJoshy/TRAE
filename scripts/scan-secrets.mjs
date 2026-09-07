// Static secret-leak scan. Fails CI if probable secrets appear in tracked
// source. Run: node ./scripts/scan-secrets.mjs
// Notes:
// - A local .env is REQUIRED for live keys; it fails only if git-tracked or
//   not covered by .gitignore.
// - evidence/ holds PUBLIC commitments (evidence roots, tx hashes) by design;
//   the 64-hex rule does not apply there.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const ROOT = import.meta.dirname;
const PARENT = join(ROOT, "..");
const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", "dist", "coverage", "data",
  "test-results", "playwright-report", ".vercel",
]);
const SKIP_FILES = new Set(["pnpm-lock.yaml", "package-lock.json"]);

const RULES = [
  [/BLOCKCHAIN_PRIVATE_KEY\s*=\s*\S+/i, "private key assignment"],
  [/TINEYE_API_KEY\s*=\s*["']?[A-Za-z0-9]{8,}/, "api key value"],
  [/SERPAPI_API_KEY\s*=\s*["']?[A-Za-z0-9]{8,}/, "api key value"],
  [/0x[0-9a-fA-F]{64}/, "64-hex secret-like literal"],
  [/-----BEGIN (RSA )?PRIVATE KEY-----/, "private key block"],
  [/["']sk-(live|test)-[A-Za-z0-9]/, "sk- secret key"],
];

// Deterministic test vectors / public-commitment contexts (never secrets).
const ALLOW_64HEX = [/abc123/, /dead/, /expected 0x-prefixed/i, /0x-prefixed/, /\^0x\[/, /slice\(0, 1[68]\)/, /etherscan\.io/, /\/(tx|address)\/0x/];
const SKIP_SELF = "scan-secrets.mjs";

let failures = 0;

function gitTracked(relPosix) {
  try {
    execSync(`git ls-files --error-unmatch "${relPosix}"`, { cwd: PARENT, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function gitIgnored(relPosix) {
  try {
    execSync(`git check-ignore -q "${relPosix}"`, { cwd: PARENT, stdio: "pipe" });
    return true;
  } catch {
    // No repo yet: fall back to a literal .gitignore read.
    try {
      const ignore = readFileSync(join(PARENT, ".gitignore"), "utf8");
      return ignore.split("\n").some((l) => l.trim() === relPosix || l.trim() === ".env");
    } catch {
      return false;
    }
  }
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || SKIP_FILES.has(name) || name === SKIP_SELF) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      walk(p);
      continue;
    }
    const rel = p.slice(PARENT.length + 1).replace(/\\/g, "/");
    if (name === ".env") {
      if (gitTracked(rel)) {
        console.error(`FAIL: tracked secret file ${p}`);
        failures++;
      } else if (!gitIgnored(rel)) {
        console.error(`FAIL: .env present but not gitignored at ${p}`);
        failures++;
      }
      continue;
    }
    if (st.size > 300_000) continue;
    if (/\.(png|jpg|jpeg|webp|bin|ico|woff2?|ttf|mp4|tflite|task)$/i.test(name)) continue;
    let text;
    try {
      text = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    const isEvidence = rel.startsWith("evidence/");
    text.split("\n").forEach((line, i) => {
      for (const [re, label] of RULES) {
        if (isEvidence && re.source.startsWith("0x")) continue;
        if (!re.test(line)) continue;
        if (re.source.startsWith("0x") && ALLOW_64HEX.some((a) => a.test(line))) continue;
        if (name === ".env.example" && /(=\s*$|=your-|=xxx|=changeme|=placeholder)/i.test(line)) continue;
        console.error(`FAIL [${label}] ${p}:${i + 1}: ${line.trim().slice(0, 120)}`);
        failures++;
      }
    });
  }
}

walk(PARENT);
if (failures > 0) {
  console.error(`\nscan-secrets: ${failures} finding(s).`);
  process.exit(1);
}
console.log("scan-secrets: clean.");
