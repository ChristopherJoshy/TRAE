# TRACE-3 — Face Identification & Blockchain Verification Pipeline

HH Goa 2026 · Shortlisting Task 3: Face Identification & Blockchain Verification.

**Pipeline:** face scan input → web/social discovery (live Exa neural search) → measured
page-image matching (real perceptual hashes, calibrated threshold) → evidence seal
(SHA-256 root) → blockchain anchor (real local EVM: ganache + `TraceAnchor.sol`, deployed
and called for real via viem) → on-chain re-verification. Every step is live; failures
stop the pipeline instead of inventing results.

## Quick start

Requires Node 20+ and an `EXA_API_KEY` in `.env` (copy `.env.example`).

```bash
npm install
npm run gen:fixtures        # synthetic unit-test images (optional for the pipeline)
node scripts/trace-pipeline.mjs --image-url "<public face image>" --out evidence.json
node scripts/verify-evidence.mjs --evidence evidence.json
node scripts/verify-evidence.mjs --evidence evidence.json --tamper   # shows MISMATCH
```

Local file input works too: `node scripts/trace-pipeline.mjs --image fixtures/real/portrait-woman.jpg`

Sample verified output: `evidence/evidence-final.json` (match similarity 0.989, on-chain MATCH=true).

## How it works

1. **Face scan** — input validated (magic bytes, 15 MB cap) and decoded; **MediaPipe BlazeFace**
   (real model, headless Chromium, local WASM) detects faces with scores; the largest face is
   cropped and embedded with a **MobileNetV3 ImageEmbedder** (1024-dim, memory-only, never stored).
2. **Web discovery** — live Exa `/search` (ID-token + context queries) finds genuinely related
   pages; Exa `/contents` + Exa-crawled `imageLinks` supply page evidence without bot-wall scraping.
3. **Measured matching** — each candidate page image is downloaded (SSRF-gated) and compared with
   windowed-containment perceptual similarity. Threshold **0.72**, calibrated: same image ≈1.0,
   different person ≈0.48, unrelated ≈0.47. Below threshold → no match, pipeline stops honestly.
4. **Seal** — canonical JSON → SHA-256 Evidence Root (`0x…`).
5. **Blockchain** — ganache local EVM (chain 1337) + solc-compiled `contracts/TraceAnchor.sol`,
   deployed and anchored for real; `getAnchor`/`verifyAnchor` + `EvidenceAnchored` event re-checked.
6. **Verify** — offline root recompute; `--tamper` proves modification detection.

## Which blockchain

Local EVM (ganache, chain ID 1337) running the committed `contracts/TraceAnchor.sol`
(`anchorEvidence` / `getAnchor` / `verifyAnchor`, `EvidenceAnchored` event). The task allows a
local chain; every hash, transaction, receipt, and event is real chain state. Swap `scripts/lib/local-chain.mjs`
for Sepolia/mainnet RPC + funded key to anchor publicly without changing the pipeline.

## Repo layout

- `scripts/trace-pipeline.mjs` — the pipeline CLI
- `scripts/verify-evidence.mjs` — offline verifier + tamper lab
- `scripts/lib/` — `mp-faces` (real MediaPipe service), `exa-search`, `page-images` (SSRF-gated matcher), `local-chain` (ganache+solc+viem), `visual-search`
- `contracts/TraceAnchor.sol` — anchor registry (commitments only, never images/biometrics)
- `packages/shared/` — domain lib (hashing, canonicalization, scoring, timeline/graph) + vitest suites
- `apps/web/` — bonus forensic-workstation frontend + API (demo mode, `npm run dev`)
- `fixtures/` — `real/` portraits (Unsplash, freely usable) + synthetic hash-test images
- `models/` — MediaPipe `.tflite` models (BlazeFace, MobileNet embedder)
- `evidence/evidence-final.json` — sample verified run
- `docs/` — ARCHITECTURE, API, SECURITY, PRIVACY, TESTING, LIMITATIONS, DEMO

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `EXA_API_KEY` | yes (pipeline) | live web discovery + page evidence |
| `TRACE_MODE` | no | `demo` for the web app (default) |

## Known limitations

- Discovery depends on Exa's index; obscure images may yield no candidates (pipeline then stops honestly).
- Scripted Lens/Bing uploads are bot-walled from this network — documented probes in `scripts/*-probe.mjs`; Exa is the working search leg.
- Local chain is ephemeral per run (restart ganache → new chain); use a persistent testnet for durable anchors.
- Face embeddings never leave memory; similarity threshold calibrated on portrait photos, not a biometric identity claim.
- Full list: `docs/LIMITATIONS.md`.
