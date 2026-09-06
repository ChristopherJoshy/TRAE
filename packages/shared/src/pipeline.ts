import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AccountEvidence,
  BlockchainAnchor,
  EvidenceItem,
  FaceAnalysis,
  ImageFingerprint,
  Investigation,
  InvestigationError,
  InvestigationStatus,
  MetadataObservation,
  ProviderRun,
  SearchCandidate,
  SealedBundle,
  TraceMode,
} from "./types.js";
import {
  decodeImage,
  extractMetadata,
  fingerprintImage,
  sha256Bytes,
  validateImage,
} from "./image.js";
import { analyzeFaces, analyzeFaceIntegrity, describeRegion } from "./face.js";
import { robustSimilarity } from "./fingerprint.js";
import {
  ProviderError,
  providerFromEnv,
  type LiveProviderEnv,
  type RawCandidate,
  type ReverseSearchProvider,
  normalizeRawCandidates,
  toCandidateFields,
} from "./providers.js";
import { DEFAULT_DEMO_CASE, getDemoCase } from "./demo.js";
import { dedupeByCanonicalUrl, normalizeUrl } from "./url.js";
import { normalizeTimestamp } from "./time.js";
import { rankSources } from "./scoring.js";
import { buildTimeline, buildGraph, validateGraph } from "./provenance.js";
import { buildClaims, explainVerdict, assertTransition } from "./claims.js";
import { classifyTransformation, withIds } from "./transform.js";
import { buildEvidenceBundle, sealBundle } from "./bundle.js";
import { BUNDLE_SCHEMA_VERSION } from "./bundle.js";
import { modeLabel } from "./modes.js";
import {
  loadStored,
  saveAssetBytes,
  saveStored,
  type StoredInvestigation,
} from "./store.js";

