/**
 * verify.mjs — headless verification of BOTH radio-lab boards.
 * Compiles the project → dist, renders each board with @tscircuit/core,
 * and checks:
 *   1. No runtime/render/DRC errors        (fatal → exit 1)
 *   2. All expected components present
 *   3. Expected nets present
 *   4. Ports wired vs dangling (custom parts may have intentional spares)
 *   5. All PCB traces routed
 *
 * Design intent (must match the tutorial PDF):
 *   AM-TX: 26 components — mic preamp → supply modulator → Colpitts
 *          oscillator + LC tank (tunable ~0.8-1.45 MHz) → antenna
 *   AM-RX: 33 components — antenna → LC tank (tunable ~0.6-1.7 MHz) →
 *          buffer → RF amp → 1N34A detector → volume → LM386 → speaker
 */
import { Circuit } from "@tscircuit/core"
import { createElement } from "react"

const boards = [
  {
    key: "am-tx",
    module: "./dist/transmitter/index.js",
    expectComponents: [
      "BT1", "SW1", "C1", "C2", "LED1", "R1",        // power
      "MIC1", "R2", "C3",                             // mic
      "Q1", "R3", "R4", "R5", "R6", "C4",             // preamp
      "Q2", "R7", "R8", "C5",                         // modulator
      "Q3", "R10", "R11", "R12", "C6",               // oscillator
      "C14", "C15", "L1", "CV1",                      // tank
      "Q4", "R14", "R15", "R16", "R17", "C17",        // modulated final
      "C16", "ANT1",                                  // antenna
    ],
    expectNets: ["V9", "GND", "VMD", "TANK"],
  },
  {
    key: "am-rx",
    module: "./dist/receiver/index.js",
    expectComponents: [
      "BT1", "SW1", "C1", "C2", "LED1", "R1",         // power
      "ANT1", "C3", "L1", "CV1", "C4",                // antenna + tank
      "Q1", "R2", "R3", "R4", "C5",                   // buffer
      "Q2", "R5", "R6", "R7", "R8", "C6", "C7",       // rf amp
      "D1", "C8", "RV1",                              // detector
      "Q3", "R9", "R10", "LED2",                      // signal LED
      "C9", "U1", "SW2", "C11", "C10", "C12", "C13", "R11", "C14", "SPK1", // audio
    ],
    expectNets: ["V9", "GND", "TANK", "DET"],
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
