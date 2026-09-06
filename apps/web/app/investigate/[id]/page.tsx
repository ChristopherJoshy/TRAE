"use client";
import { use, useEffect, useState } from "react";
import type { StoredInvestigation } from "@trace/shared";
import { ChainBadge, ModeBadge, StatusBadge } from "@/components/Badges";
import { PeelImage } from "@/components/PeelImage";
import { VerdictPanel } from "@/components/VerdictPanel";
import { SimilarityLens } from "@/components/SimilarityLens";
import { Constellation } from "@/components/Constellation";
import { TemporalTrace } from "@/components/TemporalTrace";
import { EvidenceList } from "@/components/EvidenceList";
import { TraceSeal } from "@/components/TraceSeal";

export default function InvestigatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [stored, setStored] = useState<StoredInvestigation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/investigations/${id}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Load failed.");
        return j;
      })
      .then((s: StoredInvestigation) => {
        setStored(s);
        setSelected(s.seal?.bundle.rankedSources[0]?.candidateId ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed."));
  }, [id]);

  if (error) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <p role="alert" className="border p-4" style={{ borderColor: "var(--trace-bad)", color: "var(--trace-bad)" }}>
          Investigation could not be loaded: {error}
        </p>
        <a href="/" className="mt-4 inline-block underline">← Back to TRACE</a>
      </main>
    );
  }
  if (!stored?.seal) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10" aria-busy="true">
        <p className="trace-mono animate-pulse text-sm tracking-[0.2em]">LOADING INVESTIGATION…</p>
      </main>
    );
  }

  const b = stored.seal.bundle;
  const assetUrl = `/api/investigations/${stored.investigation.id}/asset`;

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b py-4" style={{ borderColor: "var(--trace-line)" }}>
        <div>
          <a href="/" className="trace-mono text-[11px] tracking-[0.25em]" style={{ color: "var(--trace-accent)" }}>
            TRACE
          </a>
          <h1 className="text-xl font-bold">{stored.investigation.label}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModeBadge mode={b.mode} />
          <ChainBadge status={stored.anchor?.status ?? "NOT_CONFIGURED"} />
          <StatusBadge status={stored.investigation.status} />
        </div>
      </header>

      {stored.investigation.errors.length > 0 && (
        <div className="mt-3 border p-3 text-sm" style={{ borderColor: "var(--trace-warn)" }} role="alert">
          {stored.investigation.errors.map((e, i) => (
            <p key={i} style={{ color: "var(--trace-warn)" }}>
              ▲ {e.phase}: {e.message} {e.retryable ? "(retryable)" : ""}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PeelImage
          assetUrl={assetUrl}
          width={b.asset.width} height={b.asset.height} mime={b.asset.mime}
          faces={b.face} fingerprint={b.fingerprint} metadata={b.metadata}
          candidates={b.candidates} transforms={b.transformations}
          graph={b.graph} evidenceRoot={stored.seal.evidenceRoot}
        />
        <div className="flex flex-col gap-4">
          <VerdictPanel verdict={b.verdict} />
          <IdentityPanel stored={stored} />
        </div>
      </div>

      <div className="mt-4">
        <Constellation graph={b.graph} ranked={b.rankedSources} candidates={b.candidates} focusCandidateId={selected} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SimilarityLens
          assetUrl={assetUrl} faces={b.face}
          candidates={b.candidates} transforms={b.transformations}
          selectedId={selected} onSelect={(cid) => setSelected(cid)}
        />
        <TemporalTrace timeline={b.timeline} candidates={b.candidates} selectedId={selected} onSelect={setSelected} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <EvidenceList evidence={b.evidence} />
        <TraceSeal stored={stored} />
      </div>

      <section aria-label="Limitations" className="trace-panel mt-4 p-4">
        <h2 className="trace-mono text-xs tracking-[0.2em]" style={{ color: "var(--trace-dim)" }}>
          LIMITATIONS — WHAT TRACE CANNOT ESTABLISH
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px]" style={{ color: "var(--trace-dim)" }}>
          {b.verdict.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <footer className="trace-mono mt-4 flex flex-wrap gap-3 text-[11px]" style={{ color: "var(--trace-dim)" }}>
        <span>ID {stored.investigation.id}</span>
        <span>PROVIDER {b.provider}</span>
        <span>SEALED {stored.seal.sealedAt}</span>
      </footer>
    </main>
  );
}

function IdentityPanel({ stored }: { stored: StoredInvestigation }) {
  const b = stored.seal!.bundle;
  return (
    <section aria-label="Identity and integrity" className="trace-panel p-4">
      <h2 className="trace-mono text-xs tracking-[0.2em]" style={{ color: "var(--trace-dim)" }}>
        IDENTITY · INTEGRITY
      </h2>
      <p className="mt-2 text-sm">
        {b.face.detected
          ? `${b.face.count} face-like region(s), quality ${b.face.quality}. Face similarity is evidence — never identity proof.`
          : "No face-like region detected."}{" "}
        <span className="trace-mono text-[11px]" style={{ color: "var(--trace-dim)" }}>
          detector {b.face.detector}
        </span>
      </p>
      <p className="mt-2 text-sm">
        Manipulation screen:{" "}
        <strong
          style={{
            color:
              b.faceIntegrity.naturalness === "HIGH"
                ? "var(--trace-support)"
                : b.faceIntegrity.naturalness === "MEDIUM"
                  ? "var(--trace-warn)"
                  : "var(--trace-bad)",
          }}
        >
          {b.faceIntegrity.naturalness} naturalness
        </strong>{" "}
        (heuristic only, confidence {(b.faceIntegrity.naturalnessConfidence * 100).toFixed(0)}%).
      </p>
      {b.faceIntegrity.warnings.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-[13px]" style={{ color: "var(--trace-warn)" }}>
          {b.faceIntegrity.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <h3 className="trace-mono mt-3 text-[11px] tracking-[0.18em]" style={{ color: "var(--trace-dim)" }}>
        ACCOUNT EVIDENCE ({b.accounts.length})
      </h3>
      {b.accounts.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--trace-dim)" }}>
          No account evidence. No ownership claim is made.
        </p>
      ) : (
        <ul className="mt-1 space-y-1 text-[13px]">
          {b.accounts.map((a) => (
            <li key={a.id}>
              @{a.handle ?? "?"} · {a.evidenceType} · {(a.confidence * 100).toFixed(0)}% — {a.detail}
            </li>
          ))}
        </ul>
      )}
      <h3 className="trace-mono mt-3 text-[11px] tracking-[0.18em]" style={{ color: "var(--trace-dim)" }}>
        CLAIMS ({b.claims.length})
      </h3>
      <ul className="mt-1 space-y-1 text-[13px]">
        {b.claims.slice(0, 6).map((c) => (
          <li key={c.id}>
            <span
              className="trace-mono text-[11px]"
              style={{
                color: c.status === "supported" ? "var(--trace-support)" : c.status === "contradicted" ? "var(--trace-bad)" : "var(--trace-warn)",
              }}
            >
              [{c.status.toUpperCase()}]
            </span>{" "}
            {c.statement}
          </li>
        ))}
      </ul>
    </section>
  );
}
