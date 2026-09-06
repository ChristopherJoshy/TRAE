// Probe: URL-based visual search in headless Chromium (Lens uploadbyurl + Bing imgurl).
import { chromium } from "@playwright/test";

const IMG = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=512&q=80&fm=jpg&fit=crop";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  locale: "en-US",
});

// Lens by URL
{
  const page = await ctx.newPage();
  await page.goto("https://lens.google.com/uploadbyurl?url=" + encodeURIComponent(IMG), { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => console.log("lens nav fail", String(e).slice(0, 120)));
  await page.waitForTimeout(9000);
  console.log("LENS url:", page.url().slice(0, 140));
  const body = await page.content();
  console.log("LENS bytes:", body.length);
  for (const pat of ["unsplash", "Visual matches", "Exact matches", "captcha", "unusual traffic", "Sorry", "about this result"]) {
    console.log("  lens", pat, ":", body.toLowerCase().includes(pat.toLowerCase()));
  }
  const links = await page.$$eval("a", (as) =>
    as.map((a) => a.href).filter((h) => h.startsWith("http") && !h.includes("google.") && !h.includes("gstatic.com")).slice(0, 12),
  );
  links.forEach((l) => console.log("  lens link:", l.slice(0, 110)));
  await page.close();
}
// Bing by URL
{
  const page = await ctx.newPage();
  await page.goto("https://www.bing.com/images/searchbyimage/upload?imgurl=" + encodeURIComponent(IMG) + "&cbir=sbi", { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => console.log("bing nav fail", String(e).slice(0, 120)));
  await page.waitForTimeout(9000);
  console.log("BING url:", page.url().slice(0, 140));
  const body = await page.content();
  console.log("BING bytes:", body.length);
  for (const pat of ["Pages that include", "unsplash", "captcha", "unusual traffic", "iris"]) {
    console.log("  bing", pat, ":", body.toLowerCase().includes(pat.toLowerCase()));
  }
  const links = await page.$$eval("a", (as) =>
    as.map((a) => a.href).filter((h) => h.startsWith("http") && !h.includes("bing.com") && !h.includes("microsoft.com")).slice(0, 12),
  );
  links.forEach((l) => console.log("  bing link:", l.slice(0, 110)));
  await page.close();
}
await browser.close();
