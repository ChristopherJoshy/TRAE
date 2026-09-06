# ARCHITECTURE

## System shape

```
browser ──► Next.js (apps/web) ──┬──► React workstation (peel, lens, constellation, timeline, seal)
                                 └──► API routes ──► pipeline (@trace/shared) ──► file store (data/)
                                                        │         ├── providers (demo | tineye | serpapi)
                                                        │         └── fixtures/images (demo bytes)
                                                        └──► EVM anchor (viem) ──► TraceAnchor.sol
```

Single-server design: Next.js API routes are the backend. No separate Python service, no database
server. Investigations persist as JSON under `TRACE_DATA_DIR/investigations/`, raw bytes
content-addressed under `assets/<sha256>.bin`.

## Why no Python / OpenCV / face-recognition

A from-scratch Windows environment cannot reliably build dlib/OpenCV wheels in judging time, and
downloading hundred-megabyte models breaks reproducible demo setup. The vision layer is therefore
pure JS (`pngjs`, `jpeg-js`) with deterministic algorithms: DCT pHash, dHash, color signatures,
windowed containment matching, skin-tone/geometry face-region estimation. The face module exposes
a narrow interface (`analyzeFaces`, `describeRegion`) so a real embedding model can replace
`heuristic-baseline-v1` without touching callers. Every heuristic output is labeled as such in
data, API, tests, and UI.

## Module map (packages/shared)

| Module | Responsibility |
|---|---|
| `types` | 19 typed domain objects; observation vs inference split |
| `modes` | demo/live/test resolution + honest labels |
| `image` | validation (magic bytes, 15 MB, pixel budget), decode, metadata scan |
| `fingerprint` | pHash/dHash/color/sharpness, `robustSimilarity` (windowed containment) |
| `face` | heuristic regions, descriptors (memory-only), integrity screen |
| `transform` | signal-based classifier, `unknown` instead of forced answers |
| `providers` | `ReverseSearchProvider`, TinEye + SerpApi adapters, error normalization |
| `demo` | deterministic fixture engine (`.example` URLs, synthetic handles) |
| `scoring` | Source Confidence with inspectable components + weights |
| `provenance` | timeline (observed vs inferred) + graph builder + validator |
| `claims` | claim/evidence engine, verdict explanations, state machine |
| `bundle` | canonicalization-adjacent seal/verify, privacy gates |
| `canonical` | deterministic JSON, number precision, id-sorted arrays, SHA-256 root |
| `chain` | anchor payload (commitments only), viem live anchor, test simulator |
| `pipeline` | ingest→analyze→search→correlate→seal orchestration with failure paths |
| `store` | file-backed persistence |

## Key decisions

- **Canonical Evidence Root**: `0x` + SHA-256 over canonical JSON (sorted keys, NFC strings,
  6-decimal numbers, id-sorted arrays). Same evidence ⇒ same root; reorder-invariant; any field
  change ⇒ mismatch.
- **Observations ≠ inferences**: stored separately (`provenance` field), rendered separately,
  ranked explanations generated from evidence objects only.
- **Source Confidence, never truth score**: weighted, inspectable, configurable (`DEFAULT_WEIGHTS`).
- **Failure honesty**: provider/chain outages produce `PARTIAL` investigations with coded errors,
  never fake success. Invalid state transitions throw (tested).
- **Privacy by construction**: descriptors/pixels never enter bundles; chain payloads pass
  `assertChainSafe`; secrets never reach the browser (only presence flags + contract address).
- **No WEBP decode** in this build (container accepted at validation, decode refused with a clear
  error) — documented in LIMITATIONS.
- **Custom SVG constellation/timeline** instead of React Flow: fewer dependencies, full control of
  forensic styling, keyboard-accessible node list.
