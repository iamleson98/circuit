/**
 * sim_driver.mjs — circuit simulation of the arc lighter's driver, straight
 * from the routed PCB.
 *
 *   1. renders board/index.tsx with @tscircuit/core (needs `npm run build`)
 *   2. converts it into a SPICE deck (board_to_spice.mjs): every resistor,
 *      capacitor, diode and transistor is the board's own part, value and net.
 *      The parts that live off the board are modelled at their pads:
 *        battery  3.2-4.2 V behind 0.15 Ω (cell + protection board)
 *        coil     primary Lp, feedback winding, high-voltage secondary — three
 *                 coupled inductors (the K element), secondary referred to the
 *                 primary side so the matrix stays well conditioned
 *        gap      a spark gap: breaks down at VBD, then an arc (VARC + RON)
 *        Q1       the P-MOSFET switch, closed (the firmware has fired)
 *      and writes it to calc/spice/arc-driver.cir
 *   3. simulates it across the coils you might buy and asserts what the
 *      design promises.
 *
 * A bare arc-lighter coil comes without a datasheet, so the coil corners span
 * what such coils plausibly are: primary 50-200 µH, feedback 0.3-0.8 of the
 * primary turns, step-up 1:250-1:600, coupling 0.95-0.98, secondary
 * self-capacitance 6-10 pF. The FZT851 model is fitted to its datasheet
 * (h_FE ≥ 100, ≥ 75 at 5 A; 0.17 V at 2 A; f_T 130 MHz) — Diodes Inc.'s own
 * SPICE file isn't publicly fetchable — and a low-gain part (D882-class)
 * stands in for "whatever transistor you fitted".
 *
 * Run:  npm run build && npm run sim      (≈ 1.5 minutes)
 */
import { Circuit, mean } from "./spice.mjs"
import { boardToSpice } from "./board_to_spice.mjs"
import { Circuit as TsCircuit } from "@tscircuit/core"
import { createElement } from "react"
import { writeFileSync, mkdirSync } from "node:fs"

