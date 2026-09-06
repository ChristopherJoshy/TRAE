// TRACE deterministic fixture generator (pure JS: pngjs + jpeg-js, no native deps).
// All fixtures are synthetic test data — abstract shapes, never real people.
// Run: node ./scripts/gen-fixtures.mjs
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "fixtures", "images");
mkdirSync(outDir, { recursive: true });

const W = 256;
const H = 256;

function canvas() {
  return { data: Buffer.alloc(W * H * 4, 255), w: W, h: H };
}

function px(c, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  c.data[i] = r; c.data[i + 1] = g; c.data[i + 2] = b; c.data[i + 3] = a;
}

function fill(c, r, g, b) {
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) px(c, x, y, r, g, b);
}

function vgrad(c, top, bottom) {
  for (let y = 0; y < c.h; y++) {
    const t = y / (c.h - 1);
    for (let x = 0; x < c.w; x++)
      px(c, x, y,
        Math.round(top[0] + (bottom[0] - top[0]) * t),
        Math.round(top[1] + (bottom[1] - top[1]) * t),
        Math.round(top[2] + (bottom[2] - top[2]) * t));
  }
}

function disc(c, cx, cy, rad, r, g, b) {
  for (let y = Math.floor(cy - rad); y <= cy + rad; y++)
    for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= rad * rad) px(c, x, y, r, g, b);
    }
}

function rect(c, x0, y0, x1, y1, r, g, b, a = 255) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(c, x, y, r, g, b, a);
}

// Skin tone comfortably inside the heuristic band (R>95, R>G>B, |R-G|>15).
const SKIN = [214, 164, 128];
const SKIN2 = [188, 132, 100];

function portrait(c, cx, cy, rad, skin) {
  disc(c, cx, cy, rad, ...skin);                 // face
  disc(c, cx, cy - rad - 6, rad + 8, 46, 30, 20); // hair mass behind
  disc(c, cx, cy, rad, ...skin);                  // face over hair
  disc(c, cx - rad / 3, cy - 6, 7, 30, 22, 18);   // eyes
  disc(c, cx + rad / 3, cy - 6, 7, 30, 22, 18);
  rect(c, Math.round(cx - rad / 3), Math.round(cy + rad / 3), Math.round(cx + rad / 3), Math.round(cy + rad / 3 + 5), 150, 80, 70); // mouth
}

function savePng(c, name, w = c.w, h = c.h) {
  const png = new PNG({ width: w, height: h });
  if (w === c.w && h === c.h) {
    c.data.copy(png.data);
  } else {
    // Nearest-neighbor scale (deterministic).
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const sx = Math.min(c.w - 1, Math.floor((x * c.w) / w));
        const sy = Math.min(c.h - 1, Math.floor((y * c.h) / h));
        const si = (sy * c.w + sx) * 4, di = (y * w + x) * 4;
        png.data[di] = c.data[si]; png.data[di + 1] = c.data[si + 1];
        png.data[di + 2] = c.data[si + 2]; png.data[di + 3] = 255;
      }
  }
  const buf = PNG.sync.write(png);
  writeFileSync(join(outDir, name), buf);
  return buf;
}

function saveJpeg(c, name, quality) {
  const raw = { data: Buffer.from(c.data), width: c.w, height: c.h };
  const buf = jpeg.encode(raw, quality).data;
  writeFileSync(join(outDir, name), buf);
  return buf;
}

const manifest = {};
function record(name, buf, desc) {
  manifest[name] = {
    sha256: createHash("sha256").update(buf).digest("hex"),
    bytes: buf.length,
    description: `SYNTHETIC TEST FIXTURE — ${desc}`,
  };
}

