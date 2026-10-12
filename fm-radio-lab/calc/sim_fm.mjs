/**
 * sim_fm.mjs — circuit simulation of BOTH FM Radio Lab boards, straight from
 * the routed PCBs.
 *
 *   1. renders transmitter + receiver with @tscircuit/core (needs `npm run build`)
 *   2. converts each board into a SPICE deck (board_to_spice.mjs) — every
 *      R/C/L/D/Q is the board's own part, value and net, plus explicit VHF
 *      parasitics (lead inductance on the RF capacitors, tank strays, coil
 *      loss) — and writes the decks to calc/spice/*.cir for ngspice / LTspice
 *   3. simulates them with calc/spice.mjs (MNA, Newton, trapezoidal; vendor
 *      Gummel-Poon models for 2N2222A / BC547B, junction-capacitance diodes)
 *      and asserts the behaviour the tutorial promises, across corners:
 *      both transistor types, coil Q 50-150, 2-5 nH leads.
 *
 * Radiated-power numbers are ESTIMATES (small-loop radiation of the coil +
 * a short-monopole model of the antenna wire): design margin, not a
 * substitute for a field-strength measurement.
 *
 * Run:  npm run build && npm run sim      (≈ 20 minutes — mostly the receiver's
 *       quench cycles, simulated in 0.05 ns steps)
 */
import { Circuit, MODELS, freq, amp, mean } from "./spice.mjs"
import { boardToSpice } from "./board_to_spice.mjs"
import { Circuit as TsCircuit } from "@tscircuit/core"
import { createElement } from "react"
import { writeFileSync, mkdirSync } from "node:fs"

