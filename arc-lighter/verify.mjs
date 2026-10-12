/**
 * verify.mjs — headless verification of the arc lighter board.
 * Renders board/index.tsx with @tscircuit/core (run `npm run build` first) and checks:
 *   1. zero runtime / design / DRC errors (any error element fails)
 *   2. exactly the expected components and named nets
 *   3. the circuit topology the safety story depends on (on the netlist)
 *   4. the values the simulations assumed
 *   5. the hand-routed 2-3 A current loop is ≥ 0.8 mm copper end to end
 *   6. manufacturability: vias, trace widths, annular rings, courtyards
 */
import { Circuit } from "@tscircuit/core"
import { createElement } from "react"
import { writeFileSync } from "fs"

const Board = (await import("./dist/board/index.js")).default
const circuit = new Circuit()
circuit.add(createElement(Board))
await circuit.renderUntilSettled()
const json = circuit.getCircuitJson()
const all = (type) => json.filter((e) => e.type === type)
let failed = false
const ok = (cond, label) => { console.log(`  ${cond ? "✓" : "✗ FAIL"} ${label}`); if (!cond) failed = true }

console.log("═".repeat(64))
console.log("BOARD: arc-lighter")
console.log("═".repeat(64))

// 1 ── errors
const errors = json.filter((el) => /error/i.test(el.type))
for (const e of errors.slice(0, 12)) console.log("   -", e.type, (e.message ?? "").slice(0, 160))
ok(errors.length === 0, `zero errors (runtime, design, DRC) — found ${errors.length}`)

