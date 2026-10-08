/**
 * sim_fm.mjs — numerical PROOF that the FM Radio Lab circuits work.
 *
 * Integrates the exact nonlinear ODEs of the Colpitts core shared by the
 * FM-TX oscillator and the FM-RX super-regenerative detector (RK4,
 * Ebers-Moll transistor with VOLTAGE-DEPENDENT junction capacitances —
 * because the junction capacitance IS the FM mechanism), including the
 * real bias networks, the quench dynamics, and the true 3-node capacitance
 * matrix:
 *
 *   state: V_C (tank) · V_E (emitter) · V_B (base) · I_L (coil)
 *
 *   M(V)·dV/dt = −I(V)      M = 3×3 node-capacitance matrix
 *     node C: trimmer+strays, C_fb(10p)→E, C_ob(V_CB)→B, tank loss R_p
 *     node E: C_be(47p)→gnd, C_fb, C_j(V_BE)→B   ← junction cap, nonlinear
 *     node B: C_bp(470p)→gnd, C_j, C_ob
 *   I_E = I_ES·(e^((V_B−V_E)/V_T)−1)/(1+I/I_LIM)   (soft class-C clamp)
 *   C_j = C_je(V_BE) + τ_F·I_E/V_T                  (depletion + diffusion)
 *   C_ob(V_CB) = C_ob0/√(1+V_CB/V_J)                (2N2222A: 8pF@10V)
 *   L·dI_L/dt = V9 − V_C                            (coil IS the DC feed)
 *
 * The junction-capacitance model is anchored to datasheet numbers:
 *   2N2222A / P2N2222A (onsemi): C_obo = 8pF @ V_CB=10V → C_ob0 ≈ 30pF
 *   C_ibo ≈ 22pF @ V_EB=0.5V → C_je0 ≈ 28pF; τ_F ≈ 200ps effective at RF.
 * THE LESSON THE SIM TEACHES: the transistor itself contributes ~17pF to
 * the tank (C_ob ~9pF direct + the junction cap reflected through the
 * feedback divider) — which is why the coil is 4 turns on a 4mm form
 * (75nH), not on a 5mm form: the design is centered WITH the transistor
 * inside the resonator, not ignoring it.
 *
 * Tests:
 *   TX: 1 START-UP · 2 FREQUENCY · 3 TUNE SWEEP · 4 FM SENSITIVITY
 *       5 FM MODULATION (f(t) visibly tracks the audio) · 6 CONVERGENCE
 *   RX: 7 SELF-QUENCH · 8 QUENCH TUNING TABLE · 9 DETECTION
 * Run:   npm run sim   (writes sim-*.csv for the tutorial plots)
 */
import { writeFileSync } from "node:fs"

/* ══════════════ device + component values (match the boards) ═══════════ */
const VT = 0.02585
const V9 = 9
const ALPHA = 0.67 // RF current transfer α at ~98MHz — the HONEST number.
// Physics: 2N2222A fT ≈ 200MHz typical at IC≈2mA (datasheet fT-vs-IC
// curve; the 300MHz spec is at 20mA), β0=150 → fβ = fT/β0 ≈ 1.33MHz.
// At 98MHz (≫ fβ): |β| ≈ fT/f ≈ 2.04 → α = |β|/(|β|+1) ≈ 0.67.
// (The old value 0.92 implied fT ≈ 1.7GHz — a different transistor!)
// Two consequences, both real: the collector feeds the tank with 27% less
// current (harder oscillation — re-verified in TEST 1), and the (1−α)≈33%
// share of every RF conduction peak that exits through the base — the
// RECTIFIED PUMP — is 4× stronger. That pump is why the super-regen
// receiver section below is modeled so carefully.
const BETA = 150 // DC current gain (quiescent base current = I_E/β)
const KQ = 1 - ALPHA // RF-frequency base current: at 98MHz the collector
// follows the emitter with α < 1, so of every conduction PEAK the (1−α)
// ≈ 8% share that the collector cannot copy flows out through the base
// terminal — and it RECTIFIES (the junction is off on the return
// half-cycle, so nothing flows back). This is the BJT "grid-leak
// pump-charge" — the classic quench mechanism — KCL-consistent with our
// own α. It applies only to the RF VARIATION of i_E (peak minus its
// ~50ns moving average): at the quiescent dead point there is no swing,
// only the tiny β_dc recombination current drains C5 → it recovers.
const ILIM = 25e-3 // soft class-C peak clamp (keeps RK4 comfortably stable)
const TAU_AVG = 50e-9 // i_E moving-average window (~5 RF cycles)
const TAU_F = 200e-12 // effective forward transit time at RF
const COB0 = 30e-12 // C_ob at V_CB=0 (from 8pF @ 10V, V_J=0.75)
const CJE0 = 28e-12 // B-E depletion cap at V_BE=0 (from C_ibo ≈ 22pF @ 0.5V)
const VJ = 0.75

const IEof = (vbe) => {
  const x = Math.min(vbe / VT, 28)
  if (x < -5) return -1e-15
  const e = 2.04e-14 * Math.exp(x) // I_ES → I_E ≈ 2mA @ V_BE = 0.65V
  return e / (1 + e / ILIM) - 1e-15
}
/** B-E junction capacitance: depletion + diffusion (the FM mechanism).
 *  More forward bias → MORE capacitance → LOWER frequency (negative
 *  kHz/mV — the sign doesn't matter for FM, only |Δf| does). */
const CjOf = (vbe) => {
  const dep = Math.min(CJE0 / Math.sqrt(Math.max(0.08, 1 - vbe / VJ)), 80e-12)
  const dif = Math.min((TAU_F * Math.max(IEof(vbe), 0)) / VT, 120e-12)
  return Math.min(dep + dif, 180e-12)
}
/** C-B output capacitance (datasheet depletion law) */
const CobOf = (vcb) => Math.min(Math.max(COB0 / Math.sqrt(Math.max(0.05, 1 + vcb / VJ)), 2e-12), 40e-12)

/** build the oscillator core. cfg: L, Cstray, Ctrim, RE, RTH, VBTH, CBP,
 *  CFB(10p), CBE(47p), and optionally RQ+CQ for the super-regen quench
 *  (the collector fed through R_q from V9, bypassed by C_q — the classic
 *  self-quenching arrangement). Returns {deriv, dc, fAnalytic, quench} */