let pass = 0, fail = 0
const check = (label, ok, detail = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${label}${detail ? "  — " + detail : ""}`) }

const MODELS = `
.model FZT851 NPN(IS=1e-12 BF=250 NF=1 VAF=100 IKF=6 ISE=1e-13 NE=1.5 BR=20 NR=1 RB=2 RE=0.01 RC=0.035 CJE=400p VJE=0.75 MJE=0.33 CJC=100p VJC=0.75 MJC=0.33 TF=1.2n TR=50n)
.model LOWB NPN(IS=1e-12 BF=80 NF=1 VAF=60 IKF=2 ISE=1e-13 NE=1.5 BR=10 RB=3 RE=0.02 RC=0.08 CJE=300p CJC=80p TF=2n TR=80n)
.model BC847B NPN(IS=7e-14 BF=300 NF=1 VAF=80 IKF=0.1 ISE=1e-14 NE=1.5 BR=8 RB=10 RC=1 CJE=11p CJC=4p TF=0.5n TR=10n)
.model SS14 D(IS=5e-6 N=1.05 RS=0.05 CJO=110p M=0.5 VJ=0.35 TT=5n)
.model LEDR D(IS=1e-19 N=1.9 RS=8 CJO=15p)`

/* ── 0. the simulator's new elements ───────────────────────────────────── */
console.log("\n[0] simulator self-test (coupled inductors, spark gap)")
{
  const { amp, freq } = await import("./spice.mjs")
  const c = new Circuit(`V1 in 0 SIN(0 1 10k)\nR1 in p 0.01\nL1 p 0 1m\nL2 s 0 100m\nK1 L1 L2 0.999\nRL s 0 1meg`)
  const r = c.tran({ tstop: 0.5e-3, h: 0.1e-6, probes: ["s", "p"] })
  const ratio = amp(r.t, r.s, 0.3e-3, 0.5e-3) / amp(r.t, r.p, 0.3e-3, 0.5e-3)
  check("a 1:10 coupled-inductor transformer steps up 10×", Math.abs(ratio / 9.99 - 1) < 0.01, ratio.toFixed(3))
  const d = new Circuit(`I1 0 p PULSE(0 1m 0 10n 10n 100n 1)\nL1 p 0 10u\nC1 p 0 1n\nL2 s 0 10u\nK1 L1 L2 0.9\nR2 s 0 1m`)
  const q = d.tran({ tstop: 20e-6, h: 5e-9, probes: ["p"] })
  const fl = 1 / (2 * Math.PI * Math.sqrt(10e-6 * (1 - 0.81) * 1e-9))
  check("shorted secondary leaves the leakage inductance L(1−k²)", Math.abs(freq(q.t, q.p, 2e-6, 20e-6) / fl - 1) < 0.01)
  const e = new Circuit(`C1 a 0 10n\nY1 a 0 VBD=3k VARC=300 RON=100 IHOLD=10m\nI1 0 a PULSE(0 1 0 1n 1n 40u 1)`)
  e.op(); const s = e.tran({ tstop: 100e-6, h: 10e-9, probes: ["a"] })
  check("the spark gap strikes at its breakdown voltage", e.get("Y1").strikes === 1 && Math.abs(Math.max(...s.a) - 3000) < 20, `${Math.max(...s.a).toFixed(0)} V`)
}

const Board = (await import("../dist/board/index.js")).default
const tc = new TsCircuit()
tc.add(createElement(Board))
await tc.renderUntilSettled()
const json = tc.getCircuitJson()

/** the routed board + the off-board parts at their pads */
function deck({ vbat = 3.7, Lp = 100e-6, nf = 0.5, n = 400, k = 0.97, cs = 6e-12, vbd = 7e3, q2 = "FZT851", reversed = false } = {}) {
  const { deck } = boardToSpice(json, {
    title: "Arc lighter driver",
    transistorModel: { Q2: q2, Q3: "BC847B" },
    diodeModel: { D1: "SS14" },
    ledModel: { default: "LEDR" },
    parts: {
      // not on the driver's path while it fires (USB unplugged, Q1 modelled as a switch):
      // left out to keep the matrix small — calc/circuit_math.mjs covers them
      ...Object.fromEntries(["C1", "R1", "R2", "R3", "LED1", "LED2", "R5", "R6", "R7", "R8", "C5", "R9", "LED3"].map((n) => [n, () => `* ${n}: charger / indicator / pull-up, idle while firing`])),
      J1: () => "* J1: USB unplugged (firing is refused while it's plugged in)",
      U1: () => "* U1: charger idle",
      U2: () => "RU2_SUPPLY vmcu 0 3.7k  ; ATtiny85 awake, ~1 mA",
      J2: () => "* J2: ISP header, nothing connected",
      Q1: ({ node }) => `SQ1 ${node("source")} ${node("drain")} RON=0.06 ROFF=1e9  ; AO3401 at Vgs = −Vbat`,
      D2: ({ node }) => `* D2: SMCJ33A — reverse breakdown ≈ 38 V, forward like a diode\nDD2R ${node("pin2")} d2_bv SS14\nVD2BV d2_bv d2_r 38\nRD2 d2_r ${node("pin1")} 0.3\nDD2F ${node("pin1")} ${node("pin2")} SS14`,
      TP_BATP: ({ node }) => `VB bat_emf 0 ${vbat}\nRBAT bat_emf ${node("BATP")} 0.15  ; cell + protection MOSFETs`,
      TP_BATN: () => "",
      TP_LOCKA: () => "RLOCK bat varm 0.02  ; LOCK switch closed",
      TP_LOCKB: () => "",
      TP_FIRE: () => "", TP_FIREG: () => "", TP_MODP: () => "", TP_MODN: () => "",
      // the coil: primary P+ (VDRV) → P− (COL), feedback FB (base) … FA (R10), HV secondary referred 1:1
      TP_PP: () => [
        `LP vdrv lp_r ${Lp}`, `RLP lp_r col ${(0.002 * Lp) / 1e-6 + 0.03}`,
        reversed ? `LF fba fb_w ${nf * nf * Lp}` : `LF fb_w fba ${nf * nf * Lp}`, `RLF fb_w base 0.5`,
        `LS s1 s2r ${Lp}`, `RLS s2r s2 ${600 / n / n}`, `CS s1 s2 ${cs * n * n}`, `RHV s2 0 ${1e9 / n / n}`,
        `YGAP s1 s2 VBD=${vbd / n} VARC=${400 / n} RON=${1e3 / n / n} IHOLD=${2e-3 * n}`,
        `K1 LP LF LS ${k}`,
      ].join("\n"),
      TP_PM: () => "", TP_FA: () => "", TP_FB: () => "",
    },
  })
  return `${MODELS}\n${deck}`
}

mkdirSync(new URL("./spice/", import.meta.url), { recursive: true })
writeFileSync(new URL("./spice/arc-driver.cir", import.meta.url), deck() + "\n.tran 20n 4m\n.end\n")
console.log("\n  wrote calc/spice/arc-driver.cir (generated from the routed board; K/Y/S elements are this engine's)")

function run(o = {}, T = 4e-3) {
  const t_start = Date.now(); let steps = 0
  const n = o.n ?? 400
  const c = new Circuit(deck(o))
  c.get("SQ1").closed = false
  c.op() // idle: switch open, VDRV discharged
  c.get("SQ1").closed = true // the firmware fires at t = 0
  const iV = (x, nm) => { const i = c.nodeOf(nm); return i === 0 ? 0 : x[i - 1] }
  const q2 = c.get("Q2"), t0 = T / 2
  let eQ2 = 0, eTVS = 0, eRE = 0, tl = 0
  const r = c.tran({ tstop: T, h: 20e-9, method: "be", probes: ["col", "base", "emit", "vdrv", "osc", "vmcu", "i(RBAT)", "s1", "s2"], every: 5,
    onStep: (t, x) => {
      steps++
      if (process.env.SIM_TRACE && steps % 20000 === 0) console.error(`  t=${(t * 1e3).toFixed(3)} ms  steps=${steps}  ${((Date.now() - t_start) / 1000).toFixed(0)} s`)
      const dt = t - tl; tl = t; if (t < t0) return
      const op = q2.op(x); eQ2 += (op.ic * op.vce + op.ib * op.vbe) * dt
      const vbv = iV(x, "col") - iV(x, "d2_bv"); if (vbv > 0) eTVS += c.get("DD2R").current(x) * iV(x, "col") * dt
      eRE += (iV(x, "emit") ** 2 / 0.51) * dt
    } })
  const sel = (a) => a.filter((_, i) => r.t[i] > t0)
  const ie = sel(r.emit).map((v) => v / 0.255)
  const osc = sel(r.osc), vmcu = mean(sel(r.vmcu))
  // pulses the T0 counter would see: above V_IH (0.6·VCC) for ≥ 1 µs (one clock at 1 MHz)
  const ts = r.t.filter((_, i) => r.t[i] > t0)
  let edges = 0, hiSince = null
  for (let i = 0; i < osc.length; i++) {
    if (osc[i] >= 0.6 * vmcu) { if (hiSince === null) hiSince = ts[i]; else if (hiSince !== -1 && ts[i] - hiSince >= 1e-6) { edges++; hiSince = -1 } }
    else hiSince = null
  }
  const g = c.get("YGAP"), hv = sel(r.s1).map((v, i) => (v - sel(r.s2)[i]) * n)
  const dur = T - t0
  return {
    Ibat: +mean(sel(r["i(RBAT)"])).toFixed(2), Ipk: +Math.max(...ie).toFixed(2), Vce: +Math.max(...sel(r.col)).toFixed(1), Vbe_min: +Math.min(...sel(r.base)).toFixed(2),
    strikes_kHz: +(g.strikes / T / 1e3).toFixed(1), arc_W: +(g.energy / T).toFixed(2), HV_kV: +(Math.max(...hv.map(Math.abs)) / 1e3).toFixed(1),
    osc_kHz: +(edges / dur / 1e3).toFixed(1), osc_pk: +Math.max(...osc).toFixed(2), vmcu: +vmcu.toFixed(2),
    PQ2: +(eQ2 / dur).toFixed(2), PTVS: +(eTVS / dur).toFixed(2), PRE_each: +(eRE / dur).toFixed(2),
  }
}

/* ── 1. coil corners ─────────────────────────────────────────────────────── */
console.log("\n[1] arc corners: coils you might buy, both transistor gains, 3.2-4.2 V")
const corners = [
  ["nominal: 100 µH, fb 0.5, 1:400, k 0.97", {}],
  ["primary 50 µH", { Lp: 50e-6 }], ["primary 200 µH", { Lp: 200e-6 }],
  ["feedback 0.3", { nf: 0.3 }], ["feedback 0.8", { nf: 0.8 }],
  ["step-up 1:250", { n: 250 }], ["step-up 1:600", { n: 600 }],
  ["coupling 0.95", { k: 0.95 }], ["secondary 10 pF", { cs: 10e-12 }],
  ["cell 3.2 V (nearly flat)", { vbat: 3.2 }], ["cell 4.2 V (full)", { vbat: 4.2 }],
  ["low-gain transistor", { q2: "LOWB" }],
]
const only = process.env.SIM_ONLY // e.g. SIM_ONLY=nominal: run just the matching corners (for tinkering)
const res = (only === "faults" ? [] : corners.filter(([name]) => !only || name.includes(only))).map(([name, o]) => { const t = Date.now(); const x = run(o); console.log(`      ${name.padEnd(38)} ${x.strikes_kHz} k strikes/s, arc ${x.arc_W} W, battery ${x.Ibat} A, Ipk ${x.Ipk} A, Vce ${x.Vce} V  (${((Date.now() - t) / 1000).toFixed(0)} s)`); return x })
if (only && only !== "faults") process.exit(0)
if (only !== "faults") {
check("the arc strikes in every corner (≥ 4 000 strikes/s)", res.every((x) => x.strikes_kHz >= 4), `${Math.min(...res.map((x) => x.strikes_kHz))}-${Math.max(...res.map((x) => x.strikes_kHz))} k/s`)
check("battery current ≤ 2.5 A everywhere (the pack's protection trips at ≈3 A)", res.every((x) => x.Ibat <= 2.5), `max ${Math.max(...res.map((x) => x.Ibat))} A`)
check("Q3 + RE cap the switch current ≤ 3.6 A per cycle (FZT851: 6 A)", res.every((x) => x.Ipk <= 3.6), `max ${Math.max(...res.map((x) => x.Ipk))} A`)
check("D2 holds the collector ≤ 45 V (FZT851: 60 V)", res.every((x) => x.Vce <= 45), `max ${Math.max(...res.map((x) => x.Vce))} V`)
check("D1 keeps the base above −1 V (V_EBO is 6 V)", res.every((x) => x.Vbe_min > -1), `min ${Math.min(...res.map((x) => x.Vbe_min))} V`)
check("heat: Q2 ≤ 1 W, each emitter resistor ≤ 0.75 W (2512: 1 W)", res.every((x) => x.PQ2 <= 1 && x.PRE_each <= 0.75),
  `Q2 ≤ ${Math.max(...res.map((x) => x.PQ2))} W, RE ≤ ${Math.max(...res.map((x) => x.PRE_each))} W each`)
check("TVS (SMCJ33A, 6.5 W rated) absorbs ≤ 3 W of leakage spikes while arcing", res.every((x) => x.PTVS <= 3), `max ${Math.max(...res.map((x) => x.PTVS))} W, for ≤ 8 s at a time`)
check("the oscillation monitor sees the coil: ≥ 2× the firmware's 2 kHz threshold (PB2 > 0.6·VCC for ≥ 1 µs)", res.every((x) => x.osc_kHz >= 4),
  `${Math.min(...res.map((x) => x.osc_kHz))}-${Math.max(...res.map((x) => x.osc_kHz))} kHz`)
}

/* ── 2. faults ───────────────────────────────────────────────────────────── */
console.log("\n[2] faults: gap too wide, feedback wired backwards")
{
    const open = run({ vbd: 1e7 })
  console.log(`      gap open (no arc):    HV ${open.HV_kV} kV, Vce ${open.Vce} V, TVS ${open.PTVS} W, battery ${open.Ibat} A`)
  check("no arc possible: the TVS holds the collector ≤ 45 V and the secondary ≤ 20 kV", open.Vce <= 45 && open.HV_kV <= 20, `${open.HV_kV} kV`)
  const rev = run({ reversed: true })
  console.log(`      feedback reversed:    ${rev.osc_kHz} kHz on PB2, battery ${rev.Ibat} A, Ipk ${rev.Ipk} A`)
  check("feedback wired backwards → no oscillation, so the monitor sees no pulses", rev.osc_kHz < 1 && rev.strikes_kHz === 0)
  check("…and the stuck state is current-limited (≤ 3.6 A) until firmware cuts it in 50 ms", rev.Ipk <= 3.6, `${rev.Ibat} A, Q2 ${rev.PQ2} W for ≤ 50 ms`)
}

console.log("\n" + "═".repeat(64))
console.log(`RESULT: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
