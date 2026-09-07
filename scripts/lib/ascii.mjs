// ASCII preview of the investigated image, rendered from the REAL decoded
// pixels (jpeg-js/pngjs, MIT) with the standard luminance-ramp technique.
// The detected face box (real BlazeFace coordinates) is tinted when the
// terminal supports color. No new dependency: every npm ASCII renderer we
// vetted either needs native builds (lwip2/canvas — fail on Windows) or is
// browser-only (console-image). See README credits.
const RAMP = " .:-=+*#%@";
const TTY = process.stdout.isTTY === true && !process.env["NO_COLOR"];
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

/**
 * Render decoded RGBA pixels to ASCII. box is an optional real face box in
 * source pixels {x,y,w,h} — border cells tint yellow, interior dimmed green.
 */
export function asciiArt(pixels, srcW, srcH, { width = 64, box = null } = {}) {
  const aspect = 2.1; // terminal cells are ~2x taller than wide
  const height = Math.max(8, Math.round((srcH / srcW) * width / aspect));
  const rows = [];
  for (let cy = 0; cy < height; cy++) {
    let row = "";
    for (let cx = 0; cx < width; cx++) {
      const sx = Math.min(srcW - 1, Math.floor(((cx + 0.5) / width) * srcW));
      const sy = Math.min(srcH - 1, Math.floor(((cy + 0.5) / height) * srcH));
      const si = (sy * srcW + sx) * 4;
      const lum =
        (0.299 * pixels[si] + 0.587 * pixels[si + 1] + 0.114 * pixels[si + 2]) / 255;
      const ch = RAMP[Math.min(RAMP.length - 1, Math.floor(lum * RAMP.length))];
      if (TTY && box) {
        const fx = ((cx + 0.5) / width) * srcW;
        const fy = ((cy + 0.5) / height) * srcH;
        const onBorder =
          Math.abs(fx - box.x) < srcW / width || Math.abs(fx - (box.x + box.w)) < srcW / width
            ? fy >= box.y && fy <= box.y + box.h
            : Math.abs(fy - box.y) < srcH / height || Math.abs(fy - (box.y + box.h)) < srcH / height
              ? fx >= box.x && fx <= box.x + box.w
              : false;
        if (onBorder) row += `${YELLOW}${ch === " " ? "+" : ch}${RESET}`;
        else if (fx >= box.x && fx <= box.x + box.w && fy >= box.y && fy <= box.y + box.h) {
          row += `${GREEN}${ch}${RESET}`;
        } else row += ch;
      } else {
        row += ch;
      }
    }
    rows.push(row);
  }
  return rows.join("\n");
}
