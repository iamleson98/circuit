/**
 * inspect-board.mjs — render a real board from one of the repo's projects and
 * report exactly what a SPICE netlister sees: every part with its ftype/value,
 * every net, and which parts need an off-board model (the "stub" list).
 *
 *   node tools/inspect-board.mjs ../../arc-lighter/dist/board/index.js
 *   node tools/inspect-board.mjs            # …all known boards
 */
import { renderBoard, BOARDS } from "./render.mjs"


const SPICEABLE = new Set([
  "simple_resistor", "simple_capacitor", "simple_inductor",
  "simple_diode", "simple_led", "simple_transistor",
  "simple_potentiometer", "simple_switch",
])

function brief(c) {
  if (c.resistance) return c.resistance
  if (c.capacitance) return c.capacitance
  if (c.inductance) return c.inductance
  if (c.ftype === "simple_potentiometer") return c.max_resistance
  return ""
}

const only = process.argv[2]
for (const b of BOARDS) {
  if (only && !b.file.includes(only) && only !== b.id) continue
  const path = new URL(`../../../${b.project}/${b.file}`, import.meta.url).pathname
  const json = await renderBoard(path)
  const comps = json.filter((e) => e.type === "source_component")
  const nets = json.filter((e) => e.type === "source_net").map((n) => n.name)
  console.log(`\n══ ${b.id}  (${path.split("/repo-circuit/")[1]})`)
  console.log(`  nets (${nets.length}): ${nets.join(" ")}`)
  const auto = [], stub = []
  for (const c of comps) {
    const line = `${c.name} ${brief(c) ? `[${brief(c)}]` : ""} (${c.ftype})`
    ;(SPICEABLE.has(c.ftype) ? auto : stub).push(line)
  }
  console.log(`  SPICE-mapped parts (${auto.length}):\n    ${auto.join("\n    ")}`)
  console.log(`  needs a model / stub (${stub.length}):\n    ${stub.join("\n    ")}`)
  if (process.env.PINS) {
    const ports = json.filter((e) => e.type === "source_port")
    for (const c of comps) {
      if (SPICEABLE.has(c.ftype)) continue
      const hints = ports.filter((p) => p.source_component_id === c.source_component_id).map((p) => `${p.name}[${(p.port_hints ?? []).join("/")}]`).join(" ")
      console.log(`    ${c.name} pins: ${hints}`)
    }
  }
}
