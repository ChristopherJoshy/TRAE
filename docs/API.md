# API

Base: same origin as the web app. All responses JSON except `*/asset` and `/api/fixtures/*` (bytes).

## Routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | service, mode, providers, chain status |
| GET | `/api/providers` | provider list + config presence (never secrets) |
| GET | `/api/demo/cases` | demo cases (ids, titles, counts) |
| GET | `/api/investigations` | recent investigations |
| POST | `/api/investigations` | run full investigation |
| GET | `/api/investigations/{id}` | full stored record (seal + anchor) |
| GET | `/api/investigations/{id}/asset` | investigated image bytes |
| GET | `/api/investigations/{id}/timeline` | observed timeline |
| GET | `/api/investigations/{id}/graph` | provenance graph |
| GET | `/api/investigations/{id}/evidence` | evidence collection |
| POST | `/api/investigations/{id}/anchor` | on-chain anchor attempt |
| POST | `/api/verify` | recompute + compare evidence root |
| GET | `/api/fixtures/{name}` | synthetic demo bytes (`X-Trace-Fixture` header) |

## POST /api/investigations

Multipart (`image` file + optional `label`, `demoCaseId`, `provider`, `imageUrl`) or JSON
(`{label?, demoCaseId?, imageUrl?, provider?}`). Mode comes from `TRACE_MODE`.

- demo/test: `demoCaseId` selects the fixture case (default `case-b`).
- live: `provider` defaults to `REVERSE_SEARCH_PROVIDER`; `serpapi` requires public `imageUrl`.
- Errors are coded: `empty-file`, `unsupported-format`, `mime-mismatch`, `file-too-large`,
  `corrupt-file`, `private-target`, `bad-scheme`, `fetch-failed`, `provider-not-configured`, …

Returns `201` with the stored record including `seal.evidenceRoot`.

## POST /api/verify

`{investigationId}` or `{bundle, expectedRoot}` → `{expectedRoot, actualRoot, match, failures[]}`.

## POST /api/investigations/{id}/anchor

Builds the minimal commitment payload and submits via viem when configured. Returns
`{investigation, anchor}` where `anchor.status` is `ANCHORED`, `NOT_CONFIGURED`, or `FAILED`
— success is never pretended.

## Request/response models

Typed in `packages/shared/src/types.ts` (`Investigation`, `EvidenceBundle`, `SealedBundle`,
`BlockchainAnchor`, `VerificationResult`, …). API routes never expose raw pixels, face
descriptors, API keys, or private keys.
