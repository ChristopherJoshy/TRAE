import type { TimestampQuality, TransformationKind } from "./types.js";

/**
 * Deterministic offline fixture engine (DEMO mode).
 * All URLs use RFC-2606 `.example` domains and synthetic handles so fixture
 * evidence can never be mistaken for real-world posts. Every demo case is
 * explicitly labeled DEMO from fixture to UI.
 */

export interface DemoAccountSeed {
  handle: string | null;
  platform: string;
  evidenceType:
    | "public-post"
    | "profile-metadata"
    | "account-control-challenge"
    | "signed-message"
    | "verified-credential"
    | "external-identity";
  detail: string;
}

export interface DemoCandidateSeed {
  key: string;
  url: string;
  title: string;
  fixture: string;
  pageTimestamp: string | null;
  timestampQuality: TimestampQuality;
  platform?: string;
  exactHashMatch?: boolean;
  perceptualSimilarity?: number;
  faceSimilarity?: number | null;
  transformHint?: TransformationKind;
  account?: DemoAccountSeed;
}

export interface DemoCase {
  id: string;
  title: string;
  narrative: string;
  provider: "demo";
  providerFailed: boolean;
  providerErrorCode: string | null;
  candidates: DemoCandidateSeed[];
  ambiguityNote: string | null;
}

const T = (d: string) => `2026-03-${d}T10:00:00.000Z`;

export const DEMO_CASE_IDS = ["case-a", "case-b", "case-c", "case-d", "case-e"] as const;
export type DemoCaseId = (typeof DEMO_CASE_IDS)[number];

