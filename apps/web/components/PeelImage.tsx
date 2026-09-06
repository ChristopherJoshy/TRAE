"use client";
import { useCallback, useState } from "react";
import type {
  FaceAnalysis,
  ImageFingerprint,
  MetadataObservation,
  ProvenanceGraph,
  SearchCandidate,
  Transformation,
} from "@trace/shared";

const LAYERS = [
  "SOURCE IMAGE",
  "FACE MAP",
  "IMAGE FINGERPRINT",
  "METADATA",
  "DISCOVERED COPIES",
  "TRANSFORMATIONS",
  "PROVENANCE GRAPH",
  "EVIDENCE ROOT",
] as const;

export function PeelImage(props: {
  assetUrl: string;
  width: number;
  height: number;
  mime: string;
  faces: FaceAnalysis;
  fingerprint: ImageFingerprint;
  metadata: MetadataObservation;
  candidates: SearchCandidate[];
  transforms: Transformation[];
  graph: ProvenanceGraph;
  evidenceRoot: string;
}) {
  const [layer, setLayer] = useState(0);
  const go = useCallback(
    (d: number) => setLayer((l) => Math.max(0, Math.min(LAYERS.length - 1, l + d))),
    [],
  );
  const strongest = props.candidates.length > 0 ? props.candidates[0] : null;

  return (
    <section aria-label="Peel the image" className="trace-panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="trace-mono text-xs tracking-[0.2em]" style={{ color: "var(--trace-dim)" }}>
          PEEL THE IMAGE — LAYER {layer + 1}/8
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => go(-1)}
            disabled={layer === 0}
            aria-label="Previous layer"
            className="border px-3 py-1 text-sm disabled:opacity-30"
            style={{ borderColor: "var(--trace-line)" }}
          >
            ←
          </button>
          <button
            onClick={() => go(1)}
            disabled={layer === LAYERS.length - 1}
            aria-label="Next layer"
            className="border px-3 py-1 text-sm disabled:opacity-30"
            style={{ borderColor: "var(--trace-line)" }}
          >
            →
          </button>
        </div>
      </div>

      <div
        className="mt-2 flex flex-wrap gap-1"
        role="tablist"
        aria-label="Evidence layers"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
        }}
      >
        {LAYERS.map((l, i) => (
          <button
            key={l}
            role="tab"
            aria-selected={i === layer}
            onClick={() => setLayer(i)}
            className="trace-mono border px-2 py-1 text-[10px] tracking-[0.12em]"
            style={{
              borderColor: i === layer ? "var(--trace-accent)" : "var(--trace-line)",
              color: i === layer ? "var(--trace-accent)" : "var(--trace-dim)",
            }}
          >
            {i + 1}·{l}
          </button>
        ))}
      </div>

      <div className="relative mt-3 overflow-hidden border" style={{ borderColor: "var(--trace-line)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={props.assetUrl}
          alt="Investigated image"
          className="block max-h-[420px] w-full object-contain"
          style={{ opacity: layer >= 2 && layer <= 3 ? 0.35 : 1 }}
        />
        {layer === 1 &&
          props.faces.faces.map((f) => (
            <div
              key={f.id}
              className="absolute border-2"
              style={{
                borderColor: "var(--trace-accent)",
                left: `${f.box.x * 100}%`,
                top: `${f.box.y * 100}%`,
                width: `${f.box.w * 100}%`,
                height: `${f.box.h * 100}%`,
              }}
              title={`${f.id} quality ${f.quality}`}
            >
              <span
                className="trace-mono absolute -top-5 left-0 px-1 text-[10px]"
                style={{ background: "var(--trace-accent)", color: "#000" }}
              >
                {f.id}·{f.quality}
              </span>
            </div>
          ))}
        <div
          key={layer}
          className="absolute inset-x-0 bottom-0 max-h-[55%] overflow-auto p-3 text-[13px]"
          style={{ background: "rgba(10,10,14,0.88)", animation: "trace-fade 240ms ease-out" }}
        >
          <LayerBody layer={layer} {...props} strongestDomain={strongest?.domain ?? null} />
        </div>
      </div>
      <style>{`@keyframes trace-fade { from { opacity: 0; transform: translateY(6px);} to { opacity: 1; transform: none; } }`}</style>
    </section>
  );
}

function LayerBody({
  layer,
  strongestDomain,
  ...p
}: {
  layer: number;
  strongestDomain: string | null;
} & Omit<Parameters<typeof PeelImage>[0], "assetUrl">) {
  switch (layer) {
    case 0:
      return (
        <p>
          Source image · {p.mime} · {p.width}×{p.height}px. This is the exact investigated instance —
          SHA-256 identifies it, similarity is judged separately.
        </p>
      );
    case 1:
      return (
        <p>
          {p.faces.detected
            ? `${p.faces.count} face-like region(s), overall quality ${p.faces.quality}. Heuristic baseline — regions are estimates, not detections.`
            : "No face-like region observed."}{" "}
          {p.faces.warnings[0]}
        </p>
      );
    case 2:
      return (
        <p className="trace-mono text-[12px]">
          sha256 {p.fingerprint.sha256.slice(0, 32)}…<br />
          phash {p.fingerprint.phash} · dhash {p.fingerprint.dhash} · sharp {p.fingerprint.sharpness}
        </p>
      );
    case 3:
      return (
        <p>
          {p.metadata.c2pa.present ? "Signed provenance markers detected. " : "No signed provenance markers. "}
          {Object.keys(p.metadata.exif).length > 0
            ? `EXIF keys: ${Object.keys(p.metadata.exif).join(", ")}.`
            : "No EXIF recovered."}{" "}
          Metadata is evidence, never proof.
        </p>
      );
    case 4:
      return (
        <p>
          {p.candidates.length === 0
            ? "No near-duplicate versions observed elsewhere."
            : `${p.candidates.length} near-duplicate version(s): ${p.candidates.map((c) => c.domain).join(", ")}.`}
        </p>
      );
    case 5:
      return (
        <p>
          {p.transforms.length === 0
            ? "No transformation analysis available."
            : p.transforms.map((t) => `${t.kind} (${(t.confidence * 100).toFixed(0)}%)`).join(" · ")}
        </p>
      );
    case 6:
      return (
        <p>
          {p.graph.nodes.length} nodes · {p.graph.edges.length} evidence-backed edges.
          {strongestDomain ? ` Strongest observed source: ${strongestDomain}.` : " No strongest source."}
        </p>
      );
    default:
      return <p className="trace-mono text-[12px]">Evidence Root {p.evidenceRoot}</p>;
  }
}