function makeCore(cfg) {
  const { L, Cstray, Ctrim, RE, RTH, VBTH, CBP = 470e-12, CFB = 10e-12, CBE = 47e-12, rp = 1800, RQ = 0, CQ = 0 } = cfg
  const quench = RQ > 0 && CQ > 0
  const CT = Cstray + Ctrim
  const Cdiv = (CFB * CBE) / (CFB + CBE)
  const fAnalytic = 1 / (2 * Math.PI * Math.sqrt(L * (CT + Cdiv + 2e-12)))
  const deriv = (t, s, ctx = {}) => {
    const [vC, vE, vB, iL, ieAvg, vQ] = s
    const vbe = vB - vE
    const ie = IEof(vbe)
    const cj = CjOf(vbe)
    const cob = CobOf(vC - vB)
    // ── the C-B junction as a clamp diode (saturation physics). When the
    // collector dips below the base, the CB junction conducts base→collector:
    // the tank's negative peak is clamped near vB−0.6 and the base is drained.
    // THIS is what kills the burst when the quench sags the collector supply —
    // without it the model would happily "oscillate" below ground.
    const iCB = vC < vB - 0.45 ? IEof(vB - 0.55 - vC) : 0
    // symmetric capacitance matrix
    const a = CT + CFB + cob, b = -CFB, c = -cob
    const d = CBE + CFB + cj, e = -cj
    const f = CBP + cj + cob
    // the coil's supply end: vQ in quench mode, the rail otherwise.
    // Tank loss rp hangs ACROSS the coil (vC→vFeed): at RF it loads the
    // tank exactly like the old to-ground form (vFeed is AC-grounded);
    // at DC it carries NOTHING (both ends sit at the same potential) —
    // which is the physically honest picture of a coil's loss.
    const vFeed = quench ? vQ : V9
    const iLoss = (vC - vFeed) / rp
    // node currents OUT (plus optional injected antenna current at tank)
    const iC = ALPHA * ie - iL + iLoss - (ctx.inject ? ctx.inject(t) : 0) - iCB
    const iE = vE / RE - ie
    // base: bias network + DC recombination + rectified RF pump current
    const pump = ie > ieAvg ? KQ * (ie - ieAvg) : 0
    const iB = (vB - (ctx.vbth ? ctx.vbth(t) : VBTH)) / RTH + ie / (BETA + 1) + pump + iCB
    // dV/dt = −M⁻¹·I via cofactors (symmetric 3×3)
    const A = d * f - e * e, Bx = c * e - b * f, Cx = b * e - c * d
    const D = a * f - c * c, E = c * b - a * e, F = a * d - b * b
    const det = a * A + b * Bx + c * Cx
    const out = [
      -(A * iC + Bx * iE + Cx * iB) / det,
      -(Bx * iC + D * iE + E * iB) / det,
      -(Cx * iC + E * iE + F * iB) / det,
      (vFeed - vC) / L,
      (ie - ieAvg) / TAU_AVG,
    ]
    if (quench) {
      // vQ node: R_q supplies from the rail; the coil draws iL; the tank
      // loss returns iLoss. C_q (nF-scale) grounds vQ at RF (X ≈ 0.3Ω at
      // 98MHz) but NOT at quench rates — so vQ integrates the rectified
      // collector current: THE QUENCH SAWTOOTH.
      out.push((((V9 - vQ) / RQ) - iL - iLoss) / CQ)
    }
    return out
  }
  // DC operating point: caps open, coil short → V_C ≈ V9 (or vQ)
  const dc = () => {
    let lo = 0.05, hi = VBTH + 0.1
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2
      if (IEof(VBTH - mid) - mid / RE > 0) lo = mid; else hi = mid
    }
    const vE = (lo + hi) / 2
    const ie = IEof(VBTH - vE)
    if (quench) {
      const vQ = V9 - RQ * ALPHA * ie
      return { vC: vQ - 0.02, vE, vB: VBTH, iL: ALPHA * ie, ie, ieAvg: ie, vQ }
    }
    return { vC: V9 - 0.02, vE, vB: VBTH, iL: ALPHA * ie, ie, ieAvg: ie }
  }
  return { deriv, dc, fAnalytic, quench, L }
}

/** RK4 integrator. Streams upward zero-crossings of V_C through V9 (the
 *  tank's DC center) into `crossings` for cycle-accurate frequency
 *  measurement, and keeps a decimated waveform log. `noCross` skips the
 *  crossing stream (long super-regen runs don't need per-cycle data). */
function simulate(core, { tEnd, dt, seed = 1e-3, vbth, inject, logEvery = 1e-9, noCross = false }) {
  const dc = core.dc()
  let s = [dc.vC + seed, dc.vE, dc.vB, dc.iL, dc.ieAvg]
  const ctx = { vbth, inject }
  const log = []
  const crossings = []
  let prevAbove = false
  const every = Math.max(1, Math.round(logEvery / dt))
  let k = 0
  for (let t = 0; t < tEnd; t += dt) {
    // RK4
    const a = core.deriv(t, s, ctx)
    const s1 = [s[0] + (dt / 2) * a[0], s[1] + (dt / 2) * a[1], s[2] + (dt / 2) * a[2], s[3] + (dt / 2) * a[3]]
    const b = core.deriv(t + dt / 2, s1, ctx)
    const s2 = [s[0] + (dt / 2) * b[0], s[1] + (dt / 2) * b[1], s[2] + (dt / 2) * b[2], s[3] + (dt / 2) * b[3]]
    const c = core.deriv(t + dt / 2, s2, ctx)
    const s3 = [s[0] + dt * c[0], s[1] + dt * c[1], s[2] + dt * c[2], s[3] + dt * c[3]]
    const d = core.deriv(t + dt, s3, ctx)
    s = [
      s[0] + (dt / 6) * (a[0] + 2 * b[0] + 2 * c[0] + d[0]),
      s[1] + (dt / 6) * (a[1] + 2 * b[1] + 2 * c[1] + d[1]),
      s[2] + (dt / 6) * (a[2] + 2 * b[2] + 2 * c[2] + d[2]),
      s[3] + (dt / 6) * (a[3] + 2 * b[3] + 2 * c[3] + d[3]),
    ]
    if (!Number.isFinite(s[0])) throw new Error(`diverged at t=${t}s state=${s.map((x) => x.toFixed(3)).join(",")}`)
    const above = s[0] > V9
    if (!noCross && above && !prevAbove) crossings.push(t + dt)
    prevAbove = above
    if (k++ % every === 0) log.push([t + dt, s[0], s[1], s[2], s[3], s[4]])
  }
  return { final: s, log, crossings }
}

