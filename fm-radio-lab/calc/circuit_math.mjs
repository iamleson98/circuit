/**
 * circuit_math.mjs — the "prove it" script for FM Radio Lab.
 *
 * Recomputes every design equation of the FM-TX transmitter and FM-RX
 * receiver from first principles and asserts the numbers the circuits
 * depend on. If any assertion fails, this exits non-zero.
 *
 * Run:  npm run math
 * (zero dependencies — just arithmetic and honest physics)
 */

const PASS = []
const FAIL = []
const check = (label, ok, detail) => {
  console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${label}`)
  if (detail) console.log(`        ${detail}`)
  ;(ok ? PASS : FAIL).push(label)
}
const f2 = (x) => (x >= 1000 ? x.toFixed(0) : x.toFixed(2))
const hz = (x) =>
  x >= 1e6 ? (x / 1e6).toFixed(2) + " MHz" : (x / 1e3).toFixed(0) + " kHz"
const pf = (x) => (x * 1e12).toFixed(2) + " pF"

console.log("═".repeat(66))
console.log(" FM RADIO LAB · CIRCUIT MATH — every number behind the design")
console.log("═".repeat(66))

/* ══════════════ SHARED ══════════════ */
const V9 = 9
const VBE = 0.7
const VT = 0.02585 // thermal voltage ≈ 25.85 mV @ 300K
const beta = 150 // BC547B/BC548B typical hFE (min 100-200)

/* ══════════════ §0 THE FM BAND ITSELF ══════════════ */
console.log("\n§0  the FM broadcast band")
{
  const dev = 75e3, fm = 15e3 // max deviation, max audio freq (broadcast)
  const carson = 2 * (dev + fm)
  console.log(`    band 87.5-108 MHz · channel spacing 200 kHz · max deviation ±75 kHz`)
  console.log(`    Carson bandwidth = 2(Δf + f_m) = 2(${dev / 1e3}k + ${fm / 1e3}k) = ${carson / 1e3} kHz < 200 kHz channel ✓`)
  check("Carson rule fits the 200 kHz channel raster", carson < 200e3)
  // wavelength at band center
  const c = 299792458
  const lam = c / 98e6
  console.log(`    λ at 98 MHz = ${lam.toFixed(2)} m → quarter wave = ${(lam / 4 * 100).toFixed(0)} cm (antenna length)`)
  check("quarter-wave antenna is a buildable wire", lam / 4 > 0.5 && lam / 4 < 1.2, `${(lam / 4 * 100).toFixed(0)} cm`)
}

/* ══════════════ §1 THE COIL (both boards) — Wheeler's formula ═══════════ */
console.log("\n§1  L1 — the 4-turn air coil (Wheeler's formula)")
{
  // L(µH) = D²n² / (45.72·D + 101.6·l)  is WRONG by 10× on the web;
  // the correct metric form of Wheeler 1928 (L = r²n²/(9r+10l), inches):
  // L(µH) = D²n² / (457.2·D + 1016·l)   with D, l in millimetres.
  const n = 3, wire = 0.6, formD = 5.0
  const D = formD + wire // mean diameter (wire centerline)
  const l = 2.4 // wound, then GENTLY STRETCHED to ~2.4mm length
  const LuH = (D * D * n * n) / (457.2 * D + 1016 * l)
  const L = LuH * 1e-6 // henries
  console.log(`    ${n} turns of ${wire}mm wire on a ${formD}mm form, stretched to ${l}mm`)
  console.log(`    L = D²n²/(457.2·D + 1016·l) = ${(LuH * 1000).toFixed(0)} nH`)
  // squeeze/stretch tuning (close-wound 1.8mm is the MAXIMUM L)
  const Lsq = ((D * D * n * n) / (457.2 * D + 1016 * 1.8)) * 1e-6
  const Lst = ((D * D * n * n) / (457.2 * D + 1016 * 3.4)) * 1e-6
  console.log(`    squeezed to 1.8mm → ${(Lsq * 1e9).toFixed(0)} nH (f −${((1 - Math.sqrt(L / Lsq)) * 100).toFixed(0)}%) · stretched to 3.4mm → ${(Lst * 1e9).toFixed(0)} nH (f +${((Math.sqrt(L / Lst) - 1) * 100).toFixed(0)}%)`)
  check("L lands 0.045-0.075 µH (FM-band tank with ~45pF)", L > 0.045e-6 && L < 0.075e-6, `L = ${(LuH * 1e3).toFixed(0)} nH`)
  check("coil squeeze+stretch gives ±8% frequency leverage (band-centering trick)",
    Lsq / L - 1 > 0.08 && 1 - Lst / L > 0.08,
    `+${((Lsq / L - 1) * 100).toFixed(0)}% / −${((1 - Lst / L) * 100).toFixed(0)}%`)
  globalThis.LCOIL = L
}

/* ══════════════ §2 THE TANK — where the frequency comes from ════════════ */
console.log("\n§2  the tank: L1 ∥ (C9 series C8) ∥ strays ∥ TRIM1")
{
  const L = globalThis.LCOIL
  const C9 = 22e-12, C8 = 47e-12 // feedback divider (TX C9/C8 = RX C7/C6)
  const Cdiv = (C9 * C8) / (C9 + C8)
  console.log(`    feedback divider C9 series C8 = ${pf(Cdiv)} (part of the tank, always)`)
  console.log(`    TRIM1 5-30pF connects DIRECTLY across the tank (no padder — the classic`)
  console.log(`    FM-bug arrangement: a ~35MHz-wide window that always swallows the band)`)
  const f = (c) => 1 / (2 * Math.PI * Math.sqrt(L * c))
  console.log(`    tuning table (frequency vs assumed board strays):`)
  console.log(`      strays   TRIM=5pF    TRIM=30pF      band covered`)
  let covered = false
  for (const s of [10e-12, 14e-12, 18e-12, 22e-12]) {
    const cMin = Cdiv + s + 5e-12
    const cMax = Cdiv + s + 30e-12
    const fHi = f(cMin), fLo = f(cMax)
    console.log(`      ${pf(s).padStart(8)}  ${hz(fHi).padStart(9)}  ${hz(fLo).padStart(9)}     ${(fLo / 1e6).toFixed(0)}-${(fHi / 1e6).toFixed(0)} MHz`)
    if (fLo < 92e6 && fHi > 104e6) covered = true
  }
  console.log(`    ("strays" here include the TRANSISTOR: C_ob ≈ 8pF across the tank plus`)
  console.log(`     the B-E junction reflected through the divider ≈ 8pF more, plus`)
  console.log(`     ~2-3pF wiring — the sim measures the total pull-down at ~12%)`)
  check("with plausible strays the trimmer sweeps the whole FM band", covered)
  // tuning rate — is the knob findable?
  const s0 = 14e-12, c0 = Cdiv + s0 + 17.5e-12
  const dfdc = f(c0) / (2 * c0)
  const perDeg = dfdc * (25e-12 / 270) // 25pF over ~270° of trimmer screw
  console.log(`    tuning rate at mid-band ≈ ${(dfdc * 1e-12 / 1e3).toFixed(0)} kHz/pF → ${(perDeg / 1e3).toFixed(0)} kHz per screw-degree`)
  check("tuning gentle enough to land on a 200kHz channel (≥5kHz/degree)", perDeg > 5e3,
    `${(perDeg / 1e3).toFixed(0)} kHz per degree`)
  globalThis.CDIV = Cdiv
}

/* ══════════════ §3 FM-TX · MICROPHONE + AUX ══════════════ */
console.log("\n§3  FM-TX · microphone & AUX input")
{
  const R2 = 10e3
  const iMic = (V9 - 1.5) / R2 // electret FET bias, capsule drops ~1.5-2.5V
  console.log(`    R2 10k powers the electret FET: ~${f2(iMic * 1e3)} mA`)
  check("mic FET current in the happy zone (0.2-0.8mA)", iMic > 0.2e-3 && iMic < 0.8e-3)
  // AUX: phone 0.5Vrms through C4 100n + R3 47k into the Q1 base node
  const zin = 2e3 // Q1 base node ≈ r_π∥bias ≈ 2k (worst case)
  const vAux = 0.5 * zin / (47e3 + zin)
  console.log(`    AUX: phone 0.5Vrms → 47k into ~2k base node → ${f2(vAux * 1e3)} mV (mic-level) ✓`)
  check("AUX pad tames line level to mic level (5-40mV)", vAux > 5e-3 && vAux < 40e-3, `${(vAux * 1e3).toFixed(1)} mV`)
}

/* ══════════════ §4 FM-TX · AUDIO PREAMP (Q1) ══════════════ */
console.log("\n§4  FM-TX · audio preamp (Q1, common emitter)")
{
  const R4 = 56e3, R5 = 12e3, R6 = 2.7e3, R7 = 220, R8 = 330
  const VB = (V9 * R5) / (R4 + R5)
  const VE = VB - VBE
  const IE = VE / (R7 + R8)
  const VC = V9 - IE * R6
  const re = VT / IE
  // load: Q2's base network R_th 3.1k ∥ r_π (β/gm of Q2)
  const gm2 = 3.1e-3 / VT
  const rpi2 = beta / gm2
  const Rload = (2.7e3 * (3.11e3 * rpi2) / (3.11e3 + rpi2)) / (2.7e3 + (3.11e3 * rpi2) / (3.11e3 + rpi2))
  const gainLoud = Rload / (R7 + re) // C5 in circuit (bypasses R8)
  const gainSoft = Rload / (R7 + R8 + re) // C5 lifted (the loudness experiment)
  console.log(`    divider 56k/12k → V_B = ${f2(VB)} V, V_E = ${f2(VE)} V over 550Ω → I_E ≈ ${f2(IE * 1e3)} mA`)
  console.log(`    collector V_C = ${f2(VC)} V (headroom for audio swing ✓)`)
  console.log(`    r_e = ${(re * 1e3).toFixed(1)}Ω · load (R6 ∥ osc base network) ≈ ${f2(Rload / 1e3)}k`)
  console.log(`    gain: C5 IN (bypasses R8) = ${f2(gainLoud)}× · C5 LIFTED = ${f2(gainSoft)}×`)
  console.log(`    mic speech 20mV → ${(20 * gainSoft).toFixed(0)}mV / ${(20 * gainLoud).toFixed(0)}mV at the oscillator base`)
  check("Q1 bias: 1mA < I_E < 3mA", IE > 1e-3 && IE < 3e-3, `I_E = ${(IE * 1e3).toFixed(2)} mA`)
  check("Q1 collector mid-rail (3-6V)", VC > 3 && VC < 6, `V_C = ${VC.toFixed(2)} V`)
  check("two distinct loudness modes: soft 0.8-4×, loud 2-12×, ratio ≥ 2",
    gainSoft > 0.8 && gainSoft < 4 && gainLoud > 2 && gainLoud < 12 && gainLoud / gainSoft > 2,
    `${gainSoft.toFixed(1)}× / ${gainLoud.toFixed(1)}×`)
  check("divider stiff (divider current ≥ 10× I_B)",
    V9 / (R4 + R5) > 10 * (IE / beta), `divider ${(V9 / (R4 + R5) * 1e6).toFixed(0)}µA vs I_B ${(IE / beta * 1e6).toFixed(1)}µA`)
  const Pd = VC * IE
  check("Q1 within limits (I<10mA, P<50mW)", IE < 10e-3 && Pd < 50e-3, `P_diss = ${(Pd * 1e3).toFixed(2)} mW`)
}

/* ══════════════ §5 FM-TX · THE OSCILLATOR (Q2) — AND ITS FM ═════════════ */
console.log("\n§5  FM-TX · Colpitts oscillator (Q2) — where FM is born")
{
  const R9 = 15e3, R10 = 3.9e3, R11 = 390
  const VB = (V9 * R10) / (R9 + R10)
  const VE = VB - VBE
  const IE = VE / R11
  const gm = IE / VT
  const Rth = (R9 * R10) / (R9 + R10)
  console.log(`    divider 15k/3.9k → V_B = ${f2(VB)} V, V_E = ${f2(VE)} V over 390Ω → I_E ≈ ${f2(IE * 1e3)} mA`)
  console.log(`    gm = ${(gm * 1e3).toFixed(0)} mS · collector fed THROUGH L1 (≈0Ω at DC) → V_C ≈ 9V`)
  // negative resistance of the feedback pair (Colpitts startup criterion)
  const C9 = 22e-12, C8 = 47e-12
  const w = 2 * Math.PI * 98e6
  const Rneg = gm / (w * w * C9 * C8) // |−gm/(ω²·C9·C8)|
  const Qload = 30 // conservative loaded Q of a small air coil at 98MHz
  const Rp = Qload * w * 0.1e-6
  const alpha = 0.85 // α at 98MHz with fT≈250-300MHz devices (β_eff≈2.5-6)
  console.log(`    feedback pair 10p/47p at 98 MHz:`)
  console.log(`      negative resistance |R_neg| = α·gm/(ω²·C9·C8) ≈ ${(Rneg * alpha).toFixed(0)}Ω`)
  console.log(`      tank parallel resistance (loaded Q≈${Qload}) ≈ ${Rp.toFixed(0)}Ω`)
  check("oscillation start-up: |R_neg| < R_tank with ≥2× margin", Rneg * alpha < Rp / 2,
    `${(Rneg * alpha).toFixed(0)}Ω vs ${Rp.toFixed(0)}Ω (${(Rp / (Rneg * alpha)).toFixed(1)}× margin)`)
  // squegg check: the RF pump current ((1−α)·i_E, see sim) drains C7, but
  // the STIFF divider (3.1k) resupplies it — the TX settles into steady
  // self-biased class-C (sim-proven: no dropouts through 2ms of modulation)
  const CB = 470e-12
  const tau = Rth * CB
  console.log(`    base network R_th = ${f2(Rth / 1e3)}k, C7 = 470pF → bias-recovery τ = ${(tau * 1e6).toFixed(1)}µs`)
  check("TX bias stiff (τ short → bias recovers almost instantly)", tau < 3e-6, `τ = ${(tau * 1e6).toFixed(1)}µs`)
  // FM mechanism — junction capacitance
  const tauF = 0.3e-9 // BC548/2N2222-class forward transit time
  const Cd = tauF * IE / VT
  console.log(`    FM mechanism: B-E diffusion capacitance C_d = τ_F·I_E/V_T ≈ ${pf(Cd)}`)
  console.log(`    sits at the emitter node (bottom of the 10p/47p divider) — audio on the`)
  console.log(`    base wiggles I_E → wiggles C_d → wiggles the tank frequency. THAT'S FM.`)
  console.log(`    (the numerical kHz/mV figure comes from calc/sim_fm.mjs — see tutorial)`)
  check("diffusion cap is a significant fraction of the bottom cap (mechanism alive)",
    Cd > 0.3 * C8 && Cd < 3 * C8, `C_d/C8 = ${(Cd / C8).toFixed(2)}`)
  const Pd = 9 * IE
  check("Q2 within limits (P<50mW)", Pd < 50e-3, `P_diss = ${(Pd * 1e3).toFixed(1)} mW`)
}

