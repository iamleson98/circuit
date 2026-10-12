/**
 * verify.mjs — headless verification of BOTH fm-radio-lab boards.
 * Renders each board with @tscircuit/core (run `npm run build` first) and checks:
 *   1. zero runtime / design / DRC errors (any error element fails)
 *   2. exactly the expected components, and the expected named nets
 *   3. the circuit topology the design depends on (asserted on the netlist —
 *      these are the facts that were wrong before the October 2026 review)
 *   4. manufacturability: vias ≥ 0.30/0.60 mm, traces ≥ 0.15 mm,
 *      plated-hole annular rings ≥ 0.18 mm
 *   5. port wiring summary
 */
import { Circuit } from "@tscircuit/core"
import { createElement } from "react"
import { writeFileSync } from "fs"

const boards = [
  {
    key: "fm-tx",
    module: "./dist/transmitter/index.js",
    expectComponents: [
      "BT1", "SW1", "C1", "C2", "LED1", "R1",          // power
      "MIC1", "R2", "C3", "AUX1", "C4", "R3",           // mic + aux
      "Q1", "R4", "R5", "R6", "R7", "R8", "C5",         // audio preamp
      "Q2", "R9", "R10", "C7", "R11", "C8", "C9",       // Colpitts oscillator
      "C6", "RV1", "R14", "C16",                        // DEV control → varactor
      "R12", "R13", "C14", "D1",                        // varactor + bias
      "L1", "TRIM1", "C11", "C12", "R15", "C17",        // tank (R15 damping, C17 padder)
      "C13", "C15", "ANT1",                             // 1:100 antenna divider
    ],
    expectNets: ["V9", "GND", "OSCB", "TANK", "VAR", "ANTX"],
    topology: (t) => {
      t("FM comes from a varactor: D1 anode on VAR, cathode on TANK (reverse-biased)", t.on("D1.pin1", "VAR") && t.on("D1.pin2", "TANK"))
      t("varactor bias divider R12 (V9→VAR) / R13 (VAR→GND), RF-grounded by C14",
        t.on("R12.pin1", "V9") && t.on("R12.pin2", "VAR") && t.on("R13.pin1", "VAR") && t.on("R13.pin2", "GND") && t.on("C14.pin1", "VAR") && t.on("C14.pin2", "GND"))
      t("audio reaches VAR only through DEV (RV1) → R14 → C16 DC block (the pot can't shift the bias)",
        t.conn("C6.pin2", "RV1.pin1") && t.on("RV1.pin3", "GND") && t.conn("RV1.pin2", "R14.pin1") && t.conn("R14.pin2", "C16.pin1") && t.on("C16.pin2", "VAR"))
      t("no audio on the oscillator base (no transistor-junction FM)", !t.conn("C6.pin2", "Q2.pin2") && !t.conn("C3.pin2", "Q2.pin2") && t.on("Q2.pin2", "OSCB"))
      t("R15 damps the tank (TANK↔V9) so the swing — and the coil's radiation — stays small", t.on("R15.pin1", "TANK") && t.on("R15.pin2", "V9"))
      t("C17 padder and TRIM1 sit directly across the tank", t.on("C17.pin1", "TANK") && t.on("C17.pin2", "GND") && t.on("TRIM1.A", "TANK") && t.on("TRIM1.B", "GND"))
      t("antenna fed through the C13 (1 pF) : C15 (100 pF) divider, not straight from the tank",
        t.on("C13.pin1", "TANK") && t.on("C13.pin2", "ANTX") && t.on("C15.pin1", "ANTX") && t.on("C15.pin2", "GND") && t.on("ANT1.ANT", "ANTX") && !t.on("ANT1.ANT", "TANK"))
    },
    // the values the compliance fixes depend on (band edge, tank damping, antenna divider)
    values: { C17: 12e-12, R15: 330, C13: 1e-12, C15: 100e-12, C16: 100e-9, R11: 680 },
  },
  {
    key: "fm-rx",
    module: "./dist/receiver/index.js",
    expectComponents: [
      "BT1", "SW1", "C1", "C2", "LED1", "R1",           // power
      "ANT1", "C3",                                     // antenna
      "Q5", "R18", "R19", "R20", "R21", "C21", "C22",   // common-base RF buffer
      "L1", "TRIM1", "C17", "C15", "C16", "R22",        // tank (C17 padder, R22 damping)
      "Q1", "R2", "R3", "C4", "R4", "C5", "C6",         // super-regen detector
      "Q2", "Q3", "R5", "R6", "C7", "C8", "R9", "R8",   // quench astable
      "R10", "R11",                                     // quench feed → Q1 base
      "R12", "C9", "R13", "C10", "RV1",                 // audio filter + volume
      "C11", "Q4", "R14", "R15", "R16", "R23", "C23", "R17", // audio amp
      "Q6", "R24", "C12", "EAR1",                       // emitter follower + earphone
    ],
    expectNets: ["V9", "GND", "TANK", "OSCB", "RFE", "Q2C", "Q3C", "AF2", "Q4C", "Q5E", "Q5B", "Q5C", "AOUT", "EAR"],
    topology: (t) => {
      t("the antenna drives the buffer's emitter (C3 → Q5E), never the tank directly",
        t.conn("ANT1.ANT", "C3.pin1") && t.on("C3.pin2", "Q5E") && t.on("Q5.pin3", "Q5E") && !t.on("ANT1.ANT", "TANK"))
      t("Q5 is common-base: base RF-grounded by C21, biased by R19/R20, emitter load R18",
        t.on("Q5.pin2", "Q5B") && t.on("C21.pin1", "Q5B") && t.on("C21.pin2", "GND") && t.on("R19.pin1", "V9") && t.on("R19.pin2", "Q5B") && t.on("R20.pin2", "GND") && t.on("R18.pin1", "Q5E") && t.on("R18.pin2", "GND"))
      t("buffer output reaches the tank only through C22 (1 pF): bursts can't get back out", t.on("Q5.pin1", "Q5C") && t.on("R21.pin2", "Q5C") && t.on("C22.pin1", "Q5C") && t.on("C22.pin2", "TANK"))
      t("R22 damps the tank (TANK↔V9): limits burst amplitude", t.on("R22.pin1", "TANK") && t.on("R22.pin2", "V9"))
      t("C17 padder and TRIM1 sit directly across the tank (keeps the detector out of the aviation band)", t.on("C17.pin1", "TANK") && t.on("C17.pin2", "GND") && t.on("TRIM1.A", "TANK") && t.on("TRIM1.B", "GND"))
      t("detector Q1: collector on TANK, base on OSCB, emitter on RFE", t.on("Q1.pin1", "TANK") && t.on("Q1.pin2", "OSCB") && t.on("Q1.pin3", "RFE"))
      t("Q4 emitter: R16 to Q4E2, then R23 ∥ C23 to GND", t.on("R23.pin1", "Q4E2") && t.on("R23.pin2", "GND") && t.on("C23.pin1", "Q4E2") && t.on("C23.pin2", "GND"))
      t("Q6 emitter follower (base Q4C, collector V9, emitter AOUT, R24 load) drives the earphone via C12",
        t.on("Q6.pin2", "Q4C") && t.on("Q6.pin1", "V9") && t.on("Q6.pin3", "AOUT") && t.on("R24.pin1", "AOUT") && t.on("R24.pin2", "GND") && t.on("C12.pin1", "AOUT") && t.on("C12.pin2", "EAR") && t.on("EAR1.TIP", "EAR") && t.on("EAR1.SLE", "GND"))
    },
    values: { C17: 12e-12, R22: 1000, C22: 1e-12, C3: 1e-9, R24: 1500 },
  },
]