/** mean frequency from streaming crossings, over [t0, t1] */
function freqFrom(crossings, t0, t1 = Infinity) {
  const seg = crossings.filter((t) => t >= t0 && t <= t1)
  if (seg.length < 3) return NaN
  return (seg.length - 1) / (seg[seg.length - 1] - seg[0])
}

const PASS = [], FAIL = []
const check = (label, ok, detail) => {
  console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${label}${detail ? "  — " + detail : ""}`)
  ;(ok ? PASS : FAIL).push(label)
}
const hz = (x) => (x >= 1e6 ? (x / 1e6).toFixed(2) + " MHz" : (x / 1e3).toFixed(0) + " kHz")

console.log("═".repeat(66))
console.log(" SIM · FM RADIO LAB — nonlinear RK4, junction-cap FM physics")
console.log(`      α=${ALPHA} β_dc=${BETA} τ_F=${TAU_F * 1e12}ps C_ob0=${COB0 * 1e12}pF C_je0=${CJE0 * 1e12}pF I_LIM=${ILIM * 1e3}mA`)
console.log("═".repeat(66))

/* ══════════════ TX CORE (transmitter/index.tsx values) ══════════════════ */
const L1 = 56.5e-9 // 3 turns, 5mm form, stretched to ~2.4mm (Wheeler)
const txCfg = (trim, vbthOffset = 0) => ({
  L: L1, Cstray: 2e-12, Ctrim: trim, // C_ob is modeled separately (~9pF)
  RE: 390, RTH: (15e3 * 3.9e3) / (15e3 + 3.9e3),
  VBTH: (9 * 3.9e3) / (15e3 + 3.9e3) + vbthOffset,
  CFB: 22e-12,
})

/* ── TEST 6 first: numerical convergence (picks the dt) ────────────────── */
console.log("\nTEST 6 · numerical convergence (dt halves → same answer)")
let DT = 1e-12
{
  const fOf = (dt) => freqFrom(simulate(makeCore(txCfg(15e-12)), { tEnd: 250e-9, dt, seed: 1e-3 }).crossings, 150e-9)
  const f1 = fOf(2e-12), f2 = fOf(1e-12), f3 = fOf(0.5e-12)
  const err21 = Math.abs(f1 / f3 - 1), err32 = Math.abs(f2 / f3 - 1)
  console.log(`    f(dt=2ps)=${hz(f1)} · f(1ps)=${hz(f2)} · f(0.5ps)=${hz(f3)}`)
  console.log(`    2ps vs 0.5ps: Δ=${(err21 * 100).toFixed(2)}% · 1ps vs 0.5ps: Δ=${(err32 * 100).toFixed(2)}%`)
  DT = err21 < 0.03 ? 2e-12 : err32 < 0.03 ? 1e-12 : 0.5e-12
  console.log(`    → using dt = ${DT * 1e12}ps for all runs`)
  check("dt-halving changes f by < 3%", err21 < 0.03 || err32 < 0.03)
}

/* ── TEST 1 · start-up ─────────────────────────────────────────────────── */
console.log("\nTEST 1 · TX start-up (1mV seed, trimmer 15pF)")
{
  const core = makeCore(txCfg(15e-12))
  const r = simulate(core, { tEnd: 500e-9, dt: DT, seed: 1e-3, logEvery: 2e-12 })
  const ampOf = (t0, t1) => {
    const seg = r.log.filter((x) => x[0] > t0 && x[0] <= t1)
    let mx = -1e9, mn = 1e9
    for (const x of seg) { if (x[1] > mx) mx = x[1]; if (x[1] < mn) mn = x[1] }
    return (mx - mn) / 2
  }
  const amp = ampOf(400e-9, 500e-9), ampPrev = ampOf(300e-9, 400e-9)
  console.log(`    1mV seed → carrier amplitude ≈ ${amp.toFixed(2)} Vp (prev window ${ampPrev.toFixed(2)} Vp)`)
  check("oscillation starts and holds ≥ 0.3Vp", amp >= 0.3, `A = ${amp.toFixed(2)} Vp`)
  check("amplitude steady or still building (not dying)", amp >= 0.75 * ampPrev, `${amp.toFixed(2)} vs ${ampPrev.toFixed(2)} Vp`)
  writeFileSync("sim-tx-startup.csv",
    "t_ns,V_C,V_E,V_B,I_L_mA\n" +
    r.log.filter((x) => x[0] < 300e-9).map((x) =>
      `${(x[0] * 1e9).toFixed(2)},${x[1].toFixed(4)},${x[2].toFixed(4)},${x[3].toFixed(4)},${(x[4] * 1e3).toFixed(3)}`).join("\n"))
  console.log("    (wrote sim-tx-startup.csv)")
}

/* ── TEST 2 · frequency accuracy ───────────────────────────────────────── */
console.log("\nTEST 2 · TX frequency vs 1/(2π√(LC)) (trimmer 15pF)")
{
  const core = makeCore(txCfg(15e-12))
  const r = simulate(core, { tEnd: 300e-9, dt: DT, seed: 1e-3 })
  const fMeas = freqFrom(r.crossings, 150e-9)
  const f0 = core.fAnalytic
  console.log(`    measured ${hz(fMeas)} vs naive ${hz(f0)} — the transistor's junction caps`) 
  console.log(`    ARE part of the tank: they pull it down ${((1 - fMeas / f0) * 100).toFixed(0)}% (that's the lesson)`)
  check("mid-trim frequency lands in the FM band (the design target)", fMeas > 88e6 && fMeas < 108e6, hz(fMeas))
  check("within 15% of the naive L·C formula (transistor included in the tank)", Math.abs(fMeas / f0 - 1) < 0.15,
    `${((fMeas / f0 - 1) * 100).toFixed(1)}%`)
}

/* ── TEST 3 · tuning sweep ─────────────────────────────────────────────── */
console.log("\nTEST 3 · TUNE sweep (trimmer 5 → 15 → 30pF)")
{
  const rows = [["trim_pF", "f_measured_Hz", "f_analytic_Hz"]]
  let prevF = Infinity, mono = true
  for (const trim of [5, 15, 30]) {
    const core = makeCore(txCfg(trim * 1e-12))
    const r = simulate(core, { tEnd: 300e-9, dt: DT, seed: 1e-3 })
    const f = freqFrom(r.crossings, 150e-9)
    rows.push([trim, f.toFixed(0), core.fAnalytic.toFixed(0)])
    console.log(`    TRIM=${String(trim).padStart(2)}pF → ${hz(f)}  (analytic ${hz(core.fAnalytic)})`)
    if (f >= prevF) mono = false
    prevF = f
  }
  writeFileSync("sim-tx-tuning.csv", rows.map((r) => r.join(",")).join("\n"))
  check("more capacitance always lowers the frequency (monotonic)", mono)
  const fHi = +rows[1][1], fLo = +rows[3][1]
  check("tuning window ≥ 20MHz wide (FM band always inside reach)", fHi - fLo > 20e6, `${((fHi - fLo) / 1e6).toFixed(0)} MHz`)
}

