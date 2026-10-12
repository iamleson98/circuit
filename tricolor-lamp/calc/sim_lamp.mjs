/**
 * sim_lamp.mjs — circuit simulation of the tri-color lamp, straight from
 * the two routed PCBs.
 *
 *   1. renders controller/index.tsx and led-panel/index.tsx with
 *      @tscircuit/core (needs `npm run build`)
 *   2. turns each into a SPICE deck (board_to_spice.mjs): every resistor,
 *      capacitor, diode and LED is the board's own part, value and net.
 *      The two decks share the cable's four nets (V12, BLUE_N, WHITE_N,
 *      YELLOW_N), so joined together they ARE the lamp: controller + cable
 *      + panel. Parts SPICE can't know are modelled at their pads:
 *        power supply  12 V behind a switch (the wall switch), with 1000 µF
 *                      of output capacitance of its own
 *        F1            0.15 Ω (the PTC fuse, cold)
 *        U1 (78L05)    a pass transistor whose base is clamped to 5.6 V and
 *                      held 1.2 V below its input (≈ 1.7 V dropout), plus
 *                      its 3 mA quiescent draw
 *        U2 (ATtiny85) its supply current (awake / asleep), and its three
 *                      output pins — driven by a copy of the firmware's
 *                      rules, run at every time step
 *        Q1-Q3         IRLZ44N as switches: on when gate − source > 2.5 V
 *   3. writes calc/spice/lamp.cir and checks what the design promises.
 *
 * Run:  npm run build && npm run sim      (≈ 1 minute)
 */
import { Circuit } from "./spice.mjs"
import { boardToSpice } from "./board_to_spice.mjs"
import { Circuit as TsCircuit } from "@tscircuit/core"
import { createElement } from "react"
import { writeFileSync, mkdirSync } from "node:fs"

let pass = 0, fail = 0
const check = (label, ok, detail = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${label}${detail ? "  — " + detail : ""}`) }
const mA = (i) => (i * 1e3).toFixed(1) + " mA"

// LED models fitted to 5 mm parts: V = N·Vt·ln(I/IS) + I·RS
//   blue/white 3.1 V and yellow 2.05 V at 15 mA, ≈ 20 Ω / 12 Ω dynamic resistance
const fit = (vf, i, n, rs) => i / Math.exp((vf - i * rs) / (n * 0.025852))
const MODELS = `
.model LEDB D(IS=${fit(3.1, 0.015, 2.6, 15).toExponential(3)} N=2.6 RS=15 CJO=30p)
.model LEDW D(IS=${fit(3.1, 0.015, 2.6, 15).toExponential(3)} N=2.6 RS=15 CJO=30p)
.model LEDY D(IS=${fit(2.05, 0.015, 2.0, 10).toExponential(3)} N=2.0 RS=10 CJO=30p)
.model D1N5819 D(IS=31.7u N=1.373 RS=0.051 CJO=110p M=0.35)
.model D1N4148 D(IS=2.52n N=1.752 RS=0.568 CJO=4p M=0.4 VJ=0.75 TT=20n)
.model Q2N2222A NPN(IS=14.34f BF=255.9 NE=1.307 ISE=14.34f IKF=.2847 BR=6.092 NC=2 RC=1 RB=10 VAF=74.03 CJC=7.306p CJE=22.01p TR=46.91n TF=411.1p)`

async function render(key) {
  const Board = (await import(`../dist/${key}/index.js`)).default
  const tc = new TsCircuit()
  tc.add(createElement(Board))
  await tc.renderUntilSettled()
  return tc.getCircuitJson()
}
const ctlJson = await render("controller")
const panelJson = await render("led-panel")

/** the controller board + its off-board parts */
function controllerDeck({ psu = 12, jumper = "open", sleepLoad = 360e3, c5 } = {}) {
  return boardToSpice(ctlJson, {
    title: "Tri-color lamp controller",
    diodeModel: { D1: "D1N5819", D2: "D1N4148" },
    parts: {
      J1: ({ node }) => [`VPSU psu_emf 0 ${psu}`, `SWALL psu_emf psu_out RON=0.05 ROFF=1e9  ; the wall switch + the supply's output stage`,
        `CPSU psu_out 0 1000u  ; the supply's own output capacitors`, `RJ1 psu_out ${node("VIN")} 0.005`, `RJ1G ${node("GNDIN")} 0 0.001`].join("\n"),
      F1: ({ node }) => `RF1 ${node("A")} ${node("B")} 0.15  ; MF-R110, cold`,
      U1: ({ node }) => [`* U1: 78L05 — pass transistor, base clamped at 5.6 V and ≥ 1.2 V below IN`,
        `DU1A ${node("IN")} u1_d D1N4148`, `DU1B u1_d u1_e D1N4148`, `RU1B u1_e u1_b 2k`,
        `DU1Z u1_b u1_ref D1N4148`, `VU1REF u1_ref 0 5.0`,
        `QU1 ${node("IN")} u1_b ${node("OUT")} Q2N2222A`, `RU1Q ${node("IN")} ${node("GND")} 3.9k  ; ≈ 3 mA quiescent`].join("\n"),
      U2: ({ node }) => [`* U2: ATtiny85 — supply current and three output pins (firmware decides)`,
        `RU2SLEEP ${node("VCC")} ${node("GND")} ${sleepLoad}  ; asleep`, `SU2AWAKE ${node("VCC")} u2_a RON=1 ROFF=1e12`, `RU2A u2_a ${node("GND")} 5.5k  ; + 0.8 mA awake`,
        ...["PB0", "PB1", "PB4"].map((p) => `E${p} u2_${p.toLowerCase()} 0 ${node("VCC")} 0 0\nR${p} u2_${p.toLowerCase()} ${node(p)} 50`)].join("\n"),
      J2: () => "* J2: ISP header, nothing plugged in",
      J3: ({ node }) => jumper === "lo" ? `RJ3 ${node("MID")} ${node("LO")} 0.01  ; jumper on LO` : jumper === "hi" ? `RJ3 ${node("MID")} ${node("HI")} 0.01  ; jumper on HI` : "* J3: no jumper",
      J4: () => "* J4: the cable — its four nets are shared with the panel's J1",
      ...Object.fromEntries(["Q1", "Q2", "Q3"].map((q) => [q, ({ node }) => `S${q} ${node("pin1")} ${node("pin2")} RON=0.025 ROFF=1e8  ; IRLZ44N\nC${q}G ${node("pin3")} ${node("pin2")} 1.8n`])),
      ...(c5 ? { C5: ({ node }) => `C5 ${node("pin1")} ${node("pin2")} ${c5}  ; −20 % tolerance` } : {}),
    },
  }).deck
}

