/**
 * verify.mjs — headless verification of BOTH radio-lab boards.
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
    key: "am-tx",
    module: "./dist/transmitter/index.js",
    expectComponents: [
      "BT1", "SW1", "C1", "C2", "LED1", "R1",          // power
      "MIC1", "R2", "C3",                               // mic
      "Q1", "R3", "R4", "R5", "R6", "C4",               // preamp
      "Q2", "R7", "R8", "C5", "C19",                    // modulator + VMD RF bypass
      "Q3", "R10", "R11", "R12", "C6",                  // oscillator
      "C14", "C15", "L1", "CV1",                        // oscillator tank
      "Q4", "R14", "R15", "R16", "C17",                 // modulated final
      "L2", "C18", "CV2",                               // output (PEAK) tank
      "C16", "ANT1",                                    // antenna
    ],
    expectNets: ["V9", "GND", "VMD", "TANK", "RF_OUT"],
    topology: (t) => {
      t("oscillator coil L1 returns to the steady V9 rail (not VMD)", t.on("L1.pin2", "V9"))
      t("oscillator bias R10 is fed from V9 (not VMD)", t.on("R10.pin1", "V9"))
      t("only the final hangs on VMD: L2 feeds Q4's collector tank from VMD", t.on("L2.pin2", "VMD") && t.on("L2.pin1", "RF_OUT") && t.on("Q4.pin1", "RF_OUT"))
      t("output tank = L2 ∥ (C18 + CV2) to GND", t.on("C18.pin1", "RF_OUT") && t.on("C18.pin2", "GND") && t.on("CV2.STATOR_A", "RF_OUT") && t.on("CV2.ROTOR", "GND"))
      t("VMD is RF-grounded by C19", t.on("C19.pin1", "VMD") && t.on("C19.pin2", "GND"))
      t("antenna is fed from the output tank through C16", t.on("C16.pin1", "RF_OUT") && t.conn("C16.pin2", "ANT1.ANT"))
      t("Q4 is driven from the oscillator tank through C17", t.on("C17.pin1", "TANK") && t.conn("C17.pin2", "Q4.pin2"))
    },
  },
  {
    key: "am-rx",
    module: "./dist/receiver/index.js",
    expectComponents: [
      "BT1", "SW1", "C1", "C2", "LED1", "R1",           // power
      "ANT1", "C3", "L1", "CV1", "C4",                  // antenna + tank
      "Q1", "R2", "R3", "R4", "C5",                     // buffer
      "Q2", "R5", "R6", "R7", "R8", "C6", "C7",         // rf amp
      "D1", "D2", "C8", "RV1",                          // voltage-doubler detector
      "Q3", "R9", "R10", "LED2",                        // signal LED
      "C9", "U1", "SW2", "C11", "C10", "C12", "C13", "R11", "C14", "SPK1", // audio
    ],
    expectNets: ["V9", "GND", "TANK", "DET", "DET_IN"],
    topology: (t) => {
      t("C7 couples Q2's collector into the detector input", t.on("C7.pin2", "DET_IN"))
      t("D2 (anode → GND, cathode → DET_IN) gives C7 its DC return: voltage doubler", t.on("D2.pin1", "GND") && t.on("D2.pin2", "DET_IN"))
      t("D1 (anode → DET_IN, cathode → DET) charges C8", t.on("D1.pin1", "DET_IN") && t.on("D1.pin2", "DET") && t.on("C8.pin1", "DET"))
      t("RV1 is the detector load and volume control", t.on("RV1.pin1", "DET") && t.on("RV1.pin3", "GND"))
      t("signal LED driver watches DET through R9", t.on("R9.pin1", "DET") && t.conn("R9.pin2", "Q3.pin2"))
    },
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

  // 3 ── topology on the board's own netlist
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