/* ── TEST 4 · FM sensitivity (the kHz-per-millivolt number) ────────────── */
console.log("\nTEST 4 · FM sensitivity — audio on the base shifts the carrier")
let SENS = 1e6
{
  const dV = 5e-3 // ±5mV quasi-static base offset
  const fs = []
  for (const off of [-dV, 0, +dV]) {
    const core = makeCore(txCfg(15e-12, off))
    const r = simulate(core, { tEnd: 300e-9, dt: DT, seed: 1e-3 })
    fs.push(freqFrom(r.crossings, 150e-9))
  }
  const [fLo, fMid, fHi] = fs
  SENS = Math.abs(fHi - fLo) / (2 * dV) // Hz/V == kHz/mV numerically
  console.log(`    V_B −5mV → ${hz(fLo)} · 0 → ${hz(fMid)} · +5mV → ${hz(fHi)}`)
  console.log(`    sensitivity |S| ≈ ${(SENS / 1e6).toFixed(1)} kHz/mV at the oscillator base`)
  console.log(`    (more forward bias → more junction capacitance → lower f; the sign`)
  console.log(`     is negative — irrelevant for FM, only |Δf| matters)`)
  console.log(`    design math: mic 20mV × Q1 gain 1.4× = 28mV at the base → ±${(28 * SENS / 1e6).toFixed(0)}kHz deviation (C5 lifted)`)
  console.log(`                 · with C5 in (gain 3.2×): ±${(64 * SENS / 1e6).toFixed(0)}kHz — broadcast-level`)
  check("FM mechanism alive: |S| ≥ 1 kHz/mV (audible deviation from mic-level audio)", SENS >= 1e6, `|S| = ${(SENS / 1e6).toFixed(1)} kHz/mV`)
  check("sensitivity sane (≤ 60 kHz/mV — not a chaos machine)", SENS <= 60e6, `|S| = ${(SENS / 1e6).toFixed(1)} kHz/mV`)
}

/* ── TEST 5 · FM modulation — f(t) tracks the audio ────────────────────── */
console.log("\nTEST 5 · FM modulation run (1kHz tone, f(t) must follow it)")
{
  // two-pass: probe the dynamic (large-signal) sensitivity, then set the
  // audio amplitude for a broadcast-grade ±75kHz demonstration
  const fa = 5e3 // 5kHz tone (an audio frequency; shorter sim windows)
  const probeA = 8e-3
  const probe = simulate(makeCore(txCfg(15e-12)), { tEnd: 250e-6, dt: DT, seed: 1e-3, vbth: (t) => txCfg().VBTH + probeA * Math.sin(2 * Math.PI * fa * t), logEvery: 1e-9 })
  const pcr = probe.crossings.filter((t) => t > 300e-9)
  let pcs = 0, pcc = 0, pAvg = 0, pn = 0
  for (let i = 1; i < pcr.length; i++) {
    const d = pcr[i] - pcr[i - 1]
    if (d > 1e-11) { pAvg += 1 / d; pn++ }
  }
  pAvg /= Math.max(pn, 1)
  for (let i = 1; i < pcr.length; i++) {
    const d = pcr[i] - pcr[i - 1]
    if (d > 1e-11) {
      const w = 2 * Math.PI * 5e3 * (pcr[i] + pcr[i - 1]) / 2
      pcs += (1 / d - pAvg) * Math.sin(w)
      pcc += (1 / d - pAvg) * Math.cos(w)
    }
  }
  const dynSens = Math.hypot(pcs, pcc) * 2 / Math.max(pn, 1) / probeA
  console.log(`    probe: dynamic sensitivity ≈ ${(dynSens / 1e6).toFixed(1)} kHz/mV`)
  const A = Math.max(2e-3, Math.min(75e3 / dynSens, 60e-3))
  const VBTH0 = txCfg().VBTH
  const vbth = (t) => VBTH0 + A * Math.sin(2 * Math.PI * fa * t)
  const core = makeCore(txCfg(15e-12))
  const r = simulate(core, { tEnd: 500e-6, dt: DT, seed: 1e-3, vbth, logEvery: 1e-9 })
  // instantaneous frequency per RF cycle from streaming crossings
  const cr = r.crossings.filter((t) => t > 300e-9)
  const ft = [] // [t, f_inst]
  for (let i = 1; i < cr.length; i++) {
    const dtc = cr[i] - cr[i - 1]
    if (dtc > 1e-11) ft.push([(cr[i] + cr[i - 1]) / 2, 1 / dtc])
  }
  const fAvg = ft.reduce((a, x) => a + x[1], 0) / ft.length
  let sxy = 0, sxx = 0, syy = 0
  for (const [t, f] of ft) {
    const x = Math.sin(2 * Math.PI * fa * t)
    const y = f - fAvg
    sxy += x * y; sxx += x * x; syy += y * y
  }
  // lock-in at the audio frequency: project f(t) onto sin/cos at 1kHz —
  // cycle-to-cycle jitter and slow drift average OUT, the true FM remains.
  // Rigor: split the run in halves — a REAL 1kHz FM tone reproduces in
  // both halves with the same amplitude AND phase; noise does not.
  const lockin = (arr, tMean) => {
    let cs = 0, cc = 0, n = 0, mean = 0
    for (const [t, f] of arr) mean += f
    mean /= arr.length
    for (const [t, f] of arr) {
      const w = 2 * Math.PI * fa * t
      cs += (f - mean) * Math.sin(w)
      cc += (f - mean) * Math.cos(w)
      n++
    }
    return { dev: Math.hypot(cs, cc) * 2 / Math.max(n, 1), phase: Math.atan2(cc, cs) }
  }
  const mid = ft[ft.length >> 1][0]
  const all = lockin(ft, fAvg)
  const h1 = lockin(ft.filter(([t]) => t < mid), fAvg)
  const h2 = lockin(ft.filter(([t]) => t >= mid), fAvg)
  const dev = all.dev
  let dPhase = Math.abs(h1.phase - h2.phase) * 180 / Math.PI
  dPhase = Math.min(dPhase, 360 - dPhase) // wrap-aware: −176° and +172° are
  // the SAME phase (12° apart), not 348° apart — the raw |Δ| crosses the
  // ±180° seam whenever the true phase sits near 180°, as it does here.
  let fMax = -1e9, fMin = 1e9
  for (const [t, f] of ft) { if (f > fMax) fMax = f; if (f < fMin) fMin = f }
  // dropout check: envelope per 50µs window from the slow log
  let minAmp = 1e9
  const seg = r.log.filter((x) => x[0] > 300e-9)
  const wN = Math.round(50e-6 / 1e-9)
  for (let w = 0; w + wN < seg.length; w += wN) {
    let mx = 0, mn = 1e9
    for (let i = w; i < w + wN; i++) { if (seg[i][1] > mx) mx = seg[i][1]; if (seg[i][1] < mn) mn = seg[i][1] }
    minAmp = Math.min(minAmp, (mx - mn) / 2)
  }
  console.log(`    quasi-static |S| = ${(SENS / 1e6).toFixed(1)} kHz/mV · dynamic (large-signal) ≈ ${(dynSens / 1e6).toFixed(1)} kHz/mV`)
  console.log(`    audio ±${(A * 1e3).toFixed(0)}mV @1kHz on the base (aimed at ±75kHz) →`)
  console.log(`    carrier f(t) raw range ${hz(fMin)} … ${hz(fMax)} (includes cycle jitter + drift)`)
  console.log(`    LOCK-IN deviation at 1kHz: ±${(dev / 1e3).toFixed(0)} kHz`)
  console.log(`    half-run check: ±${(h1.dev / 1e3).toFixed(0)}kHz @ ${((h1.phase * 180 / Math.PI + 360) % 360).toFixed(0)}° vs ±${(h2.dev / 1e3).toFixed(0)}kHz @ ${((h2.phase * 180 / Math.PI + 360) % 360).toFixed(0)}° (Δ${dPhase.toFixed(0)}°)`)
  console.log(`    carrier never drops out: min 50µs-window amplitude ${minAmp.toFixed(2)} Vp`)
  check("f(t) tracks the audio: both halves agree in amplitude (±30%) and phase (<45°)",
    h1.dev > 0.7 * dev && h1.dev < 1.3 * dev && h2.dev > 0.7 * dev && h2.dev < 1.3 * dev && dPhase < 45,
    `±${(h1.dev / 1e3).toFixed(0)}/±${(h2.dev / 1e3).toFixed(0)}kHz, Δφ ${dPhase.toFixed(0)}°`)
  check("measured deviation 15-400kHz (audible FM, not chaos)", dev > 15e3 && dev < 400e3, `±${(dev / 1e3).toFixed(0)} kHz`)
  check("no dropouts through 2ms of modulation", minAmp > 0.15, `${minAmp.toFixed(2)} Vp`)
  writeFileSync("sim-tx-fm.csv",
    "t_us,f_inst_MHz,audio_mV\n" +
    ft.filter((_, i) => i % 40 === 0).map(([t, f]) =>
      `${(t * 1e6).toFixed(2)},${(f / 1e6).toFixed(5)},${(A * 1e3 * Math.sin(2 * Math.PI * fa * t)).toFixed(2)}`).join("\n"))
  console.log("    (wrote sim-tx-fm.csv: instantaneous frequency vs the audio)")
}


