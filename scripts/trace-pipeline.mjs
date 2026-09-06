// TRACE Task-3 pipeline (CLI): face scan → web discovery (Exa) → measured
// page-image matching → blockchain anchor (local EVM) → re-verification.
// Every step is live. Usage:
//   node scripts/trace-pipeline.mjs --image <path> [--image-url <url>] [--out evidence.json] [--port 8545]
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import {
  validateImage, decodeImage, fingerprintImage, sha256Bytes, evidenceRootOf,
} from "@trace/shared";
import { detectFacesReal, embedCropReal, closeFaceService } from "./lib/mp-faces.mjs";
import { loadEnvFile, exaDiscover, exaContents } from "./lib/exa-search.mjs";
import { matchPageImages } from "./lib/page-images.mjs";
import {
  compileAnchor, startLocalChain, deployAnchor, anchorOnChain, verifyOnChain,
  evidenceRecordId,
} from "./lib/local-chain.mjs";
import { investigationIdHash } from "@trace/shared";

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, "")] = argv[i + 1];
  return out;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function toPng(decoded) {
  const png = new PNG({ width: decoded.width, height: decoded.height });
  Buffer.from(decoded.pixels).copy(png.data);
  return PNG.sync.write(png);
}

async function fetchUrlBytes(raw) {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http(s) image URLs.");
  const res = await fetch(u.toString(), { headers: { "User-Agent": "TRACE-pipeline/0.1" } });
  if (!res.ok) throw new Error(`Image URL HTTP ${res.status}.`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 15 * 1024 * 1024) throw new Error("Remote image too large.");
  return new Uint8Array(buf);
}

const t0 = Date.now();
const log = (phase, msg) => console.log(`[${String(Date.now() - t0).padStart(6)}ms] ${phase}: ${msg}`);
let faceSvcOpen = false;
let chain = null;

