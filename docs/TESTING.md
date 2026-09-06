# TESTING

## Suites

| Suite | Where | What |
|---|---|---|
| Unit (domain) | `packages/shared/tests/core.test.ts` | canonicalization, URLs, timestamps, scoring, state machine, claims |
| Unit (vision) | `tests/vision.test.ts` | ingest validation, hashes, face heuristic, transforms |
| Integration | `tests/pipeline.test.ts` | happy path, case-e partial, corrupt input, unconfigured live provider, tamper mismatch |
| Providers | `tests/providers.test.ts` | normalization, malformed rejection, error mapping, zero/many results; live contract gated |
| Adversarial + property | `tests/adversarial.test.ts` | crop/compression/text/color/watermark vs unrelated, fake-timestamp ranking, ambiguity, idempotency/reorder invariants, hamming bounds |
| Privacy + chain | `tests/privacy.test.ts` | embedding/secret rejection, minimal payload, ABI shape, simulated anchor |
| Web validation | `apps/web/tests/validate.test.ts` | zod schemas, SSRF gate (private IPs, schemes, credentials) |
| Secrets scan | `scripts/scan-secrets.mjs` | static leak scan (CI) |
| E2E | `apps/web/tests/e2e/*.spec.ts` | Playwright: upload → workstation → seal → verify → tamper |

## Commands

```bash
npm test                                   # all unit + integration
npm run typecheck                          # both workspaces (needs shared built)
npm run scan:secrets
RUN_LIVE_PROVIDER_TESTS=true npm run test --workspace @trace/shared   # metered; needs TINEYE_API_KEY
npx playwright install chromium            # one-time browser fetch
npx playwright test --config apps/web/playwright.config.ts
```

## Coverage targets

Core domain ≥90%, canonicalization/crypto ≥95%, provider normalization ≥90%, API critical paths
via integration tests, contract via ABI + simulator tests (public testnets never in CI), frontend
critical flows via E2E. Current: 56 unit/integration tests green; E2E covers the judge path.

## Philosophy

Tests assert observable contracts (similarity ordering, root equality/inequality, status codes,
verdict wording) — never implementation echoes. A failing test is investigated, never deleted.
Red-team questions (identity spoofing, crop robustness, EXIF forgery, fake timestamps, SSRF,
UI injection, root replay, biometric leaks, mode confusion, false confidence on provider failure)
map to specific tests or LIMITATIONS entries.