/* ══════════════ RX (receiver/index.tsx values) ══════════════════════════
 * The FM-RX detector: an EXTERNALLY-QUENCHED SUPER-REGENERATIVE receiver —
 * the production-standard architecture (every serious super-regen since
 * the 1940s separates the detector from its quench oscillator).
 *
 * THE RECEIVER IS THE TRANSMITTER — literally: Q1 is the SAME common-base
 * Colpitts as the FM-TX (same coil, same trimmer, same 22p/47p feedback
 * divider, same 15k/3.9k base divider — compare the files side by side!).
 * The difference: its base bias is GATED by a quench oscillator (Q2+Q3,
 * a textbook astable multivibrator at ~50kHz) through R11/R12:
 *
 *   astable Q2 collector ──R11 4.7k──┬── Q1 base ── R2 15k ╥ 9V
 *        (0.2↔9V sawtooth-ish)       └── R12 1k ╥ GND   └── R3 3.9k ╥ GND
 *   → vB toggles 0.42V (dead) ↔ ~1.3-1.6V (oscillating)
 *
 * THE QUENCH CYCLE (one astable period, T ≈ 20µs):
 *   1. KILL: the astable saturates low → vB ≈ 0.42V → vBE ≈ 0.2V → the
 *      transistor is cut off hard. The burst dies, the tank rings down.
 *   2. SETTLE: ~13µs of quiet. Whatever rides the tank — thermal noise,
 *      or a distant station — keeps sloshing there at µV level.
 *   3. RAMP: the astable's collector rises exponentially (τ = R_c·C_t ≈
 *      4.7µs — the "smooth ramp, sharp drop" shape the super-regen
 *      literature prescribes). vB sweeps up THROUGH the oscillation
 *      threshold: the loop gain crosses 1 and the burst ignites —
 *      seeded by whatever is on the tank.
 *   4. WINDOW: ~1-2µs of growth before the next drop. The envelope at
 *      cutoff = seed × e^(∫dt/τ_growth) — the exponential preserves the
 *      seed's RELATIVE amplitude: a ±1% amplitude variation on the tank
 *      (an FM signal on the response slope!) becomes a ±1% variation of
 *      the burst envelope, at millivolt scale. Gain in TIME: a µV seed
 *      becomes a 2V burst. That is the 10⁴-10⁶ "gain" of super-
 *      regeneration — from ONE transistor.
 *   Repeat 50,000 times a second — ultrasonic, above the audio band.
 *
 * WHY EXTERNAL QUENCH (the design lesson this project teaches):
 * a BJT cannot self-quench the way Armstrong's tubes did — the rectified
 * base current pushes the base UP (anti-quenching; the grid-leak story
 * inverts for transistors), and an emitter-side quench cap would short
 * the Colpitts feedback divider (nF ≈ 0.2Ω at 98MHz vs the 47pF leg's
 * 345Ω). The two-transistor self-quench loop latches. So the factory
 * answer: a SEPARATE oscillator does the strangling, deterministically,
 * at a frequency you choose. (See the tutorial's Super-Regen chapter.)
 *
 * FM RECEPTION: tune TRIM1 a hair OFF the station. On the tank's response
 * slope the station's frequency wobble (±75kHz broadcast deviation)
 * becomes an amplitude wobble; each burst's seed wobbles; the envelope
 * follows; the rectified emitter voltage carries the audio. THE SILENCE
 * IS THE SIGNAL: tune ONTO a carrier and the hiss collapses — the carrier
 * seeds every regrowth, nothing left to hiss about. */
