// Probe: scripted Bing visual search upload in headless Chromium.
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  locale: "en-US",
});
const page = await ctx.newPage();
await page.goto("https://www.bing.com/images", { waitUntil: "domcontentloaded", timeout: 60000 });
// Open visual search (camera button).
const camSelectors = ['[aria-label="Search using an image"]', "#sb_sbi", ".sbi_btn", 'a[title*="image search" i]'];
let opened = false;
for (const sel of camSelectors) {
  const el = page.locator(sel).first();
  if ((await el.count()) > 0) {
    await el.click().catch(() => null);
    opened = true;
    break;
  }
}
console.log("camera opened:", opened);
// Find a file input for upload.
await page.waitForTimeout(3000);
const inputs = page.locator('input[type="file"]');
console.log("file inputs:", await inputs.count());
if ((await inputs.count()) > 0) {
  await inputs.first().setInputFiles("fixtures/real/portrait-woman.jpg");
  await page.waitForURL(/searchbyimage|images\/search/, { timeout: 60000 }).catch(() => null);
  console.log("landed:", page.url().slice(0, 160));
  await page.waitForTimeout(5000);
  const body = await page.content();
  const { writeFileSync } = await import("node:fs");
  writeFileSync("/tmp/bing-results.html", body);
  console.log("bytes:", body.length);
  for (const pat of ["Pages that include", "unsplash", "captcha", "CAPTCHA", "unusual traffic"]) {
    console.log(pat, ":", body.toLowerCase().includes(pat.toLowerCase()));
  }
  // Extract outbound links that look like visual matches.
  const links = await page.$$eval("a", (as) =>
    as.map((a) => a.href).filter((h) => h.startsWith("http") && !h.includes("bing.com") && !h.includes("microsoft.com")).slice(0, 30),
  );
  console.log("external links:", links.length);
  links.slice(0, 10).forEach((l) => console.log(" -", l.slice(0, 120)));
}
await browser.close();
