/**
 * circuit_math.mjs — the hand-calculation half of Radio Lab's proof.
 *
 * Re-derives the bias points, tuning ranges and budgets of the AM-TX and
 * AM-RX from first principles and asserts the numbers the design depends on.
 * Things that hand math can't settle honestly — does the oscillator start in
 * every corner, how big are the harmonics, how deep is the modulation — are
 * checked by `npm run sim` (calc/sim_am.mjs), which simulates the real boards.
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
const f2 = (x) => (Math.abs(x) >= 1000 ? x.toFixed(0) : x.toFixed(2))
const hz = (x) => (x >= 1e6 ? (x / 1e6).toFixed(3) + " MHz" : (x / 1e3).toFixed(0) + " kHz")
const fres = (L, C) => 1 / (2 * Math.PI * Math.sqrt(L * C))

console.log("═".repeat(66))
console.log(" RADIO LAB · CIRCUIT MATH — every number behind the design")
console.log("═".repeat(66))

const V9 = 9
const VBE = 0.65
const VT = 0.02585
const BETA = { min: 110, typ: 290 } // BC547B hFE 200-450; 2N3904 100-300 → design for ≥110
/** emitter current of a divider-biased stage, INCLUDING the base current's drop on the divider */
const ie = (Vth, Rth, RE, beta) => (Vth - VBE) / (RE + Rth / (beta + 1))

/* ══════════════ §1 AM-TX · MIC PREAMP (Q1) ══════════════ */
console.log("\n§1  AM-TX · microphone preamp (Q1)")
{
  const R3 = 68e3, R4 = 10e3, R5 = 4.7e3, R6 = 560
  const Vth = (V9 * R4) / (R3 + R4), Rth = (R3 * R4) / (R3 + R4)
  const lo = ie(Vth, Rth, R6, BETA.min), hi = ie(Vth, Rth, R6, BETA.typ)
  const VC = V9 - hi * R5
  const gain = R5 / (VT / hi)
  console.log(`    68k/10k divider → I_E ${f2(lo * 1e3)}-${f2(hi * 1e3)} mA (β ${BETA.min}-${BETA.typ}), V_C ≈ ${f2(VC)} V, gain ≈ R5/r_e ≈ ${f2(gain)}×`)
  check("Q1 bias 0.6-1.2 mA over the β spread", lo > 0.6e-3 && hi < 1.2e-3)
  check("collector mid-rail (3-7 V) for audio swing", VC > 3 && VC < 7)
}

/* ══════════════ §2 AM-TX · SUPPLY MODULATOR (Q2) ══════════════ */
console.log("\n§2  AM-TX · supply modulator (Q2) — the VMD rail")
{
  const R7 = 10e3, R8 = 15e3
  const VB = (V9 * R8) / (R7 + R8)
  const VMD = VB - VBE
  // voice: ~5 mV at the capsule (close speech) × Q1 gain × divider into Q2's bias network
  const gainQ1 = 4.7e3 / (VT / 0.85e-3), divider = 6e3 / (4.7e3 + 6e3)
  const m5 = (5e-3 * gainQ1 * divider) / VMD
  console.log(`    10k/15k → V_B ${f2(VB)} V → VMD ≈ ${f2(VMD)} V; 5 mV of voice → ±${f2(5e-3 * gainQ1 * divider)} V on VMD → m ≈ ${(m5 * 100).toFixed(0)} %`)
  check("VMD idles at 4-5.5 V (headroom both ways)", VMD > 4 && VMD < 5.5)
  check("close speech gives 5-15 % modulation (simulation: 8 %)", m5 > 0.05 && m5 < 0.15)
  console.log(`    C19 (100nF) grounds VMD at RF; follower output ~25Ω → audio corner ≈ ${(1 / (2 * Math.PI * 25 * 100e-9) / 1e3).toFixed(0)} kHz`)
  check("VMD's RF bypass leaves speech untouched (corner > 20 kHz)", 1 / (2 * Math.PI * 25 * 100e-9) > 20e3)
}