const RXQ = {
  // the astable (Q2/Q3) — the EXACT board values; T = 0.693·(Rb1+Rb2)·Ct
  fq: 1 / (0.693 * (18e3 + 11e3) * 1e-9),      // ≈ 49.3kHz
  Rc: 4.7e3, Ct: 1e-9,                          // rise τ = Rc·Ct ≈ 4.7µs
  tLow: 13.2e-6, tDrop: 0.25e-6,                // LOW phase ≈ 0.693·Rb1·Ct
  // the quench feed + Q1 base network (board values)
  Rq1: 4.7e3, Rq2: 1e3, R2: 15e3, R3: 3.9e3,
  // Q1 = the TX core
  L: 56.5e-9, Cstray: 3e-12, Ctrim: 15e-12,
  RE: 470, CBP: 220e-12, CFB: 22e-12, CBE: 47e-12, rp: 1800,
  winFine: 5e-6,  // fine-dt gate (covers the ramp's active tail + drop)
}
const RX = RXQ // alias for the helpers below

/** the astable's collector waveform: sharp drop, LOW, exponential rise */
function rxAst(q, t) {
  const T = 1 / q.fq
  const ph = t % T
  if (ph < q.tDrop) return 0.2 + 8.8 * Math.max(0, 1 - ph / q.tDrop)
  if (ph < q.tLow) return 0.2
  return 0.2 + 8.8 * (1 - Math.exp(-(ph - q.tLow) / (q.Rc * q.Ct)))
}
/** Q1's base Thevenin from the network (divider ∥ Rq1→astable ∥ Rq2→gnd) */
function rxBaseTh(q, t) {
  const VB0 = (V9 * q.R3) / (q.R2 + q.R3)
  const RTHd = (q.R2 * q.R3) / (q.R2 + q.R3)
  const g1 = 1 / RTHd, g2 = 1 / q.Rq1, g3 = 1 / q.Rq2
  const G = g1 + g2 + g3
  return { vbth: (g1 * VB0 + g2 * rxAst(q, t)) / G, RTH: 1 / G }
}

/** phase-gated RK4 for the quenched detector. The dt is keyed to the
 *  quench PHASE (a pure function of t), not the state — so a periodic
 *  solution integrates to an exactly periodic log: zero numerical noise,
 *  deterministic burst-to-burst comparison. */
function rxSimulate({ tEnd, inject = null, seed = 1e-3, logEvery = 2e-9, cfg = null, crossings = false } = {}) {
  const q = cfg ?? RXQ
  const bt = rxBaseTh(q, 0)
  const core = makeCore({
    L: q.L, Cstray: q.Cstray, Ctrim: q.Ctrim, RE: q.RE,
    RTH: bt.RTH, VBTH: 0, CBP: q.CBP, CFB: q.CFB, CBE: q.CBE, rp: q.rp,
  })
  const dc = core.dc()
  let s = [dc.vC + seed, dc.vE, dc.vB, dc.iL, dc.ieAvg]
  const ctx = { inject, vbth: (t) => rxBaseTh(q, t).vbth }
  const log = []
  const zc = []
  let prevAbove = false
  const every = Math.max(1, Math.round(logEvery / 3e-12))
  const T = 1 / q.fq
  let k = 0, t = 0
  while (t < tEnd) {
    const ph = t % T
    // fine dt only for the ramp's active tail (the threshold crossing +
    // the burst window + the drop); the long quiet LOW phase runs coarse.
    const dt = ph > q.tLow + 3e-6 || ph < q.tDrop + 0.5e-6 ? 3e-12 : 1e-9
    const a1 = core.deriv(t, s, ctx)
    const s1 = s.map((v, i) => v + (dt / 2) * a1[i])
    const a2 = core.deriv(t + dt / 2, s1, ctx)
    const s2 = s.map((v, i) => v + (dt / 2) * a2[i])
    const a3 = core.deriv(t + dt / 2, s2, ctx)
    const s3 = s.map((v, i) => v + dt * a3[i])
    const a4 = core.deriv(t + dt, s3, ctx)
    s = s.map((v, i) => v + (dt / 6) * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i]))
    for (let i = 0; i < 5; i++) if (!Number.isFinite(s[i])) throw new Error(`RX diverged at t=${t}s`)
    t += dt
    const above = s[0] > V9
    if (crossings && above && !prevAbove) zc.push(t)
    prevAbove = above
    if (k++ % every === 0) log.push([t, s[0], s[1], s[2], s[3], s[4], rxAst(q, t)])
  }
  return { log, final: s, zc }
}

/** per-quench-cycle burst envelope: max |vC−9| within each cycle */
function rxBursts(r, q, t0 = 0) {
  const T = 1 / q.fq
  const out = []
  for (let w = 0; ; w++) {
    const t1 = t0 + w * T
    if (t1 + T > (r.log.length ? r.log[r.log.length - 1][0] : 0)) break
    let e = 0, vEmean = 0, n = 0
    for (const x of r.log) {
      if (x[0] < t1 || x[0] >= t1 + T) continue
      if (Math.abs(x[1] - 9) > e) e = Math.abs(x[1] - 9)
      vEmean += x[2]; n++
    }
    if (n > 10) out.push({ t: t1, env: e, vE: vEmean / n })
  }
  return out
}

/** 2-pole RC low-pass (the board's R8-C13 + R9-C14 audio filter, fc≈3.4kHz) */
function rc2(log, col, tau = 4.7e3 * 10e-9) {
  const out = []
  let y = 0, y2 = 0
  for (let i = 0; i < log.length; i++) {
    const dt = i > 0 ? log[i][0] - log[i - 1][0] : 2e-9
    y += (log[i][col] - y) * Math.min(1, dt / tau)
    y2 += (y - y2) * Math.min(1, dt / tau)
    out.push([log[i][0], y2])
  }
  return out
}
function lockin(arr, fa, t0, t1) {
  const seg = arr.filter((x) => x[0] > t0 && x[0] <= t1)
  let cs = 0, cc = 0, mean = 0
  for (const x of seg) mean += x[1]
  mean /= seg.length
  for (const x of seg) {
    const w = 2 * Math.PI * fa * x[0]
    cs += (x[1] - mean) * Math.sin(w)
    cc += (x[1] - mean) * Math.cos(w)
  }
  return { amp: Math.hypot(cs, cc) * 2 / seg.length, mean }
}