export function getDemoCase(id: string): DemoCase {
  switch (id) {
    case "case-a":
      return {
        id: "case-a",
        title: "High-confidence original source (DEMO)",
        narrative: "Exact match at the earliest observed timestamp with consistent metadata.",
        provider: "demo",
        providerFailed: false,
        providerErrorCode: null,
        ambiguityNote: null,
        candidates: [
          {
            key: "a-origin", url: "https://photos.example/case-a/original-photo",
            title: "Morning portrait — original upload (DEMO fixture)",
            fixture: "original.png", pageTimestamp: T("14"), timestampQuality: "PAGE_METADATA",
            exactHashMatch: true, perceptualSimilarity: 1, faceSimilarity: 0.97,
          },
          {
            key: "a-repost", url: "https://blog.example/case-a/repost-with-credit?utm_source=feed",
            title: "Repost with credit (DEMO fixture)",
            fixture: "recompressed.jpg", pageTimestamp: T("15"), timestampQuality: "PAGE_METADATA",
            perceptualSimilarity: 0.94, faceSimilarity: 0.93, transformHint: "recompressed",
          },
          {
            key: "a-crop", url: "https://social.example/case-a/cropped-share",
            title: "Cropped share (DEMO fixture)", platform: "Social",
            fixture: "cropped.png", pageTimestamp: T("16"), timestampQuality: "PAGE_METADATA",
            perceptualSimilarity: 0.81, faceSimilarity: 0.88, transformHint: "cropped",
          },
        ],
      };
    case "case-b":
      return {
        id: "case-b",
        title: "Cropped / recompressed repost chain (DEMO)",
        narrative: "Derivatives propagate with shrinking similarity and visible transforms.",
        provider: "demo",
        providerFailed: false,
        providerErrorCode: null,
        ambiguityNote: null,
        candidates: [
          {
            key: "b-origin", url: "https://photos.example/case-b/original-photo",
            title: "Original upload (DEMO fixture)",
            fixture: "original.png", pageTimestamp: T("14"), timestampQuality: "PAGE_METADATA",
            perceptualSimilarity: 0.99, faceSimilarity: 0.96,
          },
          {
            key: "b-resize", url: "https://forum.example/case-b/resized-copy",
            title: "Resized copy (DEMO fixture)",
            fixture: "resized.png", pageTimestamp: T("15"), timestampQuality: "PAGE_METADATA",
            perceptualSimilarity: 0.9, faceSimilarity: 0.9, transformHint: "resized",
          },
          {
            key: "b-text", url: "https://social.example/case-b/meme-text-overlay",
            title: "Text overlay share (DEMO fixture)", platform: "Social",
            fixture: "text-overlay.png", pageTimestamp: T("16"), timestampQuality: "PAGE_METADATA",
            perceptualSimilarity: 0.74, faceSimilarity: 0.85, transformHint: "text-overlay",
          },
          {
            key: "b-color", url: "https://blog.example/case-b/filtered-repost",
            title: "Filtered repost (DEMO fixture)",
            fixture: "color-shifted.png", pageTimestamp: T("17"), timestampQuality: "INFERRED",
            perceptualSimilarity: 0.68, faceSimilarity: 0.8, transformHint: "color-adjusted",
          },
        ],
      };
    case "case-c":
      return {
        id: "case-c",
        title: "Possible impersonation pattern (DEMO)",
        narrative: "Same face appears under two unrelated synthetic accounts; ownership unresolved.",
        provider: "demo",
        providerFailed: false,
        providerErrorCode: null,
        ambiguityNote: "Face similarity connects the image, but no account-control evidence links either account to the depicted person.",
        candidates: [
          {
            key: "c-first", url: "https://social.example/case-c/first-post",
            title: "First observed post by @demo_mara (DEMO fixture)", platform: "Social",
            fixture: "original.png", pageTimestamp: T("14"), timestampQuality: "PAGE_METADATA",
            perceptualSimilarity: 0.92, faceSimilarity: 0.91,
            account: {
              handle: "demo_mara", platform: "Social",
              evidenceType: "public-post",
              detail: "Public post observed. No account-control challenge completed.",
            },
          },
          {
            key: "c-copy", url: "https://social.example/case-c/copy-by-stranger",
            title: "Same image posted by @demo_stranger99 (DEMO fixture)", platform: "Social",
            fixture: "recompressed.jpg", pageTimestamp: T("17"), timestampQuality: "PAGE_METADATA",
            perceptualSimilarity: 0.9, faceSimilarity: 0.9, transformHint: "recompressed",
            account: {
              handle: "demo_stranger99", platform: "Social",
              evidenceType: "profile-metadata",
              detail: "New account, no verified credential. Ownership of depicted identity not established.",
            },
          },
        ],
      };
    case "case-d":
      return {
        id: "case-d",
        title: "Ambiguous evidence — two plausible sources (DEMO)",
        narrative: "Two candidates carry near-equal evidence; TRACE must not force an answer.",
        provider: "demo",
        providerFailed: false,
        providerErrorCode: null,
        ambiguityNote: "Scores differ by less than 5 points with conflicting timestamp quality. No single origin can be asserted.",
        candidates: [
          {
            key: "d-one", url: "https://photos.example/case-d/archive-upload",
            title: "Archive upload, weak timestamp (DEMO fixture)",
            fixture: "resized.png", pageTimestamp: T("13"), timestampQuality: "INFERRED",
            perceptualSimilarity: 0.88, faceSimilarity: 0.87,
          },
          {
            key: "d-two", url: "https://news.example/case-d/editorial-use",
            title: "Editorial use, exact timestamp (DEMO fixture)",
            fixture: "watermarked.png", pageTimestamp: T("14"), timestampQuality: "EXACT",
            perceptualSimilarity: 0.86, faceSimilarity: 0.87, transformHint: "watermark",
          },
        ],
      };
    case "case-e":
      return {
        id: "case-e",
        title: "Provider failure — partial evidence (DEMO)",
        narrative: "Reverse search unavailable. Local analysis only; coverage explicitly incomplete.",
        provider: "demo",
        providerFailed: true,
        providerErrorCode: "provider-unavailable",
        ambiguityNote: "No remote candidates observed. Absence of matches proves nothing.",
        candidates: [],
      };
    default:
      throw new Error(`Unknown demo case ${id}.`);
  }
}

/** Default demo case for one-click investigations. */
export const DEFAULT_DEMO_CASE: DemoCaseId = "case-b";