/** the LED panel, element and private node names prefixed so they can't clash */
function panelDeck() {
  const color = Object.fromEntries(panelJson.filter((e) => e.type === "source_component" && e.ftype === "simple_led").map((c) => [c.name, c.color]))
  const { deck } = boardToSpice(panelJson, {
    title: "Tri-color lamp LED panel",
    ledModel: Object.fromEntries(Object.entries(color).map(([n, c]) => [n, c === "blue" ? "LEDB" : c === "white" ? "LEDW" : "LEDY"])),
    parts: { J1: () => "* J1: the cable" },
  })
  return deck.split("\n").map((l) => {
    if (!l || l.startsWith("*")) return l
    const tok = l.split(/\s+/)
    tok[0] = tok[0][0] + "P_" + tok[0].slice(1)
    for (let i = 1; i < tok.length; i++) if (tok[i].startsWith("n_")) tok[i] = "p_" + tok[i]
    return tok.join(" ")
  }).join("\n")
}

const lampDeck = (o) => `${MODELS}\n${controllerDeck(o)}\n${panelDeck()}`
mkdirSync(new URL("./spice/", import.meta.url), { recursive: true })
writeFileSync(new URL("./spice/lamp.cir", import.meta.url), lampDeck() + "\n.tran 0.5m 1.5\n.end\n")
console.log("\n  wrote calc/spice/lamp.cir (controller + cable + LED panel, generated from the routed boards)")

const ratio = 33 / 133
const adcOf = (x, c) => Math.min(1023, Math.floor((c.v(x, "sense") / Math.max(0.1, c.v(x, "vcc"))) * 1024))
const setPin = (c, pin, on) => { c.get(`E${pin}`).g = on ? 1 : 0 }
const mosfets = (c, x) => { for (const q of ["Q1", "Q2", "Q3"]) { const g = c.v(x, `gate${q[1]}`); c.get(`S${q}`).closed = g > 2.5 } }
const stringCurrents = (c, x, color) => {
  const R = Object.fromEntries(panelJson.filter((e) => e.type === "source_component").map((e) => [e.name, e]))
  const out = []
  for (let n = 1; n <= 18; n++) {
    const led = R[`D${n}a`]
    if (led.color !== color) continue
    out.push(c.get(`RP_${n}`).current?.(x) ?? (c.v(x, "v12") - c.v(x, `p_n_d${n}a_pin1`)) / R[`R${n}`].resistance)
  }
  return out
}

