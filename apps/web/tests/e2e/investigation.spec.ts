import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURE = join("..", "..", "..", "fixtures", "images", "original.png");

test("judge path: upload → workstation → seal → verify → tamper", async ({ page, request }, testInfo) => {
  // Home: product is legible in seconds.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /TRACE/ })).toBeVisible();
  await expect(page.getByLabel("DEMO MODE")).toBeVisible();
  await expect(page.getByText("Don't trust the image. Trace it.")).toBeVisible();

  // Upload fixture, default demo case.
  await page.locator('input[name="image"]').setInputFiles(FIXTURE);
  await page.getByRole("button", { name: /RUN INVESTIGATION/ }).click();
  await page.waitForURL(/\/investigate\//, { timeout: 60_000 });
  const invId = page.url().split("/investigate/")[1] as string;
  expect(invId).toMatch(/^inv-/);

  // Workstation core: verdict, graph, timeline, lens, seal.
  await expect(page.getByText("CURRENT CONCLUSION", { exact: false })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("WHAT THIS DOES NOT PROVE")).toBeVisible();
  await expect(page.getByLabel("Provenance constellation")).toBeVisible();
  await expect(page.getByLabel("Temporal trace")).toBeVisible();
  await expect(page.getByLabel("Similarity lens")).toBeVisible();
  await expect(page.getByLabel("Trace seal")).toBeVisible();
  await expect(page.getByLabel("Peel the image")).toBeVisible();

  // Peel layers advance.
  await page.getByRole("tab", { name: /FACE MAP/ }).click();
  await expect(page.getByText(/face-like region/)).toBeVisible();

  // Lens candidate selection + overlay.
  const candidate = page.getByRole("option").first();
  if (await candidate.count()) {
    await candidate.click();
    await expect(page.getByText("WHY THESE MATCH")).toBeVisible();
  }

  // Seal verify → MATCH via the real endpoint.
  const verify = await request.post("/api/verify", { data: { investigationId: invId } });
  expect(verify.ok()).toBe(true);
  const v = await verify.json();
  expect(v.match).toBe(true);
  expect(v.actualRoot).toMatch(/^0x[0-9a-f]{64}$/);

  // Tamper: one edited field must fail.
  const stored = await (await request.get(`/api/investigations/${invId}`)).json();
  const tampered = structuredClone(stored.seal.bundle);
  tampered.verdict.sourceConfidence = (tampered.verdict.sourceConfidence + 7) % 101;
  const bad = await request.post("/api/verify", {
    data: { bundle: tampered, expectedRoot: stored.seal.evidenceRoot },
  });
  const bv = await bad.json();
  expect(bv.match).toBe(false);

  // Anchor without chain config stays honest.
  const anchor = await request.post(`/api/investigations/${invId}/anchor`);
  const aj = await anchor.json();
  expect(aj.anchor.status).toBe("NOT_CONFIGURED");

  if (testInfo.project.name === "mobile") {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("failure paths stay honest", async ({ request }) => {
  const corrupt = readFileSync(join("..", "..", "..", "fixtures", "images", "corrupt.bin"));
  const res = await request.post("/api/investigations", {
    multipart: { image: { name: "corrupt.bin", mimeType: "application/octet-stream", buffer: corrupt } },
  });
  expect(res.status()).toBe(422);

  const missing = await request.get("/api/investigations/inv-doesnotexist00");
  expect(missing.status()).toBe(404);
});
