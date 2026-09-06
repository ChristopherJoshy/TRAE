// Probe: MediaPipe FaceDetector inside headless Chromium (real WebGL).
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIME = { ".mjs": "text/javascript", ".js": "text/javascript", ".wasm": "application/wasm", ".tflite": "application/octet-stream", ".html": "text/html", ".jpg": "image/jpeg" };
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  let p = join(ROOT, url.pathname);
  if (url.pathname === "/") p = join(ROOT, "scripts", "mp-probe.html");
  try {
    const b = readFileSync(p);
    const ext = p.slice(p.lastIndexOf("."));
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream", "Access-Control-Allow-Origin": "*" });
    res.end(b);
  } catch {
    res.writeHead(404); res.end("nf");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
page.on("console", (m) => console.log("[pg]", m.text()));
page.on("pageerror", (e) => console.log("[pgerr]", String(e).slice(0, 300)));
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction(() => globalThis.__mpDone === true, null, { timeout: 90000 });
const result = await page.evaluate(() => globalThis.__mpResult);
console.log("RESULT:", JSON.stringify(result).slice(0, 500));
await browser.close();
server.close();