/* ══════════════ §3 AM-TX · OSCILLATOR (Q3) ══════════════ */
console.log("\n§3  AM-TX · Colpitts oscillator (Q3) — on the STEADY 9V rail")
const tx = {}
{
  const R10 = 56e3, R11 = 10e3, R12 = 1e3
  const Vth = (V9 * R11) / (R10 + R11), Rth = (R10 * R11) / (R10 + R11)
  const I = ie(Vth, Rth, R12, BETA.typ)
  const L = 100e-6, Cs = (680e-12 * 680e-12) / (680e-12 + 680e-12), strays = 13e-12
  tx.fLo = fres(L, 280e-12 + Cs + strays)
  tx.fHi = fres(L, 10e-12 + Cs + strays)
  console.log(`    56k/10k from V9 → V_B ${f2(Vth)} V → I_E ≈ ${f2(I * 1e3)} mA`)
  console.log(`    tank: L1 100µH ∥ [CV1 10-280pF + C14·C15 series ${f2(Cs * 1e12)}pF + ~13pF strays] → ${hz(tx.fLo)} … ${hz(tx.fHi)} (simulated 650-828 kHz)`)
  check("oscillator bias 0.5-1 mA", I > 0.5e-3 && I < 1e-3)
  check("TUNE stays inside the 510-1705 kHz band of FCC §15.219", tx.fLo > 510e3 && tx.fHi < 1705e3)
  console.log(`    (L1 and R10 return to V9, not VMD — verify.mjs asserts that on the board's netlist)`)
}

/* ══════════════ §4 AM-TX · FINAL (Q4) + OUTPUT TANK ══════════════ */
console.log("\n§4  AM-TX · modulated final (Q4) and its PEAK tank")
{
  const R14 = 27e3, R15 = 10e3, R16 = 1e3
  const Vth = (V9 * R15) / (R14 + R15), Rth = (R14 * R15) / (R14 + R15)
  const I = ie(Vth, Rth, R16, BETA.typ)
  const VMD = 4.7
  const Pin = VMD * I
  const L2 = 100e-6, Cpad = 330e-12, strays = 6e-12
  const pLo = fres(L2, 280e-12 + Cpad + strays), pHi = fres(L2, 10e-12 + Cpad + strays)
  console.log(`    27k/10k from V9 → I_C ≈ ${f2(I * 1e3)} mA → DC input VMD·I_C ≈ ${f2(Pin * 1e3)} mW`)
  console.log(`    PEAK tank: L2 100µH ∥ [CV2 10-280pF + C18 330pF] → ${hz(pLo)} … ${hz(pHi)}`)
  check("DC input to the final ≤ 100 mW (FCC §15.219(a))", Pin <= 0.1, `${(Pin * 1e3).toFixed(1)} mW`)
  check("PEAK can reach every TUNE frequency", pLo <= tx.fLo * 1.02 && pHi >= tx.fHi * 0.98, `${hz(pLo)}-${hz(pHi)} vs ${hz(tx.fLo)}-${hz(tx.fHi)}`)
  const Xc16 = 1 / (2 * Math.PI * 750e3 * 47e-12), Xant = 1 / (2 * Math.PI * 750e3 * 15e-12)
  console.log(`    C16 47pF (${f2(Xc16 / 1e3)}kΩ) into a 1-2m wire (~15pF, ${f2(Xant / 1e3)}kΩ): ~${((Xant / (Xant + Xc16)) * 100).toFixed(0)} % of the tank voltage reaches the wire`)
  check("antenna coupling light enough not to detune PEAK (wire C ≪ tank C)", 1 / (1 / 47e-12 + 1 / 15e-12) < 0.05 * (Cpad + 140e-12))
}

/* ══════════════ §5 AM-TX · BUDGET ══════════════ */
console.log("\n§5  AM-TX · power budget")
{
  const I = (9 - 2) / 2.2e3 + 0.3e-3 + 0.85e-3 + 0.71e-3 + 1.73e-3 + 9 / 78e3 + 9 / 25e3 + 9 / 66e3 + 9 / 37e3
  console.log(`    LED + mic + Q1 + Q3 + Q4 + dividers ≈ ${f2(I * 1e3)} mA (simulation: 7.6 mA) → ~${(550 / (I * 1e3)).toFixed(0)} h on a 550 mAh 9V cell`)
  check("battery draw < 15 mA", I < 15e-3)
}

/* ══════════════ §6 AM-RX · FRONT END ══════════════ */
console.log("\n§6  AM-RX · antenna + LC tank + buffer (Q1)")
{
  const L = 220e-6, strays = 25e-12
  const fLo = fres(L, 280e-12 + strays), fHi = fres(L, 10e-12 + strays)
  console.log(`    220µH ∥ CV1 (10-280pF) + ~25pF strays → ${hz(fLo)} … ${hz(fHi)} (simulated 618-1854 kHz)`)
  check("RX covers the TX window and the MW broadcast band middle", fLo < 650e3 && fHi > 1500e3)
  const Vth = (V9 * 470e3) / 1.47e6, Rth = (1e6 * 470e3) / 1.47e6
  const lo = ie(Vth, Rth, 2.2e3, BETA.min), hi = ie(Vth, Rth, 2.2e3, BETA.typ)
  console.log(`    buffer: 1M/470k (R_th ${(Rth / 1e3).toFixed(0)}k) → I_E ${f2(lo * 1e3)}-${f2(hi * 1e3)} mA over the β spread`)
  check("buffer stays biased 0.3-1.2 mA for any β ≥ 110", lo > 0.3e-3 && hi < 1.2e-3)
  check("buffer input ≥ 100 kΩ (tank keeps its Q)", Rth >= 100e3)
}

