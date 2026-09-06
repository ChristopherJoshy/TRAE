import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "trace-e2e-"));

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  retries: process.env["CI"] ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:3101",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev -- -p 3101",
    url: "http://127.0.0.1:3101/api/health",
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
    env: {
      TRACE_MODE: "demo",
      TRACE_DATA_DIR: dataDir,
      PORT: "3101",
    } as Record<string, string>,
  },
});
