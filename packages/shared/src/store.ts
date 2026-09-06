import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  BlockchainAnchor,
  Investigation,
  SealedBundle,
} from "./types.js";

export interface StoredInvestigation {
  investigation: Investigation;
  /** Asset metadata only — bytes live under assets/<sha256>.bin */
  asset: {
    id: string;
    mime: string;
    byteSize: number;
    width: number;
    height: number;
    sha256: string;
    storageKey: string;
    storedAt: string;
  } | null;
  seal: SealedBundle | null;
  anchor: BlockchainAnchor | null;
  demoCase: string | null;
}

let dataDir = process.env["TRACE_DATA_DIR"] ?? join(process.cwd(), "data");

export function configureStore(dir: string): void {
  dataDir = dir;
}

export function storeDir(): string {
  return dataDir;
}

function ensureDirs(): void {
  mkdirSync(join(dataDir, "investigations"), { recursive: true });
  mkdirSync(join(dataDir, "assets"), { recursive: true });
}

function invPath(id: string): string {
  return join(dataDir, "investigations", `${id}.json`);
}

function assertSafeId(id: string): void {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) throw new Error("Invalid investigation id.");
}

export function saveStored(inv: StoredInvestigation): void {
  ensureDirs();
  assertSafeId(inv.investigation.id);
  writeFileSync(invPath(inv.investigation.id), JSON.stringify(inv, null, 2), "utf8");
}

export function loadStored(id: string): StoredInvestigation | null {
  assertSafeId(id);
  const p = invPath(id);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as StoredInvestigation;
}

export function listStored(): Array<{ id: string; label: string; status: string; updatedAt: string; mode: string }> {
  ensureDirs();
  const dir = join(dataDir, "investigations");
  if (!existsSync(dir)) return [];
  const out: Array<{ id: string; label: string; status: string; updatedAt: string; mode: string }> = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const s = JSON.parse(readFileSync(join(dir, f), "utf8")) as StoredInvestigation;
      out.push({
        id: s.investigation.id,
        label: s.investigation.label,
        status: s.investigation.status,
        updatedAt: s.investigation.updatedAt,
        mode: s.investigation.mode,
      });
    } catch {
      continue;
    }
  }
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return out;
}

export function saveAssetBytes(sha256: string, bytes: Uint8Array): string {
  ensureDirs();
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("Invalid sha256.");
  const key = `assets/${sha256}.bin`;
  writeFileSync(join(dataDir, key), Buffer.from(bytes));
  return key;
}

export function loadAssetBytes(storageKey: string): Buffer | null {
  if (!/^assets\/[0-9a-f]{64}\.bin$/.test(storageKey)) return null;
  const p = join(dataDir, storageKey);
  if (!existsSync(p)) return null;
  return readFileSync(p);
}
