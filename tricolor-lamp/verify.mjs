/**
 * verify.mjs — headless verification of both tri-color lamp boards.
 * Renders controller/index.tsx and led-panel/index.tsx with @tscircuit/core
 * (run `npm run build` first) and checks, on each board's own netlist:
 *   1. zero runtime / design / DRC errors
 *   2. exactly the expected components and named nets
 *   3. the circuit topology (including the firmware's pin map and the
 *      cable between the boards, pin for pin)
 *   4. the values the calculations and simulations assumed
 *   5. polarity: diodes, LEDs, electrolytic capacitors, MOSFETs
 *   6. manufacturability: holes big enough for the real leads, trace widths,
 *      annular rings, vias, courtyards
 */
import { Circuit } from "@tscircuit/core"
import { createElement } from "react"
import { writeFileSync } from "fs"

let failed = false
const ok = (cond, label) => { console.log(`  ${cond ? "✓" : "✗ FAIL"} ${label}`); if (!cond) failed = true }

async function load(key) {
  const Board = (await import(`./dist/${key}/index.js`)).default
  const circuit = new Circuit()
  circuit.add(createElement(Board))
  await circuit.renderUntilSettled()
  const json = circuit.getCircuitJson()
  writeFileSync(`circuit-${key}.json`, JSON.stringify(json, null, 2))
  const all = (type) => json.filter((e) => e.type === type)
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
  const same = (a, b) => find(a) === find(b)
  const comp = (name) => all("source_component").find((c) => c.name === name)
  return { json, all, compName, port, on, same, comp }
}

function common(b, expectComps, expectNets) {
  const { json, all, compName } = b
  const errors = json.filter((el) => /error/i.test(el.type))
  for (const e of errors.slice(0, 12)) console.log("   -", e.type, (e.message ?? "").slice(0, 160))
  ok(errors.length === 0, `zero errors (runtime, design, DRC) — found ${errors.length}`)
  const comps = all("source_component").map((c) => c.name)
  const missing = expectComps.filter((c) => !comps.includes(c)), extra = comps.filter((c) => !expectComps.includes(c))
  ok(!missing.length && !extra.length, `${comps.length} components, exactly as expected${missing.length ? " — missing " + missing : ""}${extra.length ? " — unexpected " + extra : ""}`)
  const nets = all("source_net").map((n) => n.name)
  const missingNets = expectNets.filter((n) => !nets.includes(n))
  ok(!missingNets.length, `named nets present (${expectNets.length})${missingNets.length ? " — missing " + missingNets : ""}`)
  return { compName }
}

function manufacturing(b, holeRules) {
  const { all, compName } = b
  const vias = all("pcb_via")
  ok(vias.every((v) => v.hole_diameter >= 0.3 - 1e-9 && v.outer_diameter >= 0.6 - 1e-9), `${vias.length} vias, all ≥ 0.30 mm drill / 0.60 mm pad`)
  const widths = all("pcb_trace").flatMap((tr) => tr.route.filter((r) => r.route_type === "wire").map((r) => r.width))
  ok(Math.min(...widths) >= 0.15 - 1e-9, `traces ≥ 0.15 mm (min ${Math.min(...widths).toFixed(2)} mm)`)
  const ring = (h) => h.shape === "circle" ? (h.outer_diameter - h.hole_diameter) / 2
    : h.shape === "pill" || h.shape === "oval" ? Math.min(h.outer_width - h.hole_width, h.outer_height - h.hole_height) / 2
    : h.shape === "circular_hole_with_rect_pad" ? (Math.min(h.rect_pad_width, h.rect_pad_height) - h.hole_diameter) / 2 : 0
  const holes = all("pcb_plated_hole")
  const minRing = Math.min(...holes.map(ring))
  ok(minRing >= 0.18 - 1e-9, `plated-hole annular rings ≥ 0.18 mm (min ${minRing.toFixed(3)} mm)`)
  // every lead fits its hole: hole ≥ lead + 0.2 mm
  const pcbComp = Object.fromEntries(all("pcb_component").map((c) => [c.pcb_component_id, compName[c.source_component_id]]))
  const tooSmall = []
  for (const h of holes) {
    const name = pcbComp[h.pcb_component_id]
    const lead = holeRules(name)
    const d = h.hole_diameter ?? Math.min(h.hole_width, h.hole_height)
    if (lead === undefined) tooSmall.push(`${name}: no lead size known`)
    else if (d < lead + 0.2 - 1e-9) tooSmall.push(`${name} ${d} mm < ${lead} mm lead + 0.2`)
  }
  ok(tooSmall.length === 0, `every hole ≥ its part's lead + 0.2 mm${tooSmall.length ? " — " + [...new Set(tooSmall)].slice(0, 6).join("; ") : ""}`)
  const noCourtyard = all("pcb_component_missing_courtyard_warning").map((w) => pcbComp[w.pcb_component_id])
  ok(noCourtyard.length === 0, `every part has a courtyard, so the DRC checks body collisions${noCourtyard.length ? " — missing: " + noCourtyard : ""}`)
  const wired = new Set(all("source_trace").flatMap((tr) => tr.connected_source_port_ids ?? []))
  const dangling = all("source_port").filter((p) => !wired.has(p.source_port_id))
  ok(dangling.length === 0, `every pin is wired (${all("source_port").length} pins)${dangling.length ? " — unconnected: " + dangling.map((d) => b.port[d.source_port_id]) : ""}`)
  console.log(`  pcb traces routed: ${all("pcb_trace").length}`)
}

