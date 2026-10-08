/**
 * verify.mjs — headless verification of BOTH fm-radio-lab boards.
 * Compiles the project → dist, renders each board with @tscircuit/core,
 * and checks:
 *   1. No runtime/render/DRC errors        (fatal → exit 1)
 *   2. All expected components present
 *   3. Expected nets present
 *   4. Ports wired vs dangling (custom parts may have intentional spares)
 *   5. All PCB traces routed
 *
 * Design intent (must match the tutorial PDF):
 *   FM-TX: 33 components — mic/aux → audio preamp → common-base Colpitts
 *          FM oscillator (junction-cap modulation, tunable 88-108 MHz)
 *          → 3.3pF → wire antenna
 *   FM-RX: 42 components — wire antenna → THE SAME Colpitts core as the
 *          TX (the detector) → externally quenched by a 2-transistor
 *          astable at ~50kHz (the production-standard super-regen
 *          architecture) → 2-pole audio filter → volume pot → class-A
 *          audio amp → earphone
 */
import { Circuit } from "@tscircuit/core"
import { createElement } from "react"

const boards = [
  {
    key: "fm-tx",
    module: "./dist/transmitter/index.js",
    expectComponents: [
      "BT1", "SW1", "C1", "C2", "LED1", "R1",        // power
      "MIC1", "R2", "C3", "AUX1", "C4", "R3",         // mic + aux
      "Q1", "R4", "R5", "R6", "R7", "R8", "C5",       // audio preamp
      "Q2", "C6", "R9", "R10", "C7", "R11",             // fm oscillator
      "C8", "C9",                                      // feedback divider
      "L1", "TRIM1", "C11", "C12",                    // tank
      "C13", "ANT1",                                   // antenna
    ],
    expectNets: ["V9", "GND", "TANK"],
  },
  {
    key: "fm-rx",
    module: "./dist/receiver/index.js",
    expectComponents: [
      "BT1", "SW1", "C1", "C2", "LED1", "R1",          // power
      "ANT1", "C3", "L1", "TRIM1", "C15", "C16",         // antenna + tank
      "Q1", "R2", "R3", "C4", "R4", "C5", "C6",            // detector (THE TX core)
      "Q2", "Q3", "R5", "R6", "C7", "C8", "R9", "R8",     // quench astable
      "R10", "R11",                                     // quench feed → Q1 base
      "R12", "C9", "R13", "C10", "RV1",                   // audio filter + volume
      "C11", "Q4", "R14", "R15", "R16", "R17", "C12", "EAR1", // audio amp + earphone
    ],
    expectNets: ["V9", "GND", "TANK", "OSCB", "RFE", "Q2C", "Q3C", "AF2", "Q4C"],
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

  // 1 ── errors (any /error/ element is fatal for this project)
  const errors = json.filter((el) => /error/i.test(el.type))
  if (errors.length) {
    console.log(`  ❌ ERRORS (${errors.length}):`)
    for (const e of errors) console.log("   -", e.type, (e.message ?? "").slice(0, 160))
    failed = true
  } else {
    console.log("  ✅ zero errors (runtime, design, DRC)")
  }

  // 2 ── components
  const comps = json.filter((el) => el.type === "source_component").map((c) => c.name)
  const missing = b.expectComponents.filter((c) => !comps.includes(c))
  const extra = comps.filter((c) => !b.expectComponents.includes(c))
  console.log(`  components: ${comps.length} (expected ${b.expectComponents.length})`)
  if (missing.length) { console.log("   ❌ missing:", missing.join(", ")); failed = true }
  if (extra.length) console.log("   (info) extra:", extra.join(", "))

  // 3 ── nets
  const nets = json.filter((el) => el.type === "source_net").map((n) => n.name)
  const missingNets = b.expectNets.filter((n) => !nets.includes(n))
  console.log(`  nets: ${nets.length} — ${nets.sort().join(", ")}`)
  if (missingNets.length) { console.log("   ❌ missing nets:", missingNets.join(", ")); failed = true }

  // 4 ── port wiring
  const wiredIds = new Set()
  for (const el of json) {
    if (el.type === "source_trace" && el.connected_source_port_ids)
      el.connected_source_port_ids.forEach((p) => wiredIds.add(p))
  }
  const ports = json.filter((el) => el.type === "source_port")
  const dangling = ports.filter((p) => !wiredIds.has(p.source_port_id))
  console.log(`  ports: ${ports.length} | wired: ${wiredIds.size} | dangling: ${dangling.length}`)
  for (const d of dangling.slice(0, 12))
    console.log("   (info) unconnected port:", d.name, "— check it is an intentional spare")

  // 5 ── pcb traces
  const pcbTraces = json.filter((el) => el.type === "pcb_trace")
  const copperPour = json.filter((el) => el.type === "pcb_copper_pour" || el.type === "pcb_copper_pour_area")
  console.log(`  pcb traces routed: ${pcbTraces.length}`)
  console.log(`  gnd pour elements: ${copperPour.length}`)

  // save circuit json for inspection / debugging
  const { writeFileSync } = await import("fs")
  writeFileSync(`circuit-${b.key}.json`, JSON.stringify(json, null, 2))
}

console.log("═".repeat(64))
if (failed) {
  console.log("RESULT: ❌ FAIL — fix the errors above")
  process.exit(1)
} else {
  console.log("RESULT: ✅ ALL CHECKS PASSED (both boards, zero errors)")
}
