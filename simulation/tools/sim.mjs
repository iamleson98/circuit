/**
 * sim.mjs — headless SPICE simulation runner for the circuits in ./circuits/.
 *
 * This does the same thing `tsci simulate analog <file>` does, but keeps the
 * data: every probe result (voltage/current graphs, operating points, sweeps)
 * is extracted from the circuit-json "soup" and written to
 * docs/plots/data/<name>.json for tools/plot.py to turn into PNG plots.
 *
 * Usage:   node tools/sim.mjs [circuit-name ...]
 *          node tools/sim.mjs                → runs every circuit in dist/circuits/
 *          node tools/sim.mjs 01-rc-lowpass  → runs just that one
 *
 * Requires: `npm run build` first (compiles circuits/*.tsx → dist/).
 * Network:  first run fetches the WebAssembly ngspice engine
 *           (@tscircuit/eecircuit-engine) from jscdn.tscircuit.com; it is
 *           cached by your browser/Node for subsequent runs.
 */
import { Circuit } from "@tscircuit/core"
import { createElement } from "react"
import { readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs"
import { join, basename, extname } from "node:path"
import { createEngine } from "./engine.mjs"
import * as recipesModule from "./recipes.mjs"

const ROOT = new URL("..", import.meta.url).pathname
const DIST_CIRCUITS = join(ROOT, "dist", "circuits")
const OUT_DIR = join(ROOT, "docs", "plots", "data")

/** Extract every simulation result element from the circuit-json soup. */
function extractSimResults(soup) {
  const results = []
  const experiments = {}

  for (const el of soup) {
    if (el.type === "simulation_experiment") {
      experiments[el.simulation_experiment_id] = el
    }
  }

  const graphTypes = [
    "simulation_transient_voltage_graph",
    "simulation_transient_current_graph",
    "simulation_dc_sweep_voltage_graph",
    "simulation_dc_sweep_current_graph",
    "simulation_ac_sweep_voltage_graph",
    "simulation_ac_sweep_current_graph",
    "simulation_dc_operating_point_voltage",
    "simulation_dc_operating_point_current",
    "simulation_oscilloscope_trace",
    "simulation_unknown_experiment_error",
  ]

  for (const el of soup) {
    if (!graphTypes.includes(el.type)) continue
    const experiment = el.simulation_experiment_id
      ? experiments[el.simulation_experiment_id]
      : undefined
    results.push({ ...el, experiment_name: experiment?.name })
  }
  return results
}

/** Normalize a result element into {x, y, label, kind} series for plotting. */
function toSeries(el) {
  const label = el.name || el.netName || el.currentName || el.graphType || "?"
  switch (el.type) {
    case "simulation_transient_voltage_graph": {
      const t = el.timestamps_ms ?? null
      const v = el.voltage_levels ?? []
      if (t && t.length === v.length) return { x: t, y: v, label, kind: "transient", unit: "V" }
      // reconstruct time axis from start/end/step if timestamps missing
      const n = v.length
      const t0 = Number(el.start_time_ms ?? 0)
      const t1 = Number(el.end_time_ms ?? t0 + n * Number(el.time_per_step ?? 1))
      const xs = Array.from({ length: n }, (_, i) => t0 + ((t1 - t0) * i) / Math.max(n - 1, 1))
      return { x: xs, y: v, label, kind: "transient", unit: "V" }
    }
    case "simulation_transient_current_graph": {
      const t = el.timestamps_ms ?? null
      const i = el.current_levels ?? el.currentLevels ?? []
      if (t && t.length === i.length) return { x: t, y: i, label, kind: "transient", unit: "A" }
      const n = i.length
      const t0 = Number(el.start_time_ms ?? 0)
      const t1 = Number(el.end_time_ms ?? t0 + n * Number(el.time_per_step ?? 1))
      const xs = Array.from({ length: n }, (_, k) => t0 + ((t1 - t0) * k) / Math.max(n - 1, 1))
      return { x: xs, y: i, label, kind: "transient", unit: "A" }
    }
    case "simulation_dc_sweep_voltage_graph":
      return {
        x: el.sweep_values ?? el.sweepValues ?? [],
        y: el.voltage_levels ?? el.voltages ?? [],
        label, kind: "dc_sweep", unit: "V",
      }
    case "simulation_dc_sweep_current_graph":
      return {
        x: el.sweep_values ?? el.sweepValues ?? [],
        y: el.current_levels ?? el.currents ?? [],
        label, kind: "dc_sweep", unit: "A",
      }
    case "simulation_ac_sweep_voltage_graph": {
      const freqs = el.frequencies_hz ?? el.frequenciesHz ?? []
      const mags = (el.complex_voltages ?? el.complexVoltages ?? []).map((c) =>
        Math.hypot(c.real ?? c.re ?? 0, c.imag ?? c.im ?? 0),
      )
      return { x: freqs, y: mags, label, kind: "ac_sweep", unit: "V" }
    }
    case "simulation_dc_operating_point_voltage":
      return { x: null, y: null, point: el.voltage, label, kind: "op_point", unit: "V", node: el.netName }
    case "simulation_dc_operating_point_current":
      return { x: null, y: null, point: el.current, label, kind: "op_point", unit: "A", node: el.currentName }
    default:
      return { x: el.timestamps_ms ?? null, y: el.voltage_levels ?? null, label, kind: el.type, unit: "?" }
  }
}

/** Apply "math channel" recipes (tools/recipes.mjs) to probed series. */
function applyRecipes(name, series) {
  const recipes = (recipesModule.default ?? {})[name] ?? []
  const byLabel = Object.fromEntries(series.map((s) => [s.label, s]))
  const derived = []
  for (const r of recipes) {
    const a = byLabel[r.fromA]
    const b = byLabel[r.fromB]
    if (!a) continue
    if (r.op === "div") {
      derived.push({
        x: a.x,
        y: a.y.map((v) => v / r.divisor),
        label: r.label,
        kind: a.kind,
        unit: r.unit,
      })
      continue
    }
    if (!b || a.x.length !== b.x.length) continue
    if (r.op === "diff_div") {
      derived.push({
        x: a.x,
        y: a.y.map((v, i) => (v - b.y[i]) / r.divisor),
        label: r.label,
        kind: "transient",
        unit: r.unit,
      })
    }
  }
  return [...series, ...derived]
}

async function main() {
  const requested = process.argv.slice(2)
  let files
  if (requested.length > 0) {
    files = requested.map((n) => join(DIST_CIRCUITS, `${n}.js`))
  } else {
    files = readdirSync(DIST_CIRCUITS)
      .filter((f) => f.endsWith(".js"))
      .sort()
      .map((f) => join(DIST_CIRCUITS, f))
  }

  if (!existsSync(DIST_CIRCUITS)) {
    console.error("dist/circuits not found — run `npm run build` first")
    process.exit(1)
  }

  mkdirSync(OUT_DIR, { recursive: true })
  console.log("loading WebAssembly ngspice engine (cached after first run)...")
  const engine = await createEngine()
  console.log("engine ready\n")

  let failures = 0
  for (const file of files) {
    const name = basename(file, extname(file))
    process.stdout.write(`▶ ${name}: `)
    try {
      const mod = await import(file)
      const Board = mod.default

      // Per-circuit netlist patch (see circuits/07 for why): if the module
      // exports netlistPatch = { find: replace, ... }, splice those strings
      // over the generated SPICE netlist before running the engine — the
      // classic way to inject a real vendor model card.
      const patch = mod.netlistPatch
      const circuitEngine = patch
        ? {
            simulate: async (spiceString) => {
              let netlist = spiceString
              for (const [find, replace] of Object.entries(patch)) {
                if (!netlist.includes(find)) {
                  throw new Error(
                    `netlistPatch: pattern not found: ${JSON.stringify(find)}`,
                  )
                }
                netlist = netlist.replace(find, replace)
              }
              return engine.simulate(netlist)
            },
          }
        : engine

      const circuit = new Circuit({
        platform: { spiceEngineMap: { ngspice: circuitEngine } },
      })
      circuit.add(createElement(Board))
      await circuit.renderUntilSettled()
      const soup = circuit.getCircuitJson()

      const results = extractSimResults(soup)
      if (results.length === 0) {
        console.log("NO SIMULATION RESULTS (does the board have <analogsimulation/>?)")
        failures++
        continue
      }

      const series = applyRecipes(name, results.map(toSeries).filter((s) => s.x !== undefined))
      const out = {
        circuit: name,
        generated_at: new Date().toISOString(),
        n_results: results.length,
        results: series,
      }
      const outPath = join(OUT_DIR, `${name}.json`)
      writeFileSync(outPath, JSON.stringify(out))
      const kinds = [...new Set(series.map((s) => s.kind))].join(", ")
      const npts = series[0]?.x?.length ?? 0
      console.log(`OK — ${results.length} result(s) [${kinds}], ${npts} pts → ${outPath.replace(ROOT, "")}`)
    } catch (err) {
      console.log(`FAILED: ${err.message?.slice(0, 300)}`)
      failures++
    }
  }
  process.exit(failures > 0 ? 1 : 0)
}

main()