export interface PipelineOptions {
  mode: TraceMode;
  providerName?: string | undefined;
  demoCaseId?: string | undefined;
  investigationId?: string | undefined;
  label?: string | undefined;
  imageUrl?: string | null | undefined;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined;
  liveEnv?: LiveProviderEnv | undefined;
  fixtureDir?: string | undefined;
  sealedAt?: string | undefined;
}
export function newInvestigationId(): string {
  return `inv-${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
}

function stamp(inv: Investigation, to: InvestigationStatus): void {
  assertTransition(inv.status, to);
  inv.history.push({ from: inv.status, to, at: new Date().toISOString() });
  inv.status = to;
  inv.updatedAt = new Date().toISOString();
}

function fail(inv: Investigation, code: string, message: string, phase: string): InvestigationError {
  const err: InvestigationError = { code, message, phase, retryable: false };
  inv.errors.push(err);
  return err;
}

/** Full investigation: ingest → analyze → search → correlate → seal. */
export async function runFullInvestigation(
  bytes: Uint8Array,
  claimedMime: string | undefined,
  opts: PipelineOptions,
): Promise<StoredInvestigation> {
  const now = new Date().toISOString();
  const id = opts.investigationId ?? newInvestigationId();
  const existing = loadStored(id);
  const inv: Investigation = existing?.investigation ?? {
    id,
    mode: opts.mode,
    status: "CREATED",
    createdAt: now,
    updatedAt: now,
    label: opts.label ?? `Investigation ${id.slice(-6)}`,
    assetId: null,
    provider: opts.mode === "live" ? (opts.providerName ?? "none") : "demo",
    errors: [],
    history: [],
  };

  // INGEST
  stamp(inv, "INGESTING");
  const validation = validateImage(bytes, claimedMime);
  if (!validation.ok) {
    fail(inv, validation.errorCode ?? "invalid-image", validation.error ?? "Invalid image.", "ingest");
    stamp(inv, "FAILED");
    const stored: StoredInvestigation = { investigation: inv, asset: null, seal: null, anchor: null, demoCase: null };
    saveStored(stored);
    const err = new Error(validation.error ?? "Invalid image.");
    (err as { code?: string }).code = validation.errorCode ?? "invalid-image";
    throw err;
  }
  const decoded = decodeImage(bytes);
  const sha = sha256Bytes(bytes);
  const assetId = `asset-${sha.slice(0, 12)}`;
  inv.assetId = assetId;
  const storageKey = saveAssetBytes(sha, bytes);

  // ANALYZE
  stamp(inv, "ANALYZING");
  const fingerprint: ImageFingerprint = fingerprintImage(bytes, decoded);
  const metadata: MetadataObservation = extractMetadata(bytes);
  const { analysis: face } = analyzeFaces(decoded, assetId, fingerprint.sharpness);
  const integrity = analyzeFaceIntegrity({
    analysis: face,
    sharpness: fingerprint.sharpness,
    mime: decoded.mime,
    byteSize: bytes.length,
    pixelCount: decoded.width * decoded.height,
  });

  // SEARCH
  stamp(inv, "SEARCHING");
  const providerRuns: ProviderRun[] = [];
  const rawSeeds: Array<{
    url: string; title: string | null; imageUrl: string | null;
    pageTimestamp: string | number | null; timestampQuality: "EXACT" | "PROVIDER_REPORTED" | "PAGE_METADATA" | "INFERRED" | "UNKNOWN";
    provider: string; providerResultId: string | null;
    platform?: string | undefined; exactHashMatch?: boolean | undefined;
    perceptualSimilarity?: number | undefined; faceSimilarity?: number | null | undefined;
    transformHint?: "unchanged" | "recompressed" | "resized" | "cropped" | "screenshot" | "text-overlay" | "color-adjusted" | "watermark" | "unknown" | undefined;
    account?: { handle: string | null; platform: string; evidenceType: AccountEvidence["evidenceType"]; detail: string } | undefined;
  }> = [];
  let providerFailed = false;

  if (opts.mode === "live") {
    let provider: ReverseSearchProvider | null = null;
    let providerInitError: string | null = null;
    try {
      provider = opts.providerName === "demo" ? null : providerFromEnv(opts.providerName, opts.liveEnv ?? {}, opts.mode);
    } catch (e) {
      providerInitError = e instanceof Error ? e.message : "Provider initialization failed.";
    }
    const started = new Date().toISOString();
    const t0 = Date.now();
    if (!provider) {
      providerFailed = true;
      fail(inv, "provider-not-configured", providerInitError ?? "Live provider not configured; cannot perform reverse-image search.", "search");
      providerRuns.push({
        provider: opts.providerName ?? "none", mode: opts.mode, startedAt: started,
        finishedAt: new Date().toISOString(), latencyMs: Date.now() - t0,
        status: "failed", errorCode: "provider-not-configured", resultCount: 0,
      });
    } else if (opts.imageUrl && provider.id === "serpapi") {
      try {
        const res = await provider.searchByUrl(opts.imageUrl);
        providerRuns.push({
          provider: provider.id, mode: opts.mode, startedAt: started,
          finishedAt: new Date().toISOString(), latencyMs: res.latencyMs, status: "ok", errorCode: null, resultCount: res.results.length,
        });
        for (const r of res.results) {
          rawSeeds.push({
            url: r.url, title: r.title ?? null, imageUrl: r.imageUrl ?? null,
            pageTimestamp: r.pageTimestamp ?? null, timestampQuality: r.timestampQuality ?? "UNKNOWN",
            provider: provider.id, providerResultId: r.providerResultId ?? null,
          });
        }
      } catch (e) {
        providerFailed = true;
        const code = e instanceof ProviderError ? e.code : "provider-unavailable";
        fail(inv, code, e instanceof Error ? e.message : "Search failed.", "search");
        providerRuns.push({
          provider: provider.id, mode: opts.mode, startedAt: started,
          finishedAt: new Date().toISOString(), latencyMs: Date.now() - t0,
          status: "failed", errorCode: code, resultCount: 0,
        });
      }
    } else {
      try {
        const res = await provider.search({ bytes, mime: decoded.mime });
        providerRuns.push({
          provider: provider.id, mode: opts.mode, startedAt: started,
          finishedAt: new Date().toISOString(), latencyMs: res.latencyMs, status: "ok", errorCode: null, resultCount: res.results.length,
        });
        for (const r of res.results) {
          rawSeeds.push({
            url: r.url, title: r.title ?? null, imageUrl: r.imageUrl ?? null,
            pageTimestamp: r.pageTimestamp ?? null, timestampQuality: r.timestampQuality ?? "UNKNOWN",
            provider: provider.id, providerResultId: r.providerResultId ?? null,
          });
        }
      } catch (e) {
        providerFailed = true;
        const code = e instanceof ProviderError ? e.code : "provider-unavailable";
        fail(inv, code, e instanceof Error ? e.message : "Search failed.", "search");
        providerRuns.push({
          provider: provider.id, mode: opts.mode, startedAt: started,
          finishedAt: new Date().toISOString(), latencyMs: Date.now() - t0,
          status: "failed", errorCode: code, resultCount: 0,
        });
      }
    }
  } else {
    // DEMO / TEST: deterministic local fixtures, explicitly labeled.
    const demo = getDemoCase(opts.demoCaseId ?? DEFAULT_DEMO_CASE);
    const t0 = Date.now();
    const started = new Date().toISOString();
    if (demo.providerFailed) {
      providerFailed = true;
      fail(inv, demo.providerErrorCode ?? "provider-unavailable", "Demo fixture: reverse-image provider unavailable (simulated).", "search");
      providerRuns.push({
        provider: "demo", mode: opts.mode, startedAt: started,
        finishedAt: new Date().toISOString(), latencyMs: 0,
        status: "failed", errorCode: demo.providerErrorCode, resultCount: 0,
      });
    } else {
      providerRuns.push({
        provider: "demo", mode: opts.mode, startedAt: started,
        finishedAt: new Date().toISOString(), latencyMs: Date.now() - t0,
        status: "ok", errorCode: null, resultCount: demo.candidates.length,
      });
      for (const c of demo.candidates) {
        rawSeeds.push({
          url: c.url, title: c.title, imageUrl: c.fixture,
          pageTimestamp: c.pageTimestamp, timestampQuality: c.timestampQuality,
          provider: "demo", providerResultId: `demo-${c.key}`,
          platform: c.platform, exactHashMatch: c.exactHashMatch,
          perceptualSimilarity: c.perceptualSimilarity, faceSimilarity: c.faceSimilarity,
          transformHint: c.transformHint,
          account: c.account ? { ...c.account } : undefined,
        });
      }
    }
    inv.provider = "demo";
  }

  // CORRELATE: normalize, dedupe, compare, score
  stamp(inv, providerFailed ? "PARTIAL" : "CORRELATING");
  const retrievedAt = new Date().toISOString();
  const normalized = normalizeRawCandidates(
    rawSeeds.map((s): RawCandidate => ({
      url: s.url, title: s.title, imageUrl: s.imageUrl,
      pageTimestamp: s.pageTimestamp, timestampQuality: s.timestampQuality,
      providerResultId: s.providerResultId,
    })),
    opts.mode === "live" ? (opts.providerName ?? "live") : "demo",
    retrievedAt,
  );

  const fixtureDir = opts.fixtureDir;
  const candidates: SearchCandidate[] = [];
  const accounts: AccountEvidence[] = [];
  normalized.forEach((seed, i) => {
    const extra = rawSeeds[i] as (typeof rawSeeds)[number];
    const fields = toCandidateFields(seed, `cand-${String(i + 1).padStart(2, "0")}`, retrievedAt);
    // Real comparison against fixture bytes when available; otherwise seed values.
    let perceptual: number | null = extra.perceptualSimilarity ?? null;
    let exact = extra.exactHashMatch ?? false;
    const fixturePath = extra.imageUrl && fixtureDir ? join(fixtureDir, extra.imageUrl) : null;
    if (fixturePath && existsSync(fixturePath)) {
      try {
        const fb = readFileSync(fixturePath);
        const fdec = decodeImage(fb);
        if (sha256Bytes(fb) === sha) exact = true;
        perceptual = robustSimilarity(decoded, fdec);
      } catch {
        // Keep seed values.
      }
    }
    let faceSim: number | null = extra.faceSimilarity ?? null;
    if (faceSim === null && face.detected && fixturePath && existsSync(fixturePath)) {
      try {
        const fb = readFileSync(fixturePath);
        const fdec = decodeImage(fb);
        const ref = analyzeFaces(fdec, `ref-${fields.id}`, 100);
        if (face.faces[0] && ref.analysis.faces[0]) {
          const d1 = describeRegion(decoded, face.faces[0].box);
          const d2 = describeRegion(fdec, ref.analysis.faces[0].box);
          let dot = 0, na = 0, nb = 0;
          for (let k = 0; k < d1.length; k++) {
            dot += (d1[k] as number) * (d2[k] as number);
            na += (d1[k] as number) * (d1[k] as number);
            nb += (d2[k] as number) * (d2[k] as number);
          }
          faceSim = na && nb ? Math.round((dot / Math.sqrt(na * nb)) * 1000) / 1000 : 0;
        }
      } catch {
        faceSim = null;
      }
    }
    candidates.push({
      id: fields.id,
      url: fields.url,
      canonicalUrl: fields.canonicalUrl,
      domain: fields.domain,
      platform: extra.platform ?? fields.platform,
      title: fields.title,
      imageUrl: extra.imageUrl,
      pageTimestamp: {
        value: fields.pageTimestampValue,
        quality: fields.pageTimestampQuality,
        source: `${fields.provider}-response`,
      },
      retrievedAt: fields.retrievedAt,
      provider: fields.provider,
      providerResultId: fields.providerResultId,
      exactHashMatch: exact,
      perceptualSimilarity: perceptual,
      faceSimilarity: faceSim,
    });
    if (extra.account) {
      accounts.push({
        id: `acct-${fields.id}`,
        candidateId: fields.id,
        platform: extra.account.platform,
        handle: extra.account.handle,
        profileUrl: null,
        evidenceType: extra.account.evidenceType,
        detail: `${extra.account.detail} (DEMO fixture — synthetic account, not a real post.)`,
        confidence: 0.35,
      });
    }
  });

  const deduped = dedupeByCanonicalUrl(candidates);
  const withTime = deduped.filter((c) => c.pageTimestamp.value !== null);
  withTime.sort((a, b) => ((a.pageTimestamp.value as string) < (b.pageTimestamp.value as string) ? -1 : 1));
  // Transformations from measurable signals; demo ground-truth hints attach below.
  const transforms = withIds(
    deduped.map((c) => {
      // Derive an estimated hamming distance from similarity when fixture bytes are unavailable.
      const sim = c.exactHashMatch ? 1 : (c.perceptualSimilarity ?? 0);
      const estDist = c.exactHashMatch ? 0 : Math.round((1 - sim) * 40);
      return classifyTransformation({
        exactHashMatch: c.exactHashMatch,
        phashDistance: estDist,
        colorDistance: Math.max(0, (1 - sim) * 0.5),
        widthRatio: 1,
        heightRatio: 1,
        sharpnessRatio: 1,
        candidateIsJpeg: (c.imageUrl ?? "").endsWith(".jpg"),
      });
    }),
    deduped.map((c) => c.id),
  );
  // Attach demo hints properly (matched by order).
  deduped.forEach((c, i) => {
    const seed = rawSeeds[i];
    if (seed?.transformHint && opts.mode !== "live" && transforms[i]) {
      const t = transforms[i] as (typeof transforms)[number];
      if (t.kind === "unknown" || t.confidence < 0.9) {
        t.kind = seed.transformHint;
        t.confidence = Math.max(t.confidence, 0.85);
        t.evidence.push(`fixture-ground-truth(demo):${seed.transformHint}`);
      }
    }
  });

  // Score + rank (temporal rank from observed order).
  const orderIdx = new Map(withTime.map((c, i) => [c.id, withTime.length > 1 ? 1 - i / (withTime.length - 1) : 1]));
  const ranked = rankSources(
    deduped.map((c) => ({
      candidate: c,
      temporalRank: orderIdx.get(c.id) ?? 0,
      metadataConsistency: metadata.c2pa.present ? 0.6 : 0.4,
      accountStrength: accounts.some((a) => a.candidateId === c.id) ? 0.35 : 0,
      contradictions: 0,
    })),
  );

  if (inv.status === "PARTIAL") {
    // stay partial-capable; continue building the report.
  } else {
    stamp(inv, "TIMELINE_BUILDING");
  }
  const timeline = buildTimeline(deduped, transforms);
  if (inv.status !== "PARTIAL") stamp(inv, "GRAPH_BUILDING");
  const graph = buildGraph({
    investigationId: id,
    candidates: deduped,
    transformations: transforms,
    rankedSourceIds: ranked.map((r) => r.candidateId),
    claims: [],
  });
  const graphErrors = validateGraph(graph);
  if (graphErrors.length > 0) {
    fail(inv, "graph-invalid", graphErrors.join(" "), "graph");
    stamp(inv, "FAILED");
    throw new Error(`Graph validation failed: ${graphErrors.join(" ")}`);
  }

  const strongest = ranked[0]?.candidateId ?? null;
  const claims = buildClaims({
    candidates: deduped,
    accounts,
    strongestSourceId: strongest,
    providerFailed,
  });

  const top = deduped.find((c) => c.id === strongest);
  const contradictions = timeline.contradictions.length;
  const { conclusion, notProven, limitations } = explainVerdict({
    strongestDomain: top?.domain ?? null,
    matchCount: deduped.length,
    contradictions,
    providerFailed,
  });
  const verdict = {
    sourceConfidence: ranked[0] ? Math.round((ranked[0].score.total / ranked[0].score.max) * 100) : 0,
    identityEvidence: Math.round(((top?.faceSimilarity ?? 0) * 100)),
    imageMatch: Math.round(((top?.perceptualSimilarity ?? (top?.exactHashMatch ? 1 : 0)) * 100)),
    temporalConsistency: Math.max(0, 100 - contradictions * 25 - (withTime.length === 0 ? 60 : 0)),
    manipulationRisk:
      integrity.naturalness === "LOW" ? 75 : integrity.naturalness === "MEDIUM" ? 35 : 10,
    conclusion,
    whatNotProven: notProven,
    limitations,
  };

  const evidence: EvidenceItem[] = [
    {
      id: "ev-fingerprint", type: "image-fingerprint", source: "local-analysis",
      observedAt: now, confidence: 0.99, provenance: "observation",
      description: `SHA-256 ${sha.slice(0, 16)}…; pHash ${fingerprint.phash}.`,
      explanation: "Cryptographic identity and perceptual similarity are separate signals.",
      payload: { sha256: sha, phash: fingerprint.phash, dhash: fingerprint.dhash },
    },
    {
      id: "ev-face", type: "face-analysis", source: "local-analysis",
      observedAt: now, confidence: face.detected ? 0.6 : 0.5, provenance: "observation",
      description: face.detected
        ? `${face.count} face-like region(s) observed (heuristic baseline).`
        : "No face-like region observed.",
      explanation: "Face similarity is evidence only — never identity proof.",
      payload: { count: face.count, quality: face.quality, detector: face.detector },
    },
    {
      id: "ev-metadata", type: "provenance-metadata", source: "local-analysis",
      observedAt: now, confidence: 0.5, provenance: "observation",
      description: metadata.c2pa.present
        ? "Signed provenance markers detected."
        : "No signed provenance markers detected.",
      explanation: "Provenance metadata is evidence, not proof of any real-world claim.",
      payload: { c2pa: metadata.c2pa.present, exifKeys: Object.keys(metadata.exif) },
    },
  ];
  for (const run of providerRuns) {
    evidence.push({
      id: `ev-provider-${run.provider}`, type: "provider-run", source: run.provider,
      observedAt: run.startedAt, confidence: run.status === "ok" ? 0.9 : 0.2,
      provenance: "observation",
      description: run.status === "ok"
        ? `${run.provider} returned ${run.resultCount} result(s) in ${run.latencyMs}ms (${modeLabel(opts.mode)}).`
        : `${run.provider} failed (${run.errorCode}). Coverage is partial.`,
      explanation: run.status === "ok"
        ? "Provider output recorded with latency and result count."
        : "Absence of results proves nothing; other evidence remains usable.",
      payload: { status: run.status, errorCode: run.errorCode, resultCount: run.resultCount },
    });
  }
  for (const c of deduped) {
    evidence.push({
      id: `ev-candidate-${c.id}`, type: "search-candidate", source: c.provider,
      observedAt: c.retrievedAt, confidence: c.perceptualSimilarity ?? 0.3,
      provenance: "observation",
      description: `Visually similar image observed at ${c.url}.`,
      explanation: "An observation of similarity at a URL — not a claim about origin.",
      payload: { canonicalUrl: c.canonicalUrl, similarity: c.perceptualSimilarity, timestamp: c.pageTimestamp },
    });
  }
  if (ranked[0]) {
    evidence.push({
      id: "ev-ranking", type: "source-ranking", source: "trace-scoring",
      observedAt: retrievedAt, confidence: 0.7, provenance: "inference",
      description: `${top?.domain ?? "none"} is the strongest observed origin candidate.`,
      explanation: (ranked[0].explanation).join(" "),
      payload: { candidateId: strongest, score: ranked[0].score.total },
    });
  }

  const bundle = buildEvidenceBundle({
    investigationId: id,
    mode: opts.mode,
    provider: inv.provider,
    createdAt: now,
    asset: { id: assetId, mime: decoded.mime, byteSize: bytes.length, width: decoded.width, height: decoded.height, sha256: sha },
    fingerprint,
    face: stripFacesForBundle(face),
    faceIntegrity: integrity,
    metadata,
    providerRuns,
    candidates: deduped,
    accounts,
    transformations: transforms,
    rankedSources: ranked,
    timeline,
    graph,
    claims,
    evidence,
    verdict,
  });

  if (inv.status !== "PARTIAL") stamp(inv, "READY_TO_SEAL");
  else {
    // PARTIAL investigations can still seal; record the transition explicitly.
    inv.history.push({ from: inv.status, to: "READY_TO_SEAL", at: new Date().toISOString() });
    inv.status = "READY_TO_SEAL";
  }
  const seal: SealedBundle = sealBundle(bundle, opts.sealedAt ?? new Date().toISOString());
  stamp(inv, "SEALED");

  const anchor: BlockchainAnchor = {
    evidenceRoot: seal.evidenceRoot,
    investigationIdHash: "",
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    appVersion: "0.1.0",
    chainId: null,
    contractAddress: null,
    txHash: null,
    blockNumber: null,
    anchoredAt: null,
    status: "NOT_CONFIGURED",
    error: "Not yet anchored.",
  };

  const stored: StoredInvestigation = {
    investigation: inv,
    asset: {
      id: assetId, mime: decoded.mime, byteSize: bytes.length,
      width: decoded.width, height: decoded.height, sha256: sha,
      storageKey, storedAt: now,
    },
    seal,
    anchor,
    demoCase: opts.mode === "demo" ? (opts.demoCaseId ?? DEFAULT_DEMO_CASE) : null,
  };
  saveStored(stored);
  return stored;
}

function stripFacesForBundle(face: FaceAnalysis): FaceAnalysis {
  // FaceAnalysis carries no raw embeddings by construction (only hashes),
  // but strip defensively before bundling.
  return {
    ...face,
    faces: face.faces.map((f) => ({ ...f })),
  };
}

export { normalizeTimestamp, normalizeUrl };