// widths of the copper between two named pins (pad to pad)
function linkWidths(b, a, c) {
  const { all, port } = b
  const pcbPortAt = Object.fromEntries(all("pcb_port").map((p) => [port[p.source_port_id], p]))
  const near = (r, p) => p && Math.hypot(r.x - p.x, r.y - p.y) < 0.05
  const tr = all("pcb_trace").find((tr) => {
    const w = tr.route.filter((r) => r.x !== undefined)
    const s = w[0], e = w[w.length - 1]
    return (near(s, pcbPortAt[a]) && near(e, pcbPortAt[c])) || (near(s, pcbPortAt[c]) && near(e, pcbPortAt[a]))
  })
  return tr ? tr.route.filter((r) => r.route_type === "wire").map((r) => r.width) : []
}

/* ═══════════════════════════ CONTROLLER ═══════════════════════════════ */
console.log("═".repeat(64))
console.log("BOARD: tricolor-lamp controller")
console.log("═".repeat(64))
const ctl = await load("controller")
{
  const { on, same, comp, all } = ctl
  common(ctl,
    ["J1", "F1", "D1", "C1", "C2", "U1", "C3", "C4", "D2", "C5", "U2", "C6", "R1", "R2", "R3", "C7", "J2", "J3", "R4", "R5", "R6", "C8",
      "Q1", "Q2", "Q3", "R7", "R8", "R9", "R10", "R11", "R12", "J4"],
    ["GND", "V12", "VREG", "VCC", "SENSE", "MODE", "RST", "G1", "G2", "G3", "GATE1", "GATE2", "GATE3", "BLUE_N", "WHITE_N", "YELLOW_N"])
  const t = (label, cond) => ok(cond, label)
  // pin names: diodes pin1 = anode, pin2 = cathode; MOSFET pin1 = drain, pin2 = source, pin3 = gate;
  // electrolytics pin1 = +
  t("input: J1 + → F1 → D1 (anode) → V12; J1 − on GND", same("J1.VIN", "F1.A") && same("F1.B", "D1.pin1") && on("D1.pin2", "V12") && on("J1.GNDIN", "GND"))
  t("C1 + on V12, − on GND; C2 across V12", on("C1.pin1", "V12") && on("C1.pin2", "GND") && on("C2.pin1", "V12") && on("C2.pin2", "GND"))
  t("78L05: IN on V12, GND on GND, OUT on VREG (C3 at its input, C4 at its output)", on("U1.IN", "V12") && on("U1.GND", "GND") && on("U1.OUT", "VREG") && on("C3.pin1", "V12") && on("C4.pin1", "VREG"))
  t("D2 from VREG (anode) to VCC (cathode): C5 can't drain back into the regulator", on("D2.pin1", "VREG") && on("D2.pin2", "VCC") && !on("U1.OUT", "VCC"))
  t("C5 (reservoir) + on VCC, − on GND; C6 decouples the chip", on("C5.pin1", "VCC") && on("C5.pin2", "GND") && on("C6.pin1", "VCC") && on("C6.pin2", "GND"))
  t("ATtiny85 power: VCC on VCC, GND on GND; RESET pulled up by R1", on("U2.VCC", "VCC") && on("U2.GND", "GND") && on("U2.RESET", "RST") && on("R1.pin1", "VCC") && on("R1.pin2", "RST"))
  t("SENSE: R2 from V12, R3 and C7 to GND, into PB3 (ADC3)", on("R2.pin1", "V12") && on("R2.pin2", "SENSE") && on("R3.pin1", "SENSE") && on("R3.pin2", "GND") && on("C7.pin1", "SENSE") && on("C7.pin2", "GND") && on("U2.PB3", "SENSE"))
  t("MODE: R4 to VCC, R5 and C8 to GND, R6 to the jumper's middle; LO = GND, HI = VCC; into PB2 (ADC1)",
    on("U2.PB2", "MODE") && on("R4.pin1", "VCC") && on("R4.pin2", "MODE") && on("R5.pin1", "MODE") && on("R5.pin2", "GND") && on("C8.pin1", "MODE") && on("C8.pin2", "GND") &&
    on("R6.pin1", "MODE") && same("R6.pin2", "J3.MID") && on("J3.LO", "GND") && on("J3.HI", "VCC"))
  t("firmware pin map: PB0 → blue (Q1), PB1 → white (Q2), PB4 → yellow (Q3)",
    on("U2.PB0", "G1") && on("U2.PB1", "G2") && on("U2.PB4", "G3") && on("Q1.pin1", "BLUE_N") && on("Q2.pin1", "WHITE_N") && on("Q3.pin1", "YELLOW_N"))
  for (const [k, q, rg, rp] of [[1, "Q1", "R7", "R10"], [2, "Q2", "R8", "R11"], [3, "Q3", "R9", "R12"]])
    t(`channel ${k}: G${k} → ${rg} → GATE${k} → ${q} gate; ${rp} holds it LOW; source on GND`,
      on(`${rg}.pin1`, `G${k}`) && on(`${rg}.pin2`, `GATE${k}`) && on(`${q}.pin3`, `GATE${k}`) && on(`${rp}.pin1`, `GATE${k}`) && on(`${rp}.pin2`, "GND") && on(`${q}.pin2`, "GND"))
  t("J4 (to the panel): +12V, BLUE, WHITE, YELLOW", on("J4.V12OUT", "V12") && on("J4.BLUE", "BLUE_N") && on("J4.WHITE", "WHITE_N") && on("J4.YELLOW", "YELLOW_N"))
  t("ISP header: MISO = PB1, SCK = PB2, MOSI = PB0, RESET, VCC, GND",
    on("J2.MISO", "G2") && on("J2.SCK", "MODE") && on("J2.MOSI", "G1") && on("J2.RESET", "RST") && on("J2.VCC", "VCC") && on("J2.GND", "GND"))

  const val = Object.fromEntries(all("source_component").map((c) => [c.name, c.capacitance ?? c.resistance]))
  const want = { R1: 10e3, R2: 100e3, R3: 33e3, R4: 1e6, R5: 1e6, R6: 10e3, R7: 100, R8: 100, R9: 100, R10: 100e3, R11: 100e3, R12: 100e3,
    C1: 470e-6, C2: 100e-9, C3: 330e-9, C4: 100e-9, C5: 220e-6, C6: 100e-9, C7: 10e-9, C8: 10e-9 }
  const bad = Object.entries(want).filter(([n, v]) => !(Math.abs(val[n] / v - 1) < 1e-6))
  ok(!bad.length, `values as calculated (${Object.keys(want).length} parts)${bad.length ? " — wrong: " + bad.map(([n, v]) => `${n}=${val[n]} (want ${v})`).join(", ") : ""}`)
  const mpn = (n) => comp(n)?.manufacturer_part_number
  ok(mpn("U2") === "ATTINY85-20PU" && mpn("U1") === "LM78L05ACZ" && ["Q1", "Q2", "Q3"].every((q) => mpn(q) === "IRLZ44NPBF") && mpn("D1") === "1N5819" && mpn("D2") === "1N4148" && mpn("F1") === "MF-R110",
    "part numbers: ATtiny85, LM78L05ACZ, 3 × IRLZ44N, 1N5819, 1N4148, MF-R110")
  ok(["C1", "C5"].every((c) => comp(c)?.are_pins_interchangeable === false), "C1 and C5 are polarized (square + pad, marked)")
  const powerLinks = [["J1.VIN", "F1.A"], ["F1.B", "D1.pin1"]]
  const pw = powerLinks.map(([a, c]) => linkWidths(ctl, a, c))
  ok(pw.every((w) => w.length && Math.min(...w) >= 0.8 - 1e-9), "12 V input path J1 → F1 → D1 is ≥ 0.8 mm copper")
  ok(all("pcb_copper_pour").length === 1, "bottom-layer GND pour present")

  const lead = (n) => /^J[14]$/.test(n) ? 1.0 : /^Q/.test(n) ? 0.9 : /^D1$/.test(n) ? 0.86 : /^F1$/.test(n) ? 0.81 : /^C1$/.test(n) ? 0.6 : /^U1$/.test(n) ? 0.5 : /^U2$/.test(n) ? 0.55 : /^J[23]$/.test(n) ? 0.64 : /^[RCD]/.test(n) ? 0.6 : undefined
  manufacturing(ctl, lead)
}

