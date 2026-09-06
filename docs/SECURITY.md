# SECURITY

Threat model: hostile uploads, malicious URLs, malicious provider payloads, secret leakage,
XSS via rendered evidence, tampered bundles. Research prototype — no auth layer; run trusted-locally.

## Controls

- **Upload validation** (`image.ts`): magic-byte detection, declared-MIME match, 15 MB cap,
  minimum dimensions, PNG IHDR pre-check against decompression bombs (60 MP budget), corrupt-file rejection.
- **SSRF gate** (`lib/validate.ts`): `assertFetchableUrl` allows http(s) only, rejects embedded
  credentials, resolves DNS and refuses private/loopback/link-local targets. Remote fetch enforces
  timeout, 15 MB cap, and image content-types. Tested (`tests/validate.test.ts`).
- **Provider payloads**: defensive normalization — entries without URLs dropped, unknown shapes
  rejected with `malformed-response`, HTTP statuses mapped to coded errors. Provider strings are
  rendered as text, never HTML (React escaping; no `dangerouslySetInnerHTML` anywhere).
- **Secrets**: env-only credentials; `chainInfo`/`providers` endpoints expose presence, never values;
  `scan:secrets` CI step fails on key material, key blocks, 64-hex literals, tracked `.env`.
- **Chain input**: `buildAnchorPayload` enforces `0x`+32-byte root format and runs the privacy gate.
- **Store paths**: investigation ids and asset keys strictly regex-validated (no traversal);
  fixture serving allowlists `.png/.jpg` basenames only.
- **CORS/auth**: same-origin API; no cookies/sessions. Multi-user hardening (auth, rate limits) is
  out of scope — see LIMITATIONS.

## Acceptance probes (all covered by tests or manual QA)

malformed image → 422 · oversized → 422 · mime mismatch → 422 · private-IP URL → 403 ·
bad scheme → 403 · bad provider JSON → dropped/failed run · XSS string in title → rendered inert ·
tampered bundle → verify MISMATCH · missing chain config → NOT_CONFIGURED (never fake success).
