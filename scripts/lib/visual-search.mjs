// Genuine visual search leg: scripted upload through the real Bing Visual
// Search dialog in headless Chromium, then parse the live results page for
// matching web posts. No hardcoded results — every URL comes from Bing.
import { chromium } from "@playwright/test";

let browser = null;

export async function ensureSearchBrowser() {
  if (browser) return browser;
  browser = await chromium.launch();
  return browser;
}

/**
 * Upload local image bytes to Bing Visual Search and return genuinely
 * observed matching-post candidates: {url, title, thumbnail}.
 */
export async function bingVisualSearch(imagePath, { timeoutMs = 90000 } = {}) {
  const t0 = Date.now();
  const br = await ensureSearchBrowser();
  const ctx = await br.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    locale: "en-US",
  });
  const page = await ctx.newPage();
  try {
    await page.goto("https://www.bing.com/images", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);
    const cam = page.locator("#sb_sbi").first();
    await cam.click({ timeout: 15000 });
    await page.waitForTimeout(1500);
    // Use the real file-chooser flow via the "upload an image" link.
    const uploadLink = page.locator('text="upload an image"').first();
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15000 }),
      uploadLink.click({ timeout: 15000 }),
    ]);
    await chooser.setFiles(imagePath);
    // Results land on a searchbyimage / images/search URL.
    await page.waitForURL(/searchbyimage|images\/search\?/, { timeout: timeoutMs }).catch(() => null);
    await page.waitForTimeout(6000);
    const url = page.url();
    if (!/searchbyimage|images\/search\?/.test(url)) {
      const state = await page.content();
      if (/captcha|unusual traffic/i.test(state)) {
        const err = new Error("Bing blocked the automated upload (captcha). Retry later or use the Lens leg.");
        err.code = "rate-limit";
        throw err;
      }
      const err = new Error(`Bing upload did not reach results (stuck at ${url.slice(0, 80)}).`);
      err.code = "provider-unavailable";
      throw err;
    }
    // "Pages that include matching images" section → outbound post links.
    const matches = await page.$$eval("a", (as) =>
      as
        .map((a) => ({
          href: a.href,
          text: (a.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 140),
          img: a.querySelector("img")?.src ?? null,
        }))
        .filter(
          (l) =>
            l.href.startsWith("http") &&
            !/bing\.com|microsoft\.com|live\.com|office\.com/.test(l.href) &&
            !/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?)(\?|$)/i.test(l.href),
        ),
    );
    // Dedupe by URL, keep first-seen order (Bing's own ranking).
    const seen = new Set();
    const out = [];
    for (const m of matches) {
      try {
        const u = new URL(m.href);
        u.hash = "";
        const key = u.toString();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ url: key, title: m.text || null, thumbnail: m.img });
        if (out.length >= 25) break;
      } catch {
        continue;
      }
    }
    return { provider: "bing-visual", results: out, latencyMs: Date.now() - t0, resultsUrl: url };
  } finally {
    await ctx.close().catch(() => null);
  }
}

export async function closeSearchBrowser() {
  if (browser) await browser.close().catch(() => null);
  browser = null;
}