/* ═══════════════════════════ LED PANEL ════════════════════════════════ */
console.log("═".repeat(64))
console.log("BOARD: tricolor-lamp LED panel")
console.log("═".repeat(64))
const panel = await load("led-panel")
{
  const { on, same, all, comp } = panel
  const strings = Array.from({ length: 18 }, (_, i) => i + 1)
  const ledsOf = (n) => all("source_component").filter((c) => c.ftype === "simple_led" && c.name.match(new RegExp(`^D${n}[a-z]$`))).map((c) => c.name).sort()
  const expected = ["J1", ...strings.flatMap((n) => [`R${n}`, ...ledsOf(n)])]
  common(panel, expected, ["V12", "BLUE_N", "WHITE_N", "YELLOW_N"])
  const counts = { blue: 0, white: 0, yellow: 0 }, per = { blue: [], white: [], yellow: [] }
  const problems = []
  for (const n of strings) {
    const leds = ledsOf(n)
    const color = comp(leds[0]).color
    counts[color] += leds.length; per[color].push(leds.length)
    if (!leds.every((d) => comp(d).color === color)) problems.push(`string ${n} mixes colours`)
    if (!on(`R${n}.pin1`, "V12")) problems.push(`R${n} not on +12 V`)
    if (!same(`R${n}.pin2`, `${leds[0]}.pin1`)) problems.push(`R${n} doesn't feed ${leds[0]}'s anode`)
    for (let i = 1; i < leds.length; i++) if (!same(`${leds[i - 1]}.pin2`, `${leds[i]}.pin1`)) problems.push(`${leds[i - 1]} cathode ↛ ${leds[i]} anode`)
    if (!on(`${leds[leds.length - 1]}.pin2`, `${color.toUpperCase()}_N`)) problems.push(`string ${n} doesn't return on ${color.toUpperCase()}_N`)
    const r = comp(`R${n}`).resistance, wantR = color === "yellow" ? 220 : 150
    if (Math.abs(r / wantR - 1) > 1e-6) problems.push(`R${n} = ${r} Ω, want ${wantR}`)
  }
  ok(problems.length === 0, `18 strings: resistor from +12 V → LEDs anode-to-cathode → their colour's return${problems.length ? " — " + problems.slice(0, 5).join("; ") : ""}`)
  ok(counts.blue === 18 && counts.white === 18 && counts.yellow === 24 && per.blue.every((k) => k === 3) && per.white.every((k) => k === 3) && per.yellow.every((k) => k === 4),
    `colours: 6 × 3 blue, 6 × 3 white, 6 × 4 yellow (found ${counts.blue}/${counts.white}/${counts.yellow})`)
  ok(on("J1.V12IN", "V12") && on("J1.BLUE", "BLUE_N") && on("J1.WHITE", "WHITE_N") && on("J1.YELLOW", "YELLOW_N"), "J1: +12V, BLUE, WHITE, YELLOW")
  // hand-routed +12 V rails
  const railPairs = []
  for (let r = 0; r < 6; r++) for (let k = 1; k < 3; k++) railPairs.push([`R${r * 3 + k}.pin1`, `R${r * 3 + k + 1}.pin1`])
  for (let r = 1; r < 6; r++) railPairs.push([`R${(r - 1) * 3 + 1}.pin1`, `R${r * 3 + 1}.pin1`])
  railPairs.push(["R16.pin1", "J1.V12IN"])
  const thin = railPairs.filter(([a, c]) => { const w = linkWidths(panel, a, c); return !w.length || Math.min(...w) < 0.6 - 1e-9 })
  ok(thin.length === 0, `+12 V rails: ${railPairs.length} hand-routed links, all ≥ 0.6 mm${thin.length ? " — " + thin.map((p) => p.join("↔")).slice(0, 4) : ""}`)
  ok(all("pcb_copper_pour").length >= 1, `bottom-layer +12 V pour present (${all("pcb_copper_pour").length} piece${all("pcb_copper_pour").length > 1 ? "s" : ""})`)
  manufacturing(panel, (n) => /^J/.test(n) ? 1.0 : /^D/.test(n) ? 0.71 : /^R/.test(n) ? 0.6 : undefined)
}

/* ═══════════════════════════ BETWEEN THE BOARDS ═══════════════════════ */
console.log("═".repeat(64))
console.log("CABLE: controller J4 ↔ LED panel J1")
console.log("═".repeat(64))
{
  const order = (b, name) => b.all("source_port").filter((p) => b.compName[p.source_component_id] === name).sort((a, c) => a.pin_number - c.pin_number).map((p) => p.name)
  const a = order(ctl, "J4"), c = order(panel, "J1")
  const role = (s) => s.replace(/^V12(OUT|IN)$/, "V12")
  ok(a.length === 4 && a.map(role).join() === c.map(role).join(), `same signal on the same screw, pin for pin: ${a.join(" ")}  ↔  ${c.join(" ")}`)
}

console.log("═".repeat(64))
if (failed) { console.log("RESULT: ❌ FAIL — fix the errors above"); process.exit(1) }
console.log("RESULT: ✅ ALL CHECKS PASSED")
