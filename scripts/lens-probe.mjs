// Probe: scripted Google Lens upload in headless Chromium, parse visual matches.
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  locale: "en-US",
});
const page = await ctx.newPage();
await page.goto("https://lens.google.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2000);
const inputs = page.locator('input[type="file"]');
console.log("file inputs:", await inputs.count());
if ((await inputs.count()) > 0) {
  await inputs.first().setInputFiles("fixtures/real/portrait-woman.jpg");
  await page.waitForURL(/search\?/, { timeout: 60000 }).catch(() => null);
  console.log("landed:", page.url().slice(0, 160));
  await page.waitForTimeout(8000);
  const body = await page.content();
  const { writeFileSync } = await import("node:fs");
  writeFileSync("/tmp/lens-results.html", body);
  console.log("bytes:", body.length);
  for (const pat of ["unsplash", "Visual matches", "Exact matches", "captcha", "unusual traffic", "Sorry"]) {
    console.log(pat, ":", body.toLowerCase().includes(pat.toLowerCase()));
  }
  const links = await page.$$eval("a", (as) =>
    as.map((a) => ({ href: a.href, text: (a.textContent ?? "").trim().slice(0, 80) }))
      .filter((l) => l.href.startsWith("http") && !l.href.includes("google.com") && !l.href.includes("gstatic.com")),
  );
  console.log("external links:", links.length);
  links.slice(0, 15).forEach((l) => console.log(" -", l.href.slice(0, 110), "|", l.text.slice(0, 60)));
  await page.screenshot({ path: "/tmp/lens-results.png" });
}
await browser.close();
