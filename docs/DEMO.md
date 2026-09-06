# DEMO

All demo content is synthetic and explicitly labeled `DEMO MODE`. Fixture URLs use RFC-2606
`.example` domains; handles (`@demo_mara`, …) are fictional. No external request is ever made.

## One-click judge path (60–90 seconds)

1. Open the app → **START INVESTIGATION** → keep `case-b`, press **RUN INVESTIGATION**.
2. Image enters → **PEEL THE IMAGE**: click layers 1→8 (face map → fingerprint → copies → root).
3. **PROVENANCE CONSTELLATION**: click nodes, hover edges for confidence + evidence.
4. **SIMILARITY LENS**: pick candidates, toggle Overlay + opacity, read WHY/DIFFERENCES.
5. **TEMPORAL TRACE**: scrub events; watch lens + graph focus follow.
6. **TRACE SEAL**: press **Verify integrity** → `EVIDENCE INTEGRITY VERIFIED`.
7. Tamper lab: open `/verify`, verify by id (MATCH), then paste the bundle with one edited field → `FAILED — EVIDENCE MODIFIED`.
8. Anchor: press **Anchor on-chain** without chain config → honest `CHAIN NOT CONFIGURED`.

## Cases

| Case | Story |
|---|---|
| `case-a` | High-confidence origin: exact match, earliest timestamp |
| `case-b` | Propagation chain: resize → text overlay → color shift (default) |
| `case-c` | Impersonation pattern: same face, two accounts, ownership unresolved |
| `case-d` | Ambiguous: two near-equal sources, no forced answer |
| `case-e` | Provider failure: partial evidence, sealed anyway |

## Fixtures

`npm run gen:fixtures` regenerates `fixtures/images/` + `manifest.json`: original, recompressed,
resized, cropped, text-overlay, color-shifted, watermarked, unrelated, multiface, noface, tiny,
corrupt, morph-like composite. Abstract shapes only — no real people.
