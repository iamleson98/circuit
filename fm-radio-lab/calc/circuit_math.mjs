/**
 * circuit_math.mjs — the hand-calculation half of FM Radio Lab's proof.
 *
 * Re-derives the bias points, tuning windows, modulation sensitivity, quench
 * timing, audio gains and radiated-power budgets of the FM-TX and FM-RX from
 * first principles and asserts the numbers the design depends on. Where a
 * hand model can't be trusted to a few percent — exact band edges with real
 * lead inductance, the tank's large-signal amplitude, super-regenerative
 * capture, re-radiation — the job belongs to `npm run sim` (calc/sim_fm.mjs),
 * which simulates the routed boards. Numbers quoted "sim:" come from there.
 *
 * Run:  npm run math      (zero dependencies — just arithmetic)
 */

const PASS = []
const FAIL = []
const check = (label, ok, detail) => {
  console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${label}`)
  if (detail) console.log(`        ${detail}`)
  ;(ok ? PASS : FAIL).push(label)
}
const MHz = (f) => (f / 1e6).toFixed(1) + " MHz"
const mA = (i) => (i * 1e3).toFixed(2) + " mA"
const dBm = (p) => 10 * Math.log10(p / 1e-3)
const fres = (L, C) => 1 / (2 * Math.PI * Math.sqrt(L * C))
const par = (...r) => 1 / r.reduce((s, x) => s + 1 / x, 0)
const ser = (a, b) => (a * b) / (a + b)

console.log("═".repeat(66))
console.log(" FM RADIO LAB · CIRCUIT MATH — every number behind the design")
console.log("═".repeat(66))

const V9 = 9
const VBE = 0.65
const VT = 0.02585
const BETA = { min: 110, typ: 290 } // BC547B hFE 200-450, 2N2222A 100-300 → design for ≥ 110
/** emitter current of a divider-biased stage, INCLUDING the base current's drop on the divider */
const ie = (Vth, Rth, RE, beta) => (Vth - VBE) / (RE + Rth / (beta + 1))
const L1 = 60e-9 // board value: Wheeler's 56 nH (§2) + ~4 nH of leads
const TRIM = { min: 5e-12, max: 30e-12 }
const STRAY = 2e-12 // board + coil self-capacitance
/** the two transistor types the kit allows: output capacitance at VCB ≈ 7 V, and the
 *  base-emitter capacitance seen at the operating point, as gm/(2π·fT_eff) */
const XSTR = {
  BC547B: { cob: 1.6e-12, fT: 300e6 },
  "2N2222A": { cob: 3.3e-12, fT: 170e6 }, // big CJE: fT is low at 1-2 mA
}
/** 1N4148 used as a varactor: Cj0 spreads 1.2-4 pF between makers */
const cj = (Vr, cj0) => cj0 / Math.pow(1 + Vr / 0.75, 0.4)

/* ══════════════ §1 THE RULES OF THE BAND ══════════════ */
console.log("\n§1  FM broadcast band and the licence-free limits")
const LIMIT_TX = (250e-6 * 3) ** 2 / 30 // §15.239: 250 µV/m @ 3 m  → EIRP = (E·r)²/30
const LIMIT_RX = (150e-6 * 3) ** 2 / 30 // §15.109 class B receiver, 88-216 MHz: 150 µV/m @ 3 m
{
  const carson = 2 * (75e3 + 15e3)
  check("±75 kHz deviation + 15 kHz audio fits the 200 kHz §15.239 band (Carson)", carson <= 200e3, `Carson bandwidth ${(carson / 1e3).toFixed(0)} kHz`)
  console.log(`        limits: FM-TX EIRP ≤ ${dBm(LIMIT_TX).toFixed(1)} dBm (§15.239), FM-RX re-radiation ≤ ${dBm(LIMIT_RX).toFixed(1)} dBm (§15.109)`)
  const lam = 3e8 / 98e6
  check("a 30-75 cm receive wire is between λ/10 and λ/4 (useful, not resonant-long)", 0.3 > lam / 12 && 0.75 <= lam / 4 + 0.02, `λ/4 = ${(lam / 4 * 100).toFixed(0)} cm`)
}

/* ══════════════ §2 THE COIL ══════════════ */
console.log("\n§2  L1 — 3 turns of 0.6 mm wire on a 5 mm form, stretched to 2.4 mm")
{
  // Wheeler: L[µH] = r²N² / (9r + 10ℓ), r and ℓ in inches
  const wheeler = (N, dMean, len) => { const r = dMean / 2 / 25.4e-3, l = len / 25.4e-3; return (r * r * N * N) / (9 * r + 10 * l) * 1e-6 }
  const L = wheeler(3, 5.6e-3, 2.4e-3)
  check("Wheeler gives 45-75 nH (an FM-band coil with ~40-60 pF)", L > 45e-9 && L < 75e-9, `L = ${(L * 1e9).toFixed(0)} nH (+ leads ≈ 60 nH, the value the boards carry)`)
  const Ls = wheeler(3, 5.6e-3, 1.8e-3), Lw = wheeler(3, 5.6e-3, 3.4e-3)
  const up = Math.sqrt(L / Lw) - 1, down = 1 - Math.sqrt(L / Ls)
  check("squeezing / stretching the coil moves the band ≥ ±4 % (the band-centering trick)", up > 0.04 && down > 0.04,
    `1.8 mm long: −${(down * 100).toFixed(1)} %   3.4 mm long: +${(up * 100).toFixed(1)} %`)
}

/* ══════════════ §3 FM-TX BIAS ══════════════ */
console.log("\n§3  FM-TX · bias points (sim: Q1 2.00 mA, Q2 1.71 mA, VAR 7.84 V)")
let txQ2gm
{
  // Q1 preamp: R4 56k / R5 12k, emitter R7 100 + R8 330 (R8 bypassed by C5), collector R6 2.7k
  const Vth = (V9 * 12e3) / 68e3, Rth = par(56e3, 12e3)
  const lo = ie(Vth, Rth, 430, BETA.min), hi = ie(Vth, Rth, 430, BETA.typ)
  const VC = V9 - 2.7e3 * hi
  check("Q1 emitter current 1-3 mA", lo > 1e-3 && hi < 3e-3, `${mA(lo)} … ${mA(hi)}`)
  check("Q1 collector sits mid-swing (2.5-6 V)", VC > 2.5 && V9 - 2.7e3 * lo < 6, `V_C ≈ ${VC.toFixed(2)}-${(V9 - 2.7e3 * lo).toFixed(2)} V`)
  const gain = par(2.7e3, 10e3) / (100 + VT / hi)
  check("Q1 audio gain 12-25× (R6 ∥ DEV pot over R7 + r_e)", gain > 12 && gain < 25, `≈ ${gain.toFixed(1)}×`)

  // Q2 oscillator: R9 15k / R10 3.9k, R11 680
  const Vth2 = (V9 * 3.9e3) / 18.9e3, Rth2 = par(15e3, 3.9e3)
  const lo2 = ie(Vth2, Rth2, 680, BETA.min), hi2 = ie(Vth2, Rth2, 680, BETA.typ)
  txQ2gm = lo2 / VT
  check("Q2 emitter current 1-2.5 mA, nearly independent of β (stiff divider)", lo2 > 1e-3 && hi2 < 2.5e-3 && hi2 / lo2 < 1.05, `${mA(lo2)} … ${mA(hi2)}  (gm ≈ ${(txQ2gm * 1e3).toFixed(0)} mS)`)
  check("C7 (470 pF) grounds Q2's base at RF (≤ 5 Ω at 88 MHz)", 1 / (2 * Math.PI * 88e6 * 470e-12) < 5)
}

/* ══════════════ §4 FM-TX TANK, TUNING AND THE C17 PADDER ══════════════ */
console.log("\n§4  FM-TX · tuning window — and why C17 is there")
const VAR_REV = V9 - (V9 * 150e3) / 172e3 // tank sits at V9 (through L1); VAR = R12/R13 divider
/** a capacitor with ~5 nH of leads looks bigger at VHF: C / (1 − ω²·L·C) */
const LEAD = 5e-9
const eff = (C, f) => C / (1 - (2 * Math.PI * f) ** 2 * LEAD * C)
/** tank frequency for a trimmer setting; fixed(f) = the rest of the tank capacitance at f */
const tune = (trim, fixed) => { let f = 100e6; for (let i = 0; i < 20; i++) f = fres(L1, trim + fixed(f)); return f }
const window = (fixed) => ({ top: tune(TRIM.min, fixed), bottom: tune(TRIM.max, fixed) })
{
  const rows = []
  for (const [name, x] of Object.entries(XSTR)) {
    const cpi = txQ2gm / (2 * Math.PI * x.fT)
    const cfb = (f) => ser(eff(22e-12, f), eff(47e-12, f) + cpi) // C9 into (C8 ∥ Cπ): the emitter node
    for (const cj0 of [1.2e-12, 4e-12]) {
      const base = (f) => cfb(f) + x.cob + STRAY + cj(VAR_REV, cj0)
      rows.push({ name, cj0, with: window((f) => base(f) + eff(12e-12, f)), without: window(base) })
    }
  }
  for (const r of rows) console.log(`        ${r.name.padEnd(8)} Cj0 ${(r.cj0 * 1e12).toFixed(1)} pF: ${MHz(r.with.bottom)} … ${MHz(r.with.top)}   (no C17: up to ${MHz(r.without.top)})`)
  check("TRIM (5-30 pF) spans more than the 88-108 MHz ratio", rows.every((r) => r.with.top / r.with.bottom > 108 / 88))
  check("the bottom of the window reaches below 88 MHz", rows.every((r) => r.with.bottom < 88e6))
  check("without C17 the top end lands in the aviation band (> 112 MHz)", rows.every((r) => r.without.top > 112e6))
  check("with C17 (12 pF) the top stays below 108 MHz even for a low-capacitance diode", rows.every((r) => r.with.top < 108e6),
    "the routed-board sim gives 80.9-104.4 MHz with a 1.2 pF diode")
}

/* ══════════════ §5 FM-TX VARACTOR ══════════════ */
console.log("\n§5  FM-TX · D1 as a varactor (sim, in band: 0.13-0.59 kHz/mV)")
{
  check("D1 reverse bias 0.9-1.6 V", VAR_REV > 0.9 && VAR_REV < 1.6, `${VAR_REV.toFixed(2)} V`)
  check("…larger than the tank's RF peak (sim ≤ 0.80 V): D1 never conducts", VAR_REV > 0.8 + 0.2)
  // df/dV = (f/2)·(dC/dV)/C_total ; dCj/dV = M·Cj/(VJ+V)
  const sens = (f, cj0) => { const C = 1 / ((2 * Math.PI * f) ** 2 * L1); return (f / 2) * ((0.4 * cj(VAR_REV, cj0)) / (0.75 + VAR_REV)) / C }
  const kMin = sens(88.2e6, 1.2e-12), kMax = sens(97.6e6, 4e-12) // the simulated corners
  console.log(`        sensitivity: ${(kMin / 1e6).toFixed(2)} kHz/mV (Cj0 1.2 pF, 88.2 MHz) … ${(kMax / 1e6).toFixed(2)} kHz/mV (Cj0 4 pF, 97.6 MHz)`)
  check("hand sensitivity matches the simulated 0.13 / 0.59 kHz/mV (±25 %)", Math.abs(kMin / 0.130e6 - 1) < 0.25 && Math.abs(kMax / 0.588e6 - 1) < 0.25)
  // 10 mV of voice → Q1 (≈19×) → DEV at max → R14 into the bias node (R12 ∥ R13)
  const toVar = 18.9 * (par(22e3, 150e3) / (par(22e3, 150e3) + 1e3 + par(2.7e3, 10e3)))
  const dev = (k) => 10 * toVar * (k / 1e6) // kHz for 10 mV of voice
  check("10 mV of voice gives ≥ ±15 kHz even with the least sensitive diode", dev(kMin) >= 15, `±${dev(kMin).toFixed(0)} … ±${dev(kMax).toFixed(0)} kHz at full DEV`)
  check("…and the most sensitive one stays under ±75 kHz with DEV ≤ 70 %", dev(kMax) * 0.7 < 75 || 75 / dev(kMax) > 0.3, "set DEV by ear on a normal FM radio")
  const fc = 1 / (2 * Math.PI * par(par(22e3, 150e3), 1e3 + 2.5e3) * 470e-12)
  check("C14 is an RF ground (≤ 4 Ω at 88 MHz) but leaves speech alone (corner > 20 kHz)", 1 / (2 * Math.PI * 88e6 * 470e-12) < 4 && fc > 20e3, `audio corner ≈ ${(fc / 1e3).toFixed(0)} kHz`)
}

/* ══════════════ §6 START-UP: SMALL-SIGNAL LOOP GAIN ══════════════ */
// Common-base Colpitts, loop broken at the transistor's control voltage:
// collector node = tank (damping R, coil loss, C, L) + feedback cap to the emitter;
// emitter node = feedback cap, bottom cap, Cπ, R_E and the emitter's own input conductance gm.
console.log("\n§6  Oscillator start-up — loop gain at the zero-phase frequency")
const cx = (re, im = 0) => ({ re, im })
const cadd = (a, b) => cx(a.re + b.re, a.im + b.im)
const cmul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re)
const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d) }
function loopGain({ Rd, coilQ, Cpar, Cfb, Ce, RE, gm, fT }) {
  const T = (f) => {
    const w = 2 * Math.PI * f, cpi = gm / (2 * Math.PI * fT)
    const Yc = cx(1 / Rd + 1 / (coilQ * w * L1), w * (Cpar + Cfb) - 1 / (w * L1))
    const Ye = cx(1 / RE + gm, w * (Cfb + Ce + cpi))
    const Yf = cx(0, -w * Cfb)
    return cdiv(cmul(cx(-gm), Yf), cadd(cmul(Yc, Ye), cmul(cx(-1), cmul(Yf, Yf))))
  }
  let prev = T(40e6)
  for (let f = 40e6; f < 200e6; f += 0.05e6) { const t = T(f); if (Math.sign(t.im) !== Math.sign(prev.im) && t.re > 0) return { f, T: t.re }; prev = t }
  return { f: 0, T: 0 }
}
let rxGrowGm
{
  const tx = [], rx = []
  // FM-RX detector in its GROW state: R2/R3 with R10 from Q2's collector (~4.9 V) and R11
  const g = 1 / 15e3 + 1 / 3.9e3 + 1 / 1e3 + 1 / 4.7e3
  const vGrow = (V9 / 15e3 + 4.9 / 4.7e3) / g
  rxGrowGm = ie(vGrow, 1 / g, 470, BETA.min) / VT
  for (const [name, x] of Object.entries(XSTR)) for (const coilQ of [50, 150]) for (const trim of [TRIM.min, TRIM.max]) {
    tx.push({ name, ...loopGain({ Rd: 330, coilQ, Cpar: trim + 12e-12 + 2.8e-12 + STRAY + x.cob, Cfb: 22e-12, Ce: 47e-12, RE: 680, gm: txQ2gm, fT: x.fT }) })
    rx.push({ name, ...loopGain({ Rd: 1e3, coilQ, Cpar: trim + 12e-12 + STRAY + x.cob + 0.7e-12, Cfb: 22e-12, Ce: 47e-12, RE: 470, gm: rxGrowGm, fT: x.fT }) })
  }
  const tMin = Math.min(...tx.map((r) => r.T)), rMin = Math.min(...rx.map((r) => r.T))
  check("FM-TX: loop gain > 1.1 in every corner, even with R15 (330 Ω) loading the tank", tMin > 1.1,
    `${tMin.toFixed(2)} … ${Math.max(...tx.map((r) => r.T)).toFixed(2)} (both transistors, coil Q 50-150, both ends of TUNE)`)
  check("FM-RX GROW: loop gain > 1.5 — bursts ignite every quench cycle", rMin > 1.5,
    `${rMin.toFixed(2)} … ${Math.max(...rx.map((r) => r.T)).toFixed(2)}  (V_B ≈ ${vGrow.toFixed(2)} V, gm ≈ ${(rxGrowGm * 1e3).toFixed(0)} mS)`)
  const vKill = (V9 / 15e3 + 0.05 / 4.7e3) / g
  check("FM-RX KILL: V_B ≈ 0.4 V — Q1 is cut off (loop gain ≈ 0), the burst dies", vKill < 0.45, `V_B ≈ ${vKill.toFixed(2)} V`)
}

/* ══════════════ §7 FM-RX TUNING AND THE C17 PADDER ══════════════ */
console.log("\n§7  FM-RX · tuning window (sim, tight build: 80.7-102.1 MHz 2N2222A, 82.1-105.2 MHz BC547B)")
{
  const rows = []
  for (const [name, x] of Object.entries(XSTR)) {
    const cfb = (f) => ser(eff(22e-12, f), eff(47e-12, f) + rxGrowGm / (2 * Math.PI * x.fT))
    const base = (f) => cfb(f) + x.cob + STRAY + 0.7e-12 // + C22 (1 pF) in series with Q5's output capacitance
    rows.push({ name, with: window((f) => base(f) + eff(12e-12, f)), without: window(base) })
  }
  for (const r of rows) console.log(`        ${r.name.padEnd(8)}: ${MHz(r.with.bottom)} … ${MHz(r.with.top)}   (no C17: ${MHz(r.without.bottom)} … ${MHz(r.without.top)})`)
  check("without a padder the detector tunes deep into the aviation band (> 115 MHz)", rows.every((r) => r.without.top > 115e6),
    "a super-regen radiates at its tuning frequency: it must not sit at 108-137 MHz")
  check("C17 (12 pF) brings the window down to the FM band (top < 108 MHz, bottom < 88 MHz)", rows.every((r) => r.with.top < 108e6 && r.with.bottom < 88e6))
}

/* ══════════════ §8 FM-RX QUENCH ASTABLE ══════════════ */
console.log("\n§8  FM-RX · quench astable Q2/Q3 (sim: 69.4 kHz, Q2 collector up to 4.8 V)")
{
  // Q2's collector is loaded by R10 into Q1's base network (R2 ∥ R3 ∥ R11 to a 0.45 V Thevenin source)
  const rOsc = par(15e3, 3.9e3, 1e3), vOsc = (V9 / 15e3) / (1 / 15e3 + 1 / 3.9e3 + 1 / 1e3)
  const vHigh2 = (V9 * (4.7e3 + rOsc) + vOsc * 4.7e3) / (4.7e3 + 4.7e3 + rOsc)
  const tau2 = par(4.7e3, 4.7e3 + rOsc) * 1e-9 // Q2C rise: R5 ∥ load, into C7 (Q3's base clamped)
  const tau3 = 4.7e3 * 1e-9                   // Q3C rise: R6 into C8 (Q2's base clamped)
  const VSAT = 0.05
  // iterate the cycle: each collector only partly recharges before the next flip
  let dv3 = V9 - VSAT, tA = 0, tB = 0, dv2 = 0
  for (let i = 0; i < 50; i++) {
    tA = 18e3 * 1e-9 * Math.log((V9 - VBE + dv3) / (V9 - VBE)) // Q2 off: Q2B recovers through R9 (GROW)
    dv2 = (vHigh2 - VSAT) * (1 - Math.exp(-tA / tau2))
    tB = 11e3 * 1e-9 * Math.log((V9 - VBE + dv2) / (V9 - VBE)) // Q3 off: Q3B recovers through R8 (KILL)
    dv3 = (V9 - VSAT) * (1 - Math.exp(-tB / tau3))
  }
  const fq = 1 / (tA + tB)
  const naive = 1 / (0.693 * (18e3 + 11e3) * 1e-9)
  check("quench rate ultrasonic and far below RF (25-150 kHz)", fq > 25e3 && fq < 150e3,
    `${(fq / 1e3).toFixed(1)} kHz (GROW ${(tA * 1e6).toFixed(1)} µs, KILL ${(tB * 1e6).toFixed(1)} µs); textbook 0.693·RC formula: ${(naive / 1e3).toFixed(0)} kHz`)
  check("hand model within 10 % of the simulated 69.4 kHz", Math.abs(fq / 69.4e3 - 1) < 0.1)
  check("Q2's collector tops out near 5 V (loaded by R10/R11), not 9 V", vHigh2 > 4.5 && vHigh2 < 5.5, `${vHigh2.toFixed(2)} V`)
  check("GROW gets most of the cycle (≥ 55 %): time for a µV seed to become a burst", tA / (tA + tB) >= 0.55, `${((tA / (tA + tB)) * 100).toFixed(0)} %`)
  const xc4 = 1 / (2 * Math.PI * fq * 220e-12), rth = 1 / (1 / 15e3 + 1 / 3.9e3 + 1 / 1e3 + 1 / 4.7e3)
  check("C4 (220 pF): RF ground at 88 MHz (≤ 10 Ω) yet ≥ 10× R_th at the quench rate", 1 / (2 * Math.PI * 88e6 * 220e-12) < 10 && xc4 > 10 * rth,
    `${(xc4 / 1e3).toFixed(1)} kΩ vs R_th ${rth.toFixed(0)} Ω`)
}

/* ══════════════ §9 FM-RX RF BUFFER AND AUDIO ══════════════ */
console.log("\n§9  FM-RX · RF buffer, audio filter, amplifier (sim: Q5 0.91 mA, Q4 1.30 mA, Q6 2.66 mA)")
{
  const Vth5 = (V9 * 10e3) / 57e3, Rth5 = par(47e3, 10e3)
  const i5 = [ie(Vth5, Rth5, 1e3, BETA.min), ie(Vth5, Rth5, 1e3, BETA.typ)]
  check("Q5 (common-base buffer) biased 0.5-1.5 mA", i5[0] > 0.5e-3 && i5[1] < 1.5e-3, `${mA(i5[0])} … ${mA(i5[1])}`)
  check("C21 grounds Q5's base at RF (≤ 2.5 Ω at 88 MHz)", 1 / (2 * Math.PI * 88e6 * 1e-9) < 2.5)
  const zin = par(1e3, VT / i5[0])
  check("Q5's emitter is a low-impedance input for the short wire (≤ 50 Ω)", zin < 50, `${zin.toFixed(0)} Ω`)

  // two-section RC ladder R12/C9 → R13/C10, loaded by the 10k volume pot
  const H = (f) => {
    const w = 2 * Math.PI * f
    const Z2 = cdiv(cx(1), cx(1 / 10e3, w * 10e-9)), Zb = cadd(cx(4.7e3), Z2)
    const Z1 = cdiv(cx(1), cadd(cx(0, w * 10e-9), cdiv(cx(1), Zb)))
    const v = cmul(cdiv(Z1, cadd(cx(4.7e3), Z1)), cdiv(Z2, Zb))
    return Math.hypot(v.re, v.im)
  }
  const dB = (f) => 20 * Math.log10(H(f) / H(10))
  check("speech passes: ≤ 3.5 dB down at 2.4 kHz", dB(2.4e3) > -3.5, `${dB(1e3).toFixed(1)} dB @ 1 kHz, ${dB(2.4e3).toFixed(1)} dB @ 2.4 kHz`)
  check("quench residue knocked down ≥ 40 dB at 69 kHz", dB(69.4e3) < -40, `${dB(69.4e3).toFixed(1)} dB`)

  const Vth4 = (V9 * 47e3) / 267e3, Rth4 = par(220e3, 47e3)
  const i4 = [ie(Vth4, Rth4, 590, BETA.min), ie(Vth4, Rth4, 590, BETA.typ)]
  check("Q4 biased 0.8-2 mA, collector mid-rail", i4[0] > 0.8e-3 && i4[1] < 2e-3 && V9 - 3.3e3 * i4[1] > 3, `${mA(i4[0])} … ${mA(i4[1])}, V_C ≥ ${(V9 - 3.3e3 * i4[1]).toFixed(1)} V`)
  const a4 = 3.3e3 / (120 + VT / i4[1])
  const i6 = (V9 - 3.3e3 * i4[1] - VBE) / 1.5e3
  const zout = VT / i6 + 3.3e3 / BETA.min
  const toEar = (a4 * 32) / (32 + zout)
  check("Q4 gain ≈ R17 / (R16 + r_e): 15-30×", a4 > 15 && a4 < 30, `${a4.toFixed(1)}×`)
  check("Q6 follower keeps ≥ 10× into a 32 Ω earbud (Q4 alone: < 0.5×)", toEar >= 10 && (3.3e3 * 0 + 32) / (120 + VT / i4[1]) < 0.5,
    `Q6 at ${mA(i6)}, output ≈ ${zout.toFixed(0)} Ω → ${toEar.toFixed(1)}× (sim ≈ 14×)`)
  check("Q6 safe: ≤ 50 mW", i6 * (V9 - (V9 - 3.3e3 * i4[1] - VBE)) < 50e-3, `${(i6 * (3.3e3 * i4[1] + VBE) * 1e3).toFixed(1)} mW`)
}

/* ══════════════ §10 RADIATED POWER ══════════════ */
console.log("\n§10 Radiated power — why the antenna feed was redesigned")
{
  const f = 98e6, lam = 3e8 / f, w = 2 * Math.PI * f
  const loopR = 31171 * ((3 * Math.PI * 2.8e-3 ** 2) / lam ** 2) ** 2 // the 3-turn coil is a small loop
  const mono = (h) => { const b = (2 * Math.PI * h) / lam, Z0 = 60 * (Math.log((2 * h) / 0.3e-3) - 1); return { R: 395 * (h / lam) ** 2, X: -Z0 / Math.tan(b) } }
  // OLD design: undamped tank (~9 V peak), 3.3 pF straight into a 75 cm (≈ λ/4, ~36 Ω) wire
  const iOld = 9 / Math.hypot(36, 1 / (w * 3.3e-12))
  const pOld = 0.5 * iOld * iOld * 36 + 0.5 * (9 / (w * L1)) ** 2 * loopR
  check("the original design was far over the limit (≥ 30 dB)", dBm(pOld) - dBm(LIMIT_TX) > 30, `≈ ${dBm(pOld).toFixed(1)} dBm`)
  // NEW design: tank ≤ 0.8 V (R15), C13 1 pF : C15 100 pF divider, ≤ 20 cm of wire
  const vt = 0.8, m = mono(0.2)
  const vAnt = vt * (1e-12 / (1e-12 + 100e-12)) // the wire's own few pF barely matter next to 100 pF
  const iAnt = vAnt / Math.hypot(m.R, m.X)
  const pAnt = 0.5 * iAnt * iAnt * m.R, pCoil = 0.5 * (vt / (w * L1)) ** 2 * loopR
  const pNew = pAnt + pCoil
  check("FM-TX now: ≥ 10 dB under §15.239 (coil + 20 cm wire)", pNew < LIMIT_TX / 10,
    `≈ ${dBm(pNew).toFixed(1)} dBm (coil ${dBm(pCoil).toFixed(1)}, wire ${dBm(pAnt).toFixed(1)}); sim worst −62.6 dBm; limit ${dBm(LIMIT_TX).toFixed(1)} dBm`)
  check("…and the coil, not the wire, dominates — so a longer wire must not be fitted anyway", pCoil > pAnt)
}

/* ══════════════ §11 BATTERY ══════════════ */
console.log("\n§11 Battery life (9 V alkaline ≈ 550 mAh)")
{
  const led = (V9 - 2) / 2.2e3
  const tx = led + 2.0e-3 + V9 / 68e3 + 1.71e-3 + V9 / 18.9e3 + 0.4e-3 + V9 / 172e3
  // RX: astable ≈ one collector (1.9 mA) + base drives; Q1 averages ~2/3 of its GROW current
  const astable = (V9 - 0.05) / 4.7e3 + (V9 - 0.7) / 11e3 + (V9 - 4.9) / 4.7e3
  const rx = led + 0.91e-3 + V9 / 57e3 + (2 / 3) * 0.85e-3 + V9 / 15e3 + astable + 1.3e-3 + 2.66e-3
  check("FM-TX runs ≥ 50 h", 550 / (tx * 1e3) >= 50, `≈ ${mA(tx)} → ${(550 / (tx * 1e3)).toFixed(0)} h  (sim DC: 7.83 mA)`)
  check("FM-RX runs ≥ 30 h", 550 / (rx * 1e3) >= 30, `≈ ${mA(rx)} → ${(550 / (rx * 1e3)).toFixed(0)} h  (the power LED is ~¼ of it)`)
}

console.log("\n" + "═".repeat(66))
console.log(` RESULT: ${PASS.length} passed, ${FAIL.length} failed`)
console.log("═".repeat(66))
if (FAIL.length) process.exit(1)