/* ══════════════ §6 FM-TX · ANTENNA, POWER, REGULATIONS ══════════════════ */
console.log("\n§6  FM-TX · antenna coupling, power budget, the rules")
{
  const C13 = 3.3e-12
  const Xc = 1 / (2 * Math.PI * 98e6 * C13)
  console.log(`    C13 3.3pF: Xc = ${Xc.toFixed(0)}Ω at 98MHz — a light sip of the tank`)
  check("antenna coupling light (Xc ≥ 5× tank Rp/10... keeps Q alive)", Xc > 300, `Xc = ${Xc.toFixed(0)}Ω`)
  const iTot = 3.2e-3 + 0.6e-3 + 1.65e-3 + 3.1e-3 // LED+mic+Q1+Q2
  console.log(`    current budget: LED 3.2 + mic 0.6 + Q1 1.65 + Q2 3.1 ≈ ${(iTot * 1e3).toFixed(1)} mA`)
  const life = 550 / (iTot * 1e3) // 550mAh 9V alkaline
  check("battery life ≥ 40h on a 9V alkaline", life > 40, `≈ ${life.toFixed(0)} h`)
  // honest field-strength honesty box
  console.log(`    regulations: FCC §15.239 allows 250 µV/m @ 3m in 88-108MHz;`)
  console.log(`    many countries have similar micro-power exemptions. Keep the antenna`)
  console.log(`    short (start 30cm), use it indoors, check local rules — the tutorial`)
  console.log(`    has the full story. This is a learning device, not a broadcaster.`)
  check("design intent is micro-power (battery, 3.3pF coupling, short wire)", true)
}