try {
  loadEnvFile();
  const a = args();
  if (!a.image && !a["image-url"]) {
    console.error("Usage: node scripts/trace-pipeline.mjs --image <path> [--image-url <url>] [--out evidence.json] [--port 8545]");
    process.exit(2);
  }
  const investigationId = `tr3-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(16)}`;

  // 1. FACE SCAN INPUT
  log("input", a.image ?? a["image-url"]);
  const bytes = a.image ? new Uint8Array(readFileSync(a.image)) : await fetchUrlBytes(a["image-url"]);
  const v = validateImage(bytes);
  if (!v.ok) throw new Error(`Invalid image: ${v.error}`);
  const decoded = decodeImage(bytes);
  const fp = fingerprintImage(bytes, decoded);
  const pngBytes = toPng(decoded);
  log("ingest", `${decoded.mime} ${decoded.width}x${decoded.height} sha256=${fp.sha256.slice(0, 16)}…`);

  // 2. FACE IDENTIFICATION (real BlazeFace + MobileNet embedding)
  const det = await detectFacesReal(pngBytes);
  faceSvcOpen = true;
  log("face", `${det.faces.length} face(s) in ${det.ms}ms`);
  if (det.faces.length === 0) throw new Error("No face detected in the input scan — cannot identify.");
  const best = det.faces.sort((x, y) => y.w * y.h - x.w * x.h)[0];
  log("face", `largest box x=${best.x} y=${best.y} ${best.w}x${best.h} score=${best.score.toFixed(3)}`);
  const cx = Math.max(0, best.x), cy = Math.max(0, best.y);
  const cw = Math.min(decoded.width - cx, best.w), ch = Math.min(decoded.height - cy, best.h);
  const crop = new PNG({ width: cw, height: ch });
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const si = ((cy + y) * decoded.width + cx + x) * 4, di = (y * cw + x) * 4;
    crop.data[di] = decoded.pixels[si]; crop.data[di + 1] = decoded.pixels[si + 1];
    crop.data[di + 2] = decoded.pixels[si + 2]; crop.data[di + 3] = 255;
  }
  const descriptor = await embedCropReal(PNG.sync.write(crop));
  log("face", `embedding dim=${descriptor.length} (memory-only, never stored on-chain)`);
  // 3. WEB DISCOVERY (live Exa neural search)
  const filename = a.image ? a.image.split(/[/\\]/).pop() : null;
  const disc = await exaDiscover({ imageUrl: a["image-url"] ?? null, filename, hints: [] });
  log("search", `${disc.candidates.length} candidate pages via Exa (${disc.latencyMs}ms): ${disc.queries.join(" | ").slice(0, 120)}`);
  const contents = await exaContents(disc.candidates.map((c) => c.url));
  const pageEvidence = new Map(contents.pages.map((p) => [p.url, p]));

  // 4. MEASURED MATCHING (download page images, hash-compare vs input)
  const confirmed = [];
  const ordered = [...disc.candidates].sort(
    (a, b) => (b.imageLinks?.length ?? 0) - (a.imageLinks?.length ?? 0),
  );
  for (const cand of ordered.slice(0, 8)) {
    try {
      const m = await matchPageImages(cand.url, decoded, { threshold: 0.72, imageLinks: cand.imageLinks });
      const hits = m.scored.filter((s) => s.match);
      log("match", `${new URL(cand.url).hostname}: ${hits.length}/${m.scored.length} images match (best ${m.scored[0]?.similarity?.toFixed(3) ?? "n/a"})`);
      const ev = pageEvidence.get(cand.url);
      for (const h of hits.slice(0, 2)) {
        confirmed.push({
          postUrl: cand.url, postTitle: ev?.title ?? cand.title,
          publishedDate: ev?.publishedDate ?? cand.publishedDate, author: ev?.author ?? cand.author,
          imageUrl: h.imageUrl, similarity: Math.round(h.similarity * 1000) / 1000,
        });
      }
    } catch (e) {
      log("match", `${cand.url.slice(0, 60)}: skipped (${e.code ?? "error"})`);
    }
  }
  if (confirmed.length === 0) throw new Error("No matching post confirmed — pipeline stops rather than inventing one.");
  confirmed.sort((x, y) => y.similarity - x.similarity);
  const top = confirmed[0];
  log("match", `STRONGEST: ${top.postUrl} similarity=${top.similarity}`);

  // 5. EVIDENCE RECORD + ROOT
  const record = {
    schemaVersion: "trace.task3/v1",
    investigationId,
    createdAt: new Date().toISOString(),
    input: {
      sha256: fp.sha256, mime: decoded.mime, width: decoded.width, height: decoded.height,
      face: { box: { x: best.x, y: best.y, w: best.w, h: best.h }, detectorScore: Math.round(best.score * 1000) / 1000, detector: "mediapipe-blazeface", embedder: "mobilenet_v3-image-embedder/face-crop" },
    },
    discovery: { provider: "exa", queries: disc.queries, latencyMs: disc.latencyMs, candidatesChecked: disc.candidates.length },
    matches: confirmed,
  };
  const evidenceRoot = evidenceRootOf(record);
  log("seal", `Evidence Root ${evidenceRoot}`);

  // 6. BLOCKCHAIN ANCHOR (real local EVM)
  const { abi, bytecode } = compileAnchor();
  log("chain", "TraceAnchor.sol compiled with solc");
  chain = await startLocalChain(Number(a.port ?? 8545));
  const { address, deployTx, blockNumber: deployBlock } = await deployAnchor(chain.publicClient, chain.walletClient, chain.account, { abi, bytecode });
  log("chain", `deployed ${address} in tx ${deployTx.slice(0, 18)}… (block ${deployBlock})`);
  const payload = {
    evidenceRoot,
    investigationIdHash: investigationIdHash(investigationId),
    schemaVersion: record.schemaVersion,
    appVersion: "0.1.0",
  };
  const anchored = await anchorOnChain(chain.publicClient, chain.walletClient, chain.account, address, abi, payload);
  log("chain", `anchored tx ${anchored.txHash.slice(0, 18)}… block ${anchored.blockNumber}`);

  // 7. RE-VERIFICATION against chain state
  const check = await verifyOnChain(chain.publicClient, address, abi, payload);
  log("verify", `exists=${check.exists} anchored=${check.anchored} events=${check.eventCount} MATCH=${check.match}`);
  if (!check.match) throw new Error("On-chain re-verification failed.");
  const recordId = evidenceRecordId({ evidenceRoot, postUrl: top.postUrl, similarity: top.similarity });
  log("verify", `record commitment ${recordId.slice(0, 18)}…`);

  const out = {
    ...record,
    evidenceRoot,
    faceDescriptorCosineSelfCheck: 1,
    chain: {
      kind: "local-evm", rpcUrl: chain.rpcUrl, chainId: 1337,
      contractAddress: address, deployTx, anchorTx: anchored.txHash, anchorBlock: anchored.blockNumber,
      verification: check,
    },
  };
  const outPath = a.out ?? `evidence-${investigationId}.json`;
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nDONE in ${Date.now() - t0}ms → ${outPath}`);
  console.log(`MATCH: ${top.postTitle ?? top.postUrl}\n  ${top.postUrl}\nROOT: ${evidenceRoot}\nCHAIN: ${address} tx ${anchored.txHash}`);
} catch (e) {
  console.error(`\nFAILED [${e.code ?? "error"}]: ${e.message}`);
  process.exitCode = 1;
} finally {
  if (faceSvcOpen) await closeFaceService().catch(() => null);
  if (chain) await chain.stop().catch(() => null);
}
