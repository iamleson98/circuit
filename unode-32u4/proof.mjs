/**
 * proof.mjs — automated electrical-correctness proof for the μNode32U4.
 *
 * It compiles the board, renders it, and machine-checks every electrical and
 * manufacturing fact the design depends on. Any regression fails loudly.
 *
 * HOW THIS AVOIDS PROVING ITSELF RIGHT
 * The pin table below is an independent transcription of the Microchip
 * datasheet (Atmel-7766J, Fig. 1-1) keyed by PHYSICAL PIN NUMBER — it is
 * checked against the pad numbers tscircuit actually generated (`pinNN`
 * port hints on the footprint), and then every pin's FUNCTION is checked
 * against the net it lands on (VCC → V5, AVCC → a ferrite-filtered rail,
 * GND → GND ...). Copying a wrong table from lib/atmega32u4.tsx cannot pass:
 * an earlier revision labelled pin 24 "VCC2" (it is AVCC) and fed it
 * straight from +5V — sections [2] and [4] catch exactly that.
 *
 * Run: npm run build && npm run proof
 */
import { Circuit } from "@tscircuit/core"
import { createElement } from "react"

const Board = (await import("./dist/index.js")).default

const circuit = new Circuit()
circuit.add(createElement(Board))
await circuit.renderUntilSettled()
const json = circuit.getCircuitJson()

// ── indexes ──────────────────────────────────────────────────────────────
const byType = {}
for (const el of json) (byType[el.type] ??= []).push(el)
const all = (t) => byType[t] ?? []
const comps = {}
for (const el of all("source_component")) comps[el.name] = el
const compName = {}
for (const c of all("source_component")) compName[c.source_component_id] = c.name
const srcPort = {}
for (const p of all("source_port")) srcPort[p.source_port_id] = p
const key = (sp) => `${compName[sp.source_component_id]}.${sp.name}`
const netName = {}
for (const n of all("source_net")) netName[n.source_net_id] = n.name

// connectivity: union-find over every source_trace (ports and named nets)
const parent = {}
const find = (a) => { parent[a] ??= a; while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a }
const union = (a, b) => { parent[find(a)] = find(b) }
for (const t of all("source_trace")) {
  const ids = [
    ...(t.connected_source_port_ids ?? []).map((p) => key(srcPort[p])),
    ...(t.connected_source_net_ids ?? []).map((n) => `net:${netName[n]}`),
  ]
  ids.forEach((i) => find(i))
  for (let i = 1; i < ids.length; i++) union(ids[0], ids[i])
}
const onNet = (port, net) => find(port) === find(`net:${net}`)
const connected = (a, b) => find(a) === find(b)
const R = (n) => comps[n]?.resistance
const C = (n) => comps[n]?.capacitance

// physical positions of every pad, keyed by "COMP.PORT"
const pos = {}
const pinNo = {}
for (const pp of all("pcb_port")) {
  const sp = srcPort[pp.source_port_id]
  if (!sp) continue
  pos[key(sp)] = { x: pp.x, y: pp.y }
  const h = (sp.port_hints ?? []).find((x) => /^pin\d+$/.test(x))
  if (h) pinNo[key(sp)] = +h.slice(3)
}

