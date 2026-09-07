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

Two modes (`--chain`):

- `local` (default) — ganache EVM (chain 1337), no funds or network needed.
- `sepolia` — Ethereum Sepolia testnet via `SEPOLIA_RPC_URL` (default public endpoint)
  with key from `SEPOLIA_PRIVATE_KEY`. Deploys `contracts/TraceAnchor.sol`, anchors the
  Evidence Root, and re-verifies `getAnchor`/`verifyAnchor` plus the `EvidenceAnchored`
  event. View the contract on https://sepolia.etherscan.io (address printed per run and
  stored as `chain.explorer` in the evidence file).

Fund the runner address with Sepolia ETH first (e.g. https://sepoliafaucet.com or
https://sepolia-faucet.pk910.de); the pipeline prints the exact address and stops honestly
with `chain-no-funds` when empty. Only `{evidenceRoot, investigationIdHash, schemaVersion,
appVersion}` goes on-chain — never images, embeddings, or personal data.

Live Sepolia deployment (Sept 2026, chain 11155111):

- Contract: https://sepolia.etherscan.io/address/0x122350c73ff0a63a1d7271a411040cc79417feab#code
- Anchor tx: https://sepolia.etherscan.io/tx/0x8001582f24e40b02fc58d31a3bf166cdacd231c9d345b62ecbdd31e9698a79b9
- Evidence: `evidence/evidence-sepolia.json` (re-verify offline with `verify-evidence`).
- `fixtures/` — `real/` portraits (Unsplash, freely usable) + synthetic hash-test images
- `models/` — MediaPipe `.tflite` models (BlazeFace, MobileNet embedder)
- `evidence/evidence-final.json` — sample verified run
- `docs/` — ARCHITECTURE, API, SECURITY, PRIVACY, TESTING, LIMITATIONS, DEMO

|---|---|---|
| `EXA_API_KEY` | yes (pipeline) | live web discovery + page evidence |
| `TRACE_MODE` | no | `demo` for the web app (default) |

## Known limitations

- Discovery depends on Exa's index; obscure images may yield no candidates (pipeline then stops honestly).
- Scripted Lens/Bing uploads are bot-walled from this network — documented probes in `scripts/*-probe.mjs`; Exa is the working search leg.
- Local chain is ephemeral per run (restart ganache → new chain); use a persistent testnet for durable anchors.
- Face embeddings never leave memory; similarity threshold calibrated on portrait photos, not a biometric identity claim.
- Full list: `docs/LIMITATIONS.md`.

## Credits

ASCII terminal preview: rendered in-repo from decoded pixels with the standard
luminance-ramp technique; decoders are `jpeg-js` + `pngjs` (both MIT). npm renderers
were vetted first and rejected on evidence: `image-to-ascii`/`img-to-ascii` need the
native `lwip2` build (fails on Windows), `ascii-art` needs native `canvas`, and
`console-image` (MIT, Hugh Kennedy) is browser-only CSS console art.