# AGENTS.md — TRACE working agreement

## Architecture map
- `packages/shared/src/` — all domain logic (pure TS + node: crypto/fs). No browser-only APIs.
  - `types.ts` domain model; `modes.ts` demo/live/test separation.
  - `image.ts` ingest+validate+decode (pngjs/jpeg-js, no native deps); `fingerprint.ts` pHash/dHash/color/sharpness.
  - `face.ts` heuristic face baseline (`heuristic-baseline-v1`, never ML-claimed); `transform.ts` classifier.
  - `providers.ts` ReverseSearchProvider + TinEye/SerpApi live adapters; `demo.ts` deterministic fixtures.
  - `scoring.ts` Source Confidence; `provenance.ts` timeline+graph; `claims.ts` claim engine + state machine.
  - `bundle.ts` seal/verify/privacy gates; `chain.ts` anchor payload + viem live anchor; `pipeline.ts` orchestration; `store.ts` file-backed persistence.
- `apps/web/` — Next.js 15 frontend + API routes (backend). Imports `@trace/shared`.
- `contracts/TraceAnchor.sol` — minimal anchor registry (commitments only).
- `fixtures/` — synthetic test images (abstract shapes, no real people) + manifest.
- `scripts/` — `gen-fixtures.mjs`, `scan-secrets.mjs`.

## Commands
- Install: `npm install` (root workspaces). Fixtures: `npm run gen:fixtures`.
- Dev: `npm run dev`. Build: `npm run build`. Typecheck: `npm run test: typecheck` → `npm run typecheck`.
- Tests: `npm test` (vitest in both workspaces). Secrets scan: `npm run scan:secrets`.
- Web dev server: `npm run dev --workspace apps/web`.

## Design decisions
- No Python/CV-native deps: pure-JS decoders keep Windows install reproducible. Face module is an
  explicitly labeled heuristic behind a swappable interface (`analyzeFaces`).
- No Postgres: file-backed JSON store (`TRACE_DATA_DIR`) with relational schema documented in `docs/API.md`.
  Raw bytes content-addressed under `assets/<sha256>.bin`.
- Custom SVG constellation + timeline instead of React Flow: fewer deps, forensic styling control.
- Modes are load-bearing: `TRACE_MODE=demo|live|test`. Demo uses `.example` URLs + synthetic handles only.

## Environment
See `.env.example`. Never commit `.env`. Never expose `BLOCKCHAIN_PRIVATE_KEY` / `*_API_KEY` to the browser.
Live provider tests only with `RUN_LIVE_PROVIDER_TESTS=true`.

## Security / data rules
- Validate uploads (magic bytes, 15 MB cap, pixel budget, mime match). SSRF: only http(s), no private IPs (see `docs/SECURITY.md`).
- Face descriptors stay in ephemeral memory; bundles/chain payloads carry hashes only (`assertBundlePrivacy`, `assertChainSafe`).
- Never present heuristic output as forensic proof; never present demo fixtures as live evidence.
- Copy rules: "strongest observed source", "evidence integrity seal" — never "true source"/"truth certificate".

## Naming
- Evidence Root = `0x`-prefixed SHA-256 of canonical bundle. TRACE Seal = rendered certificate, not legal proof.
- Source Confidence (never "truth score"). Face similarity (never identity).

## Known limitations
- Heuristic face/transform analysis, incomplete reverse-image indexes, falsifiable timestamps/metadata,
  no WEBP decode in this build, single-server persistence. Full list: `docs/LIMITATIONS.md`.
