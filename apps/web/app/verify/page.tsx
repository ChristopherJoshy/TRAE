"use client";
import { useState } from "react";
import type { VerificationResult } from "@trace/shared";

export default function VerifyPage() {
  const [id, setId] = useState("");
  const [bundleText, setBundleText] = useState("");
  const [root, setRoot] = useState("");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(body: object) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Verification failed.");
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <header className="border-b py-6" style={{ borderColor: "var(--trace-line)" }}>
        <a href="/" className="trace-mono text-[11px] tracking-[0.25em]" style={{ color: "var(--trace-accent)" }}>
          TRACE
        </a>
        <h1 className="mt-1 text-2xl font-bold">Verify evidence integrity</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--trace-dim)" }}>
          Recomputes the Evidence Root and compares it. To demonstrate tamper detection, fetch a sealed
          bundle, change one field, and verify — the result must fail.
        </p>
      </header>

      <section className="trace-panel mt-4 p-4" aria-label="Verify by investigation">
        <h2 className="trace-mono text-xs tracking-[0.2em]" style={{ color: "var(--trace-dim)" }}>
          BY INVESTIGATION ID
        </h2>
        <div className="mt-2 flex gap-2">
          <input
            value={id} onChange={(e) => setId(e.target.value)}
            placeholder="inv-…" aria-label="Investigation id"
            className="trace-mono flex-1 border bg-transparent p-2 text-sm"
            style={{ borderColor: "var(--trace-line)" }}
          />
          <button
            onClick={() => run({ investigationId: id })} disabled={busy || !id}
            className="px-4 py-2 text-sm font-bold disabled:opacity-40"
            style={{ background: "var(--trace-accent)", color: "#000" }}
          >
            Verify
          </button>
        </div>
      </section>

      <section className="trace-panel mt-4 p-4" aria-label="Verify pasted bundle">
        <h2 className="trace-mono text-xs tracking-[0.2em]" style={{ color: "var(--trace-dim)" }}>
          PASTED BUNDLE + EXPECTED ROOT (TAMPER LAB)
        </h2>
        <textarea
          value={bundleText} onChange={(e) => setBundleText(e.target.value)}
          placeholder='{"schemaVersion": "trace.bundle/v1", …}' aria-label="Evidence bundle JSON"
          rows={6}
          className="trace-mono mt-2 w-full border bg-transparent p-2 text-[12px]"
          style={{ borderColor: "var(--trace-line)" }}
        />
        <input
          value={root} onChange={(e) => setRoot(e.target.value)}
          placeholder="0x…" aria-label="Expected root"
          className="trace-mono mt-2 w-full border bg-transparent p-2 text-[12px]"
          style={{ borderColor: "var(--trace-line)" }}
        />
        <button
          onClick={() => run({ bundle: JSON.parse(bundleText), expectedRoot: root })}
          disabled={busy || !bundleText || !root}
          className="mt-2 border px-4 py-2 text-sm disabled:opacity-40"
          style={{ borderColor: "var(--trace-line)" }}
        >
          Verify pasted bundle
        </button>
      </section>

      {error && (
        <p role="alert" className="mt-4 border p-3 text-sm" style={{ borderColor: "var(--trace-bad)", color: "var(--trace-bad)" }}>
          {error}
        </p>
      )}
      {result && (
        <div
          className="mt-4 border p-4" aria-live="polite"
          style={{ borderColor: result.match ? "var(--trace-support)" : "var(--trace-bad)" }}
        >
          <p className="trace-mono font-bold" style={{ color: result.match ? "var(--trace-support)" : "var(--trace-bad)" }}>
            EVIDENCE INTEGRITY {result.match ? "VERIFIED" : "FAILED — EVIDENCE MODIFIED"}
          </p>
          <p className="trace-mono mt-2 break-all text-[12px]">EXPECTED ROOT {result.expectedRoot}</p>
          <p className="trace-mono break-all text-[12px]">CURRENT ROOT&nbsp;&nbsp; {result.actualRoot}</p>
          {result.failures.map((f) => (
            <p key={f} className="mt-1 text-sm" style={{ color: "var(--trace-bad)" }}>{f}</p>
          ))}
        </div>
      )}
    </main>
  );
}