// 2 ── components & nets
const expect = [
  "J1", "U1", "C1", "C2", "R1", "R2", "LED1", "R3", "LED2",            // USB charging
  "TP_BATP", "TP_BATN", "TP_LOCKA", "TP_LOCKB",                         // battery + lock
  "U2", "R4", "C4", "C3", "R5", "R7", "R8", "C5", "R9", "LED3", "J2",   // ATtiny85
  "TP_FIRE", "TP_FIREG",                                                // button
  "Q1", "R6",                                                           // arc power switch
  "C6", "C7", "C8", "Q2", "R10", "RE1", "RE2", "Q3", "R11", "D1", "D2", "R12", "R13", // driver
  "TP_PP", "TP_PM", "TP_FA", "TP_FB", "TP_MODP", "TP_MODN",             // coil / module pads
]
const comps = all("source_component").map((c) => c.name)
const missing = expect.filter((c) => !comps.includes(c)), extra = comps.filter((c) => !expect.includes(c))
ok(!missing.length && !extra.length, `${comps.length} components, exactly as expected${missing.length ? " — missing " + missing : ""}${extra.length ? " — unexpected " + extra : ""}`)
const nets = all("source_net").map((n) => n.name)
const wantNets = ["GND", "VBUS", "BAT", "VARM", "VMCU", "VDRV", "GATE", "COL", "BASE", "EMIT", "FBA", "OSC", "VBS", "FIRE", "STAT", "LEDS", "RST"]
const missingNets = wantNets.filter((n) => !nets.includes(n))
ok(!missingNets.length, `named nets present (${wantNets.length})${missingNets.length ? " — missing " + missingNets : ""}`)

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
const on = (p, net) => find(p) === find(`net:${net}`)
const t = (label, cond) => ok(cond, label)
// port names: diodes/LEDs pin1 = anode, pin2 = cathode; NPN pin1 = collector,
// pin2 = base, pin3 = emitter; MOSFET pin1 = drain, pin2 = source, pin3 = gate
t("charger: MCP73831 VDD on VBUS, VBAT on the cell, R1 programs the current", on("U1.VDD", "VBUS") && on("U1.VBAT", "BAT") && on("U1.VSS", "GND") && find("U1.PROG") === find("R1.pin1") && on("R1.pin2", "GND"))
t("charge LEDs: red VBUS→STAT (charging), green STAT→GND (done)", on("R2.pin1", "VBUS") && on("LED1.pin2", "STAT") && on("R3.pin1", "STAT") && on("LED2.pin2", "GND"))
t("the cell charges upstream of LOCK; LOCK feeds VARM", on("TP_BATP.BATP", "BAT") && on("TP_LOCKA.LOCKA", "BAT") && on("TP_LOCKB.LOCKB", "VARM") && !on("U1.VBAT", "VARM"))
t("nothing but the charger touches BAT: the MCU and the driver are both behind LOCK", on("R4.pin1", "VARM") && on("Q1.pin2", "VARM"))
t("Q1 is a high-side switch VARM→VDRV, gated by PB4, pulled OFF by R6", on("Q1.pin1", "VDRV") && on("Q1.pin3", "GATE") && on("U2.PB4", "GATE") && on("R6.pin1", "VARM") && on("R6.pin2", "GATE"))
t("MCU supply is RC-filtered from VARM (R4 → VMCU, C3/C4)", on("U2.VCC", "VMCU") && on("R4.pin2", "VMCU") && on("C4.pin1", "VMCU") && on("C3.pin1", "VMCU"))
t("FIRE button on PB3; USB sense on PB0 via R7/R8; status LED on PB1", on("U2.PB3", "FIRE") && on("TP_FIRE.FIRE", "FIRE") && on("U2.PB0", "VBS") && on("R7.pin1", "VBUS") && on("R8.pin2", "GND") && on("U2.PB1", "LEDS"))
t("coil primary P+ on VDRV, P− on Q2's collector; feedback FA ← R10 ← VDRV, FB → base", on("TP_PP.PP", "VDRV") && on("TP_PM.PM", "COL") && on("Q2.pin1", "COL") && on("R10.pin1", "VDRV") && on("TP_FA.FA", "FBA") && on("R10.pin2", "FBA") && on("TP_FB.FB", "BASE") && on("Q2.pin2", "BASE"))
t("current limit: RE1 ∥ RE2 from the emitter to GND; Q3 (base via R11 from EMIT) steals Q2's base drive", on("Q2.pin3", "EMIT") && on("RE1.pin1", "EMIT") && on("RE2.pin1", "EMIT") && on("RE1.pin2", "GND") && on("RE2.pin2", "GND") && on("Q3.pin1", "BASE") && on("Q3.pin3", "GND") && find("Q3.pin2") === find("R11.pin2") && on("R11.pin1", "EMIT"))
t("D1 clamps the base (cathode on BASE), D2 clamps the collector (cathode on COL)", on("D1.pin2", "BASE") && on("D1.pin1", "GND") && on("D2.pin2", "COL") && on("D2.pin1", "GND"))
t("oscillation monitor: R12 COL→OSC, R13 OSC→GND, OSC on PB2 (the T0 counter input)", on("R12.pin1", "COL") && on("R12.pin2", "OSC") && on("R13.pin2", "GND") && on("U2.PB2", "OSC"))
t("ISP header: MISO=PB1, SCK=PB2, MOSI=PB0, RESET=RST, VCC=VMCU", on("J2.MISO", "LEDS") && on("J2.SCK", "OSC") && on("J2.MOSI", "VBS") && on("J2.RESET", "RST") && on("U2.RESET", "RST") && on("J2.VCC", "VMCU"))
t("module pads: MOD+ on VDRV, MOD− on GND", on("TP_MODP.MODP", "VDRV") && on("TP_MODN.MODN", "GND"))

// 4 ── values the simulations and calculations assumed
const src = Object.fromEntries(all("source_component").map((c) => [c.name, c.capacitance ?? c.resistance]))
const want = { R1: 4700, RE1: 0.51, RE2: 0.51, R10: 47, R11: 100, R12: 100e3, R13: 33e3, R6: 100e3, R4: 10, R7: 1e6, R8: 2.2e6, C6: 22e-6, C7: 22e-6, C8: 22e-6 }
const bad = Object.entries(want).filter(([n, v]) => !(Math.abs(src[n] / v - 1) < 1e-6))
ok(!bad.length, `critical values: ${Object.keys(want).join(", ")}${bad.length ? " — wrong: " + bad.map(([n, v]) => `${n}=${src[n]} (want ${v})`).join(", ") : ""}`)

