# PRIVACY

Default model — what lives where:

| Data | Location |
|---|---|
| Raw uploaded image | Server disk only (`data/assets/<sha256>.bin`), served back read-only |
| Face descriptors / embeddings | Ephemeral analysis memory only; **never persisted, never bundled** |
| Face embedding hashes | Evidence bundle (one-way hashes for comparison records) |
| Normalized evidence, fingerprints | File store + evidence bundle |
| Chain payload | `{evidenceRoot, investigationIdHash, schemaVersion, appVersion}` only |
| Logs | ids, phases, durations, provider names, error codes — never pixels, embeddings, or secrets |

## Rules enforced in code

- `assertBundlePrivacy`: bundles must not contain `descriptor/embedding/pixels/*key/secret*`.
- `assertChainSafe`: chain payloads reject numeric vectors (embedding-shaped), oversized strings,
  and forbidden keys. Tested with adversarial inputs.
- UI carries a biometric notice on the upload form; face similarity is labeled evidence-only and
  never presented as identity proof; account ownership requires explicit account-control evidence.
- No scraping of authenticated/private content, no CAPTCHA/login bypass, no restriction evasion:
  providers are official APIs (TinEye, SerpApi) within their terms and rate limits.

## User obligations

Provide only images you have a lawful basis to analyze. Demo fixtures are synthetic (abstract
shapes, no real people) and use `.example` domains plus synthetic handles.