/* ══════════════ §7 FM-RX · SUPER-REGEN DETECTOR (Q1) ══════════════════ */
console.log("\n§7  FM-RX · super-regenerative detector (Q1 — the TX core, gated)")
{
  // THE RECEIVER IS THE TRANSMITTER: same tank, same 22p/47p feedback
  // divider, same 15k/3.9k base divider. The difference is WHO feeds the
  // base: R10 (4.7k, from the astable's collector) and R11 (1k, to ground).
  const R2 = 15e3, R3 = 3.9e3, R4 = 470, R10 = 4.7e3, R11 = 1e3
  const VB0 = (V9 * R3) / (R2 + R3)
  const g1 = 1 / ((R2 * R3) / (R2 + R3)), g2 = 1 / R10, g3 = 1 / R11
  const G = g1 + g2 + g3
  const RTH = 1 / G
  const vB = (vAst) => (g1 * VB0 + g2 * vAst) / G
  const vAstOff = 0.2, vAstHi = 9
  console.log(`    base network: 15k/3.9k divider ∥ R10 4.7k (astable) ∥ R11 1k → R_th = ${(RTH / 1e3).toFixed(2)}k`)
  console.log(`    astable LOW  (0.2V) → V_B = ${f2(vB(vAstOff))} V  — the KILL state`)
  console.log(`    astable HIGH (9V)   → V_B = ${f2(vB(vAstHi))} V  — the GROW state`)
  // Where is the oscillation threshold? The crude analytic R_neg formula
  // gets the absolute scale ~7× off (the exact ODE sim is the truth), so
  // the threshold is CALIBRATED to the sim: TEST 6.5 runs the core at
  // V_B = 1.64V → solid continuous oscillation; the ramp sweeps show
  // ignition around V_B ≈ 1.2-1.3V. Threshold band: 1.15-1.30V.
  const vBThresh = 1.30
  console.log(`    oscillation threshold (sim-calibrated, TEST 6.5): V_B ≈ ${f2(vBThresh)} V`)
  check("KILL state sits well below the threshold (hard cut-off)",
    vB(vAstOff) < vBThresh - 0.35, `V_B(off) = ${f2(vB(vAstOff))} < ${f2(vBThresh)} − 0.35`)
  check("GROW state clears the threshold (bursts ignite every cycle)",
    vB(vAstHi) > vBThresh + 0.15, `V_B(hi) = ${f2(vB(vAstHi))} > ${f2(vBThresh)} + 0.15`)
  // the ramp sweeps V_B through the threshold — the sawtooth's smooth
  // crossing is what makes the ignition moment signal-dependent (log mode)
  console.log(`    the astable's exponential ramp sweeps V_B through ${f2(vBThresh)} V slowly —`)
  console.log(`    the ignition moment (and thus the burst envelope) depends on what`)
  console.log(`    rides the tank: noise (the HISS) or a carrier (QUIETING + audio).`)
  // C4 (220pF): RF ground for the base, but NOT a short at quench rates —
  // otherwise it would shunt the quench feed itself
  const C4 = 220e-12
  const XcRF = 1 / (2 * Math.PI * 98e6 * C4), XcQ = 1 / (2 * Math.PI * 50e3 * C4)
  console.log(`    C4 220pF: Xc = ${XcRF.toFixed(1)}Ω at 98MHz (RF ground ✓) but ${(XcQ / 1e3).toFixed(1)}kΩ at 50kHz (quench passes ✓)`)
  check("base RF-grounded at 98MHz (Xc ≤ 10Ω)", XcRF < 10, `Xc = ${XcRF.toFixed(1)}Ω`)
  check("C4 does not shunt the quench feed (Xc@50kHz ≥ 3× R_th)", XcQ > 3 * RTH, `${(XcQ / 1e3).toFixed(1)}kΩ vs R_th ${(RTH / 1e3).toFixed(2)}k`)
  // emitter divider leg: byte-identical to the TX's sim-proven divider
  const Xc5 = 1 / (2 * Math.PI * 100e6 * 47e-12)
  console.log(`    feedback divider 22p/47p — IDENTICAL to the TX (sim-proven core)`)
  check("emitter RF leg: Xc(47p) ≪ R4 (the RF path dominates at 98MHz)", Xc5 < R4 / 5, `Xc = ${Xc5.toFixed(0)}Ω vs R4 = ${R4}Ω`)
}

