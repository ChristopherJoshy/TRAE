import { describe, expect, it } from "vitest";
import {
  CreateInvestigationSchema,
  VerifySchema,
  assertFetchableUrl,
  isPrivateIPExport,
} from "../lib/validate.js";

describe("request schemas", () => {
  it("rejects bad investigation payloads", () => {
    expect(() => CreateInvestigationSchema.parse({ demoCaseId: "nope" })).toThrow();
    expect(() => CreateInvestigationSchema.parse({ imageUrl: "not-a-url" })).toThrow();
    expect(CreateInvestigationSchema.parse({ label: "ok", demoCaseId: "case-a" }).label).toBe("ok");
  });
  it("verify requires id or bundle+root", () => {
    expect(() => VerifySchema.parse({})).toThrow();
    expect(() => VerifySchema.parse({ expectedRoot: "0x123" })).toThrow();
    expect(VerifySchema.parse({ investigationId: "inv-abc12345" }).investigationId).toBe("inv-abc12345");
  });
});

describe("SSRF gate", () => {
  it("blocks private/loopback/link-local literal targets", async () => {
    for (const u of [
      "http://127.0.0.1/x.png",
      "http://10.0.0.5/x.png",
      "http://192.168.1.1/x.png",
      "http://172.16.9.9/x.png",
      "http://169.254.169.254/latest",
      "http://[::1]/x.png",
    ]) {
      await expect(assertFetchableUrl(u)).rejects.toMatchObject({ code: "private-target" });
    }
  });
  it("blocks non-http schemes, credentials, and malformed urls", async () => {
    await expect(assertFetchableUrl("file:///etc/passwd")).rejects.toMatchObject({ code: "bad-scheme" });
    await expect(assertFetchableUrl("ftp://e.example/x")).rejects.toMatchObject({ code: "bad-scheme" });
    await expect(assertFetchableUrl("https://user:pass@e.example/x")).rejects.toMatchObject({ code: "bad-url" });
    await expect(assertFetchableUrl("::::")).rejects.toMatchObject({ code: "bad-url" });
  });
  it("classifies private IPs", () => {
    expect(isPrivateIPExport("127.0.0.1")).toBe(true);
    expect(isPrivateIPExport("10.1.2.3")).toBe(true);
    expect(isPrivateIPExport("192.168.0.1")).toBe(true);
    expect(isPrivateIPExport("172.31.255.255")).toBe(true);
    expect(isPrivateIPExport("169.254.10.20")).toBe(true);
    expect(isPrivateIPExport("::1")).toBe(true);
    expect(isPrivateIPExport("8.8.8.8")).toBe(false);
    expect(isPrivateIPExport("1.1.1.1")).toBe(false);
  });
});
