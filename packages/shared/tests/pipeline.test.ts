import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { configureStore } from "../src/store.js";
import { runFullInvestigation } from "../src/pipeline.js";
import { verifyBundle, assertBundlePrivacy } from "../src/bundle.js";
import { validateGraph } from "../src/provenance.js";

const FIX = join(process.cwd(), "..", "..", "fixtures", "images");

beforeAll(() => {
  configureStore(mkdtempSync(join(tmpdir(), "trace-test-")));
});

describe("pipeline demo happy path (case-b)", () => {
  it("ingest → analyze → search → correlate → seal → verify", async () => {
    const bytes = readFileSync(join(FIX, "original.png"));
    const stored = await runFullInvestigation(bytes, "image/png", {
      mode: "demo",
      demoCaseId: "case-b",
      label: "test happy path",
      fixtureDir: FIX,
      sealedAt: "2026-03-20T00:00:00.000Z",
      investigationId: "inv-testhappy0001",
    });
    expect(stored.investigation.status).toBe("SEALED");
    expect(stored.seal).not.toBeNull();
    const seal = stored.seal!;
    expect(seal.evidenceRoot).toMatch(/^0x[0-9a-f]{64}$/);
    expect(seal.bundle.candidates.length).toBe(4);
    expect(seal.bundle.rankedSources[0]?.rank).toBe(1);
    expect(seal.bundle.timeline.events.length).toBeGreaterThan(0);
    expect(validateGraph(seal.bundle.graph)).toEqual([]);
    // Determinism: same inputs → same root.
    const again = await runFullInvestigation(bytes, "image/png", {
      mode: "demo",
      demoCaseId: "case-b",
      fixtureDir: FIX,
      sealedAt: "2026-03-20T00:00:00.000Z",
      investigationId: "inv-testhappy0002",
    });
    // Different investigation ids → different roots (id is part of the bundle).
    expect(again.seal!.evidenceRoot).not.toBe(seal.evidenceRoot);
    // Verify passes on the sealed bundle.
    const v = verifyBundle(seal.bundle, seal.evidenceRoot);
    expect(v.match).toBe(true);
    // Tamper → mismatch.
    const tampered = structuredClone(seal.bundle);
    tampered.verdict.sourceConfidence = (tampered.verdict.sourceConfidence + 1) % 101;
    const v2 = verifyBundle(tampered, seal.evidenceRoot);
    expect(v2.match).toBe(false);
    expect(v2.failures.join(" ")).toMatch(/MODIFIED/);
    // Privacy: no embeddings/pixels/secrets in the bundle.
    expect(assertBundlePrivacy(seal.bundle)).toEqual([]);
  });
});

describe("pipeline failure paths", () => {
  it("case-e seals a partial investigation with provider failure", async () => {
    const bytes = readFileSync(join(FIX, "original.png"));
    const stored = await runFullInvestigation(bytes, "image/png", {
      mode: "demo",
      demoCaseId: "case-e",
      fixtureDir: FIX,
      investigationId: "inv-testpartial01",
    });
    expect(stored.investigation.status).toBe("SEALED");
    expect(stored.investigation.errors.some((e) => e.phase === "search")).toBe(true);
    expect(stored.seal!.bundle.candidates).toHaveLength(0);
    expect(stored.seal!.bundle.verdict.limitations.join(" ")).toMatch(/partial/i);
  });
  it("corrupt input fails honestly", async () => {
    const bytes = readFileSync(join(FIX, "corrupt.bin"));
    await expect(
      runFullInvestigation(bytes, undefined, { mode: "demo", investigationId: "inv-testcorrupt01" }),
    ).rejects.toThrow();
  });
  it("live mode without credentials fails the search but keeps local analysis", async () => {
    const bytes = readFileSync(join(FIX, "original.png"));
    const stored = await runFullInvestigation(bytes, "image/png", {
      mode: "live",
      providerName: "tineye",
      liveEnv: {},
      fixtureDir: FIX,
      investigationId: "inv-testlivefail01",
    });
    expect(stored.seal).not.toBeNull();
    expect(stored.investigation.errors.some((e) => e.code === "provider-not-configured")).toBe(true);
  });
});