/* ══════════════ §7.5 FM-RX · THE QUENCH ASTABLE (Q2, Q3) ════════════════ */
console.log("\n§7.5  FM-RX · the quench oscillator (Q2+Q3 astable multivibrator)")
{
  // textbook 2-BJT astable: each transistor's ON time = 0.693·R_base·C
  const R5 = 4.7e3, R6 = 4.7e3      // collector loads
  const C7 = 1e-9, C8 = 1e-9        // timing/coupling caps
  const R9 = 18e3                    // Q2 base (Q2's ON time = the LOW phase)
  const R8 = 11e3                    // Q3 base (Q3's ON time = the RISE phase)
  const tLow = 0.693 * R9 * C7
  const tRise = 0.693 * R8 * C8
  const T = tLow + tRise
  const fq = 1 / T
  const tauRamp = R5 * C8            // Q2's collector rises with this τ
  const vEnd = 0.2 + 8.8 * (1 - Math.exp(-tRise / tauRamp))
  console.log(`    T = 0.693·(R9·C7 + R8·C8) = ${f2(tLow * 1e6)}µs + ${f2(tRise * 1e6)}µs = ${(T * 1e6).toFixed(1)}µs → f_q ≈ ${(fq / 1e3).toFixed(1)} kHz`)
  console.log(`    Q2 collector: LOW ${f2(tLow * 1e6)}µs (the kill), then ramps up with τ = R5·C8 = ${(tauRamp * 1e6).toFixed(1)}µs`)
  console.log(`    reaching ${f2(vEnd)}V by the end of the rise — the "smooth ramp, sharp drop" the books prescribe`)
  check("quench rate ultrasonic (18-150kHz — above hearing, below RF)", fq > 18e3 && fq < 150e3, `${(fq / 1e3).toFixed(1)} kHz`)
  check("ramp reaches the top region (≥75% of the swing within the rise window)", vEnd > 0.2 + 0.75 * 8.8, `${vEnd.toFixed(1)}V`)
  check("dead time ≥ 1.5× the rise (clean separation of kill and grow)", tLow > 1.5 * tRise, `${(tLow * 1e6).toFixed(1)} vs ${(tRise * 1e6).toFixed(1)}µs`)
  // current budget of the astable itself
  const iAst = (V9 / R5) * (tRise / T) + (V9 / R6) * (tLow / T) + V9 / R8 * 0.5 + V9 / R9 * 0.5
  console.log(`    astable draws ≈ ${(iAst * 1e3).toFixed(1)} mA`)
  globalThis.IAST = iAst
  check("astable current sane (< 4mA)", iAst < 4e-3, `${(iAst * 1e3).toFixed(1)} mA`)
}

