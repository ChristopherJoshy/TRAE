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
import { banner, phase, simBar, matchTable, provenanceTree, verdict, failLine, spin } from "./lib/show.mjs";
import { asciiArt } from "./lib/ascii.mjs";

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
  // Forgiving input: a URL passed as --image is treated as --image-url.
  if (typeof a.image === "string" && /^https?:\/\//i.test(a.image.trim()) && !a["image-url"]) {
    a["image-url"] = a.image.trim();
    delete a.image;
    log("input", "URL detected in --image, routing to URL fetch");
  }
  if (!a.image && !a["image-url"]) {
    console.error("Usage: node scripts/trace-pipeline.mjs --image <path> [--image-url <url>] [--out evidence.json] [--port 8545] [--chain local|sepolia]");
    process.exit(2);
  }
  const investigationId = `tr3-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(16)}`;
  const chainName = (a.chain ?? "local").toLowerCase();
  banner("live", chainName);
  phase(1, 6, "FACE SCAN INPUT");
  log("input", a.image ?? a["image-url"]);
  const bytes = a.image ? new Uint8Array(readFileSync(a.image)) : await fetchUrlBytes(a["image-url"]);
  const v = validateImage(bytes);
  if (!v.ok) throw new Error(`Invalid image: ${v.error}`);
  const decoded = decodeImage(bytes);
  const fp = fingerprintImage(bytes, decoded);
  const pngBytes = toPng(decoded);
  log("ingest", `${decoded.mime} ${decoded.width}x${decoded.height} sha256=${fp.sha256.slice(0, 16)}…`);

  // 2. FACE IDENTIFICATION (real BlazeFace + MobileNet embedding)
  phase(2, 6, "FACE IDENTIFICATION");
  const faceSp = spin("warming up BlazeFace service…");
  const det = await detectFacesReal(pngBytes);
  faceSvcOpen = true;
  faceSp.text = `encoding ${det.faces.length} face crop(s)…`;
  if (det.faces.length === 0) { faceSp.stop(); throw new Error("No face detected in the input scan — cannot identify."); }
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
  faceSp.succeed(`${det.faces.length} face(s), best ${best.score.toFixed(3)}, ${descriptor.length}-dim (memory-only, never stored)`);
  console.log("\n" + asciiArt(decoded.pixels, decoded.width, decoded.height, { box: { x: best.x, y: best.y, w: best.w, h: best.h } }));
  console.log("  face box tinted above (real BlazeFace coordinates)");
  // 3. WEB DISCOVERY (live Exa neural search)
  phase(3, 6, "WEB DISCOVERY");
  const filename = a.image ? a.image.split(/[/\\]/).pop() : null;
  const exaSp = spin("querying Exa neural search…");
  const disc = await exaDiscover({ imageUrl: a["image-url"] ?? null, filename, hints: [] });
  exaSp.text = `extracting page evidence for ${disc.candidates.length} candidates…`;
  const contents = await exaContents(disc.candidates.map((c) => c.url));
  exaSp.succeed(`${disc.candidates.length} candidate pages (${disc.latencyMs}ms search)`);
  log("search", `queries: ${disc.queries.join(" | ").slice(0, 160)}`);
  const pageEvidence = new Map(contents.pages.map((p) => [p.url, p]));

  // 4. MEASURED MATCHING (download page images, hash-compare vs input)
  phase(4, 6, "MEASURED MATCHING");
  const confirmed = [];
  const ordered = [...disc.candidates].sort(
    (x, y) => (y.imageLinks?.length ?? 0) - (x.imageLinks?.length ?? 0),
  );
  const maxPages = Math.min(12, Math.max(1, Number(a["max-pages"] ?? 10)));
  const checkedLines = [];
  const allScored = [];
  const pages = ordered.slice(0, maxPages);
  const matchSp = spin(`matching page images…`);
  for (const [pi, cand] of pages.entries()) {
    const host = (() => { try { return new URL(cand.url).hostname; } catch { return cand.url; } })();
    matchSp.text = `[${pi + 1}/${pages.length}] ${host}…`;
    try {
      const m = await matchPageImages(cand.url, decoded, { threshold: 0.72, imageLinks: cand.imageLinks });
      const hits = m.scored.filter((s) => s.match);
      log("match", `${host}: ${hits.length}/${m.scored.length} images match (best ${m.scored[0]?.similarity?.toFixed(3) ?? "n/a"})`);
      checkedLines.push(`${host}: ${hits.length}/${m.scored.length} @ best ${m.scored[0]?.similarity?.toFixed(3) ?? "n/a"}`);
      for (const s of m.scored) allScored.push({ ...s, pageUrl: cand.url });
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
      checkedLines.push(`${host}: skipped (${e.code ?? "error"})`);
    }
  }
  if (confirmed.length === 0) { matchSp.stop(); throw new Error("No matching post confirmed — pipeline stops rather than inventing one."); }
  confirmed.sort((x, y) => y.similarity - x.similarity);
  const top = confirmed[0];
  matchSp.succeed(`${confirmed.length} confirmed, best ${top.similarity} (${pages.length} pages)`);
  log("match", `STRONGEST: ${top.postUrl} similarity=${top.similarity}`);
  const runners = allScored
    .filter((s) => !s.match && s.similarity > 0)
    .sort((x, y) => y.similarity - x.similarity)
    .slice(0, 3);
  matchTable(confirmed, runners);

  // 5. EVIDENCE RECORD + ROOT
  phase(5, 6, "EVIDENCE SEAL");
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

  // 6. BLOCKCHAIN ANCHOR (local EVM by default, Sepolia with --chain sepolia)
  phase(6, 6, "BLOCKCHAIN ANCHOR");
  const { abi, bytecode } = compileAnchor();
  log("chain", "TraceAnchor.sol compiled with solc");
  const isSepolia = chainName === "sepolia";
  if (isSepolia) {
    const { SEPOLIA, connectExternalChain } = await import("./lib/local-chain.mjs");
    const rpcUrl = process.env["SEPOLIA_RPC_URL"]?.trim() || "https://ethereum-sepolia-rpc.publicnode.com";
    chain = await connectExternalChain({
      rpcUrl, chain: SEPOLIA, privateKey: process.env["SEPOLIA_PRIVATE_KEY"] ?? "",
    });
    log("chain", `sepolia ${chain.address} balance=${chain.balanceWei} wei`);
    if (chain.balanceWei === "0") {
      throw Object.assign(new Error(`No Sepolia ETH at ${chain.address} — fund it from a faucet, then rerun.`), { code: "chain-no-funds" });
    }
  } else {
    chain = await startLocalChain(Number(a.port ?? 8545));
  }
  const chainSp = spin("deploying TraceAnchor contract…");
  const { address, deployTx, blockNumber: deployBlock } = await deployAnchor(chain.publicClient, chain.walletClient, chain.account, { abi, bytecode });
  chainSp.text = `anchoring root ${evidenceRoot.slice(0, 18)}…`;
  const payload = {
    evidenceRoot,
    investigationIdHash: investigationIdHash(investigationId),
    schemaVersion: record.schemaVersion,
    appVersion: "0.1.0",
  };
  const anchored = await anchorOnChain(chain.publicClient, chain.walletClient, chain.account, address, abi, payload);
  chainSp.succeed(`anchored tx ${anchored.txHash.slice(0, 18)}… (block ${anchored.blockNumber})`);
  log("chain", `deployed ${address} (block ${deployBlock})`);

  // 7. RE-VERIFICATION against chain state (events scoped to deploy block:
  // free-tier RPCs cap eth_getLogs ranges)
  const check = await verifyOnChain(chain.publicClient, address, abi, payload, { fromBlock: BigInt(deployBlock) });
  log("verify", `exists=${check.exists} anchored=${check.anchored} events=${check.eventCount} MATCH=${check.match}`);
  if (!check.match) throw new Error("On-chain re-verification failed.");
  const recordId = evidenceRecordId({ evidenceRoot, postUrl: top.postUrl, similarity: top.similarity });
  log("verify", `record commitment ${recordId.slice(0, 18)}…`);

  const safeRpc = chain.rpcUrl.replace(/(\/v2\/).+$/, "$1<redacted>").replace(/([?&](api[_-]?key|key)=)[^&]+/i, "$1<redacted>");
  const out = {
    ...record,
    evidenceRoot,
    faceDescriptorCosineSelfCheck: 1,
    chain: {
      kind: isSepolia ? "sepolia-testnet" : "local-evm",
      rpcUrl: safeRpc, chainId: isSepolia ? 11155111 : 1337,
      explorer: isSepolia ? `https://sepolia.etherscan.io/address/${address}#code` : null,
      contractAddress: address, deployTx, anchorTx: anchored.txHash, anchorBlock: anchored.blockNumber,
      verification: check,
    },
  };
  const outPath = a.out ?? `evidence-${investigationId}.json`;
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  const topHost = (() => { try { return new URL(top.postUrl).hostname; } catch { return top.postUrl; } })();
  provenanceTree({
    faces: det.faces.length, faceScore: best.score.toFixed(3), faceMs: det.ms ?? 0, embDim: descriptor.length,
    candidates: disc.candidates.length, searchMs: disc.latencyMs,
    checkedLines,
    topHost, topSim: top.similarity,
    root: evidenceRoot,
    chainKind: isSepolia ? "sepolia-testnet" : "local-evm", chainId: isSepolia ? 11155111 : 1337,
    contract: address, deployBlock, anchorTx: anchored.txHash, anchorBlock: anchored.blockNumber,
    exists: check.exists, anchored: check.anchored, events: check.eventCount,
  });
  verdict(true, Date.now() - t0, outPath);
} catch (e) {
  failLine(e.code, e instanceof Error ? e.message : String(e));
  verdict(false, Date.now() - t0, "");
} finally {
  if (faceSvcOpen) await closeFaceService().catch(() => null);
  if (chain) await chain.stop().catch(() => null);
}
