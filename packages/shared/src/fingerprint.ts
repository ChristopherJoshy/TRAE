/**
 * Visual fingerprints: SHA-256 (exact identity) vs perceptual hashes
 * (near-duplicate similarity). SHA-256 must never be confused with
 * perceptual similarity — they answer different questions.
 */

/** Hamming distance between two 16-hex-char (64-bit) hashes. */
export function hamming(a: string, b: string): number {
  if (a.length !== b.length) throw new Error("Hash length mismatch.");
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i] as string, 16) ^ parseInt(b[i] as string, 16);
    dist += (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1) + ((x >> 3) & 1);
  }
  return dist;
}

function toGray32(
  pixels: Uint8Array | Buffer,
  width: number,
  height: number,
  size: number,
): number[] {
  const out = new Array<number>(size * size).fill(0);
  const counts = new Array<number>(size * size).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const r = pixels[si] as number;
      const g = pixels[si + 1] as number;
      const b = pixels[si + 2] as number;
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const dx = Math.min(size - 1, Math.floor((x * size) / width));
      const dy = Math.min(size - 1, Math.floor((y * size) / height));
      const di = dy * size + dx;
      out[di] = (out[di] as number) + gray;
      counts[di] = (counts[di] as number) + 1;
    }
  }
  return out.map((v, i) => v / Math.max(1, counts[i] as number));
}

/** 2D DCT-II on an n×n matrix (naive O(n^4), n=32 — fine for a prototype). */
function dct2(matrix: number[], n: number): number[] {
  const out = new Array<number>(n * n).fill(0);
  const c = (k: number) => (k === 0 ? Math.sqrt(1 / n) : Math.sqrt(2 / n));
  for (let u = 0; u < n; u++) {
    for (let v = 0; v < n; v++) {
      let sum = 0;
      for (let x = 0; x < n; x++) {
        for (let y = 0; y < n; y++) {
          sum +=
            (matrix[y * n + x] as number) *
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * n)) *
            Math.cos(((2 * y + 1) * v * Math.PI) / (2 * n));
        }
      }
      out[u * n + v] = c(u) * c(v) * sum;
    }
  }
  return out;
}

function bitsToHex(bits: number[]): string {
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    const nib =
      ((bits[i] as number) << 3) |
      ((bits[i + 1] as number) << 2) |
      ((bits[i + 2] as number) << 1) |
      (bits[i + 3] as number);
    hex += nib.toString(16);
  }
  return hex;
}

/** 64-bit DCT perceptual hash, hex-encoded (16 chars). */
export function phash(pixels: Uint8Array | Buffer, width: number, height: number): string {
  const gray = toGray32(pixels, width, height, 32);
  const dct = dct2(gray, 32);
  const coeffs: number[] = [];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      if (x === 0 && y === 0) continue;
      coeffs.push(dct[y * 32 + x] as number);
    }
  const sorted = [...coeffs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] as number;
  return bitsToHex(coeffs.map((c) => (c > median ? 1 : 0)));
}

/** 64-bit difference hash, hex-encoded (16 chars). */
export function dhash(pixels: Uint8Array | Buffer, width: number, height: number): string {
  const gx = toGray32(pixels, width, height, 9).map((_, i) => i);
  void gx;
  // 9x8 grid for horizontal diffs.
  const grid = new Array<number>(9 * 8).fill(0);
  const counts = new Array<number>(9 * 8).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const gray =
        0.299 * (pixels[si] as number) +
        0.587 * (pixels[si + 1] as number) +
        0.114 * (pixels[si + 2] as number);
      const dx = Math.min(8, Math.floor((x * 9) / width));
      const dy = Math.min(7, Math.floor((y * 8) / height));
      const di = dy * 9 + dx;
      grid[di] = (grid[di] as number) + gray;
      counts[di] = (counts[di] as number) + 1;
    }
  }
  const bits: number[] = [];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const a = (grid[y * 9 + x] as number) / Math.max(1, counts[y * 9 + x] as number);
      const b = (grid[y * 9 + x + 1] as number) / Math.max(1, counts[y * 9 + x + 1] as number);
      bits.push(a > b ? 1 : 0);
    }
  return bitsToHex(bits);
}
export interface PixelImage {
  pixels: Uint8Array | Buffer;
  width: number;
  height: number;
}

export interface FpSignals {
  phash: string;
  dhash: string;
  colorSignature: number[];
}

export function signalsOf(img: PixelImage): FpSignals {
  return {
    phash: phash(img.pixels, img.width, img.height),
    dhash: dhash(img.pixels, img.width, img.height),
    colorSignature: colorSignature(img.pixels, img.width, img.height),
  };
}

