// Terminal showmanship for the TRACE pipeline, built on open-source
// terminal libraries: figlet (banner fonts, MIT), chalk (colors, MIT),
// ora (honest activity spinners, MIT). Rules: spinners show live REAL state
// (current page, real counts) and never fake percentages; every number that
// persists on screen is measured. Recording-safe: chalk/ora degrade cleanly
// when piped or with NO_COLOR.
import chalk from "chalk";
import ora from "ora";
import figlet from "figlet";

export function banner(mode, chainName) {
  console.log("");
  try {
    console.log(chalk.cyan(figlet.textSync("TRACE", { font: "Standard" })));
  } catch {
    console.log(chalk.cyan.bold("TRACE"));
  }
  console.log(
    chalk.dim("  Don't trust the image. Trace it.   ") +
      chalk.yellow(`[${mode.toUpperCase()} MODE]`) +
      "  " +
      chalk.magenta(`⛓ ${chainName}`),
  );
  console.log("");
}

/** Indeterminate activity spinner with live text. Caller ends it. */
export function spin(text) {
  return ora({ text, color: "cyan", spinner: "dots" }).start();
}

export function phase(n, total, title) {
  const rule = "━".repeat(Math.max(0, 46 - title.length));
  console.log(`\n${chalk.bold(chalk.cyan(`━━━ [${n}/${total}] ${title} `))}${chalk.dim(rule)}`);
}

export function simBar(sim) {
  const w = 18;
  const fill = Math.round(sim * w);
  const bar = "█".repeat(fill) + "░".repeat(w - fill);
  const color = sim >= 0.72 ? "green" : sim >= 0.55 ? "yellow" : "gray";
  return chalk[color](bar) + ` ${chalk.bold(sim.toFixed(3))}`;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Confirmed matches (every one, not just #1) plus labeled runners-up:
 * real below-threshold measurements, explicitly NOT claimed as matches.
 */
export function matchTable(confirmed, runnersUp = []) {
  console.log(chalk.bold("\n  ★ CONFIRMED MATCHES (≥ 0.72, measured)"));
  confirmed.slice(0, 5).forEach((m, i) => {
    const via = m.via === "face-verified" ? chalk.green(" ✓face") + chalk.dim(` ${m.faceCos ?? ""}`) : chalk.dim(" ◉visual");
    console.log(`  ${chalk.yellow(`#${i + 1}`)} ${simBar(m.similarity)}  ${chalk.bold(hostOf(m.postUrl))}${via}`);
    console.log(`     ${chalk.dim((m.postTitle ?? "").slice(0, 72))}`);
    console.log(`     ${chalk.dim(m.postUrl.slice(0, 88))}`);
    console.log(`     ${chalk.dim("image: " + (m.imageUrl ?? "").slice(0, 88))}`);
  });
  if (runnersUp.length > 0) {
    console.log(chalk.bold("\n  ◌ RUNNERS-UP (below threshold — observed, NOT claimed)"));
    runnersUp.slice(0, 5).forEach((r) => {
      const face = r.faceCos != null ? chalk.dim(` face ${Number(r.faceCos).toFixed(2)}`) : "";
      console.log(`     ${simBar(r.similarity)}  ${chalk.dim(hostOf(r.pageUrl ?? r.postUrl ?? ""))}${face}`);
    });
  }
}

/** Rich-style provenance tree finale — all values measured upstream. */
export function provenanceTree(ev) {
  const L = [];
  const B = (s) => L.push(chalk.cyan("  │ ") + s);
  L.push("");
  L.push(chalk.bold(chalk.cyan("  ◈ PROVENANCE TRACE")));
  L.push(chalk.cyan("  │"));
  L.push(`${chalk.cyan("  ├─")} ◉ face scan — ${ev.faces} face(s), best score ${ev.faceScore} ${chalk.dim("[BlazeFace, " + ev.faceMs + "ms]")}`);
  B(`${chalk.cyan("└─")} embedding ${ev.embDim}-dim → memory only, never stored`);
  L.push(`${chalk.cyan("  ├─")} ◉ web discovery — ${ev.candidates} pages ${chalk.dim("[Exa, " + ev.searchMs + "ms]")}`);
  const lines = ev.checkedLines.length > 10
    ? [...ev.checkedLines.slice(0, 10), `… ${ev.checkedLines.length - 10} more pages checked`]
    : ev.checkedLines;
  lines.forEach((c) => B(`${chalk.cyan("├─")} ${c}`));
  B(`${chalk.green("└─ ★ MATCH")} ${chalk.bold(ev.topHost)} ${simBar(ev.topSim)}`);
  L.push(`${chalk.cyan("  ├─")} ◉ seal — ${chalk.dim(ev.root)}`);
  L.push(`${chalk.cyan("  └─")} ${chalk.magenta("⛓ chain")} — ${ev.chainKind} ${chalk.dim("(chain " + ev.chainId + ")")}`);
  L.push(`${chalk.cyan("     ├─")} contract ${chalk.bold(ev.contract)} ${chalk.dim("(block " + ev.deployBlock + ")")}`);
  L.push(`${chalk.cyan("     ├─")} anchor tx ${chalk.bold(ev.anchorTx)} ${chalk.dim("(block " + ev.anchorBlock + ")")}`);
  L.push(`${chalk.cyan("     └─")} re-verified: exists=${ev.exists} anchored=${ev.anchored} events=${ev.events}`);
  console.log(L.join("\n"));
}

export function verdict(ok, ms, outPath) {
  console.log("");
  if (ok) {
    console.log(chalk.green.bold(`  ✔ EVIDENCE ANCHORED & VERIFIED  (${(ms / 1000).toFixed(0)}s)  → ${outPath}`));
  } else {
    console.log(chalk.red.bold("  ✘ PIPELINE STOPPED — no invented results"));
  }
  console.log("");
}

export function failLine(code, message) {
  console.log(`\n${chalk.red.bold(`  ✘ FAILED [${code ?? "error"}]`)} ${message}`);
}