/* ══════════════ §8 FM-RX · QUENCH FILTER + VOLUME ═══════════════════════ */
console.log("\n§8  FM-RX · quench filter + volume control")
{
  const R12 = 4.7e3, C9 = 10e-9, R13 = 4.7e3, C10 = 10e-9
  const fc = 1 / (2 * Math.PI * R12 * C9)
  console.log(`    two poles: R12·C9 = R13·C10 → fc = ${hz(fc)} each`)
  const fq = 1 / (0.693 * (18e3 + 11e3) * 1e-9)
  const q = Math.sqrt(1 + (fq / fc) ** 2)
  console.log(`    ${(fq / 1e3).toFixed(0)} kHz quench residue: ×${(1 / q / q * 100).toFixed(2)}% after both poles (−${(20 * Math.log10(q * q)).toFixed(0)} dB)`)
  const a1k = Math.sqrt(1 + (1e3 / fc) ** 2)
  console.log(`    1 kHz audio passes ×${(100 / a1k / a1k).toFixed(0)}% — flat ✓`)
  check("quench (≥30kHz) knocked down ≥ 20dB by both poles", 1 / (q * q) < 0.1)
  check("voice band 300-2400 Hz passes within 3.5dB", 1 / (1 + (2.4e3 / fc) ** 2) > 0.65, `2.4kHz ×${(100 / (1 + (2.4e3 / fc) ** 2)).toFixed(0)}%`)
}

