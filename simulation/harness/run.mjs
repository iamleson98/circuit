/**
 * run.mjs — the simulation harness for this repo's REAL boards.
 *
 *   node harness/run.mjs                  # every board, every scenario
 *   node harness/run.mjs unode-32u4       # one board
 *   node harness/run.mjs unode-32u4 crystal arc-lighter
 *
 * For each testbench in harness/testbenches/:
 *   1. render the project's actual board TSX (via its dist/ build) to circuit JSON
 *   2. let the testbench describe the off-board world (battery, coil, antenna…)
 *      and the scenario (stimulus, probes, checks)  → a SPICE deck
 *   3. simulate it with the harness's own MNA engine (tools/spice.mjs)
 *   4. write the deck (.cir — open it in ngspice/LTspice too), the data (JSON)
 *      and print every check ✓/✗
 *
 * Prerequisites: each project built once (cd <project> && npm install && npm run build).
 */
import { readdirSync, mkdirSync, writeFileSync } from "node:fs"
import { join, basename } from "node:path"
import { fileURLToPath } from "node:url"
import { boardToSpice } from "./tools/board_to_spice.mjs"
import { renderBoard } from "./tools/render.mjs"
import { Circuit, MODELS, val, freq, amp, mean, rms, tone } from "./tools/spice.mjs"

const HERE = fileURLToPath(new URL(".", import.meta.url))
const ROOT = new URL("../..", import.meta.url).pathname // repo root
const OUT = { decks: join(HERE, "out", "decks"), data: join(HERE, "out", "data") }
for (const d of Object.values(OUT)) mkdirSync(d, { recursive: true })

/** thin a series for the committed JSON: ≤6000 points, tail preserved */
function decimate(series) {
  return series.map((s) => {
    if (!s.y || s.y.length <= 6000) return s
    const stride = Math.ceil(s.y.length / 6000)
    const keep = (arr) => {
      const out = []
      for (let i = 0; i < arr.length; i += stride) out.push(arr[i])
      if ((arr.length - 1) % stride !== 0) out.push(arr[arr.length - 1]) // always keep the true tail
      return out
    }
    return { ...s, x: s.x ? keep(s.x) : s.x, y: keep(s.y), note: `decimated ${s.y.length} → ${Math.ceil(s.y.length / stride)} points (full data: rerun)` }
  })
}

/* ── discover testbenches ── */
const requested = process.argv.slice(2)
const tbFiles = readdirSync(join(HERE, "testbenches"))
  .filter((f) => f.endsWith(".mjs"))
  .sort()

let nPass = 0, nFail = 0, nErr = 0
const boardRows = []

for (const f of tbFiles) {
  const tb = (await import(join(HERE, "testbenches", f))).default
  if (requested.length > 0 && !requested.includes(tb.id)) continue

  const boardPath = join(ROOT, tb.project, tb.boardFile)
  process.stdout.write(`\n━━ ${tb.title}  [${tb.id}]\n`)
  let json, extraJson = {}
  try {
    json = await renderBoard(boardPath)
    for (const ex of tb.extraBoards ?? []) {
      extraJson[ex.as] = await renderBoard(join(ROOT, ex.project, ex.file))
    }
  } catch (e) {
    console.log(`  ✗ cannot render ${boardPath}: ${e.message}`)
    console.log(`    (did you build it?  cd ${tb.project} && npm install && npm run build)`)
    nErr++
    boardRows.push({ id: tb.id, ok: false, detail: "board render failed" })
    continue
  }

  const ctx = { json, extraJson, boardToSpice, MODELS, Circuit, val, freq, amp, mean, rms, tone, boardPath, tb }
  for (const scenarioFn of tb.scenarios) {
    let sc
    try {
      sc = scenarioFn(ctx)
    } catch (e) {
      console.log(`  ✗ [build] ${e.message}`)
      nErr++
      continue
    }
    const t0 = Date.now()
    let result
    try {
      result = sc.run()
    } catch (e) {
      console.log(`  ✗ [${sc.name}] simulation error: ${e.message}`)
      nErr++
      continue
    }
    const dt = ((Date.now() - t0) / 1000).toFixed(1)

    // artifacts: the deck (runnable in any SPICE) + the data (for plot.py)
    writeFileSync(join(OUT.decks, `${tb.id}.${sc.name}.cir`), sc.deck + (sc.cirTrailer ? `\n${sc.cirTrailer}\n.end\n` : "\n"))
    writeFileSync(join(OUT.data, `${tb.id}.${sc.name}.json`), JSON.stringify({
      board: tb.id, title: tb.title, scenario: sc.name, scenario_title: sc.what,
      summary: result.summary ?? "", checks: result.checks ?? [],
      results: decimate(result.series ?? []),
    }))

    const ok = (result.checks ?? []).every((c) => c.ok)
    let p = 0, x = 0
    for (const c of result.checks ?? []) { c.ok ? p++ : x++; console.log(`    ${c.ok ? "✓" : "✗"} ${c.label}${c.detail ? "  — " + c.detail : ""}`) }
    nPass += p; nFail += x
    console.log(`    ${ok ? "PASS" : "FAIL"}  ${sc.what}  (${dt}s${result.summary ? " · " + result.summary : ""})`)
    boardRows.push({ id: tb.id, scenario: sc.name, ok, detail: result.summary ?? "" })
  }
}

/* ── summary ── */
console.log(`\n${"═".repeat(64)}\nHARNESS SUMMARY`)
const byBoard = {}
for (const r of boardRows) (byBoard[r.id] ??= []).push(r)
for (const [id, rows] of Object.entries(byBoard)) {
  const ok = rows.every((r) => r.ok)
  console.log(`  ${ok ? "✓" : "✗"} ${id.padEnd(22)} ${rows.filter((r) => r.ok).length}/${rows.length} scenarios`)
  for (const r of rows) if (!r.ok) console.log(`      · ${r.scenario ?? "?"}: ${r.detail}`)
}
console.log(`  ${nPass + nFail + nErr} scenarios · ${nPass} checks passed · ${nFail} failed · ${nErr} errors`)
console.log(`  decks → simulation/harness/out/decks/   data → simulation/harness/out/data/`)
process.exit(nFail + nErr > 0 ? 1 : 0)