// 5 ── the hand-routed current loop
const sport = Object.fromEntries(all("source_port").map((p) => [p.source_port_id, p]))
const pairs = [["TP_BATP.BATP", "TP_LOCKA.LOCKA"], ["TP_LOCKB.LOCKB", "Q1.pin2"], ["Q1.pin1", "C6.pin1"], ["C6.pin1", "C7.pin1"], ["C7.pin1", "C8.pin1"], ["C8.pin1", "TP_PP.PP"],
  ["Q2.pin1", "TP_PM.PM"], ["Q2.pin3", "RE1.pin1"], ["RE1.pin1", "RE2.pin1"], ["RE1.pin2", "RE2.pin2"], ["RE2.pin2", "TP_BATN.BATN"]]
// the copper that runs pad-to-pad between the two named pins (the router may hang
// other branches of the same net off the same source trace; those aren't the loop)
const pcbPortAt = Object.fromEntries(all("pcb_port").map((p) => [port[p.source_port_id], p]))
const near = (r, p) => p && Math.hypot(r.x - p.x, r.y - p.y) < 0.05
const traceOf = (a, b) => all("pcb_trace").find((tr) => {
  const w = tr.route.filter((r) => r.x !== undefined)
  const s = w[0], e = w[w.length - 1]
  return (near(s, pcbPortAt[a]) && near(e, pcbPortAt[b])) || (near(s, pcbPortAt[b]) && near(e, pcbPortAt[a]))
})
const loopOk = pairs.map(([a, b]) => { const tr = traceOf(a, b); const ws = tr ? tr.route.filter((r) => r.route_type === "wire").map((r) => r.width) : []; return { a, b, ok: ws.length > 0 && Math.min(...ws) >= 0.8 - 1e-9 } })
ok(loopOk.every((x) => x.ok), `current loop: ${pairs.length} hand-routed links, all ≥ 0.8 mm${loopOk.filter((x) => !x.ok).map((x) => ` — ${x.a}↔${x.b} not`).join("")}`)
ok(all("pcb_copper_pour").length === 1, "bottom-layer GND pour present (the return path)")

// 6 ── manufacturability
const vias = all("pcb_via")
ok(vias.every((v) => v.hole_diameter >= 0.3 - 1e-9 && v.outer_diameter >= 0.6 - 1e-9), `${vias.length} vias, all ≥ 0.30 mm drill / 0.60 mm pad`)
const widths = all("pcb_trace").flatMap((tr) => tr.route.filter((r) => r.route_type === "wire").map((r) => r.width))
ok(Math.min(...widths) >= 0.15 - 1e-9, `traces ≥ 0.15 mm (min ${Math.min(...widths).toFixed(2)} mm)`)
const ring = (h) => h.shape === "circle" ? (h.outer_diameter - h.hole_diameter) / 2
  : h.shape === "pill" || h.shape === "oval" ? Math.min(h.outer_width - h.hole_width, h.outer_height - h.hole_height) / 2
  : h.shape === "circular_hole_with_rect_pad" ? (Math.min(h.rect_pad_width, h.rect_pad_height) - h.hole_diameter) / 2 : 0
const minRing = Math.min(...all("pcb_plated_hole").map(ring))
ok(minRing >= 0.18 - 1e-9, `plated-hole annular rings ≥ 0.18 mm (min ${minRing.toFixed(3)} mm)`)
const noCourtyard = all("pcb_component_missing_courtyard_warning").map((w) => compName[json.find((e) => e.type === "pcb_component" && e.pcb_component_id === w.pcb_component_id)?.source_component_id]).filter((n) => n !== "J1")
ok(noCourtyard.length === 0, `every part has a courtyard, so the DRC checks body collisions${noCourtyard.length ? " — missing: " + noCourtyard : ""} (J1: its shell legs fix it at the board edge)`)

// wiring summary
const wired = new Set(all("source_trace").flatMap((tr) => tr.connected_source_port_ids ?? []))
const dangling = all("source_port").filter((p) => !wired.has(p.source_port_id) && !/internal/.test(p.name))
console.log(`  ports: ${all("source_port").length} | wired: ${wired.size} | unconnected: ${dangling.map((d) => port[d.source_port_id]).join(", ") || "none"}`)
console.log(`  pcb traces routed: ${all("pcb_trace").length}`)
writeFileSync("circuit-arc-lighter.json", JSON.stringify(json, null, 2))

console.log("═".repeat(64))
if (failed) { console.log("RESULT: ❌ FAIL — fix the errors above"); process.exit(1) }
console.log("RESULT: ✅ ALL CHECKS PASSED")