/* ══════════════ §7 AM-RX · RF AMPLIFIER (Q2) ══════════════ */
console.log("\n§7  AM-RX · RF amplifier (Q2)")
{
  const Vth = (V9 * 47e3) / 267e3, Rth = (220e3 * 47e3) / 267e3
  const I = ie(Vth, Rth, 820, BETA.typ)
  const gain = 2.2e3 / (VT / I)
  console.log(`    220k/47k → I_C ≈ ${f2(I * 1e3)} mA, V_C ≈ ${f2(V9 - I * 2.2e3)} V, gain ≈ R8/r_e ≈ ${f2(gain)}× (simulated antenna→Q2 collector ≈ 256× incl. the tank's step-up)`)
  check("Q2 bias 0.6-1.5 mA", I > 0.6e-3 && I < 1.5e-3)
  check("RF gain 50-120×", gain > 50 && gain < 120)
}

/* ══════════════ §8 AM-RX · DETECTOR ══════════════ */
console.log("\n§8  AM-RX · voltage-doubler detector (D1 + D2) and signal LED")
{
  const tau = 10e3 * 4.7e-9
  console.log(`    envelope filter R·C = 10k × 4.7nF = ${(tau * 1e6).toFixed(0)} µs`)
  check("τ ≥ 10 RF periods at 1 MHz (no carrier ripple)", tau >= 10e-6)
  check("τ ≤ 1/3 of a 3 kHz audio period (no envelope clipping)", tau <= 1 / 3e3 / 3)
  // doubler: DET ≈ 2·(Vpk − Vf) for a strong carrier; C7 needs a DC return → D2
  const vpk = 1.0, vf = 0.2
  console.log(`    a 1 Vpk carrier at Q2's collector → DET ≈ 2·(V_pk − V_f) ≈ ${f2(2 * (vpk - vf))} V`)
  console.log(`    (D2 is C7's DC return path — without it DET can't hold DC; verify.mjs asserts D2 on the netlist)`)
  const vOn = 0.6 + (2e-3 / 300) * 47e3 // LED current 2mA / β through R9
  console.log(`    signal LED: Q3 conducts when DET > ~${f2(vOn)} V — reached on strong stations (simulated 5.1 V at 300 mV antenna EMF)`)
  check("signal-LED threshold reachable by the doubler on strong carriers", vOn < 2 * (vpk - vf))
}

/* ══════════════ §9 AM-RX · LM386 ══════════════ */
console.log("\n§9  AM-RX · LM386 audio stage")
{
  // datasheet equivalent circuit: gain = 2 × 15k / (150 + 1.35k ∥ Z(pins 1-8))
  const g20 = (2 * 15e3) / (150 + 1.35e3), g200 = (2 * 15e3) / 150
  console.log(`    pins 1-8 open → gain ${g20.toFixed(0)}; 10µF across them (SW2) → gain ${g200.toFixed(0)}`)
  check("gain 20 / 200 from the datasheet's internal resistors", Math.round(g20) === 20 && Math.round(g200) === 200)
  const fc = 1 / (2 * Math.PI * 8 * 220e-6)
  console.log(`    C13 220µF into 8Ω → low-frequency corner ${fc.toFixed(0)} Hz; Zobel 10Ω + 47nF at pin 5`)
  check("output coupling passes speech (corner < 150 Hz)", fc < 150)
  const Iq = 4e-3 + 0.7e-3 + 1.1e-3 + 3.2e-3
  console.log(`    quiescent ≈ LM386 4 mA + RF stages ~1.8 mA + power LED 3.2 mA ≈ ${f2(Iq * 1e3)} mA → ~${(550 / (Iq * 1e3)).toFixed(0)} h`)
  check("RX quiescent draw < 15 mA", Iq < 15e-3)
}

console.log("\n" + "═".repeat(66))
console.log(` RESULT: ${PASS.length} passed, ${FAIL.length} failed`)
if (FAIL.length) {
  console.log(" FAILED:", FAIL.join(" | "))
  process.exit(1)
}
console.log(" The arithmetic holds. Next: `npm run sim` simulates the real boards.")
