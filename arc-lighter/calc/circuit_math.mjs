/**
 * circuit_math.mjs — the arc lighter's design equations, asserted.
 *
 * Charging, battery budget, the MCU's supply filter, the power switch, the
 * driver's current limit and energy per cycle, the clamps, the monitor
 * divider and the firmware's thresholds — every number the board relies on.
 * The driver's real behaviour with real coils is simulated by
 * `npm run sim` (calc/sim_driver.mjs); numbers quoted "sim:" come from there.
 *
 * Run:  npm run math
 */
const PASS = [], FAIL = []
const check = (label, ok, detail) => {
  console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${label}`)
  if (detail) console.log(`        ${detail}`)
  ;(ok ? PASS : FAIL).push(label)
}
const mA = (i) => (i * 1e3).toFixed(1) + " mA"
const par = (...r) => 1 / r.reduce((s, x) => s + 1 / x, 0)

console.log("═".repeat(66))
console.log(" ARC LIGHTER · CIRCUIT MATH")
console.log("═".repeat(66))

/* §1 charging (MCP73831-2: 4.20 V, I = 1000 V / R_PROG) */
console.log("\n§1  USB charging")
{
  const R1 = 4.7e3, I = 1000 / R1
  check("charge current 150-300 mA (0.5-1 C for a 300-500 mAh cell)", I > 0.15 && I < 0.3, `I = 1000 V / 4.7 kΩ = ${mA(I)}`)
  const pd = (5.0 - 3.6) * I
  check("charger dissipation ≤ 0.35 W in SOT-23-5 (it throttles itself above that)", pd <= 0.35, `(5.0 − 3.6 V) × ${mA(I)} = ${(pd * 1e3).toFixed(0)} mW worst case`)
  const t300 = (0.3 / I) * 1.25, t500 = (0.5 / I) * 1.25
  check("a full charge takes 1.5-3 h", t300 > 1.2 && t500 < 3.5, `300 mAh ≈ ${t300.toFixed(1)} h, 500 mAh ≈ ${t500.toFixed(1)} h (×1.25 for the constant-voltage tail)`)
  const iLed = (5.0 - 2.0) / 1e3
  check("charge LEDs ≈ 3 mA (bright enough, < 25 mA STAT rating)", iLed > 2e-3 && iLed < 25e-3, mA(iLed))
}

/* §2 the cell */
console.log("\n§2  Battery: protected 1-cell LiPo, 300-500 mAh, ≥ 3 A continuous")
{
  const iArc = 2.11 // sim: worst-case average battery current while arcing
  const mins = (0.3 / iArc) * 60
  check("arc time per charge (300 mAh) ≥ 6 minutes — 70+ lights of 5 s", mins >= 6, `${mins.toFixed(1)} min at ${iArc} A (sim worst case)`)
  check("arc current < 3 A: below the pack protection's over-current trip", iArc < 3)
  // idle: LOCK open → nothing. Unlocked + asleep: ATtiny85 power-down + leakages
  const sleep = 0.2e-6 + 25e-6 // power-down (BOD may stay on in sleep on older silicon) — worst case
  const days = 0.3 / sleep / 24
  check("unlocked but asleep: drains a 300 mAh cell in no less than a year", days > 365, `≤ ${(sleep * 1e6).toFixed(0)} µA → ${(days / 365).toFixed(1)} years; locked: 0 µA`)
}

/* §3 MCU supply filter R4 + C4 */
console.log("\n§3  ATtiny85 supply: R4 = 10 Ω, C4 = 10 µF from VARM")
{
  const R = 10, C = 10e-6, f = 20e3
  const att = 1 / Math.sqrt(1 + (2 * Math.PI * f * R * C) ** 2)
  check("coil ripple (≥ 20 kHz) attenuated ≥ 20 dB at the MCU", att < 0.1, `${(20 * Math.log10(att)).toFixed(1)} dB`)
  check("DC drop at the MCU's 1-2 mA ≤ 20 mV (Q1's gate still fully off)", 2e-3 * R <= 0.02)
}

/* §4 the arc power switch Q1 (AO3401A: R_DS(on) ≤ 80 mΩ at −2.5 V, ≤ 50 mΩ at −4.5 V) */
console.log("\n§4  Q1 AO3401A high-side switch")
{
  const rds = 0.08, irms = 2.4
  const p = irms * irms * rds
  check("conduction loss ≤ 0.5 W at a nearly flat cell (SOT-23, ≤ 8 s at a time)", p <= 0.5, `${irms} A rms × ${rds * 1e3} mΩ = ${p.toFixed(2)} W`)
  check("gate pull-up R6 holds it off through reset and programming (100 kΩ to VARM)", true, "verify.mjs checks the netlist; firmware drives PB4 HIGH first thing")
}

/* §5 the driver */
console.log("\n§5  Driver: FZT851 + current limit (Q3, RE1 ∥ RE2)")
{
  const RE = par(0.51, 0.51), vbeQ3 = 0.65
  const ilim = vbeQ3 / RE
  check("peak current limit 2.3-3.0 A (FZT851 is rated 6 A, 20 A pulsed)", ilim > 2.3 && ilim < 3.0, `I_lim = 0.65 V / ${RE.toFixed(3)} Ω = ${ilim.toFixed(2)} A (sim peaks: 2.9-3.3 A incl. Q3's turn-on delay)`)
  // base drive through R10 + the feedback winding must saturate Q2 up to I_lim at the lowest gain
  const vbat = 3.2, vfb = 1.0, ib = (vbat + vfb - 0.85 - vbeQ3) / (47 + 0.5)
  check("R10 (47 Ω) supplies ≥ I_lim / h_FE(min 75) at a 3.2 V cell", ib >= ilim / 75, `I_B ≈ ${mA(ib)} ≥ ${mA(ilim / 75)}`)
  const pR10 = (4.2 + 2) ** 2 / 47 * 0.5
  check("R10 dissipation ≤ 0.5 W (1206: 0.25 W continuous, here ≤ 8 s)", pR10 <= 0.5, `≈ ${pR10.toFixed(2)} W peak-ish; sim measured 0.1-0.2 W`)
  // energy per cycle vs what the coil's own capacitance needs at breakdown
  const Lp = 100e-6, Cs = 6e-12, Vbd = 7e3
  const vmax = ilim * Math.sqrt(Lp / Cs)
  check("energy per cycle can charge the secondary past breakdown: I_lim·√(Lp/Cs) > 7 kV", vmax > Vbd * 1.2,
    `${(vmax / 1e3).toFixed(1)} kV for a 100 µH / 6 pF coil (needs Lp ≥ ${((Vbd / ilim) ** 2 * Cs * 1e6).toFixed(0)} µH at 6 pF)`)
  // TVS: the secondary can reach n × (V_clamp − V_bat) before the clamp eats the flyback
  const vclamp = 38, n = 250
  check("D2's clamp (≈38-40 V) still lets a 1:250 coil reach 8 kV", n * (vclamp - 4.2) > 8e3, `${((n * (vclamp - 4.2)) / 1e3).toFixed(1)} kV`)
  check("…and keeps Q2 below 75 % of its 60 V rating", 40 / 60 < 0.75)
  const pRE = 0.65 // sim: worst per-resistor dissipation while arcing
  check("emitter resistors: 2512 (1 W) each, ≤ 0.75 W in the worst simulated corner", pRE <= 0.75)
}

/* §6 oscillation monitor and USB sense */
console.log("\n§6  Monitors: R12/R13 (collector → PB2), R7/R8 (VBUS → PB0)")
{
  const k = 33e3 / (100e3 + 33e3)
  const vih = (vcc) => 0.6 * vcc
  const minFly = vih(4.2) / k
  check("a flyback above ≈10 V counts as HIGH even at VCC = 4.2 V", minFly < 11, `collector ≥ ${minFly.toFixed(1)} V (a 1:600 coil at 7 kV flies to ≈15 V)`)
  const iclamp = (40 - (4.2 + 0.5)) / 100e3
  check("at the 40 V clamp the pin's protection diode carries ≤ 1 mA", iclamp <= 1e-3, mA(iclamp))
  const fmax = 1e6 / 2.5
  check("T0 counts up to f_CPU / 2.5 = 400 kHz ≫ the coil rate (≤ 16.5 kHz simulated; 90 kHz allowed for)", fmax > 90e3 * 4)
  const vbs = 5 * 2.2 / 3.2
  check("USB sense: 5 V reads HIGH at any cell voltage (VIH ≤ 2.52 V)", vbs > vih(4.2), `${vbs.toFixed(2)} V`)
  const inject = (5 - 3.0 - 0.5) / 1e6
  check("…and back-feeds ≤ 2 µA when the lighter is locked (MCU stays dead)", inject <= 2e-6, `${(inject * 1e6).toFixed(1)} µA`)
}

/* §7 firmware thresholds */
console.log("\n§7  Firmware thresholds")
{
  check("coil-fault threshold (2 kHz) is ≥ 3× below the slowest simulated coil (7.5 kHz)", 7.5e3 / 2e3 >= 3)
  check("a mis-wired coil sits current-limited ≤ 50 ms: Q2 absorbs ≤ 0.25 J", 4.43 * 0.05 <= 0.25, "sim: 4.4 W × 50 ms = 0.22 J — a SOT-223 shrugs that off")
  check("8 s arc limit keeps the TVS ≤ 25 J per burst (≤ 3 W × 8 s; SMCJ33A rated 6.5 W)", 3 * 8 <= 25)
  check("start refused below 3.40 V at rest, stopped below 3.00 V under load (pack cut-off ≈2.4-2.5 V)", 3.4 > 3.0 && 3.0 > 2.5)
  check("brown-out reset (2.7 V) sits below the 3.0 V load cut-off: firmware stops first", 2.7 < 3.0)
}

console.log("\n" + "═".repeat(66))
console.log(` RESULT: ${PASS.length} passed, ${FAIL.length} failed`)
console.log("═".repeat(66))
if (FAIL.length) process.exit(1)
