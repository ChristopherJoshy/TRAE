// High-resolution terminal preview of the investigated image.
//
// Technique (researched): the half-block truecolor method used by timg
// (hzeller/timg, GPL-2.0), chafa (hpjansson/chafa, LGPL-3.0) and pixterm
// (eliukblau/pixterm, MIT) — each character cell maps TWO vertical pixels via
// the upper-half block "▀", with the top pixel as 24-bit foreground and the
// bottom pixel as 24-bit background. That doubles vertical resolution versus
// classic ASCII ramps while keeping every color measured from the real
// decoded pixels (jpeg-js/pngjs, MIT).
// Fallback (NO_COLOR / piped output): a 70-level luminance ramp — the same
// family of ramps every classic ASCII renderer uses, sampled from real pixels.
// The detected face box (real BlazeFace coordinates) is drawn as a frame;
// box cells are the only pixels we alter, and only for display.
import chalk from "chalk";

const RAMP_70 = "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ";
function colorOK() {
  return (process.stdout.isTTY === true || "FORCE_COLOR" in process.env) && !process.env["NO_COLOR"] && chalk.level >= 2;
}

function sample(pixels, srcW, srcH, x0, y0, x1, y1) {
  let r = 0, g = 0, b = 0, n = 0;
  const xa = Math.max(0, Math.floor(x0)), xb = Math.min(srcW - 1, Math.ceil(x1));
  const ya = Math.max(0, Math.floor(y0)), yb = Math.min(srcH - 1, Math.ceil(y1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const si = (y * srcW + x) * 4;
      r += pixels[si]; g += pixels[si + 1]; b += pixels[si + 2]; n++;
    }
  }
  return n === 0 ? [0, 0, 0] : [r / n, g / n, b / n];
}

function onBorder(fx, fy, box, ex, ey) {
  if (!box) return false;
  const nearX = Math.abs(fx - box.x) < ex || Math.abs(fx - (box.x + box.w)) < ex;
  const nearY = Math.abs(fy - box.y) < ey || Math.abs(fy - (box.y + box.h)) < ey;
  const inX = fx >= box.x - ex && fx <= box.x + box.w + ex;
  const inY = fy >= box.y - ey && fy <= box.y + box.h + ey;
  return (nearX && inY) || (nearY && inX);
}

/**
 * Render decoded RGBA pixels. box is an optional real face box in source
 * pixels {x,y,w,h}. Width adapts to the terminal (default 72 cells).
 */
export function asciiArt(pixels, srcW, srcH, { width = 0, box = null } = {}) {
  const termW = process.stdout.columns ?? 80;
  const w = width > 0 ? width : Math.max(48, Math.min(96, termW - 8));
  if (!colorOK()) return rampArt(pixels, srcW, srcH, w, box);
  // Each cell = 1 x 2 source pixels (upper half-block).
  const h = Math.max(10, Math.round(((srcH / 2) / srcW) * w));
  const rows = [];
  for (let cy = 0; cy < h; cy++) {
    let row = "";
    for (let cx = 0; cx < w; cx++) {
      const x0 = (cx / w) * srcW, x1 = ((cx + 1) / w) * srcW;
      const yt0 = ((cy * 2) / (h * 2)) * srcH, yt1 = (((cy * 2) + 1) / (h * 2)) * srcH;
      const yb0 = (((cy * 2) + 1) / (h * 2)) * srcH, yb1 = (((cy * 2) + 2) / (h * 2)) * srcH;
      const fx = (x0 + x1) / 2, fy = (yt0 + yb1) / 2;
      if (onBorder(fx, fy, box, srcW / w, srcH / h)) {
        row += chalk.bgYellow.black("▀");
        continue;
      }
      const [tr, tg, tb] = sample(pixels, srcW, srcH, x0, yt0, x1, yt1);
      const [br, bg2, bb] = sample(pixels, srcW, srcH, x0, yb0, x1, yb1);
      row += chalk.rgb(Math.round(tr), Math.round(tg), Math.round(tb)).bgRgb(Math.round(br), Math.round(bg2), Math.round(bb))("▀");
    }
    rows.push(row);
  }
  return rows.join("\n");
}

/** Grayscale fallback: 70-level ramp sampled from real pixels. */
export function rampArt(pixels, srcW, srcH, w, box) {
  const aspect = 2.1;
  const h = Math.max(8, Math.round((srcH / srcW) * w / aspect));
  const rows = [];
  for (let cy = 0; cy < h; cy++) {
    let row = "";
    for (let cx = 0; cx < w; cx++) {
      const sx = Math.min(srcW - 1, Math.floor(((cx + 0.5) / w) * srcW));
      const sy = Math.min(srcH - 1, Math.floor(((cy + 0.5) / h) * srcH));
      const si = (sy * srcW + sx) * 4;
      const lum = (0.299 * pixels[si] + 0.587 * pixels[si + 1] + 0.114 * pixels[si + 2]) / 255;
      const ch = RAMP_70[Math.min(RAMP_70.length - 1, Math.floor(lum * RAMP_70.length))];
      const fx = ((cx + 0.5) / w) * srcW, fy = ((cy + 0.5) / h) * srcH;
      row += onBorder(fx, fy, box, srcW / w, srcH / h) ? "+" : ch;
    }
    rows.push(row);
  }
  return rows.join("\n");
}
