// Identity-chain leg: from a REAL resolved identity (name/login obtained
// via api.github.com, never invented), find MORE images of the same person
// and verify each by face embedding before claiming anything.
// Free, keyless, official APIs only: api.github.com/search/users.
// Every candidate is face-verified against the input descriptor —
// lookalikes are rejected with their measured scores, not hidden.
import { decodeImage } from "@trace/shared";
import { PNG } from "pngjs";

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}

async function githubApi(path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "TRACE-pipeline/0.1 (+research prototype)",
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) {
      const err = new Error(`GitHub API HTTP ${res.status}.`);
      err.code = res.status === 403 || res.status === 429 ? "rate-limit" : "github-error";
      throw err;
    }
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

async function downloadImage(url, timeoutMs = 15000, maxBytes = 5 * 1024 * 1024) {
  // Same SSRF gate + caps as every other matching leg (DNS-checked, no
  // private targets, image content-type, size cap).
  const { fetchImageGated } = await import("./page-images.mjs");
  return fetchImageGated(url, { timeoutMs, maxBytes });
}

/**
 * Given identity clues + the input face descriptor, find more images of the
 * same person. Returns {confirmed, checked} — confirmed entries carry
 * via:'identity-chain' and the measured faceCos.
 */
export async function identityChainSearch({ names = [], logins = [], faceDescriptor, faceThreshold = 0.75, maxAvatars = 6 } = {}) {
  if (!faceDescriptor || faceDescriptor.length === 0) {
    return { confirmed: [], checked: 0, note: "identity chain skipped (no input face descriptor)" };
  }
  const queries = [
    ...logins.filter(Boolean).slice(0, 2).map((l) => `@${l}`),
    ...names.filter(Boolean).slice(0, 2),
  ];
  if (queries.length === 0) {
    return { confirmed: [], checked: 0, note: "identity chain skipped (no identity clues)" };
  }
  const { detectFacesReal, embedCropReal } = await import("./mp-faces.mjs");
  const seen = new Set();
  const confirmed = [];
  const rejected = [];
  const notes = [];
  for (const q of queries) {
    let items = [];
    try {
      const json = await githubApi(`/search/users?q=${encodeURIComponent(q)}&per_page=8`);
      items = json?.items ?? [];
      notes.push(`github-user-search "${q}": ${items.length} accounts`);
    } catch (e) {
      notes.push(`github-user-search "${q}" skipped (${e.code ?? "error"})`);
      continue;
    }
    for (const it of items) {
      if (!it?.avatar_url || seen.has(it.avatar_url)) continue;
      seen.add(it.avatar_url);
      if (checked >= maxAvatars) break;
      checked++;
      try {
        const bytes = await downloadImage(it.avatar_url);
        const dec = decodeImage(bytes);
        const full = new PNG({ width: dec.width, height: dec.height });
        Buffer.from(dec.pixels).copy(full.data);
        const det = await detectFacesReal(PNG.sync.write(full));
        const faces = (det.faces ?? []).filter((f) => f.score >= 0.5).sort((x, y) => y.w * y.h - x.w * x.h);
        if (faces.length === 0) continue;
        const f = faces[0];
        const x0 = Math.max(0, f.x), y0 = Math.max(0, f.y);
        const w = Math.min(dec.width - x0, f.w), h = Math.min(dec.height - y0, f.h);
        if (w < 16 || h < 16) continue;
        const crop = new PNG({ width: w, height: h });
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const si = ((y0 + y) * dec.width + x0 + x) * 4, di = (y * w + x) * 4;
            crop.data[di] = dec.pixels[si]; crop.data[di + 1] = dec.pixels[si + 1];
            crop.data[di + 2] = dec.pixels[si + 2]; crop.data[di + 3] = 255;
          }
        }
        const emb = await embedCropReal(PNG.sync.write(crop));
        if (!emb || emb.length === 0) { rejected.push({ login: it.login, cos: null }); continue; }
        const cos = Math.round(cosine(emb, faceDescriptor) * 1000) / 1000;
        if (cos >= faceThreshold) {
          confirmed.push({
            postUrl: it.html_url,
            postTitle: `@${it.login} — GitHub account, face-consistent with input (${cos})`,
            publishedDate: null,
            author: it.login,
            imageUrl: it.avatar_url,
            similarity: cos,
            via: "identity-chain",
            faceCos: cos,
          });
        } else {
          rejected.push({ login: it.login, cos });
        }
      } catch {
        continue; // one bad avatar never sinks the chain
      }
    }
  }
  return { confirmed, checked, rejected, note: notes.join("; ") };
}