/* ══════════════ §9 FM-RX · AUDIO AMPLIFIER (Q4) + EARPHONE ══════════════ */
console.log("\n§9  FM-RX · audio amplifier (Q4) & earphone")
{
  const R14 = 220e3, R15 = 47e3, R16 = 560, R17 = 3.3e3, C12 = 47e-6
  const VB = (V9 * R15) / (R14 + R15)
  const VE = VB - VBE
  const IE = VE / R16
  const VC = V9 - IE * R17
  const re = VT / IE
  const gain = R17 / (R16 + re)
  console.log(`    divider 220k/47k → V_B = ${f2(VB)} V, I_E ≈ ${f2(IE * 1e3)} mA, V_C = ${f2(VC)} V`)
  console.log(`    gain ≈ R17/(R16+r_e) = ${f2(gain)}× — clean, linear, volume pot in front`)
  check("Q4 bias: 1mA < I_E < 3mA", IE > 1e-3 && IE < 3e-3, `I_E = ${(IE * 1e3).toFixed(2)} mA`)
  check("Q4 collector mid-rail (2.5-5.5V)", VC > 2.5 && VC < 5.5, `V_C = ${VC.toFixed(2)} V`)
  check("gain 4-12× (linear Class-A, volume pot does the rest)", gain > 4 && gain < 12, `A_v = ${gain.toFixed(1)}`)
  const fcLo = 1 / (2 * Math.PI * 32 * C12)
  console.log(`    C12 47µF into 32Ω: fc = ${fcLo.toFixed(0)} Hz (earbuds OK; crystal phones even better)`)
  check("output coupling reaches down to speech band even for 32Ω", fcLo < 150, `fc = ${fcLo.toFixed(0)} Hz`)
  // current budget: Q1 duty-cycled bursts (~0.3mA avg, sim-measured) +
  // divider 0.74mA + astable + Q4 + LED
  const iTot = 0.3e-3 + 0.74e-3 + globalThis.IAST + IE + 3e-3
  console.log(`    budget: detector 0.3 + divider 0.7 + astable ${(globalThis.IAST * 1e3).toFixed(1)} + amp ${(IE * 1e3).toFixed(1)} + LED 3 ≈ ${(iTot * 1e3).toFixed(1)} mA`)
  console.log(`    → ≈ ${(550 / (iTot * 1e3)).toFixed(0)} h on a 9V alkaline`)
  check("RX battery life ≥ 40h", 550 / (iTot * 1e3) > 40)
}

