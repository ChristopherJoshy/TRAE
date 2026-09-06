// Real face analysis service: headless Chromium + MediaPipe BlazeFace
// (detection boxes + scores) + MobileNetV3 ImageEmbedder (embeddings on face
// crops). Models and WASM are served locally — fully offline after setup.
// Singleton browser reused across calls.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIME = {
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".tflite": "application/octet-stream",
  ".html": "text/html",
};

const PAGE = `<!doctype html><html><body><script type="module">
import { FilesetResolver, FaceDetector, ImageEmbedder } from "/vision/vision_bundle.mjs";
let det = null, emb = null;
async function ensure() {
  if (det) return;
  const vision = await FilesetResolver.forVisionTasks("/vision/wasm");
  det = await FaceDetector.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "/models/blaze_face_short_range.tflite" },
    runningMode: "IMAGE", minDetectionConfidence: 0.3,
  });
  emb = await ImageEmbedder.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "/models/mobilenet_v3_small.tflite" },
    runningMode: "IMAGE",
  });
}
async function bitmapOf(b64) {
  const res = await fetch("data:image/png;base64," + b64);
  return createImageBitmap(await res.blob());
}
window.__trace = {
  async detect(b64) {
    await ensure();
    const bmp = await bitmapOf(b64);
    const t0 = performance.now();
    const out = det.detect(bmp);
    bmp.close();
    return {
      ms: Math.round(performance.now() - t0),
      width: 0,
      faces: out.detections.map((d) => ({
        x: Math.round(d.boundingBox.originX), y: Math.round(d.boundingBox.originY),
        w: Math.round(d.boundingBox.width), h: Math.round(d.boundingBox.height),
        score: d.categories?.[0]?.score ?? 0,
      })),
    };
  },
  async embed(b64) {
    await ensure();
    const bmp = await bitmapOf(b64);
    const r = emb.embed(bmp);
    bmp.close();
    return Array.from(r.embeddings?.[0]?.floatEmbedding ?? []);
  },
};
window.__traceReady = true;
</scr` + `ipt></body></html>`;

let browser = null;
let page = null;
let server = null;

async function staticRoot(req, res) {
  const url = new URL(req.url ?? "/", "http://x");
  const path = decodeURIComponent(url.pathname);
  try {
    let file;
    if (path === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(PAGE);
      return;
    } else if (path.startsWith("/vision/")) {
      file = join(ROOT, "node_modules/@mediapipe/tasks-vision", path.slice("/vision/".length));
    } else if (path.startsWith("/models/")) {
      file = join(ROOT, path.slice(1));
    } else {
      res.writeHead(404); res.end("nf"); return;
    }
    const bytes = readFileSync(file);
    const ext = file.slice(file.lastIndexOf("."));
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(bytes);
  } catch {
    res.writeHead(404); res.end("nf");
  }
}

export async function ensureFaceService() {
  if (page) return page;
  server = createServer(staticRoot);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
  page = await browser.newPage();
  page.on("pageerror", (e) => console.error("[face-svc pageerror]", String(e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__traceReady === true, null, { timeout: 120000 });
  return page;
}

/** Detect faces in a PNG (bytes). Returns pixel boxes + detector scores. */
export async function detectFacesReal(pngBytes) {
  const p = await ensureFaceService();
  const b64 = Buffer.from(pngBytes).toString("base64");
  return p.evaluate((b) => window.__trace.detect(b), b64);
}

/** Embed an image crop (PNG bytes) → real float embedding vector. */
export async function embedCropReal(pngBytes) {
  const p = await ensureFaceService();
  const b64 = Buffer.from(pngBytes).toString("base64");
  return p.evaluate((b) => window.__trace.embed(b), b64);
}

export async function closeFaceService() {
  if (browser) await browser.close().catch(() => null);
  if (server) server.close();
  browser = null; page = null; server = null;
}