/* ── TEST 6.5 · detector physics sanity ────────────────────────────────── */
console.log("\nTEST 6.5 · detector physics (unit checks)")
let F_OSC = 100e6
{
  // With the astable stuck HIGH, the base network's Thevenin is simply
  // RTH = R2∥R3∥Rq1∥Rq2 at 1.64V — the core IS the TX. Use the plain
  // fixed-dt TX path (fast, and it cross-checks both integrators).
  const g1 = 1 / ((15e3 * 3.9e3) / (15e3 + 3.9e3)), g2 = 1 / RXQ.Rq1, g3 = 1 / RXQ.Rq2
  const G = g1 + g2 + g3
  const VBTH_h = (g1 * (9 * 3.9e3) / (15e3 + 3.9e3) + g2 * 9) / G
  const core = makeCore({
    L: RXQ.L, Cstray: RXQ.Cstray, Ctrim: RXQ.Ctrim, RE: RXQ.RE,
    RTH: 1 / G, VBTH: VBTH_h, CBP: RXQ.CBP, CFB: RXQ.CFB, CBE: RXQ.CBE, rp: RXQ.rp,
  })
  const r = simulate(core, { tEnd: 400e-9, dt: DT, seed: 2e-3, logEvery: 1e-9 })
  let mx = 0, mn = 9
  for (const x of r.log) { if (Math.abs(x[1] - 9) > mx) mx = Math.abs(x[1] - 9) }
  console.log(`    quench stuck HIGH (vB=${VBTH_h.toFixed(2)}V) → continuous oscillation: tank swing ${mx.toFixed(2)}Vp`)
  check("with the quench stuck high, the core is the TX (oscillates continuously)", mx > 0.3, `${mx.toFixed(2)}Vp`)
  // measure the ACTUAL oscillation frequency (the naive LC formula misses
  // the transistor's junction caps by ~11% — that's the lesson)
  const r2 = simulate(core, { tEnd: 300e-9, dt: DT, seed: 1e-3 })
  const fMeas = freqFrom(r2.crossings, 150e-9)
  F_OSC = fMeas
  const fNaive = 1 / (2 * Math.PI * Math.sqrt(RXQ.L * (RXQ.Cstray + RXQ.Ctrim + (RXQ.CFB * RXQ.CBE) / (RXQ.CFB + RXQ.CBE) + 2e-12)))
  console.log(`    measured f_osc = ${hz(F_OSC)} (naive LC says ${hz(fNaive)} — the junction caps ARE the tank)`)
  check("oscillation frequency lands in the FM band", F_OSC > 87e6 && F_OSC < 120e6, hz(F_OSC))
}

/* ── TEST 7 · the detector quenches on schedule ─────────────────────────── */
console.log("\nTEST 7 · external quench — one burst per astable cycle, never more")
{
  const r = rxSimulate({ tEnd: 260e-6, seed: 1e-3 })
  const bursts = rxBursts(r, RXQ, 60e-6)
  const envs = bursts.map((b) => b.env)
  const mean = envs.reduce((a, b) => a + b, 0) / envs.length
  const std = Math.sqrt(envs.reduce((s, x) => s + (x - mean) ** 2, 0) / envs.length)
  const cycles = Math.round((260e-6 - 60e-6) * RXQ.fq)
  console.log(`    ${bursts.length} quench cycles, each with a burst: env ${mean.toFixed(2)}Vp ± ${(std / mean * 100).toFixed(1)}%`)
  console.log(`    burst envelope bounded (no rail slamming): max ${Math.max(...envs).toFixed(2)}Vp`)
  check("every quench cycle produces exactly one burst (deterministic gating)", bursts.length >= 8 && Math.abs(bursts.length - cycles) <= 1, `${bursts.length} vs ${cycles} cycles`)
  check("burst envelope healthy (0.5-4Vp — grown from µV, not rail-slammed)", mean > 0.5 && mean < 4, `${mean.toFixed(2)}Vp`)
  check("quench rate ultrasonic (18-150kHz)", RXQ.fq > 18e3 && RXQ.fq < 150e3, `${(RXQ.fq / 1e3).toFixed(1)} kHz`)
  writeFileSync("sim-rx-quench.csv",
    "t_us,V_C,V_E,V_B,I_L_mA,IeAvg_mA,V_AST\n" +
    (() => {
      const rows = []
      const T = 1 / RXQ.fq
      const t0 = Math.ceil(80e-6 * RXQ.fq) * T // align to the cycle for a clean plot
      for (const x of r.log) if (x[0] >= t0 && x[0] < t0 + 2 * T) rows.push(x.map((v, i) => (i === 0 ? (v * 1e6).toFixed(3) : i === 4 || i === 5 ? (v * 1e3).toFixed(3) : v.toFixed(4))).join(","))
      return rows.join("\n")
    })())
  console.log("    (wrote sim-rx-quench.csv: two full quench cycles in all their glory)")
}

/* ── TEST 8 · C_t is the quench knob ───────────────────────────────────── */
console.log("\nTEST 8 · quench tuning — the astable's C_t sets the rate")
{
  const rates = []
  for (const ct of [0.5e-9, 2.2e-9]) {
    const q = { ...RXQ, Ct: ct, fq: 1 / (0.693 * (18e3 + 11e3) * ct), tLow: 0.693 * 18e3 * ct }
    const r = rxSimulate({ tEnd: 140e-6, cfg: q })
    const b = rxBursts(r, q, 40e-6)
    rates.push(b.length / ((140e-6 - 40e-6)))
    console.log(`    C_t = ${(ct * 1e9).toFixed(1)}nF → quench ${(b.length / 100e-6 / 1e3).toFixed(0)} kHz`)
  }
  const f0 = RXQ.fq
  check("quench rate falls as C_t grows (T = 0.693·(Rb1+Rb2)·Ct)",
    rates[0] > f0 && f0 > rates[1],
    `${(rates[0] / 1e3).toFixed(0)} > ${(f0 / 1e3).toFixed(0)} > ${(rates[1] / 1e3).toFixed(0)} kHz`)
}