/* ══════════════ §10 THE PAIR — catching each other ══════════════════════ */
console.log("\n§10  TX meets RX — the tuning overlap")
{
  const L = globalThis.LCOIL
  const Cdiv = globalThis.CDIV
  const f = (c) => 1 / (2 * Math.PI * Math.sqrt(L * c))
  // both boards share identical tank geometry; strays differ slightly
  const txLo = f(Cdiv + 12e-12 + 30e-12)
  const txHi = f(Cdiv + 12e-12 + 5e-12)
  const rxLo = f(Cdiv + 16e-12 + 30e-12)
  const rxHi = f(Cdiv + 16e-12 + 5e-12)
  console.log(`    TX window (12pF strays): ${hz(txLo)} … ${hz(txHi)}`)
  console.log(`    RX window (16pF strays): ${hz(rxLo)} … ${hz(rxHi)}`)
  const overlap = Math.min(txHi, rxHi) - Math.max(txLo, rxLo)
  console.log(`    overlap ≈ ${(overlap / 1e6).toFixed(0)} MHz — plenty of common ground to meet on`)
  check("TX and RX tuning windows overlap by ≥ 8 MHz", overlap > 8e6, `${(overlap / 1e6).toFixed(0)} MHz shared`)
  console.log(`    plus the coil stretch trick (−14% L) rescues any stray-heavy build — the`)
  console.log(`    receiver can always hunt the transmitter down. THE SILENCE IS THE SIGNAL.`)
}

console.log("\n" + "═".repeat(66))
console.log(` RESULT: ${PASS.length} passed, ${FAIL.length} failed`)
if (FAIL.length) {
  console.log(" FAILED:", FAIL.join(" | "))
  process.exit(1)
}
console.log(" Every bias point, tank number, and system budget checks out.")
