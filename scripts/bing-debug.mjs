// Debug: screenshot each stage of Bing visual search upload.
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  locale: "en-US",
});
const page = await ctx.newPage();
page.on("response", (r) => {
  if (/searchbyimage|images\/search\?/.test(r.url())) console.log("RESP", r.status(), r.url().slice(0, 130));
});
await page.goto("https://www.bing.com/images", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/bing-1-home.png" });
const cands = ["#sb_sbi", '[aria-label="Search using an image"]', ".sbi_btn"];
for (const sel of cands) {
  const el = page.locator(sel).first();
  if ((await el.count()) > 0) {
    console.log("clicking", sel);
    await el.click({ timeout: 10000 }).catch((e) => console.log("click fail", sel, String(e).slice(0, 120)));
    break;
  }
}
await page.waitForTimeout(3000);
await page.screenshot({ path: "/tmp/bing-2-dialog.png" });
// Enumerate file inputs with visibility + accept attrs.
const info = await page.$$eval('input[type="file"]', (els) =>
  els.map((e) => ({ visible: e.offsetParent !== null, accept: e.accept, id: e.id, name: e.name })),
);
console.log("inputs:", JSON.stringify(info));
const btns = await page.$$eval("button", (els) => els.map((e) => (e.textContent ?? "").trim()).filter(Boolean).slice(0, 20));
console.log("buttons:", JSON.stringify(btns));
await browser.close();