let failed = false
for (const b of boards) {
  console.log("═".repeat(64))
  console.log(`BOARD: ${b.key}`)
  console.log("═".repeat(64))
  const Board = (await import(b.module)).default
  const circuit = new Circuit()
  circuit.add(createElement(Board))
  await circuit.renderUntilSettled()
  const json = circuit.getCircuitJson()
  const all = (type) => json.filter((e) => e.type === type)
  const ok = (cond, label) => { console.log(`  ${cond ? "✓" : "✗ FAIL"} ${label}`); if (!cond) failed = true }

  // 1 ── errors
  const errors = json.filter((el) => /error/i.test(el.type))
  for (const e of errors.slice(0, 12)) console.log("   -", e.type, (e.message ?? "").slice(0, 160))
  ok(errors.length === 0, `zero errors (runtime, design, DRC) — found ${errors.length}`)

  // 2 ── components & nets
  const comps = all("source_component").map((c) => c.name)
  const missing = b.expectComponents.filter((c) => !comps.includes(c))
  const extra = comps.filter((c) => !b.expectComponents.includes(c))
  ok(!missing.length && !extra.length, `${comps.length} components, exactly as expected${missing.length ? " — missing " + missing : ""}${extra.length ? " — unexpected " + extra : ""}`)
  const nets = all("source_net").map((n) => n.name)
  const missingNets = b.expectNets.filter((n) => !nets.includes(n))
  ok(!missingNets.length, `named nets present: ${b.expectNets.join(", ")}${missingNets.length ? " — missing " + missingNets : ""}`)

  // 3 ── topology on the board's own netlist (pin1/2/3 = C/B/E on the TO-92s, pin1 = anode on diodes)
  const compName = Object.fromEntries(all("source_component").map((c) => [c.source_component_id, c.name]))
  const port = Object.fromEntries(all("source_port").map((p) => [p.source_port_id, `${compName[p.source_component_id]}.${p.name}`]))
  const netName = Object.fromEntries(all("source_net").map((n) => [n.source_net_id, n.name]))
  const parent = {}
  const find = (a) => { parent[a] ??= a; while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a }
  for (const tr of all("source_trace")) {
    const ids = [...(tr.connected_source_port_ids ?? []).map((p) => port[p]), ...(tr.connected_source_net_ids ?? []).map((n) => `net:${netName[n]}`)]
    ids.forEach(find)
    for (let i = 1; i < ids.length; i++) parent[find(ids[0])] = find(ids[i])
  }
  const t = (label, cond) => ok(cond, label)
  t.on = (p, net) => find(p) === find(`net:${net}`)
  t.conn = (a, c) => find(a) === find(c)
  b.topology(t)
  const src = Object.fromEntries(all("source_component").map((c) => [c.name, c.capacitance ?? c.resistance ?? c.inductance]))
  const bad = Object.entries(b.values).filter(([n, v]) => !(Math.abs(src[n] / v - 1) < 1e-6))
  ok(!bad.length, `critical values: ${Object.keys(b.values).join(", ")}${bad.length ? " — wrong: " + bad.map(([n, v]) => `${n}=${src[n]} (want ${v})`).join(", ") : ""}`)

  // 4 ── manufacturability
  const vias = all("pcb_via")
  ok(vias.every((v) => v.hole_diameter >= 0.3 - 1e-9 && v.outer_diameter >= 0.6 - 1e-9), `${vias.length} vias, all ≥ 0.30 mm drill / 0.60 mm pad`)
  const widths = all("pcb_trace").flatMap((tr) => tr.route.filter((r) => r.route_type === "wire").map((r) => r.width))
  ok(Math.min(...widths) >= 0.15 - 1e-9, `traces ≥ 0.15 mm (min ${Math.min(...widths).toFixed(2)} mm)`)
  const ring = (h) => h.shape === "circle" ? (h.outer_diameter - h.hole_diameter) / 2
    : h.shape === "pill" || h.shape === "oval" ? Math.min(h.outer_width - h.hole_width, h.outer_height - h.hole_height) / 2
    : h.shape === "circular_hole_with_rect_pad" ? (Math.min(h.rect_pad_width, h.rect_pad_height) - h.hole_diameter) / 2 : 0
  const minRing = Math.min(...all("pcb_plated_hole").map(ring))
  ok(minRing >= 0.18 - 1e-9, `plated-hole annular rings ≥ 0.18 mm (min ${minRing.toFixed(3)} mm)`)

  // 5 ── wiring summary
  const wired = new Set(all("source_trace").flatMap((tr) => tr.connected_source_port_ids ?? []))
  const dangling = all("source_port").filter((p) => !wired.has(p.source_port_id))
  console.log(`  ports: ${all("source_port").length} | wired: ${wired.size} | unconnected: ${dangling.map((d) => port[d.source_port_id]).join(", ") || "none"}`)
  console.log(`  pcb traces routed: ${all("pcb_trace").length}`)
  writeFileSync(`circuit-${b.key}.json`, JSON.stringify(json, null, 2))
}

console.log("═".repeat(64))
if (failed) { console.log("RESULT: ❌ FAIL — fix the errors above"); process.exit(1) }
console.log("RESULT: ✅ ALL CHECKS PASSED (both boards)")