function windowAt(img: PixelImage, cxFrac: number, cyFrac: number, frac: number): PixelImage {
  const nw = Math.max(8, Math.floor(img.width * frac));
  const nh = Math.max(8, Math.floor(img.height * frac));
  const ox = Math.min(img.width - nw, Math.max(0, Math.floor(cxFrac * img.width - nw / 2)));
  const oy = Math.min(img.height - nh, Math.max(0, Math.floor(cyFrac * img.height - nh / 2)));
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const si = ((oy + y) * img.width + ox + x) * 4;
      const di = (y * nw + x) * 4;
      out[di] = img.pixels[si] as number;
      out[di + 1] = img.pixels[si + 1] as number;
      out[di + 2] = img.pixels[si + 2] as number;
      out[di + 3] = 255;
    }
  }
  return { pixels: out, width: nw, height: nh };
}

/**
 * Crop-robust similarity. Crops and screenshots preserve most content inside
 * a sub-window, so besides the full-frame comparison each image is also
 * checked window-against-whole in both directions (containment). The best
 * variant wins. Answers red-team Q2: cropping must not silently break
 * matching, while unrelated pairs still have to clear every variant.
 */
export function robustSimilarity(a: PixelImage, b: PixelImage): number {
  const sa = signalsOf(a);
  const sb = signalsOf(b);
  const centers: Array<[number, number]> = [
    [0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75],
  ];
  const scores = [perceptualSimilarity(sa, sb)];
  for (const [fx, fy] of centers) {
    scores.push(perceptualSimilarity(signalsOf(windowAt(a, fx, fy, 0.6)), sb));
    scores.push(perceptualSimilarity(sa, signalsOf(windowAt(b, fx, fy, 0.6))));
  }
  return Math.max(...scores);
}

/** 4×4 RGB color signature (48 values, 0..1) — robust to crop/resize. */
export function colorSignature(
  pixels: Uint8Array | Buffer,
  width: number,
  height: number,
): number[] {
  const n = 4;
  const acc = new Array<number>(n * n * 3).fill(0);
  const counts = new Array<number>(n * n).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const cx = Math.min(n - 1, Math.floor((x * n) / width));
      const cy = Math.min(n - 1, Math.floor((y * n) / height));
      const ci = cy * n + cx;
      acc[ci * 3] = (acc[ci * 3] as number) + (pixels[si] as number);
      acc[ci * 3 + 1] = (acc[ci * 3 + 1] as number) + (pixels[si + 1] as number);
      acc[ci * 3 + 2] = (acc[ci * 3 + 2] as number) + (pixels[si + 2] as number);
      counts[ci] = (counts[ci] as number) + 1;
    }
  }
  return acc.map((v, i) => v / (255 * Math.max(1, counts[Math.floor(i / 3)] as number)));
}

export function colorDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("Signature length mismatch.");
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] as number) - (b[i] as number);
    sum += d * d;
  }
  return Math.sqrt(sum / a.length);
}

/** Variance-of-Laplacian sharpness on a small grayscale grid. */
export function sharpness(pixels: Uint8Array | Buffer, width: number, height: number): number {
  const s = 32;
  const g = toGray32(pixels, width, height, s);
  let mean = 0;
  const lap: number[] = [];
  for (let y = 1; y < s - 1; y++) {
    for (let x = 1; x < s - 1; x++) {
      const v =
        4 * (g[y * s + x] as number) -
        (g[y * s + x - 1] as number) -
        (g[y * s + x + 1] as number) -
        (g[(y - 1) * s + x] as number) -
        (g[(y + 1) * s + x] as number);
      lap.push(v);
      mean += v;
    }
  }
  mean /= lap.length;
  return lap.reduce((t, v) => t + (v - mean) * (v - mean), 0) / lap.length;
}

/**
 * Combined perceptual similarity 0..1 from hash + color signals.
 * Calibrated so identical images score 1 and unrelated images score low.
 */
export function perceptualSimilarity(a: {
  phash: string;
  dhash: string;
  colorSignature: number[];
}, b: {
  phash: string;
  dhash: string;
  colorSignature: number[];
}): number {
  const ph = 1 - hamming(a.phash, b.phash) / 64;
  const dh = 1 - hamming(a.dhash, b.dhash) / 64;
  const cd = Math.max(0, 1 - colorDistance(a.colorSignature, b.colorSignature) * 3);
  const sim = 0.5 * ph + 0.3 * dh + 0.2 * cd;
  return Math.max(0, Math.min(1, Math.round(sim * 1000) / 1000));
}
