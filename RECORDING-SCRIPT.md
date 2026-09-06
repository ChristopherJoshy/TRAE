# Screen recording script (≈3 minutes, one take, no editing)

Target: show face scan → matching post found → blockchain upload/verification.

## Setup (before recording)

```bash
npm install
```

`.env` must contain `EXA_API_KEY`. Test once: `node scripts/verify-evidence.mjs --evidence evidence/evidence-final.json`
(expect `EVIDENCE INTEGRITY VERIFIED`).

## Take

1. **Show the input** (10s): open `fixtures/real/portrait-woman.jpg` (Unsplash portrait, freely usable).
2. **Run the pipeline** (starts immediately, ~60–150s — narrate while it runs):
   ```bash
   node scripts/trace-pipeline.mjs --image-url "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=512&q=80&fm=jpg&fit=crop" --out evidence-demo.json
   ```
   Point out as lines appear: real BlazeFace box + score → live Exa candidates →
   measured per-page similarities → STRONGEST match URL + similarity → Evidence Root →
   contract deploy tx → anchor tx/block → on-chain `MATCH=true`.
3. **Show the match** (15s): open the STRONGEST post URL in a browser; `cat evidence-demo.json`
   (matches, root, chain tx).
4. **Tamper lab** (20s):
   ```bash
   node scripts/verify-evidence.mjs --evidence evidence-demo.json
   node scripts/verify-evidence.mjs --evidence evidence-demo.json --tamper
   ```
   VERIFIED → FAILED — EVIDENCE MODIFIED.

Upload unlisted (YouTube/Drive/Loom) and submit the repo link + recording link at
https://forms.gle/oZbQGuwiNeHVcHWo8 before Sept 7, 2026, 11:59 PM. No resubmissions.
