/**
 * sim_am.mjs — circuit simulation of BOTH Radio Lab boards, straight from
 * the routed PCBs.
 *
 *   1. renders transmitter + receiver with @tscircuit/core (needs `npm run build`)
 *   2. converts each board into a SPICE deck (board_to_spice.mjs) — every
 *      R/C/L/D/Q is the board's own part, value and net — and writes the decks
 *      to calc/spice/*.cir so you can re-run them in ngspice or LTspice
 *   3. simulates them with calc/spice.mjs (MNA, Newton, trapezoidal; standard
 *      Gummel-Poon transistor and diode models from the vendors' SPICE files)
 *      and asserts the behaviour the tutorial promises.
 *
 * Run:  npm run build && npm run sim      (≈ 4-6 minutes)
 */
import { Circuit, MODELS, freq, amp, tone, mean } from "./spice.mjs"
import { boardToSpice } from "./board_to_spice.mjs"
import { Circuit as TsCircuit } from "@tscircuit/core"
import { createElement } from "react"
import { writeFileSync, mkdirSync } from "node:fs"

let pass = 0, fail = 0
const check = (label, ok, detail = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${label}${detail ? "  — " + detail : ""}`) }
const dB = (x) => 20 * Math.log10(x)

async function render(mod) {
  const Board = (await import(mod)).default
  const c = new TsCircuit()
  c.add(createElement(Board))
  await c.renderUntilSettled()
  return c.getCircuitJson()
}

/* ── 0. the simulator itself, against closed-form answers ───────────────── */
console.log("\n[0] simulator self-test")
{
  const rc = new Circuit(`V1 in 0 PULSE(0 1 0 1n 1n 1 2)\nR1 in out 1k\nC1 out 0 1u`)
  const r = rc.tran({ tstop: 2e-3, h: 5e-6, probes: ["out"] })
  const i = r.t.findIndex((t) => t >= 1e-3)
  check("RC step matches 1 − e^(−t/RC)", Math.abs(r.out[i] - (1 - Math.exp(-r.t[i] / 1e-3))) < 2e-3)
  const lc = new Circuit(`I1 0 top PULSE(0 1m 0 1n 1n 100n 1)\nL1 top mid 100u\nR1 mid 0 10\nC1 top 0 1n`)
  const rl = lc.tran({ tstop: 40e-6, h: 5e-9, probes: ["top"] })
  const f0 = 1 / (2 * Math.PI * Math.sqrt(100e-6 * 1e-9))
  check("LC ring frequency matches 1/(2π√LC)", Math.abs(freq(rl.t, rl.top, 2e-6, 38e-6) / f0 - 1) < 0.005)
  const ce = new Circuit(`${MODELS}\nVCC vcc 0 9\nR1 vcc b 68k\nR2 b 0 10k\nRC vcc c 4.7k\nRE e 0 560\nCE e 0 1000u\nVIN in 0 DC 0 AC 1\nCIN in b 10u\nQ1 c b e Q2N3904`)
  const x = ce.op(), q = ce.get("Q1").op(x)
  const g = Math.hypot(...ce.ac([1e3], ["c"])[0].c)
  const gm = q.ic / 0.025852
  check("BJT stage gain matches gm·(Rc∥ro)", Math.abs(g / (gm * 4700 / (1 + 4700 * q.ic / 74.03)) - 1) < 0.08, `|Av| = ${g.toFixed(0)}`)
}

const txJson = await render("../dist/transmitter/index.js")
const rxJson = await render("../dist/receiver/index.js")
mkdirSync(new URL("./spice/", import.meta.url), { recursive: true })

/* ── deck builders ───────────────────────────────────────────────────────── */
function txDeck({ q = "BC547B", cv1 = 100e-12, cv2 = 60e-12, coilQ = 40, f = 800e3, micPk = 0, cant = 15e-12, kick = true } = {}) {
  const { deck, node } = boardToSpice(txJson, {
    title: "Radio Lab AM-TX",
    closedSwitches: ["SW1"],
    transistorModel: { default: q },
    coilQ: { L1: { Q: coilQ, f }, L2: { Q: coilQ, f } },
    parts: {
      BT1: ({ node }) => `VBT1 bt1_emf ${node("pin2")} 9\nRBT1_INT bt1_emf ${node("pin1")} 1.5`,
      MIC1: ({ node }) => `IMIC1 ${node("MIC_P")} ${node("MIC_N")} SIN(0.3m ${micPk / 2200} 1k)`,
      CV1: ({ node }) => `CCV1 ${node("STATOR_A")} ${node("ROTOR")} ${cv1}`,
      CV2: ({ node }) => `CCV2 ${node("STATOR_A")} ${node("ROTOR")} ${cv2}`,
      ANT1: ({ node }) => `CANT1_WIRE ${node("ANT")} 0 ${cant}\nRANT1_LEAK ${node("ANT")} 0 1meg`,
    },
    extra: `CPAR_TANK tank 0 5p\nCPAR_OUT rf_out 0 3p${kick ? "\nIKICK 0 tank PULSE(0 10u 0 10n 10n 200n 1)" : ""}`,
  })
  TX.ant = node("ANT1.ANT")
  return `${MODELS}\n${deck}`
}
const TX = {}, RX = {}
function rxDeck({ q = "BC547B", cv1 = 150e-12, coilQ = 50, wiper = 0.5, cant = 15e-12 } = {}) {
  const { deck, node } = boardToSpice(rxJson, {
    title: "Radio Lab AM-RX",
    closedSwitches: ["SW1"],
    transistorModel: { default: q },
    diodeModel: { D1: "D1N34A", D2: "D1N34A" },
    coilQ: { L1: { Q: coilQ, f: 1e6 } },
    wiper: { RV1: wiper },
    parts: {
      BT1: ({ node }) => `VBT1 bt1_emf ${node("pin2")} 9\nRBT1_INT bt1_emf ${node("pin1")} 1.5`,
      SW2: ({ node }) => `RSW2_OPEN ${node("pin1")} ${node("pin2")} 100meg  ; GAIN 20/200 switch, open`,
      CV1: ({ node }) => `CCV1 ${node("STATOR_A")} ${node("ROTOR")} ${cv1}`,
      ANT1: ({ node }) => `VANT1 ant1_emf 0 0\nCANT1_WIRE ant1_emf ${node("ANT")} ${cant}\nRANT1_LEAK ${node("ANT")} 0 100meg`,
      // LM386 behavioural model (datasheet equivalent circuit): 50k inputs,
      // 1.35k between the gain pins, output = Vs/2 + 20·Vin, ~4mA quiescent
      U1: ({ node }) => [
        `RU1_INP ${node("IN_POS")} 0 50k`, ...(node("IN_NEG") === "0" ? [] : [`RU1_INN ${node("IN_NEG")} 0 50k`]),
        `RU1_GAIN ${node("GAIN_A")} ${node("GAIN_B")} 1.35k`, `RU1_GB ${node("GAIN_A")} 0 15k`,
        `RU1_BYP ${node("BYPASS")} 0 15k`, `RU1_Q ${node("VS")} ${node("GND")} 2.25k`,
        `EU1 u1_o u1_mid ${node("IN_POS")} ${node("IN_NEG")} 20`, `VU1_MID u1_mid 0 4.5`, `RU1_OUT u1_o ${node("OUT")} 0.5`,
      ].join("\n"),
      SPK1: ({ node }) => `RSPK1 ${node("SPK_P")} ${node("SPK_N")} 8`,
    },
    extra: "CPAR_TANK tank 0 8p",
  })
  RX.wiper = node("RV1.pin2"); RX.q3b = node("Q3.pin2")
  return `${MODELS}\n${deck}`
}
writeFileSync(new URL("./spice/am-tx.cir", import.meta.url), txDeck() + "\n.tran 10n 1.5m\n.end\n")
writeFileSync(new URL("./spice/am-rx.cir", import.meta.url), rxDeck() + "\n.tran 20n 3m\n.end\n")
console.log("\n  wrote calc/spice/am-tx.cir and calc/spice/am-rx.cir (generated from the routed boards)")

/* ── 1. AM-TX bias ───────────────────────────────────────────────────────── */
console.log("\n[1] AM-TX DC operating point")
{
  const c = new Circuit(txDeck({ kick: false }))
  const x = c.op()
  const ic = (n) => c.get(n).op(x).ic
  const vmd = c.v(x, "vmd")
  console.log(`      V9 ${c.v(x, "v9").toFixed(2)} V · VMD ${vmd.toFixed(2)} V · Ic: Q1 ${(ic("Q1") * 1e3).toFixed(2)} Q2 ${(ic("Q2") * 1e3).toFixed(2)} Q3 ${(ic("Q3") * 1e3).toFixed(2)} Q4 ${(ic("Q4") * 1e3).toFixed(2)} mA`)
  check("modulator rail VMD idles at 4-5.5V", vmd > 4 && vmd < 5.5)
  check("oscillator biased 0.4-1.2mA", ic("Q3") > 0.4e-3 && ic("Q3") < 1.2e-3)
  const pin = vmd * ic("Q4")
  check("DC input to the final ≤ 100mW (FCC §15.219(a))", pin < 0.1, `${(pin * 1e3).toFixed(1)} mW`)
  const ibat = (9 - c.v(x, "v9")) / 1.5
  check("battery current < 15mA", ibat < 15e-3, `${(ibat * 1e3).toFixed(1)} mA → ~${(550 / (ibat * 1e3)).toFixed(0)} h on a 9V alkaline`)
}

/* ── 2. start-up and tuning ──────────────────────────────────────────────── */
console.log("\n[2] AM-TX oscillator starts at every TUNE setting (BC547B / 2N3904, coil Q 25 & 60)")
const fAt = {}
{
  const fs = []
  let allStart = true
  for (const q of ["BC547B", "Q2N3904"]) for (const coilQ of [25, 60]) for (const cv1 of [10e-12, 280e-12]) {
    const c = new Circuit(txDeck({ q, coilQ, cv1, f: cv1 < 100e-12 ? 840e3 : 650e3 }))
    const r = c.tran({ tstop: 1.0e-3, h: 1 / 900e3 / 80, probes: ["tank"] })
    const a = amp(r.t, r.tank, 0.95e-3, 1e-3)
    const f = freq(r.t, r.tank, 0.7e-3, 1e-3)
    if (a < 0.3) allStart = false
    fs.push(f)
    fAt[`${q}/${coilQ}/${cv1}`] = f
    console.log(`      ${q.padEnd(8)} Q=${coilQ} CV1=${(cv1 * 1e12).toFixed(0).padStart(3)}pF → ${(f / 1e3).toFixed(0)} kHz, ${a.toFixed(2)} Vpk`)
  }
  check("oscillation in all 8 corners (≥ 0.3 Vpk)", allStart)
  check("TUNE spans the 0.65-0.86 MHz window (inside the 510-1705 kHz band)", Math.min(...fs) < 700e3 && Math.max(...fs) > 820e3 && Math.min(...fs) > 510e3 && Math.max(...fs) < 1705e3,
    `${(Math.min(...fs) / 1e3).toFixed(0)}-${(Math.max(...fs) / 1e3).toFixed(0)} kHz`)
}

/* ── 3. harmonics with PEAK tuned (FCC §15.219(c)) ───────────────────────── */
console.log("\n[3] AM-TX spurious emissions: harmonics at the antenna with PEAK tuned")
{
  let worst = -Infinity
  for (const [q, coilQ, cv1] of [["BC547B", 25, 10e-12], ["Q2N3904", 25, 10e-12], ["BC547B", 60, 100e-12], ["Q2N3904", 60, 280e-12]]) {
    // PEAK: tune CV2 for maximum output = output tank on the measured carrier
    const probe = new Circuit(txDeck({ q, coilQ, cv1 }))
    const r0 = probe.tran({ tstop: 0.6e-3, h: 1 / 900e3 / 80, probes: ["tank"] })
    let fc = freq(r0.t, r0.tank, 0.3e-3, 0.6e-3), m
    for (let k = 0; k < 2; k++) {
      const cv2 = Math.max(5e-12, 1 / ((2 * Math.PI * fc) ** 2 * 100e-6) - 330e-12 - 6e-12)
      const c = new Circuit(txDeck({ q, coilQ, cv1, cv2, f: fc }))
      const T = 2.4e-3
      const r = c.tran({ tstop: T, h: 1 / fc / 100, probes: [TX.ant, "tank"] })
      const antNode = TX.ant
      fc = freq(r.t, r.tank, 1.2e-3, T)
      const n = Math.floor((T - 1.2e-3) * fc), t1 = T - n / fc
      const H = [1, 2, 3, 4, 5].map((k) => tone(r.t, r[antNode], k * fc, t1, T))
      m = { fc, H }
    }
    const h = m.H.slice(1).map((x) => dB(x / m.H[0]))
    worst = Math.max(worst, ...h)
    console.log(`      ${q.padEnd(8)} Q=${coilQ} CV1=${(cv1 * 1e12).toFixed(0)}pF: carrier ${(m.fc / 1e3).toFixed(0)} kHz, ${m.H[0].toFixed(2)} Vpk at ANT; H2..H5 ${h.map((x) => x.toFixed(0)).join(" / ")} dBc`)
  }
  check("every harmonic ≥ 20 dB below the carrier (with ≥ 5 dB margin)", worst <= -25, `worst ${worst.toFixed(1)} dBc`)
}

/* ── 4. modulation ───────────────────────────────────────────────────────── */
console.log("\n[4] AM-TX modulation: voice → VMD → final; the oscillator stays put")
{
  const res = {}
  for (const micPk of [5e-3, 20e-3]) {
    const c = new Circuit(txDeck({ micPk, cv2: 60e-12 }))
    const T = 4e-3
    const r = c.tran({ tstop: T, h: 1 / 800e3 / 80, probes: [TX.ant, "tank"] })
    const e = []
    for (let t = 2e-3; t < T - 10e-6; t += 10e-6) e.push(amp(r.t, r[TX.ant], t, t + 10e-6))
    const m = (Math.max(...e) - Math.min(...e)) / (Math.max(...e) + Math.min(...e))
    const fs = []
    for (let t = 2e-3; t < T - 0.125e-3; t += 0.125e-3) fs.push(freq(r.t, r.tank, t, t + 0.125e-3))
    res[micPk] = { m, swing: Math.max(...fs) - Math.min(...fs) }
    console.log(`      voice ${micPk * 1e3} mV at the mic → m = ${(m * 100).toFixed(1)} %, carrier swing ${(res[micPk].swing / 1e3).toFixed(2)} kHz`)
  }
  check("audible AM: m ≥ 5 % for 5 mV, ≥ 15 % for 20 mV of voice", res[5e-3].m >= 0.05 && res[20e-3].m >= 0.15)
  check("no incidental FM: carrier swing < 2 kHz even on loud speech", res[20e-3].swing < 2e3)
}

/* ── 5. AM-RX tuning + selectivity ───────────────────────────────────────── */
console.log("\n[5] AM-RX tuning range and selectivity")
const peakOf = (cv1) => {
  const c = new Circuit(rxDeck({ cv1 }).replace("VANT1 ant1_emf 0 0", "VANT1 ant1_emf 0 DC 0 AC 1"))
  const fl = []
  for (let f = 400e3; f <= 2.6e6; f *= 1.003) fl.push(f)
  const rr = c.ac(fl, ["tank"])
  let b = rr[0]
  for (const r of rr) if (Math.hypot(...r.tank) > Math.hypot(...b.tank)) b = r
  const g = Math.hypot(...b.tank)
  const band = rr.filter((r) => Math.hypot(...r.tank) >= g / Math.SQRT2)
  return { f: b.f, bw: band[band.length - 1].f - band[0].f }
}
{
  const lo = peakOf(280e-12), hi = peakOf(10e-12), mid = peakOf(150e-12)
  console.log(`      CV1 280 pF → ${(lo.f / 1e3).toFixed(0)} kHz · 150 pF → ${(mid.f / 1e3).toFixed(0)} kHz (−3 dB bandwidth ${(mid.bw / 1e3).toFixed(1)} kHz) · 10 pF → ${(hi.f / 1e3).toFixed(0)} kHz`)
  check("RX covers the whole TX window and the MW band middle", lo.f < 650e3 && hi.f > 1500e3)
  check("selectivity: tank bandwidth < 25 kHz", mid.bw < 25e3)
  globalThis.RXF = mid.f
}

/* ── 6. AM-RX detector ───────────────────────────────────────────────────── */
console.log("\n[6] AM-RX detector (voltage doubler D1+D2) and signal LED")
{
  const fc = globalThis.RXF
  const out = {}
  for (const A of [3e-3, 300e-3]) {
    const c = new Circuit(rxDeck({ cv1: 150e-12 }))
    c.get("VANT1").setFn((t) => A * (1 + 0.3 * Math.sin(2 * Math.PI * 1e3 * t)) * Math.sin(2 * Math.PI * fc * t))
    const T = 5e-3
    const r = c.tran({ tstop: T, h: 1 / fc / 50, probes: ["det", RX.wiper, RX.q3b], every: 2 })
    const idx = r.t.map((t, i) => (t >= 2e-3 ? i : -1)).filter((i) => i >= 0)
    out[A] = { det: mean(idx.map((i) => r.det[i])), audio: tone(r.t, r[RX.wiper], 1e3, 2e-3, T), vb: mean(idx.map((i) => r[RX.q3b][i])) }
    console.log(`      antenna EMF ${A * 1e3} mV (m = 0.3): DET ${(out[A].det * 1e3).toFixed(0)} mV DC, ${(out[A].audio * 1e3).toFixed(1)} mVpk of 1 kHz at the volume wiper, signal-LED transistor base ${(out[A].vb * 1e3).toFixed(0)} mV`)
  }
  check("weak station (3 mV EMF) gives ≥ 20 mVpk of audio at the wiper", out[3e-3].audio >= 20e-3)
  check("audio grows with signal strength (detector never collapses)", out[300e-3].audio > out[3e-3].audio)
  check("strong station turns the signal LED on (Q3 base ≥ 0.6 V)", out[300e-3].vb >= 0.6)
}

console.log("\n" + "═".repeat(64))
console.log(`RESULT: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