/* ── 1. DC: each colour on its own, at the supply's corners ─────────────── */
console.log("\n[1] each colour lit, supply at 11.4 / 12.0 / 12.6 V (DC operating point)")
{
  for (const [color, pin] of [["blue", "PB0"], ["white", "PB1"], ["yellow", "PB4"]]) {
    const res = []
    for (const psu of [11.4, 12.0, 12.6]) {
      const c = new Circuit(lampDeck({ psu }))
      c.get("SWALL").closed = true; c.get("SU2AWAKE").closed = true
      setPin(c, pin, true)
      let x = c.op()
      for (let k = 0; k < 3; k++) { mosfets(c, x); x = c.op({ x0: x }) }
      const ii = stringCurrents(c, x, color)
      const others = ["blue", "white", "yellow"].filter((o) => o !== color).flatMap((o) => stringCurrents(c, x, o))
      res.push({ psu, ii, others, v12: c.v(x, "v12"), vcc: c.v(x, "vcc"), gate: c.v(x, `gate${pin === "PB0" ? 1 : pin === "PB1" ? 2 : 3}`), adc: adcOf(x, c) })
    }
    const nom = res[1]
    const spread = Math.max(...nom.ii) / Math.min(...nom.ii)
    check(`${color}: 6 strings, ${mA(Math.min(...nom.ii))}-${mA(Math.max(...nom.ii))} each at 12 V (13-18 mA), equal to ±2 %`, nom.ii.length === 6 && Math.min(...nom.ii) > 0.013 && Math.max(...nom.ii) < 0.018 && spread < 1.02)
    check(`${color}: ${mA(Math.min(...res[0].ii))} at 11.4 V … ${mA(Math.max(...res[2].ii))} at 12.6 V (below the 30 mA limit)`, Math.max(...res[2].ii) < 0.03 && Math.min(...res[0].ii) > 0.008)
    check(`${color}: the other two colours stay dark (≤ 1 µA)`, Math.max(...nom.others.map(Math.abs)) < 1e-6)
    if (color === "blue") {
      check("12 V rail ≈ 11.7 V (supply − D1), VCC ≈ 4.4 V", Math.abs(nom.v12 - 11.68) < 0.15 && nom.vcc > 4.2 && nom.vcc < 4.6, `rail ${nom.v12.toFixed(2)} V, VCC ${nom.vcc.toFixed(2)} V`)
      check("the gate sees ≥ 4 V (IRLZ44N fully on)", nom.gate >= 4.0, `${nom.gate.toFixed(2)} V`)
      check("the ADC reads the 12 V as 600-760 at all three supply voltages", res.every((r) => r.adc >= 600 && r.adc <= 760), res.map((r) => r.adc).join(" / "))
    }
  }
}

/* ── 2. DC: the MODE jumper ────────────────────────────────────────────── */
console.log("\n[2] MODE jumper (DC)")
{
  for (const [jumper, lo, hi, name] of [["open", 341, 682, "STEP"], ["lo", 0, 341, "MEMORY"], ["hi", 682, 1024, "RESET"]]) {
    const c = new Circuit(lampDeck({ jumper }))
    c.get("SWALL").closed = true
    const x = c.op()
    const counts = Math.floor((c.v(x, "mode") / c.v(x, "vcc")) * 1024)
    check(`jumper ${jumper.padEnd(4)} → ADC ${String(counts).padStart(4)} → ${name}`, counts >= lo && counts < hi)
  }
}

/* ── 3. DC: supply connected backwards ─────────────────────────────────── */
console.log("\n[3] supply connected backwards (DC)")
{
  const c = new Circuit(lampDeck({ psu: -12 }))
  c.get("SWALL").closed = true
  const x = c.op()
  const i = Math.abs(c.get("SWALL").current(x))
  check("D1 blocks it: the 12 V rail stays within 0.3 V of 0, the chip sees nothing", c.v(x, "v12") > -0.3 && c.v(x, "vcc") < 0.3, `rail ${c.v(x, "v12").toFixed(3)} V, VCC ${c.v(x, "vcc").toFixed(3)} V`)
  check("…and only the Schottky's leakage flows (≤ 1 mA)", i < 1e-3, `${(i * 1e6).toFixed(0)} µA`)
}

