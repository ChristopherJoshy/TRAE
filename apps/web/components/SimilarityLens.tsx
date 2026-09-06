"use client";
import { useMemo, useState } from "react";
import type { FaceAnalysis, SearchCandidate, Transformation } from "@trace/shared";

function candidateImage(c: SearchCandidate): string {
  // Demo fixtures are served locally and labeled synthetic; live URLs load client-side.
  if (c.provider === "demo" && c.imageUrl && !c.imageUrl.includes("://")) {
    return `/api/fixtures/${c.imageUrl}`;
  }
  return c.imageUrl ?? "";
}

/** Similarity Lens: synchronized comparison of source candidate vs investigated image. */
export function SimilarityLens(props: {
  assetUrl: string;
  faces: FaceAnalysis;
  candidates: SearchCandidate[];
  transforms: Transformation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [opacity, setOpacity] = useState(0.5);
  const [overlay, setOverlay] = useState(false);
  const [showFaces, setShowFaces] = useState(true);

  const selected: SearchCandidate | null = useMemo(
    () => props.candidates.find((c) => c.id === (props.selectedId ?? props.candidates[0]?.id)) ?? null,
    [props.candidates, props.selectedId],
  );
  const transform = props.transforms.find((t) => t.candidateId === selected?.id);

  return (
    <section aria-label="Similarity lens" className="trace-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="trace-mono text-xs tracking-[0.2em]" style={{ color: "var(--trace-dim)" }}>
          SIMILARITY LENS
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          <label className="flex items-center gap-1">
            Zoom
            <input
              type="range" min={1} max={3} step={0.25} value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))} aria-label="Synchronized zoom"
            />
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} />
            Overlay
          </label>
          {overlay && (
            <label className="flex items-center gap-1">
              Opacity
              <input
                type="range" min={0} max={1} step={0.05} value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))} aria-label="Overlay opacity"
              />
            </label>
          )}
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={showFaces} onChange={(e) => setShowFaces(e.target.checked)} />
            Face regions
          </label>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1" role="listbox" aria-label="Source candidates">
        {props.candidates.map((c) => (
          <button
            key={c.id}
            role="option"
            aria-selected={c.id === selected?.id}
            onClick={() => props.onSelect(c.id)}
            className="trace-mono border px-2 py-1 text-[11px]"
            style={{
              borderColor: c.id === selected?.id ? "var(--trace-accent)" : "var(--trace-line)",
              color: c.id === selected?.id ? "var(--trace-accent)" : "var(--trace-dim)",
            }}
          >
            {c.domain} · {c.exactHashMatch ? "exact" : `${((c.perceptualSimilarity ?? 0) * 100).toFixed(0)}%`}
          </button>
        ))}
        {props.candidates.length === 0 && (
          <p className="text-sm" style={{ color: "var(--trace-dim)" }}>
            No reverse-search results to compare.
          </p>
        )}
      </div>

      {selected && (
        <div className="mt-3">
          {overlay ? (
            <div className="relative mx-auto w-full max-w-[520px] overflow-hidden border" style={{ borderColor: "var(--trace-line)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={candidateImage(selected)} alt={`Source candidate ${selected.domain}`} style={{ transform: `scale(${zoom})`, width: "100%" }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={props.assetUrl} alt="Investigated image overlay"
                className="absolute inset-0 h-full w-full object-cover"
                style={{ opacity, transform: `scale(${zoom})` }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <figure className="border p-2" style={{ borderColor: "var(--trace-line)" }}>
                <figcaption className="trace-mono text-[11px]" style={{ color: "var(--trace-dim)" }}>
                  SOURCE CANDIDATE — {selected.domain}
                </figcaption>
                <div className="overflow-auto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={candidateImage(selected)} alt={`Source candidate ${selected.domain}`} style={{ transform: `scale(${zoom})`, transformOrigin: "top left", maxWidth: "100%" }} />
                </div>
              </figure>
              <figure className="relative border p-2" style={{ borderColor: "var(--trace-line)" }}>
                <figcaption className="trace-mono text-[11px]" style={{ color: "var(--trace-dim)" }}>
                  INVESTIGATED IMAGE
                </figcaption>
                <div className="relative overflow-auto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={props.assetUrl} alt="Investigated image" style={{ transform: `scale(${zoom})`, transformOrigin: "top left", maxWidth: "100%" }} />
                  {showFaces &&
                    props.faces.faces.map((f) => (
                      <div
                        key={f.id}
                        className="pointer-events-none absolute border"
                        style={{
                          borderColor: "var(--trace-accent)",
                          left: `${f.box.x * 100}%`, top: `${f.box.y * 100}%`,
                          width: `${f.box.w * 100}%`, height: `${f.box.h * 100}%`,
                        }}
                      />
                    ))}
                </div>
              </figure>
            </div>
          )}
          <div className="mt-2 grid grid-cols-1 gap-2 text-[13px] md:grid-cols-2">
            <div className="border p-3" style={{ borderColor: "var(--trace-line)" }}>
              <h3 className="trace-mono text-[11px] tracking-[0.18em]" style={{ color: "var(--trace-support)" }}>
                ✓ WHY THESE MATCH
              </h3>
              <ul className="mt-1 list-disc pl-5">
                {selected.exactHashMatch && <li>Exact cryptographic hash match.</li>}
                {(selected.perceptualSimilarity ?? 0) >= 0.7 && (
                  <li>Strong perceptual similarity ({((selected.perceptualSimilarity ?? 0) * 100).toFixed(1)}%).</li>
                )}
                {(selected.faceSimilarity ?? 0) >= 0.7 && (
                  <li>Same face geometry (similarity {((selected.faceSimilarity ?? 0) * 100).toFixed(1)}% — evidence only).</li>
                )}
                {transform && transform.kind !== "unchanged" && transform.kind !== "unknown" && (
                  <li>Consistent {transform.kind} derivation relationship.</li>
                )}
                {(selected.perceptualSimilarity ?? 0) < 0.7 && !selected.exactHashMatch && (
                  <li>Weak match — treat as a lead, not a conclusion.</li>
                )}
              </ul>
            </div>
            <div className="border p-3" style={{ borderColor: "var(--trace-line)" }}>
              <h3 className="trace-mono text-[11px] tracking-[0.18em]" style={{ color: "var(--trace-warn)" }}>
                Δ DIFFERENCES
              </h3>
              <ul className="mt-1 list-disc pl-5">
                {transform ? (
                  <>
                    <li>
                      {transform.kind} (confidence {(transform.confidence * 100).toFixed(0)}%).
                    </li>
                    {transform.evidence.map((e) => (
                      <li key={e} className="trace-mono text-[12px]">
                        {e}
                      </li>
                    ))}
                  </>
                ) : (
                  <li>No transformation analysis.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