// ── assertion toolkit ────────────────────────────────────────────────────
let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ FAIL: ${label}`) }
}

// ═════════════════════════ 1. COMPONENT INVENTORY ═══════════════════════
console.log("\n[1] Component inventory")
const expected = ["C1","C2","C3","C4","C5","C6","C7","C8","C9","C10","C11","F1","FB1","FB2",
  "J1","J2","J3","J4","LED1","LED2","LED3","LED4","R1","R2","R3","R4","R5","R6","R7","R8","R9","R10",
  "SW1","SW2","U1","Y1"]
ok(expected.every((n) => comps[n]) && Object.keys(comps).length === expected.length,
  `all ${expected.length} components present, no extras`)
ok(comps.U1?.manufacturer_part_number === "ATmega32U4-AU", "U1 is an ATmega32U4-AU (external-crystal TQFP-44)")
ok(comps.J1?.manufacturer_part_number === "10118194-0001LF", "J1 footprint is tied to a real part (Amphenol 10118194-0001LF)")

// ═════════════════════════ 2. TQFP-44 PINOUT vs DATASHEET ═══════════════
console.log("\n[2] U1 pinout = Microchip ATmega32U4 TQFP-44 (Atmel-7766J Fig. 1-1), by physical pin number")
// function of each physical pin, transcribed from Fig. 1-1
const DATASHEET = {
  1: "PE6", 2: "UVCC", 3: "D-", 4: "D+", 5: "UGND", 6: "UCAP", 7: "VBUS", 8: "PB0", 9: "PB1", 10: "PB2", 11: "PB3",
  12: "PB7", 13: "RESET", 14: "VCC", 15: "GND", 16: "XTAL2", 17: "XTAL1", 18: "PD0", 19: "PD1", 20: "PD2", 21: "PD3", 22: "PD5",
  23: "GND", 24: "AVCC", 25: "PD4", 26: "PD6", 27: "PD7", 28: "PB4", 29: "PB5", 30: "PB6", 31: "PC6", 32: "PC7", 33: "PE2",
  34: "VCC", 35: "GND", 36: "PF7", 37: "PF6", 38: "PF5", 39: "PF4", 40: "PF1", 41: "PF0", 42: "AREF", 43: "GND", 44: "AVCC",
}
const u1ByPin = {}
for (const [k, n] of Object.entries(pinNo)) if (k.startsWith("U1.")) u1ByPin[n] = k.slice(3)
const fnOf = (label) => label.replace(/\d+$/, (d) => (/^(VCC|AVCC|GND)/.test(label) ? "" : d)).replace("DMINUS", "D-").replace("DPLUS", "D+")
let mismatches = []
for (let p = 1; p <= 44; p++) {
  const label = u1ByPin[p]
  if (!label || fnOf(label) !== DATASHEET[p]) mismatches.push(`pin ${p}: board=${label} datasheet=${DATASHEET[p]}`)
}
ok(mismatches.length === 0, `every one of 44 pads carries its datasheet function${mismatches.length ? " — " + mismatches.join("; ") : ""}`)
// physical geometry: pin 1 top-left, counter-clockwise, 0.8 mm pitch
const P = (n) => pos[`U1.${u1ByPin[n]}`]
const cx = (P(1).x + P(23).x) / 2, cy = (P(12).y + P(34).y) / 2
const side = (n) => {
  const p = P(n), dx = p.x - cx, dy = p.y - cy
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "L" : "R") : dy < 0 ? "B" : "T"
}
const sides = Array.from({ length: 44 }, (_, i) => side(i + 1)).join("")
ok(sides === "L".repeat(11) + "B".repeat(11) + "R".repeat(11) + "T".repeat(11),
  "pads 1-11 left, 12-22 bottom, 23-33 right, 34-44 top (datasheet order)")
ok(P(1).y > P(11).y && P(12).x < P(22).x && P(23).y < P(33).y && P(34).x > P(44).x, "numbering runs counter-clockwise from pin 1 at the top-left")
const pitches = []
for (let p = 1; p < 44; p++) if (side(p) === side(p + 1)) pitches.push(Math.hypot(P(p + 1).x - P(p).x, P(p + 1).y - P(p).y))
ok(pitches.every((d) => Math.abs(d - 0.8) < 0.01), "0.8 mm pitch on all four edges (44A package)")
const u1pads = all("pcb_smtpad").filter((s) => s.pcb_component_id === all("pcb_component").find((c) => compName[c.source_component_id] === "U1")?.pcb_component_id)
const span = Math.max(...u1pads.map((s) => s.x + (s.width ?? 0) / 2)) - Math.min(...u1pads.map((s) => s.x - (s.width ?? 0) / 2))
ok(span > 12.0 && span < 13.4, `land-pattern span ${span.toFixed(2)} mm brackets the 12.0 mm lead-tip span (lead toes covered)`)

// ═════════════════════════ 3. USB FRONT-END ═════════════════════════════
console.log("\n[3] USB front-end (datasheet §2.2.8-13, Fig 21-3)")
ok(R("R1") === 22 && R("R2") === 22, "R1/R2 = 22Ω series resistors (§2.2.8/9)")
ok(comps.F1?.current_rating_amps === 0.5, "F1 PTC fuse 500mA hold (USB budget)")
ok(C("C7") === 1e-6 && onNet("C7.pin2", "GND") && connected("U1.UCAP", "C7.pin1"), "C7 = 1µF from UCAP to GND (§2.2.12)")
ok(connected("J1.DPLUS", "R1.pin1") && connected("R1.pin2", "U1.DPLUS") && !connected("J1.DPLUS", "U1.DPLUS"), "J1.D+ → R1 → U1.D+ (resistor in series, not bypassed)")
ok(connected("J1.DMINUS", "R2.pin1") && connected("R2.pin2", "U1.DMINUS") && !connected("J1.DMINUS", "U1.DMINUS"), "J1.D− → R2 → U1.D−")
ok(connected("J1.VBUS", "F1.pin1") && onNet("F1.pin2", "V5") && !onNet("J1.VBUS", "V5"), "VBUS reaches V5 only through F1")
ok(["GND", "SHIELD1", "SHIELD2", "SHIELD3", "SHIELD4", "SHIELD5", "SHIELD6"].every((p) => onNet(`J1.${p}`, "GND")), "USB GND and all six shell connections on GND")
ok(!Object.keys(parent).some((k) => k !== "J1.ID" && connected(k, "J1.ID")), "ID pin left open (device-only port)")
// connector must sit ON the board edge (receptacle overhangs it by 0.7 mm)
const board = all("pcb_board")[0]
const leftEdge = board.center.x - board.width / 2
const j1Signal = ["VBUS", "DMINUS", "DPLUS", "ID", "GND"].map((p) => pos[`J1.${p}`])
const padRowToEdge = Math.min(...j1Signal.map((p) => p.x)) - leftEdge
ok(Math.abs(padRowToEdge - (2.75 + 1.4)) < 0.01, `J1 signal pads ${padRowToEdge.toFixed(2)} mm from the board edge = Amphenol drawing (4.15 mm) → receptacle overhangs the edge`)
ok(j1Signal.every((p, i, a) => i === 0 || (Math.abs(a[i - 1].y - p.y - 0.65) < 0.01)), "J1 pins 1→5 top-to-bottom at 0.65 mm pitch (VBUS on top with the opening facing left)")

// ═════════════════════════ 4. POWER INTEGRITY ═══════════════════════════
console.log("\n[4] Power integrity (datasheet Fig. 21-3, Fig. 24-10)")
for (const p of ["VCC1", "VCC2", "UVCC", "VBUS"]) ok(onNet(`U1.${p}`, "V5"), `U1.${p} on V5`)
for (const p of ["GND1", "GND2", "GND3", "GND4", "UGND"]) ok(onNet(`U1.${p}`, "GND"), `U1.${p} on GND`)
for (const [pin, net, fb, cap] of [["AVCC1", "AVCC1", "FB2", "C4"], ["AVCC2", "AVCC2", "FB1", "C6"]]) {
  ok(onNet(`U1.${pin}`, net) && !onNet(`U1.${pin}`, "V5"), `U1.${pin} on its own rail ${net}, NOT directly on V5`)
  ok(onNet(`${fb}.IN`, "V5") && onNet(`${fb}.OUT`, net), `${fb} (ferrite bead) feeds ${net} from V5`)
  ok(onNet(`${cap}.pin1`, net) && onNet(`${cap}.pin2`, "GND") && C(cap) === 1e-7, `${cap} = 100nF decouples ${net}`)
  ok(/BLM18/.test(comps[fb]?.manufacturer_part_number ?? ""), `${fb} is a real bead part (${comps[fb]?.manufacturer_part_number})`)
}
ok(onNet("C3.pin1", "V5") && onNet("C5.pin1", "V5") && onNet("C8.pin1", "V5"), "C3/C5/C8 decouple the VCC pins and UVCC")
ok(onNet("U1.AREF", "AREF") && onNet("C9.pin1", "AREF") && onNet("C9.pin2", "GND"), "AREF bypassed by C9")
// USB 2.0 §7.2.4.1: ≤ 10 µF presented on VBUS at attach (count every cap hanging off V5, incl. behind beads)
const capsOnRail = all("source_component").filter((c) => c.capacitance && ["V5", "AVCC1", "AVCC2"].some((n) => onNet(`${c.name}.pin1`, n)))
const railC = capsOnRail.reduce((s, c) => s + c.capacitance, 0)
ok(railC <= 10e-6, `total VBUS-side capacitance ${(railC * 1e6).toFixed(2)} µF ≤ 10 µF (USB 2.0 inrush limit)`)

// ═════════════════════════ 5. CLOCK ═════════════════════════════════════
console.log("\n[5] 16MHz crystal clock (datasheet §6, Table 6-3)")
ok(Number(comps.Y1?.frequency) === 16e6, "Y1 = 16MHz")
ok(C("C10") === 22e-12 && C("C11") === 22e-12, "C10/C11 = 22pF (inside the 12-22pF window, CL≈15pF with ~4pF strays)")
ok(connected("U1.XTAL1", "Y1.pin2") && connected("U1.XTAL1", "C10.pin1"), "XTAL1 ties Y1 + C10")
ok(connected("U1.XTAL2", "Y1.pin1") && connected("U1.XTAL2", "C11.pin1"), "XTAL2 ties Y1 + C11")
ok(onNet("C10.pin2", "GND") && onNet("C11.pin2", "GND"), "load caps return to GND")

// ═════════════════════════ 6. RESET & BOOT ══════════════════════════════
console.log("\n[6] Reset & bootloader entry (datasheet §2.2.14, §27.5.3)")
ok(R("R3") === 10000 && onNet("R3.pin1", "V5") && onNet("R3.pin2", "RST"), "R3 = 10k RESET pull-up to V5")
ok(R("R4") === 10000 && onNet("R4.pin1", "V5") && onNet("R4.pin2", "HWB"), "R4 = 10k HWB pull-up to V5")
ok(onNet("U1.RESET", "RST") && onNet("SW1.pin1", "RST") && onNet("J3.RESET", "RST") && onNet("SW1.pin3", "GND"), "RST = U1.RESET + SW1 (to GND) + ICSP.RESET")
ok(onNet("U1.PE2", "HWB") && onNet("SW2.pin1", "HWB") && onNet("J4.HWB", "HWB") && onNet("SW2.pin3", "GND"), "HWB = U1.PE2 + SW2 (to GND) + J4.HWB")

// ═════════════════════════ 7. ICSP = STANDARD AVR ISP GRID ══════════════
console.log("\n[7] ICSP header J3 = standard AVR ISP grid (rotated 90° CW)")
const j3 = Object.fromEntries(["MISO", "VCC", "SCK", "MOSI", "RESET", "GND"].map((p) => [p, pos[`J3.${p}`]]))
const ys = [...new Set(Object.values(j3).map((p) => p.y.toFixed(2)))].map(Number).sort((a, b) => b - a)
const xs = [...new Set(Object.values(j3).map((p) => p.x.toFixed(2)))].map(Number).sort((a, b) => a - b)
const at = (l, x, y) => Math.abs(j3[l].x - x) < 0.01 && Math.abs(j3[l].y - y) < 0.01
ok(at("RESET", xs[0], ys[0]) && at("SCK", xs[1], ys[0]) && at("MISO", xs[2], ys[0]), "top row: RESET | SCK | MISO")
ok(at("GND", xs[0], ys[1]) && at("MOSI", xs[1], ys[1]) && at("VCC", xs[2], ys[1]), "bottom row: GND | MOSI | VCC")
for (const [pin, net] of [["MISO", "MISO"], ["SCK", "SCK"], ["MOSI", "MOSI"], ["RESET", "RST"], ["VCC", "V5"], ["GND", "GND"]])
  ok(onNet(`J3.${pin}`, net), `J3.${pin} on ${net}`)
ok(onNet("U1.PB3", "MISO") && onNet("U1.PB1", "SCK") && onNet("U1.PB2", "MOSI"), "SPI from U1.PB3/PB1/PB2 (datasheet pin map)")

// ═════════════════════════ 8. INDICATORS (Leonardo macros) ══════════════
console.log("\n[8] Indicators — PWR/L/TX/RX (ArduinoCore leonardo macros)")
for (const r of ["R5", "R6", "R7", "R8"]) ok(R(r) === 1000, `${r} = 1k (≈3mA @ 5V)`)
ok(onNet("LED1.pin1", "V5") && connected("LED1.pin2", "R5.pin1") && onNet("R5.pin2", "GND"), "PWR: V5 → LED1 → R5 → GND")
ok(onNet("U1.PC7", "D13") && onNet("R6.pin1", "D13") && connected("R6.pin2", "LED2.pin1") && onNet("LED2.pin2", "GND"), "L: PC7/D13 → R6 → LED2 → GND (active-high)")
ok(onNet("LED3.pin1", "V5") && connected("LED3.pin2", "R7.pin1") && connected("R7.pin2", "U1.PD5"), "TX: V5 → LED3 → R7 → PD5 (TXLED1 drives LOW)")
ok(onNet("LED4.pin1", "V5") && connected("LED4.pin2", "R8.pin1") && onNet("R8.pin2", "SS") && onNet("U1.PB0", "SS"), "RX: V5 → LED4 → R8 → PB0 (RXLED1 drives LOW)")

// ═════════════════════════ 9. I²C PULL-UPS ══════════════════════════════
console.log("\n[9] I²C pull-ups")
ok(R("R9") === 4700 && R("R10") === 4700 && onNet("R9.pin1", "V5") && onNet("R10.pin1", "V5"), "R9/R10 = 4.7k to V5")
ok(["U1.PD1", "R9.pin2", "J2.D2", "J4.SDA"].every((p) => onNet(p, "SDA")), "SDA = PD1/D2 + pull-up + J2.D2 + J4.SDA")
ok(["U1.PD0", "R10.pin2", "J2.D3", "J4.SCL"].every((p) => onNet(p, "SCL")), "SCL = PD0/D3 + pull-up + J2.D3 + J4.SCL")

// ═════════════════════════ 10. LEONARDO PIN MAP ═════════════════════════
console.log("\n[10] Breakout = ArduinoCore-avr leonardo variant, pin-for-pin")
const MAP = {
  "J2.D0": "PD2", "J2.D1": "PD3", "J2.D2": "PD1", "J2.D3": "PD0", "J2.D4": "PD4", "J2.D5": "PC6", "J2.D6": "PD7",
  "J2.D7": "PE6", "J2.D8": "PB4", "J2.D9": "PB5", "J2.D10": "PB6", "J2.D11": "PB7", "J2.D12": "PD6", "J2.D13": "PC7",
  "J4.A0": "PF7", "J4.A1": "PF6", "J4.A2": "PF5", "J4.A3": "PF4", "J4.A4": "PF1", "J4.A5": "PF0",
  "J4.MISO": "PB3", "J4.SCK": "PB1", "J4.MOSI": "PB2", "J4.SS": "PB0", "J4.HWB": "PE2", "J4.AREF": "AREF",
}
for (const [hdr, mcu] of Object.entries(MAP)) ok(connected(hdr, `U1.${mcu}`), `${hdr} ↔ U1.${mcu}`)
ok(onNet("J2.V5", "V5") && onNet("J4.V5", "V5") && onNet("J2.GND", "GND") && onNet("J4.GND", "GND"), "header power pins on V5/GND")

// ═════════════════════════ 11. MANUFACTURABILITY ════════════════════════
console.log("\n[11] Manufacturability (standard 2-layer rules)")
const vias = all("pcb_via")
ok(vias.length > 0 && vias.every((v) => v.hole_diameter >= 0.3 - 1e-9 && v.outer_diameter >= 0.6 - 1e-9),
  `all ${vias.length} vias ≥ 0.30 mm drill / 0.60 mm pad (0.15 mm annular ring)`)
const widths = all("pcb_trace").flatMap((t) => t.route.filter((r) => r.route_type === "wire").map((r) => r.width))
ok(Math.min(...widths) >= 0.15 - 1e-9, `minimum trace width ${Math.min(...widths).toFixed(3)} mm ≥ 0.15 mm`)
ok(all("pcb_plated_hole").every((h) => h.shape !== "circle" || (h.outer_diameter - h.hole_diameter) / 2 >= 0.18), "every round plated hole keeps ≥ 0.18 mm annular ring")
const pours = all("pcb_copper_pour")
const gndNetId = all("source_net").find((n) => n.name === "GND")?.source_net_id
ok(pours.length > 0 && pours.every((p) => p.layer === "bottom" && p.source_net_id === gndNetId), "bottom-layer copper pour tied to GND")
// USB pair: no vias, lengths matched
const traceFor = (a, b) => {
  const st = all("source_trace").find((t) => {
    const ks = (t.connected_source_port_ids ?? []).map((p) => key(srcPort[p]))
    return ks.includes(a) && ks.includes(b)
  })
  return all("pcb_trace").filter((t) => t.source_trace_id === st?.source_trace_id)
}
const lenOf = (ts) => ts.reduce((s, t) => s + t.route.reduce((a, r, i, arr) => (i && r.route_type === "wire" && arr[i - 1].route_type === "wire" ? a + Math.hypot(r.x - arr[i - 1].x, r.y - arr[i - 1].y) : a), 0), 0)
const viasOn = (ts) => vias.filter((v) => ts.some((t) => t.pcb_trace_id === v.pcb_trace_id)).length + ts.reduce((s, t) => s + t.route.filter((r) => r.route_type === "via").length, 0)
const dp = [...traceFor("J1.DPLUS", "R1.pin1"), ...traceFor("R1.pin2", "U1.DPLUS")]
const dm = [...traceFor("J1.DMINUS", "R2.pin1"), ...traceFor("R2.pin2", "U1.DMINUS")]
ok(dp.length && dm.length && viasOn(dp) === 0 && viasOn(dm) === 0, "USB D+/D− routed without vias")
ok(Math.abs(lenOf(dp) - lenOf(dm)) < 2, `USB D+/D− length match ${lenOf(dp).toFixed(1)} vs ${lenOf(dm).toFixed(1)} mm (< 2 mm)`)

// ═════════════════════════ 12. DRC — ZERO ═══════════════════════════════
console.log("\n[12] Design-rule check (the bottom line)")
const errors = json.filter((e) => /error/i.test(e.type))
for (const e of errors.slice(0, 10)) console.log("     ", e.type, (e.message ?? "").slice(0, 140))
ok(errors.length === 0, `0 DRC / routing errors (found ${errors.length})`)
const routedConnections = new Set(all("pcb_trace").map((t) => t.source_trace_id)).size
ok(all("pcb_trace").length > 0 && !json.some((e) => e.type === "pcb_autorouting_error"), `autorouter completed (${all("pcb_trace").length} PCB traces, ${routedConnections} connections)`)

// ═════════════════════════ SUMMARY ══════════════════════════════════════
console.log("\n" + "═".repeat(60))
console.log(`PROOF: ${pass} passed, ${fail} failed`)
if (fail > 0) { console.log("THE CIRCUIT IS NOT VERIFIED."); process.exit(1) }
console.log("Every assertion above is a datasheet-, USB-spec-, Arduino-variant- or")
console.log("fab-rule-derived fact, checked against the rendered board.")
