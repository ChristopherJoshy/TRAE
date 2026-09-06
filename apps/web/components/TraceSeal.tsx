"use client";
import { useState } from "react";
import type { StoredInvestigation, VerificationResult } from "@trace/shared";
import { ChainBadge } from "./Badges";

/** TRACE Seal: evidence integrity certificate (not a legal certification). */
export function TraceSeal({ stored }: { stored: StoredInvestigation }) {
  const [anchor, setAnchor] = useState(stored.anchor);
  const [verify, setVerify] = useState<VerificationResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const seal = stored.seal;
  if (!seal) return null;
  const b = seal.bundle;
  const strongestId = b.rankedSources[0]?.candidateId ?? null;
  const strongest = b.candidates.find((c) => c.id === strongestId);

  async function doAnchor() {
    setBusy("anchor");
    try {
      const res = await fetch(`/api/investigations/${stored.investigation.id}/anchor`, { method: "POST" });
      const json = await res.json();
      if (json.anchor) setAnchor(json.anchor);
    } finally {
      setBusy(null);
    }
  }

  async function doVerify() {
    setBusy("verify");
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investigationId: stored.investigation.id }),
      });
      setVerify(await res.json());
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label="Trace seal" className="trace-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="trace-mono text-xs tracking-[0.2em]" style={{ color: "var(--trace-dim)" }}>
          TRACE SEAL — EVIDENCE INTEGRITY SEAL
        </h2>
        <ChainBadge status={anchor?.status ?? "NOT_CONFIGURED"} />
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-2 text-[13px] md:grid-cols-2">
        <Field k="Investigation" v={stored.investigation.id} mono />
        <Field k="Sealed at" v={seal.sealedAt} mono />
        <Field k="Evidence Root" v={seal.evidenceRoot} mono long />
        <Field k="Strongest observed source" v={strongest ? `${strongest.domain} (rank 1)` : "none"} />
        <Field k="Evidence items" v={String(b.evidence.items.length)} />
        <Field k="Transformations" v={b.transformations.map((t) => t.kind).join(", ") || "none"} />
        <Field
          k="Chain"
          v={
            anchor?.status === "ANCHORED"
              ? `Anchored · tx ${anchor.txHash?.slice(0, 18)}… · block ${anchor.blockNumber}`
              : (anchor?.error ?? "Not anchored")
          }
          mono
        />
        <Field k="Result" v={b.verdict.conclusion} />
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={doAnchor}
          disabled={busy !== null}
          className="border px-4 py-2 text-sm font-semibold disabled:opacity-40"
          style={{ borderColor: "var(--trace-accent)", color: "var(--trace-accent)" }}
        >
          {busy === "anchor" ? "Anchoring…" : "Anchor on-chain"}
        </button>
        <button
          onClick={doVerify}
          disabled={busy !== null}
          className="border px-4 py-2 text-sm disabled:opacity-40"
          style={{ borderColor: "var(--trace-line)" }}
        >
          {busy === "verify" ? "Verifying…" : "Verify integrity"}
        </button>
      </div>
      {verify && (
        <div
          className="mt-3 border p-3"
          style={{ borderColor: verify.match ? "var(--trace-support)" : "var(--trace-bad)" }}
          aria-live="polite"
        >
          <p className="trace-mono text-sm font-bold" style={{ color: verify.match ? "var(--trace-support)" : "var(--trace-bad)" }}>
            EVIDENCE INTEGRITY {verify.match ? "VERIFIED" : "FAILED — EVIDENCE MODIFIED"}
          </p>
          <p className="trace-mono mt-1 text-[12px]">expected {verify.expectedRoot}</p>
          <p className="trace-mono text-[12px]">current&nbsp;&nbsp; {verify.actualRoot}</p>
        </div>
      )}
      <p className="mt-3 text-[12px]" style={{ color: "var(--trace-dim)" }}>
        The seal proves the evidence has not changed since sealing — not that any claim is true.
      </p>
    </section>
  );
}

function Field({ k, v, mono, long }: { k: string; v: string; mono?: boolean; long?: boolean }) {
  return (
    <div className={long ? "md:col-span-2" : ""}>
      <dt className="trace-mono text-[11px] tracking-[0.15em]" style={{ color: "var(--trace-dim)" }}>
        {k}
      </dt>
      <dd className={`mt-0.5 break-all ${mono ? "trace-mono text-[12px]" : "text-sm"}`}>{v}</dd>
    </div>
  );
}