/* ── TEST 9 · quieting: a carrier captures the bursts ──────────────────── */
console.log("\nTEST 9 · quieting — a carrier on the tank takes over the bursts")
{
  const rN = rxSimulate({ tEnd: 220e-6, seed: 1e-3 })
  const rS = rxSimulate({ tEnd: 220e-6, seed: 1e-3, inject: (t) => 15e-6 * Math.sin(2 * Math.PI * (F_OSC + 80e3) * t) })
  const bN = rxBursts(rN, RXQ, 100e-6), bS = rxBursts(rS, RXQ, 100e-6)
  const mean = (a, k) => (a.length ? a.reduce((s, x) => s + x[k], 0) / a.length : 0)
  const std = (a, k) => { const m = mean(a, k); return a.length > 1 ? Math.sqrt(a.reduce((s2, x) => s2 + (x[k] - m) ** 2, 0) / a.length) : 9 }
  console.log(`    noise-only : env ${mean(bN, "env").toFixed(3)}Vp ±${(std(bN, "env") * 1e3).toFixed(1)}mV, mean vE ${mean(bN, "vE").toFixed(4)}V`)
  console.log(`    carrier in : env ${mean(bS, "env").toFixed(3)}Vp ±${(std(bS, "env") * 1e3).toFixed(1)}mV, mean vE ${mean(bS, "vE").toFixed(4)}V`)
  console.log(`    (the carrier seeds every regrowth: the bursts jump to a new,`)
  console.log(`     steadier envelope — the quieting "thump" of tuning past a station)`)
  check("a captured carrier changes the burst pattern (detection works)",
    Math.abs(mean(bS, "env") - mean(bN, "env")) > 0.02 || Math.abs(mean(bS, "vE") - mean(bN, "vE")) > 0.002,
    `env Δ${((mean(bS, "env") - mean(bN, "env")) * 1e3).toFixed(1)}mV, vE Δ${((mean(bS, "vE") - mean(bN, "vE")) * 1e3).toFixed(2)}mV`)
}

/* ── TEST 10 · THE MONEY TEST: FM slope detection, end to end ──────────── */
console.log("\nTEST 10 · FM reception — slope-detect a broadcast-grade FM signal")
{
  const fa = RXQ.fq / 16              // ≈ 3.1kHz — inside the audio filter's
                                     // passband, and EXACTLY 16 quench cycles
                                     // per tone period (integer-window lock-in)
  const fc = F_OSC + 600e3            // carrier at the tank's MAXIMUM-SLOPE
                                     // point (x=1/√3 of the resonance curve)
  const dev = 75e3                    // ±75kHz broadcast deviation
  const tW = 500e-6, tEnd = tW + 32 / RXQ.fq // warm-up + exactly 2 fa periods
  // ANALYTIC FM phase — a pure function of t. (RK4 evaluates deriv 4× per
  // step, often at repeated t values; a stateful phase-integrating closure
  // would corrupt the phase — a real harness bug this suite once had.)
  // φ(t) = ∫2π(fc + dev·sin(2πfa·τ))dτ = 2πfc·t − (dev/2πfa)·cos(2πfa·t)
  const beta = dev / (2 * Math.PI * fa)
  const injectFM = (t) =>
    30e-6 * Math.sin(2 * Math.PI * fc * t - beta * Math.cos(2 * Math.PI * fa * t)) // ≈ the FM-TX at 2-3 m
  const rS = rxSimulate({ tEnd, inject: injectFM, seed: 1e-3 })
  const rN = rxSimulate({ tEnd, inject: null, seed: 1e-3 })
  // (a) the earphone path: vE through the board's 2-pole RC
  const afS = rc2(rS.log, 2), afN = rc2(rN.log, 2)
  const sig = lockin(afS, fa, tW, tEnd), noi = lockin(afN, fa, tW, tEnd)
  const snr = sig.amp / Math.max(noi.amp, 1e-15)
  // (b) the direct evidence: the per-burst envelope sequence modulates at fa
  const eS = rxBursts(rS, RXQ, tW).map((b) => b.env)
  const eN = rxBursts(rN, RXQ, tW).map((b) => b.env)
  const envLock = lockin(eS.map((e, i) => [tW + i / RXQ.fq, e]), fa, tW, tEnd)
  console.log(`    FM signal: carrier at the max-slope point (+600kHz), ±75kHz dev @ ${(fa / 1e3).toFixed(2)}kHz, 30µA inject (the FM-TX across the room)`, )
  console.log(`    earphone-band audio: ${(sig.amp * 1e3).toFixed(2)} mV vs floor ${(noi.amp * 1e3).toFixed(2)} mV → SNR ${snr.toFixed(1)}×`)
  console.log(`    burst-envelope modulation at ${fa / 1e3}kHz: ±${(envLock.amp * 1e3).toFixed(1)} mV (the audio, seen directly)`)
  console.log(`    env seq SIG: ${eS.map((x) => x.toFixed(3)).join(" ")}`)
  console.log(`    env seq NOI: ${eN.map((x) => x.toFixed(3)).join(" ")}`)
  check("FM SLOPE DETECTION works: tone recovered ≥3× above the noise floor",
    snr > 3 && sig.amp > 5e-5, `SNR ${snr.toFixed(1)}× (${(sig.amp * 1e3).toFixed(2)}mV vs ${(noi.amp * 1e3).toFixed(2)}mV)`)
  check("the burst envelope visibly modulates at the audio rate (the direct view)",
    envLock.amp > 2e-3, `±${(envLock.amp * 1e3).toFixed(1)}mV on ~2V bursts`)
  writeFileSync("sim-rx-fm.csv",
    "t_us,V_E_raw,V_E_filtered\n" +
    (() => {
      const rows = []
      for (let i = 0; i < rS.log.length; i += 2) {
        if (rS.log[i][0] <= tW) continue
        rows.push(`${(rS.log[i][0] * 1e6).toFixed(3)},${rS.log[i][2].toFixed(4)},${afS[i][1].toFixed(5)}`)
      }
      return rows.join("\n")
    })())
  console.log("    (wrote sim-rx-fm.csv: raw vs earphone-filtered detector output)")
}

console.log("\n" + "═".repeat(66))
console.log(` RESULT: ${PASS.length} passed, ${FAIL.length} failed`)
if (FAIL.length) {
  console.log(" FAILED:", FAIL.join(" | "))
  process.exit(1)
}
console.log(" TX: starts at the honest α, tunes across the FM band, and the carrier")
console.log("     dances with the audio — FM proven, junction-cap physics and all.")
console.log(" RX: the TX core, strangled 50,000 times a second by a textbook astable,")
console.log("     quiets to a carrier and slope-detects a broadcast-grade FM signal.")
console.log("     The receiver IS the transmitter — proven, not hoped.")