let pass = 0, fail = 0
const check = (label, ok, detail = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${label}${detail ? "  — " + detail : ""}`) }
const dBm = (p) => 10 * Math.log10(p / 1e-3)
// 1N4148 junction capacitance varies by maker (≤ 4 pF max, ~1 pF typical): bracket it
const VAR_MODELS = `
.model D1N4148HI D(IS=2.52n N=1.752 RS=0.568 CJO=4p M=0.4 VJ=0.75 TT=20n)
.model D1N4148LO D(IS=2.52n N=1.752 RS=0.568 CJO=1.2p M=0.4 VJ=0.75 TT=20n)`

/* radiation models */
const coilRadiation = (Vpk, f, L = 56e-9) => { // 3-turn coil on a 5.6 mm mean diameter = small loop
  const lam = 3e8 / f, NA = 3 * Math.PI * 2.8e-3 ** 2
  const I = Vpk / (2 * Math.PI * f * L)
  return 0.5 * I * I * 31171 * (NA / lam ** 2) ** 2
}
const shortWire = (h, f = 98e6) => { // monopole of length h: radiation R and capacitance
  const lam = 3e8 / f, b = (2 * Math.PI * h) / lam, Z0 = 60 * (Math.log((2 * h) / 0.3e-3) - 1)
  return { R: 395 * (h / lam) ** 2, C: 1 / (2 * Math.PI * f * (Z0 / Math.tan(b))) }
}
const LIMIT_TX = (250e-6 * 3) ** 2 / 30 // FCC §15.239: 250 µV/m @ 3 m → EIRP ≈ −47 dBm
const LIMIT_RX = (150e-6 * 3) ** 2 / 30 // FCC §15.109 class B, 88-216 MHz: 150 µV/m @ 3 m ≈ −52 dBm

async function render(mod) {
  const Board = (await import(mod)).default
  const c = new TsCircuit()
  c.add(createElement(Board))
  await c.renderUntilSettled()
  return c.getCircuitJson()
}

/* ── 0. the simulator itself ─────────────────────────────────────────────── */
console.log("\n[0] simulator self-test")
{
  const lc = new Circuit(`I1 0 top PULSE(0 1m 0 0.1n 0.1n 1n 1)\nL1 top mid 60n\nR1 mid 0 0.5\nC1 top 0 40p`)
  const r = lc.tran({ tstop: 0.3e-6, h: 0.02e-9, probes: ["top"] })
  const f0 = 1 / (2 * Math.PI * Math.sqrt(60e-9 * 40e-12))
  check("VHF LC ring frequency matches 1/(2π√LC)", Math.abs(freq(r.t, r.top, 0.02e-6, 0.28e-6) / f0 - 1) < 0.005, `${(f0 / 1e6).toFixed(1)} MHz`)
  // reverse-biased diode behind 1 MΩ: the RC roll-off reveals its junction capacitance
  const d = new Circuit(`${MODELS}${VAR_MODELS}\nV1 in 0 DC 2 AC 1\nR1 in k 1meg\nD1 0 k D1N4148HI`)
  d.op()
  const f = 100e3, vk = Math.hypot(...d.ac([f], ["k"])[0].k)
  const cSim = Math.sqrt(1 / (vk * vk) - 1) / (2 * Math.PI * f * 1e6)
  const cTheory = 4e-12 / Math.pow(1 + 2 / 0.75, 0.4)
  check("varactor capacitance at 2 V reverse matches Cj0/(1+V/Vj)^M", Math.abs(cSim / cTheory - 1) < 0.02, `${(cSim * 1e12).toFixed(2)} pF`)
}

const txJson = await render("../dist/transmitter/index.js")
const rxJson = await render("../dist/receiver/index.js")
mkdirSync(new URL("./spice/", import.meta.url), { recursive: true })

const RF_LEADS = 5e-9
function txDeck({ q = "Q2N2222A", trim = 15e-12, coilQ = 100, varModel = "D1N4148HI", wire = 0.2, dev = 0.5, kick = true, lead = RF_LEADS } = {}) {
  const w = shortWire(wire)
  const { deck, node } = boardToSpice(txJson, {
    title: "FM Radio Lab FM-TX",
    closedSwitches: ["SW1"],
    transistorModel: { Q1: "BC547B", Q2: q },
    diodeModel: { D1: varModel },
    coilQ: { L1: { Q: coilQ, f: 98e6 } },
    wiper: { RV1: dev },
    leadL: Object.fromEntries(["C2", "C7", "C8", "C9", "C11", "C12", "C13", "C14", "C15", "C17"].map((n) => [n, lead])),
    parts: {
      BT1: ({ node }) => `VBT1 bt1_emf ${node("pin2")} 9\nRBT1_INT bt1_emf ${node("pin1")} 1.5`,
      MIC1: ({ node }) => `IMIC1 ${node("MIC_P")} ${node("MIC_N")} 0.3m`,
      AUX1: ({ node }) => `RAUX1_OPEN ${node("TIP")} ${node("SLE")} 1meg  ; nothing plugged in`,
      TRIM1: ({ node }) => `CTRIM1 ${node("A")} ${node("B")} ${trim}`,
      ANT1: ({ node }) => `CANT1_WIRE ${node("ANT")} ant1_w ${w.C}\nRANT1_RAD ant1_w 0 ${w.R}\nRANT1_LEAK ${node("ANT")} 0 1meg`,
    },
    extra: `CPAR_TANK tank 0 2p${kick ? "\nIKICK 0 tank PULSE(0 2m 0 0.2n 0.2n 1n 1)" : ""}`,
  })
  return { deck: `${MODELS}${VAR_MODELS}\n${deck}`, node, w }
}
function rxDeck({ q = "Q2N2222A", trim = 15e-12, coilQ = 100, wire = 0.3, lead = RF_LEADS, coldStart = false, hold = false } = {}) {
  const w = shortWire(wire)
  const { deck, node } = boardToSpice(rxJson, {
    title: "FM Radio Lab FM-RX",
    closedSwitches: ["SW1"],
    transistorModel: { default: "BC547B", Q1: q },
    coilQ: { L1: { Q: coilQ, f: 98e6 } },
    wiper: { RV1: 0.5 },
    leadL: Object.fromEntries(["C2", "C3", "C4", "C5", "C6", "C15", "C16", "C17", "C21", "C22"].map((n) => [n, lead])),
    parts: {
      BT1: ({ node }) => coldStart
        ? `VBT1 bt1_emf ${node("pin2")} PULSE(0 9 0 1u 1n 1 2)\nRBT1_INT bt1_emf ${node("pin1")} 1.5`
        : `VBT1 bt1_emf ${node("pin2")} 9\nRBT1_INT bt1_emf ${node("pin1")} 1.5`,
      TRIM1: ({ node }) => `CTRIM1 ${node("A")} ${node("B")} ${trim}`,
      ANT1: ({ node }) => `VANT1 ant1_emf 0 0\nRANT1_RAD ant1_emf ant1_w ${w.R}\nCANT1_WIRE ant1_w ${node("ANT")} ${w.C}\nRANT1_LEAK ${node("ANT")} 0 1meg`,
      EAR1: ({ node }) => `REAR1 ${node("TIP")} ${node("SLE")} 32  ; 32 Ω earbud`,
    },
    // the astable's DC solution has both transistors on; a 2 µs tug on Q2's base starts it
    extra: hold
      // hold the quench astable in GROW (Q2 off) so the detector free-runs at its tuning frequency
      ? "CPAR_TANK tank 0 2p\nINOISE 0 tank 0\nVHOLD q2b_hold 0 -2\nRHOLD q2b_hold q2b 100\nIKICK 0 tank PULSE(0 2m 0 0.2n 0.2n 1n 1)"
      : `CPAR_TANK tank 0 2p\nINOISE 0 tank 0${coldStart ? "" : "\nIUNLATCH q2b 0 PULSE(0 3m 0 10n 10n 2u 1)"}`,
  })
  return { deck: `${MODELS}\n${deck}`, node, w }
}
writeFileSync(new URL("./spice/fm-tx.cir", import.meta.url), txDeck().deck + "\n.tran 0.05n 4u\n.end\n")
writeFileSync(new URL("./spice/fm-rx.cir", import.meta.url), rxDeck().deck + "\n.tran 0.05n 100u\n.end\n")
console.log("\n  wrote calc/spice/fm-tx.cir and calc/spice/fm-rx.cir (generated from the routed boards)")

/* ── 1. FM-TX bias ───────────────────────────────────────────────────────── */
console.log("\n[1] FM-TX DC operating point")
{
  const { deck } = txDeck({ kick: false })
  const c = new Circuit(deck), x = c.op()
  const ic = (n) => c.get(n).op(x).ic
  const vr = c.v(x, "tank") - c.v(x, "var")
  console.log(`      Q1 ${(ic("Q1") * 1e3).toFixed(2)} mA · Q2 ${(ic("Q2") * 1e3).toFixed(2)} mA · varactor reverse bias ${vr.toFixed(2)} V · battery ${((9 - c.v(x, "v9")) / 1.5 * 1e3).toFixed(1)} mA`)
  check("oscillator biased 1-2.5 mA", ic("Q2") > 1e-3 && ic("Q2") < 2.5e-3)
  check("varactor reverse-biased 0.9-1.6 V (C16 keeps the DEV pot off its bias)", vr > 0.9 && vr < 1.6)
}

/* ── 2. FM-TX start-up, band, amplitude, radiated power ──────────────────── */
// a low-capacitance 1N4148 (≈1.2 pF, the typical part) puts the band edges highest: the worst case for
// staying below 108 MHz AND for reaching 88 MHz, and the most radiation (∝ f²). [3] shows the 4 pF case.
// builds: "loose" (coil Q 50, 5 nH leads) and "tight" (coil Q 150, 2 nH leads — least capacitance, highest band edges)
console.log("\n[2] FM-TX start-up corners: 2N2222A / BC547B, loose / tight build, TRIM 5 / 30 pF (1.2 pF 1N4148)")
{
  const rows = []
  for (const q of ["Q2N2222A", "BC547B"]) for (const [coilQ, lead] of [[50, 5e-9], [150, 2e-9]]) for (const trim of [5e-12, 30e-12]) {
    const { deck, w } = txDeck({ q, coilQ, trim, lead, varModel: "D1N4148LO" })
    const c = new Circuit(deck)
    const T = 5e-6
    const r = c.tran({ tstop: T, h: 0.05e-9, probes: ["tank", "ant1_w"] })
    const a = amp(r.t, r.tank, T - 0.4e-6, T), f = freq(r.t, r.tank, T - 1.5e-6, T)
    let p = 0, n = 0
    for (let i = 0; i < r.t.length; i++) if (r.t[i] > T - 1.5e-6) { p += r.ant1_w[i] ** 2 / w.R; n++ }
    const eirp = p / n + coilRadiation(a, f)
    rows.push({ a, f, eirp, trim: trim * 1e12 })
    console.log(`      ${q.padEnd(8)} Q=${String(coilQ).padStart(3)} ${lead * 1e9}nH TRIM=${(trim * 1e12).toFixed(0).padStart(2)}pF → ${(f / 1e6).toFixed(1)} MHz, tank ${a.toFixed(2)} Vpk, radiated ≈ ${dBm(eirp).toFixed(1)} dBm`)
  }
  check("oscillates in all 8 corners (≥ 0.3 Vpk)", rows.every((r) => r.a >= 0.3))
  const fmin = Math.min(...rows.map((r) => r.f)), fmax = Math.max(...rows.map((r) => r.f))
  check("TRIM reaches the bottom of the band (< 88 MHz) for every transistor", rows.filter((r) => r.trim === 30).every((r) => r.f < 88e6))
  check("…and C17 keeps the top below the 108 MHz aviation-band edge", fmax < 108.5e6, `${(fmin / 1e6).toFixed(1)}-${(fmax / 1e6).toFixed(1)} MHz`)
  check("tank swing pinned ≤ 1 Vpk by R15 (any coil Q, either transistor)", rows.every((r) => r.a <= 1.0))
  const worst = Math.max(...rows.map((r) => r.eirp))
  check("radiated power ≥ 10 dB under FCC §15.239", worst < LIMIT_TX / 10, `worst ${dBm(worst).toFixed(1)} dBm vs limit ${dBm(LIMIT_TX).toFixed(1)} dBm`)
}

/* ── 3. FM-TX varactor modulation ────────────────────────────────────────── */
console.log("\n[3] FM-TX varactor FM sensitivity (1N4148 capacitance 1.2-4 pF), top and bottom of the band")
{
  const s = []
  for (const varModel of ["D1N4148HI", "D1N4148LO"]) for (const trim of [5e-12, 18e-12]) {
    const { deck } = txDeck({ varModel, trim })
    const c0 = new Circuit(deck), v0 = c0.v(c0.op(), "var")
    const at = (dv) => {
      // a slow audio swing ≈ a small DC step on the varactor bias node
      const c = new Circuit(deck + `\nVTEST var_test 0 ${v0 + dv}\nRTEST var_test var 1k`)
      const r = c.tran({ tstop: 4e-6, h: 0.05e-9, probes: ["tank", "var"] })
      return { f: freq(r.t, r.tank, 2e-6, 4e-6), v: mean(r.var.slice(-2000)) }
    }
    const lo = at(-0.05), hi = at(0.05)
    const k = (hi.f - lo.f) / (hi.v - lo.v) / 1e6
    s.push(k)
    console.log(`      ${varModel} TRIM=${(trim * 1e12).toFixed(0)}pF @ ${((lo.f + hi.f) / 2e6).toFixed(1)} MHz → ${k.toFixed(3)} kHz/mV`)
  }
  check("FM direction is the same in every case (no sign flips, unlike transistor-junction FM)", s.every((k) => k < 0) || s.every((k) => k > 0))
  const mag = s.map(Math.abs)
  check("≥ 0.1 kHz/mV worst case: ±30 kHz needs ≤ 300 mV at the varactor", Math.min(...mag) >= 0.1, `${Math.min(...mag).toFixed(2)}-${Math.max(...mag).toFixed(2)} kHz/mV`)
}

/* ── 4. FM-TX audio gain ─────────────────────────────────────────────────── */
console.log("\n[4] FM-TX microphone preamp")
{
  const { deck } = txDeck({ kick: false, dev: 1.0 })
  const [, mic, micN] = deck.match(/^IMIC1 (\S+) (\S+) 0.3m$/m)
  const c = new Circuit(deck.replace(/^IMIC1 .*$/m, `IMIC1 ${mic} ${micN} DC 0.3m AC 1`))
  c.op()
  const z = c.ac([1e3], [mic, "var"])[0]
  const g = Math.hypot(...z.var) / Math.hypot(...z[mic])
  check("mic → varactor gain ≥ 12× with DEV at max (a few mV of voice → tens of kHz)", g >= 12, `${g.toFixed(1)}×`)
}

/* ── 5. FM-RX super-regeneration ─────────────────────────────────────────── */
console.log("\n[5] FM-RX: quench, bursts, capture, re-radiation")
function noise(rms = 1e-7, hold = 0.2e-9, seed = 12345) {
  let s = seed >>> 0, last = -1, v = 0
  const rnd = () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296 }
  return (t) => { const k = Math.floor(t / hold); if (k !== last) { last = k; v = rms * Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-12))) * Math.cos(2 * Math.PI * rnd()) } return v }
}
function runRx({ A = 0, fs = 0, T = 75e-6, ...o } = {}) {
  const { deck, w } = rxDeck(o)
  const c = new Circuit(deck)
  c.op()
  c.get("INOISE").setFn(noise())
  if (A) c.get("VANT1").setFn((t) => A * Math.sin(2 * Math.PI * fs * t))
  const r = c.tran({ tstop: T, h: 0.05e-9, probes: ["tank", "q2c", "ant1_emf", "ant1_w"], every: 2 })
  const W = 0.1e-6, env = []
  for (let t = 20e-6; t < T - W; t += W) env.push([t, amp(r.t, r.tank, t, t + W)])
  const pk = Math.max(...env.map((e) => e[1]))
  const edges = []
  for (let i = 1; i < r.t.length; i++) if (r.t[i] > 20e-6 && r.q2c[i - 1] < 2.5 && r.q2c[i] >= 2.5) edges.push(r.t[i])
  const ign = [], mins = []
  for (let k = 0; k < edges.length; k++) {
    const hit = env.find((e) => e[0] >= edges[k] && e[1] >= 0.2 * pk)
    if (hit && hit[0] - edges[k] < 12e-6) ign.push(hit[0] - edges[k])
    if (k + 1 < edges.length) mins.push(Math.min(...env.filter((e) => e[0] >= edges[k] && e[0] < edges[k + 1]).map((e) => e[1])))
  }
  let on = 0
  for (const e of env) if (e[1] > pk / 2) on++
  const mid = env.filter((e) => e[1] > 0.8 * pk)
  const fb = mid.length ? freq(r.t, r.tank, mid[Math.floor(mid.length / 2)][0] - 0.1e-6, mid[Math.floor(mid.length / 2)][0] + 0.1e-6) : 0
  let p = 0, n = 0
  for (let i = 0; i < r.t.length; i++) if (r.t[i] > 20e-6) { p += (r.ant1_emf[i] - r.ant1_w[i]) ** 2 / w.R; n++ }
  return { fq: edges.length > 1 ? (edges.length - 1) / (edges[edges.length - 1] - edges[0]) : 0, pk, ign: ign.length ? mean(ign) * 1e6 : NaN, bursts: ign.length, cycles: edges.length, killed: mins.length > 0 && mins.every((m) => m < 0.02), duty: on / env.length, fb, pAnt: p / n }
}
{
  // cold power-up: does the quench astable start by itself? (RF ignored at this step size)
  const { deck } = rxDeck({ coldStart: true })
  const c = new Circuit(deck)
  c.finalize(); c._x = new Float64Array(c.n)
  const r = c.tran({ tstop: 1.2e-3, h: 20e-9, probes: ["q2c"] })
  const tail = r.q2c.filter((_, i) => r.t[i] > 0.9e-3)
  check("quench astable starts by itself from a cold power-up (switch on, C1 charging)", Math.max(...tail) - Math.min(...tail) > 2, `Q2 collector ${Math.min(...tail).toFixed(2)}-${Math.max(...tail).toFixed(2)} V`)

  // tuning window: detector held in GROW, both ends of TUNE, both transistor types, tight build (highest edges)
  const win = []
  for (const q of ["Q2N2222A", "BC547B"]) for (const trim of [5e-12, 30e-12]) {
    const c = new Circuit(rxDeck({ q, trim, coilQ: 150, lead: 2e-9, hold: true }).deck)
    const r = c.tran({ tstop: 3e-6, h: 0.05e-9, probes: ["tank"] })
    win.push({ q, trim: trim * 1e12, f: freq(r.t, r.tank, 2e-6, 3e-6) })
  }
  for (const q of ["Q2N2222A", "BC547B"]) console.log(`      ${q.padEnd(8)} tunes ${win.filter((w) => w.q === q).map((w) => (w.f / 1e6).toFixed(1)).reverse().join("-")} MHz (TRIM 30 → 5 pF, tight build)`)
  check("TRIM reaches the bottom of the FM band (< 88 MHz) for either transistor", win.filter((w) => w.trim === 30).every((w) => w.f < 88e6))
  check("…and C17 keeps the detector — which radiates — below the 108 MHz aviation band", win.every((w) => w.f < 108.5e6), `top ${(Math.max(...win.map((w) => w.f)) / 1e6).toFixed(1)} MHz`)

  // re-radiation is worst at the top of the band (∝ f²): run the corners there, plus a 75 cm antenna
  const corners = [["Q2N2222A", 50, 5e-9, 0.3], ["BC547B", 50, 5e-9, 0.3], ["Q2N2222A", 150, 2e-9, 0.3], ["BC547B", 150, 2e-9, 0.3], ["BC547B", 150, 2e-9, 0.75]]
  const res = corners.map(([q, coilQ, lead, wire]) => ({ q, coilQ, lead, wire, ...runRx({ q, coilQ, lead, wire, trim: 5e-12 }) }))
  for (const x of res) console.log(`      ${x.q.padEnd(8)} Q=${String(x.coilQ).padStart(3)} leads ${x.lead * 1e9}nH, ${x.wire * 100} cm wire: quench ${(x.fq / 1e3).toFixed(1)} kHz, bursts ${x.bursts}/${x.cycles - 1} cycles, ${x.pk.toFixed(2)} Vpk at ${(x.fb / 1e6).toFixed(1)} MHz, killed: ${x.killed}, radiated ≈ ${dBm(x.pAnt + coilRadiation(x.pk, x.fb) * x.duty).toFixed(1)} dBm`)
  check("quench is ultrasonic (> 25 kHz) in every corner", res.every((x) => x.fq > 25e3))
  check("detector ignites once per quench cycle in every corner", res.every((x) => x.bursts >= x.cycles - 1 && x.pk > 0.3))
  check("…and every burst is extinguished in the kill phase", res.every((x) => x.killed))
  check("burst amplitude pinned ≤ 2.5 Vpk by R22", res.every((x) => x.pk <= 2.5), `${Math.min(...res.map((x) => x.pk)).toFixed(2)}-${Math.max(...res.map((x) => x.pk)).toFixed(2)} Vpk`)
  const worst = Math.max(...res.map((x) => x.pAnt + coilRadiation(x.pk, x.fb) * x.duty))
  console.log(`      worst re-radiation (antenna + coil, duty-weighted) ≈ ${dBm(worst).toFixed(1)} dBm`)
  check("re-radiation ≥ 6 dB under FCC §15.109 (150 µV/m @ 3 m), 30-75 cm antenna", worst < LIMIT_RX / 4, `${dBm(worst).toFixed(1)} dBm vs limit ${dBm(LIMIT_RX).toFixed(1)} dBm`)
  // capture, mid-band, weakest corner (lowest burst amplitude)
  const b0 = runRx({ q: "Q2N2222A", coilQ: 50, lead: 5e-9 })
  const base = { ...b0, q: "Q2N2222A", coilQ: 50, lead: 5e-9 }, s = runRx({ q: base.q, coilQ: base.coilQ, lead: base.lead, A: 300e-6, fs: base.fb })
  console.log(`      300 µV carrier at ${(base.fb / 1e6).toFixed(2)} MHz (weakest corner): ignition ${s.ign.toFixed(2)} µs vs ${base.ign.toFixed(2)} µs without`)
  check("a 300 µV carrier captures the detector (ignition advances ≥ 0.1 µs)", base.ign - s.ign >= 0.1, `advance ${(base.ign - s.ign).toFixed(2)} µs`)
}

/* ── 6. FM-RX audio amplifier ────────────────────────────────────────────── */
console.log("\n[6] FM-RX audio amplifier (Q4 + follower Q6) into a 32 Ω earbud")
{
  const { deck } = rxDeck()
  const c = new Circuit(deck + "\nVAUDTEST aud_t 0 DC 0 AC 1\nCAUDTEST aud_t q4b 10u")
  c.op()
  const z = c.ac([1e3], ["ear", "q4b"])[0]
  const g = Math.hypot(...z.ear) / Math.hypot(...z.q4b)
  check("Q4 base → 32 Ω earbud gain ≥ 10× at 1 kHz (was ≈ 0.06× with no follower)", g >= 10, `${g.toFixed(1)}×`)
}

console.log("\n" + "═".repeat(64))
console.log(`RESULT: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
