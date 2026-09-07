// Zero-dependency terminal showmanship for the TRACE pipeline:
// banner, phase headers, match table, provenance tree, verdict box.
// Recording-safe: no line rewriting, colors only on TTY (NO_COLOR respected).
const TTY = process.stdout.isTTY === true && !process.env["NO_COLOR"];

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

function paint(color, s) {
  return TTY ? `${C[color]}${s}${C.reset}` : s;
}

export function banner(mode, chainName) {
  const lines = [
    "",
    paint("cyan", "  ████████╗██████╗  █████╗  ██████╗███████╗"),
    paint("cyan", "     ██╔══╝██╔══██╗██╔══██╗██╔════╝██╔════╝"),
    paint("cyan", "     ██║   ██████╔╝███████║██║     █████╗  "),
    paint("cyan", "     ██║   ██╔══██╗██╔══██║██║     ██╔══╝  "),
    paint("cyan", "     ██║   ██║  ██║██║  ██║╚██████╗███████╗"),
    paint("cyan", "     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝"),
    paint("dim", "  Don't trust the image. Trace it.   ") +
      paint("yellow", `[${mode.toUpperCase()} MODE]`) + "  " + paint("magenta", `⛓ ${chainName}`),
    "",
  ];
  console.log(lines.join("\n"));
}

export function phase(n, total, title) {
  console.log(`\n${paint("bold", paint("cyan", `━━━ [${n}/${total}] ${title} `))}${paint("dim", "━".repeat(Math.max(0, 46 - title.length)))}`);
}

export function simBar(sim) {
  const w = 18;
  const fill = Math.round(sim * w);
  const bar = "█".repeat(fill) + "░".repeat(w - fill);
  const color = sim >= 0.72 ? "green" : sim >= 0.55 ? "yellow" : "dim";
  return paint(color, bar) + ` ${paint("bold", sim.toFixed(3))}`;
}

export function matchTable(matches) {
  console.log(paint("bold", "\n  ★ CONFIRMED MATCHES"));
  console.log(paint("dim", "  ────────────────────────────────────────────────────────────"));
  matches.slice(0, 5).forEach((m, i) => {
    const host = (() => { try { return new URL(m.postUrl).hostname; } catch { return m.postUrl; } })();
    console.log(`  ${paint("yellow", `#${i + 1}`)} ${simBar(m.similarity)}  ${paint("bold", host)}`);
    console.log(`     ${paint("dim", (m.postTitle ?? "").slice(0, 72))}`);
    console.log(`     ${paint("dim", m.postUrl.slice(0, 88))}`);
  });
}

/** Rich-style provenance tree finale. */
export function provenanceTree(ev) {
  const L = [];
  const B = (s) => L.push(paint("cyan", "  │ ") + s);
  L.push("");
  L.push(paint("bold", paint("cyan", "  ◈ PROVENANCE TRACE")));
  L.push(paint("cyan", "  │"));
  L.push(`${paint("cyan", "  ├─")} ◉ face scan — ${ev.faces} face(s), best score ${ev.faceScore} ${paint("dim", "[BlazeFace, " + ev.faceMs + "ms]")}`);
  B(`${paint("cyan", "└─")} embedding ${ev.embDim}-dim → memory only, never stored`);
  L.push(`${paint("cyan", "  ├─")} ◉ web discovery — ${ev.candidates} pages ${paint("dim", "[Exa, " + ev.searchMs + "ms]")}`);
  ev.checkedLines.forEach((c) => B(`${paint("cyan", "├─")} ${c}`));
  B(`${paint("green", "└─ ★ MATCH")} ${paint("bold", ev.topHost)} ${simBar(ev.topSim)}`);
  L.push(`${paint("cyan", "  ├─")} ◉ seal — ${paint("dim", ev.root)}`);
  L.push(`${paint("cyan", "  └─")} ${paint("magenta", "⛓ chain")} — ${ev.chainKind} ${paint("dim", "(chain " + ev.chainId + ")")}`);
  L.push(`${paint("cyan", "     ├─")} contract ${paint("bold", ev.contract)} ${paint("dim", "(block " + ev.deployBlock + ")")}`);
  L.push(`${paint("cyan", "     ├─")} anchor tx ${paint("bold", ev.anchorTx)} ${paint("dim", "(block " + ev.anchorBlock + ")")}`);
  L.push(`${paint("cyan", "     └─")} re-verified: exists=${ev.exists} anchored=${ev.anchored} events=${ev.events}`);
  console.log(L.join("\n"));
}

export function verdict(ok, ms, outPath) {
  console.log("");
  if (ok) {
    console.log(paint("green", paint("bold", `  ✔ EVIDENCE ANCHORED & VERIFIED  (${(ms / 1000).toFixed(0)}s)  → ${outPath}`)));
  } else {
    console.log(paint("red", paint("bold", "  ✘ PIPELINE STOPPED — no invented results")));
  }
  console.log("");
}

export function failLine(code, message) {
  console.log(`\n${paint("red", paint("bold", `  ✘ FAILED [${code ?? "error"}]`))} ${message}`);
}