// 1. Original: gradient room + centered portrait.
{
  const c = canvas();
  vgrad(c, [38, 44, 58], [86, 92, 110]);
  rect(c, 0, 200, 255, 255, 52, 60, 74);
  portrait(c, 128, 118, 52, SKIN);
  record("original.png", savePng(c, "original.png"), "exact original; one face-like region");
}
// 2. Recompressed JPEG q50.
{
  const c = canvas();
  vgrad(c, [38, 44, 58], [86, 92, 110]);
  rect(c, 0, 200, 255, 255, 52, 60, 74);
  portrait(c, 128, 118, 52, SKIN);
  record("recompressed.jpg", saveJpeg(c, "recompressed.jpg", 50), "JPEG recompressed derivative");
}
// 3. Resized 128×128.
{
  const c = canvas();
  vgrad(c, [38, 44, 58], [86, 92, 110]);
  rect(c, 0, 200, 255, 255, 52, 60, 74);
  portrait(c, 128, 118, 52, SKIN);
  record("resized.png", savePng(c, "resized.png", 128, 128), "resized derivative 128x128");
}
// 4. Cropped: 0.85x zoom viewport (keeps most content, aspect changed).
{
  const src = canvas();
  vgrad(src, [38, 44, 58], [86, 92, 110]);
  rect(src, 0, 200, 255, 255, 52, 60, 74);
  portrait(src, 128, 118, 52, SKIN);
  const c = canvas();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(x * 0.85), sy = Math.floor(y * 0.85);
      const si = (sy * src.w + sx) * 4, di = (y * W + x) * 4;
      c.data[di] = src.data[si]; c.data[di + 1] = src.data[si + 1]; c.data[di + 2] = src.data[si + 2];
    }
  record("cropped.png", savePng(c, "cropped.png"), "cropped derivative (aspect changed)");
}
// 5. Text overlay: white caption bar + dark glyph blocks.
{
  const c = canvas();
  vgrad(c, [38, 44, 58], [86, 92, 110]);
  rect(c, 0, 200, 255, 255, 52, 60, 74);
  portrait(c, 128, 108, 52, SKIN);
  rect(c, 0, 206, 255, 255, 245, 245, 240);
  for (let row = 0; row < 3; row++)
    for (let g = 0; g < 6; g++)
      rect(c, 14 + g * 38, 214 + row * 12, 14 + g * 38 + 24, 214 + row * 12 + 6, 30, 30, 34);
  record("text-overlay.png", savePng(c, "text-overlay.png"), "derivative with overlaid text bar");
}
// 6. Color shifted.
{
  const c = canvas();
  vgrad(c, [70, 40, 50], [130, 80, 95]);
  rect(c, 0, 200, 255, 255, 80, 52, 66);
  portrait(c, 128, 118, 52, [232, 150, 120]);
  record("color-shifted.png", savePng(c, "color-shifted.png"), "color-adjusted derivative");
}
// 7. Watermarked: translucent corner box + diagonal dots.
{
  const c = canvas();
  vgrad(c, [38, 44, 58], [86, 92, 110]);
  rect(c, 0, 200, 255, 255, 52, 60, 74);
  portrait(c, 128, 118, 52, SKIN);
  for (let y = 216; y < 248; y++)
    for (let x = 150; x < 246; x++) {
      const i = (y * W + x) * 4;
      c.data[i] = Math.round(c.data[i] * 0.6 + 255 * 0.4);
      c.data[i + 1] = Math.round(c.data[i + 1] * 0.6 + 255 * 0.4);
      c.data[i + 2] = Math.round(c.data[i + 2] * 0.6 + 255 * 0.4);
    }
  record("watermarked.png", savePng(c, "watermarked.png"), "watermarked derivative");
}
// 8. Unrelated: teal waves, no skin tones.
{
  const c = canvas();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = Math.sin(x / 12) * Math.cos(y / 16);
      px(c, x, y, 20, Math.round(140 + 60 * v), Math.round(150 + 50 * v));
    }
  record("unrelated.png", savePng(c, "unrelated.png"), "unrelated image; no face expected");
}
// 9. Multi-face: two portraits.
{
  const c = canvas();
  vgrad(c, [44, 40, 52], [90, 84, 100]);
  portrait(c, 78, 120, 40, SKIN);
  portrait(c, 182, 122, 38, SKIN2);
  record("multiface.png", savePng(c, "multiface.png"), "two face-like regions; ambiguity expected");
}
// 10. No face: gray machine room.
{
  const c = canvas();
  vgrad(c, [60, 60, 64], [110, 110, 116]);
  rect(c, 30, 40, 120, 150, 40, 42, 48);
  rect(c, 140, 60, 226, 190, 150, 152, 158);
  disc(c, 190, 90, 22, 30, 32, 38);
  record("noface.png", savePng(c, "noface.png"), "no face-like region expected");
}
// 11. Tiny 16×16.
{
  const c = canvas();
  vgrad(c, [38, 44, 58], [86, 92, 110]);
  portrait(c, 128, 118, 52, SKIN);
  record("tiny.png", savePng(c, "tiny.png", 16, 16), "very small image; low-quality expected");
}
// 12. Corrupt file.
{
  const buf = Buffer.from([0x00, 0x11, 0x22, 0x89, 0x50, 0x4e, 0x00, 0xff, 0xd8, 0x11, 0x22, 0x33]);
  writeFileSync(join(outDir, "corrupt.bin"), buf);
  record("corrupt.bin", buf, "corrupt file; must fail validation");
}
// 13. Morph-like composite: asymmetric halves + seam.
{
  const c = canvas();
  vgrad(c, [38, 44, 58], [86, 92, 110]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = x - 128, dy = y - 118;
      if (dx * dx + dy * dy <= 52 * 52) {
        const s = x < 128 ? SKIN : SKIN2;
        px(c, x, y, ...s);
      }
    }
  for (let y = 60; y < 180; y++) px(c, 128, y, 20, 20, 24);
  disc(c, 111, 112, 7, 30, 22, 18);
  disc(c, 145, 112, 7, 30, 22, 18);
  record("morphlike.png", savePng(c, "morphlike.png"), "suspicious asymmetric composite test fixture");
}

writeFileSync(join(root, "fixtures", "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Wrote ${Object.keys(manifest).length} fixtures to ${outDir}`);
