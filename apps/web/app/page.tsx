"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ModeBadge } from "@/components/Badges";

interface Health {
  mode: "demo" | "live" | "test";
  modeLabel: string;
  chain: { status: string };
  providers: Array<{ id: string; configured: boolean; note: string }>;
}

interface DemoCases {
  notice: string;
  cases: Array<{ id: string; title: string; narrative: string; candidates: number; providerFailed: boolean }>;
}

interface Recent {
  investigations: Array<{ id: string; label: string; status: string; updatedAt: string; mode: string }>;
}

export default function Home() {
  const router = useRouter();
  const [health, setHealth] = useState<Health | null>(null);
  const [cases, setCases] = useState<DemoCases | null>(null);
  const [recent, setRecent] = useState<Recent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => null);
    fetch("/api/demo/cases").then((r) => r.json()).then(setCases).catch(() => null);
    fetch("/api/investigations").then((r) => r.json()).then(setRecent).catch(() => null);
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const form = new FormData(e.currentTarget);
      const res = await fetch("/api/investigations", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Investigation failed.");
      router.push(`/investigate/${json.investigation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b py-6" style={{ borderColor: "var(--trace-line)" }}>
        <div>
          <p className="trace-mono text-[11px] tracking-[0.3em]" style={{ color: "var(--trace-accent)" }}>
            TRUST & ATTRIBUTION CHAIN FOR VISUAL EVIDENCE
          </p>
          <h1 className="mt-1 text-4xl font-black tracking-tight">
            TRACE <span style={{ color: "var(--trace-dim)" }} className="text-lg font-normal">— Don&apos;t trust the image. Trace it.</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {health && <ModeBadge mode={health.mode} />}
          <a href="/verify" className="trace-mono border px-2 py-1 text-[11px] tracking-[0.18em]" style={{ borderColor: "var(--trace-line)" }}>
            VERIFY →
          </a>
        </div>
      </header>

      <p className="mt-4 max-w-3xl text-[15px] leading-relaxed" style={{ color: "var(--trace-dim)" }}>
        TRACE reconstructs and evaluates evidence about an image — observed sources, transformations,
        timeline, identity evidence, and cryptographic integrity. It does not declare truth.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <form onSubmit={submit} className="trace-panel p-4 lg:col-span-3" aria-label="Start investigation">
          <h2 className="trace-mono text-xs tracking-[0.2em]" style={{ color: "var(--trace-dim)" }}>
            START INVESTIGATION
          </h2>
          <label className="mt-3 block text-sm">
            Image file (JPG/PNG, ≤15 MB)
            <input
              name="image" type="file" accept="image/png,image/jpeg"
              className="mt-1 block w-full border p-2 text-sm"
              style={{ borderColor: "var(--trace-line)" }}
            />
          </label>
          <label className="mt-3 block text-sm">
            …or image URL
            <input
              name="imageUrl" type="url" placeholder="https://…"
              className="mt-1 block w-full border bg-transparent p-2 text-sm"
              style={{ borderColor: "var(--trace-line)" }}
            />
          </label>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block text-sm">
              Demo case (demo mode)
              <select name="demoCaseId" defaultValue="case-b" className="mt-1 block w-full border bg-transparent p-2 text-sm" style={{ borderColor: "var(--trace-line)", background: "var(--trace-panel)" }}>
                {cases?.cases.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Label
              <input name="label" maxLength={120} placeholder="e.g. forwarded portrait" className="mt-1 block w-full border bg-transparent p-2 text-sm" style={{ borderColor: "var(--trace-line)" }} />
            </label>
          </div>
          {health?.mode === "demo" && cases && (
            <p className="mt-2 text-[12px]" style={{ color: "var(--trace-warn)" }}>
              ▲ {cases.notice}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 border p-2 text-sm" style={{ borderColor: "var(--trace-bad)", color: "var(--trace-bad)" }}>
              {error}
            </p>
          )}
          <button
            type="submit" disabled={busy}
            className="mt-4 px-6 py-2 text-sm font-bold tracking-widest disabled:opacity-40"
            style={{ background: "var(--trace-accent)", color: "#000" }}
          >
            {busy ? "INVESTIGATING…" : "▸ RUN INVESTIGATION"}
          </button>
          <p className="mt-2 text-[12px]" style={{ color: "var(--trace-dim)" }}>
            Biometric analysis is performed locally on the image you provide. Provide only images you have a lawful basis to analyze.
          </p>
        </form>

        <div className="trace-panel p-4 lg:col-span-2">
          <h2 className="trace-mono text-xs tracking-[0.2em]" style={{ color: "var(--trace-dim)" }}>
            HOW AN INVESTIGATION READS
          </h2>
          <ol className="mt-3 space-y-3 text-sm">
            {[
              ["INVESTIGATION", "Image enters; fingerprints, face regions, metadata extracted."],
              ["DISCOVERY", "Near-duplicates observed via reverse-image search (live) or fixtures (demo)."],
              ["CORRELATION", "Candidates ranked; timeline, transformations, and graph built from evidence."],
              ["PROOF", "Evidence sealed to a root; optionally anchored so tampering is detectable."],
            ].map(([t, d]) => (
              <li key={t} className="border-l-2 pl-3" style={{ borderColor: "var(--trace-accent)" }}>
                <span className="trace-mono text-[11px] tracking-[0.15em]" style={{ color: "var(--trace-accent)" }}>{t}</span>
                <p style={{ color: "var(--trace-dim)" }}>{d}</p>
              </li>
            ))}
          </ol>
          <h2 className="trace-mono mt-5 text-xs tracking-[0.2em]" style={{ color: "var(--trace-dim)" }}>
            RECENT
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {(recent?.investigations ?? []).slice(0, 6).map((r) => (
              <li key={r.id}>
                <a href={`/investigate/${r.id}`} className="underline" style={{ color: "var(--trace-ink)" }}>
                  {r.label}
                </a>{" "}
                <span className="trace-mono text-[11px]" style={{ color: "var(--trace-dim)" }}>
                  {r.status} · {r.mode}
                </span>
              </li>
            ))}
            {(recent?.investigations ?? []).length === 0 && (
              <li style={{ color: "var(--trace-dim)" }}>No investigations yet.</li>
            )}
          </ul>
        </div>
      </div>
    </main>
  );
}