/* ── 4. transient: switch on, blue lit, switch off ─────────────────────── */
console.log("\n[4] switching off, with the firmware's rules running on the simulated chip (transient)")
{
  const c = new Circuit(lampDeck())
  c.get("SWALL").closed = false
  c.op()
  let onLevel = 0, lit = false, state = "boot", tOff = null, tDetect = null, tDead = null, minV12AfterDead = 99, vccAtEnd = 0, maxAdcAfterDead = 0
  const T_OFF = 0.6
  const r = c.tran({
    tstop: 1.6, h: 0.5e-3, method: "be", probes: ["v12", "vcc", "sense"],
    onStep: (t, x, circ) => {
      circ.get("SWALL").closed = t < T_OFF
      const adc = adcOf(x, circ)
      if (state === "boot" && t > 0.15) { state = "on"; lit = true; setPin(circ, "PB0", true); circ.get("SU2AWAKE").closed = true }
      if (state === "on" && t > 0.4 && !onLevel) onLevel = adc
      if (state === "on" && onLevel && adc * 8 < onLevel * 7) { state = "off"; tDetect = t; circ.get("SU2AWAKE").closed = false }
      if (state === "off" && lit && adc * 16 < onLevel * 9) { lit = false; tDead = t; setPin(circ, "PB0", false) }
      if (tDead && t > tDead + 0.02) { maxAdcAfterDead = Math.max(maxAdcAfterDead, adc); minV12AfterDead = Math.min(minV12AfterDead, circ.v(x, "v12")) }
      mosfets(circ, x)
      vccAtEnd = circ.v(x, "vcc")
    },
  })
  tOff = T_OFF
  check("on: the ADC's 'on' level settles at ≈ 670", onLevel > 600 && onLevel < 760, String(onLevel))
  check("the switch-off is seen within 50 ms of the supply stopping (lit LEDs pull the rail down fast)", tDetect && tDetect - tOff < 0.05, tDetect ? `${((tDetect - tOff) * 1e3).toFixed(1)} ms` : "never")
  check("the blue LEDs then drain the rail to 'dead' (≈ 6.5 V) in under 3 s and go out", tDead && tDead - tOff < 3, tDead ? `${(tDead - tOff).toFixed(2)} s` : "not within the run")
  check("after that the rail never creeps back towards 'on' (no false switch-on)", !tDead || maxAdcAfterDead * 32 < onLevel * 29, `highest reading ${maxAdcAfterDead} vs ${Math.ceil(onLevel * 29 / 32)} needed`)
  check("VCC is still ≥ 4 V at the end: the chip is alive and timing", vccAtEnd >= 4.0, `${vccAtEnd.toFixed(2)} V`)
  const i0 = r.t.findIndex((t) => t > tOff)
  console.log(`      rail: ${r.v12[i0 - 1].toFixed(2)} V on → ${r.v12[r.t.findIndex((t) => t > tOff + 0.05)].toFixed(2)} V 50 ms after → ${r.v12[r.v12.length - 1].toFixed(2)} V at ${r.t[r.t.length - 1].toFixed(1)} s`)
}

/* ── 5. transient: how long C5 keeps the chip alive (worst case) ───────── */
console.log("\n[5] hold-up: the chip asleep on C5 after the 12 V is gone (worst case)")
{
  // worst-case drain from math §6 (≈ 41 µA at ≈ 3.5 V) as a resistor, C5 at −20 %
  const c = new Circuit(lampDeck({ sleepLoad: 3.5 / 41e-6, c5: "176u" }))
  c.get("SWALL").closed = true
  c.op()
  let t29 = null
  const r = c.tran({
    tstop: 12, h: 4e-3, method: "be", probes: ["vcc", "v12"],
    onStep: (t, x, circ) => { circ.get("SWALL").closed = t < 0.05; if (!t29 && circ.v(x, "vcc") < 2.9) t29 = t },
  })
  const t0 = 0.05
  check("worst case: VCC stays above the 2.9 V brown-out maximum for ≥ 4.5 s (1.5 × the 3 s 'quick' window)", (t29 ?? 99) - t0 >= 4.5, t29 ? `${(t29 - t0).toFixed(1)} s` : "> 12 s")
  console.log(`      VCC: ${r.vcc[0].toFixed(2)} V → ${r.vcc[r.t.findIndex((t) => t > 3)].toFixed(2)} V at 3 s → ${r.vcc[r.vcc.length - 1].toFixed(2)} V at 12 s`)
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
