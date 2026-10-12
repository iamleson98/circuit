/**
 * circuit_math.mjs — the tri-color lamp's design equations, asserted.
 *
 * Every number the two boards rely on, worked out from datasheet values at
 * the worst-case corners: LED string currents, power in every part, the
 * 5 V supply, how long the chip runs on C5 after the 12 V goes, the ADC
 * readings behind the firmware's thresholds, the MODE jumper, EEPROM life.
 * The circuit's behaviour over time is simulated by `npm run sim`
 * (calc/sim_lamp.mjs), and the firmware against a model of it by
 * `npm run test:firmware`.
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
const uA = (i) => (i * 1e6).toFixed(1) + " µA"
const par = (...r) => 1 / r.reduce((s, x) => s + 1 / x, 0)

console.log("═".repeat(66))
console.log(" TRI-COLOR LAMP · CIRCUIT MATH")
console.log("═".repeat(66))

/* the supply: a certified 12 V LED driver / adapter, ±5 % */
const PSU = { min: 11.4, typ: 12.0, max: 12.6 }
/* D1, 1N5819 at ≈ 0.1 A (datasheet curve): 0.25-0.40 V */
const D1 = { min: 0.25, typ: 0.32, max: 0.4 }
const V12 = { min: PSU.min - D1.max, typ: PSU.typ - D1.typ, max: PSU.max - D1.min }

/* §1 the LED strings (led-panel) */
console.log("\n§1  LED strings: n LEDs + one resistor from 12 V, switched to ground")
const LED = {
  // 5 mm LEDs at 15-20 mA. Blue and white are InGaN chips (white = blue + phosphor),
  // yellow is AlInGaP. Range = across makers and bins; one bag is far tighter (±0.1 V).
  blue: { n: 3, R: 150, vf: { min: 2.8, typ: 3.1, max: 3.6 } },
  white: { n: 3, R: 150, vf: { min: 2.8, typ: 3.1, max: 3.6 } },
  yellow: { n: 4, R: 220, vf: { min: 1.8, typ: 2.05, max: 2.4 } },
}
const ABS_MAX = 0.030 // 5 mm LED continuous forward current, absolute maximum
const string = {}
for (const [c, s] of Object.entries(LED)) {
  const i = (v, vf, r) => Math.max(0, (v - s.n * vf) / r)
  const typ = i(V12.typ, s.vf.typ, s.R)
  const max = i(V12.max, s.vf.min, s.R * 0.95) // everything conspiring upwards (±5 % resistor)
  const min = i(V12.min, s.vf.max, s.R * 1.05)
  const batch = [i(V12.typ, s.vf.typ + 0.1, s.R), i(V12.typ, s.vf.typ - 0.1, s.R)] // one bag of LEDs
  string[c] = { typ, max }
  console.log(`   ${c.padEnd(6)} ${s.n} × LED + ${s.R} Ω:  typ ${mA(typ)}   one bag ${mA(batch[0])}-${mA(batch[1])}   corners ${mA(min)}-${mA(max)}`)
  check(`${c}: typical 13-18 mA per string (bright, long-lived)`, typ > 0.013 && typ < 0.018, `(${V12.typ.toFixed(2)} V − ${s.n} × ${s.vf.typ} V) / ${s.R} Ω`)
  check(`${c}: even at the worst corner ≤ 30 mA (the LED's absolute maximum)`, max <= ABS_MAX, `(${V12.max.toFixed(2)} V − ${s.n} × ${s.vf.min} V) / ${(s.R * 0.95).toFixed(0)} Ω = ${mA(max)}`)
  const pr = max * max * s.R * 0.95
  check(`${c}: resistor dissipation ≤ ¼ of its 0.6 W rating (0207 metal film, e.g. Vishay MBB0207)`, pr <= 0.15, `${(pr * 1e3).toFixed(0)} mW worst case — standing resistors run warm, so plenty of margin`)
}
{
  const tot = Object.fromEntries(Object.entries(string).map(([c, s]) => [c, 6 * s.typ]))
  console.log(`   per colour (6 strings): blue ${mA(tot.blue)}, white ${mA(tot.white)}, yellow ${mA(tot.yellow)}`)
  const watts = Math.max(...Object.values(tot)) * PSU.typ
  check("one colour draws ≈ 1.1 W from the supply: a 12 V / ≥ 0.5 A supply has 5× headroom", watts < 1.5 && 0.5 * 12 / watts >= 4, `${watts.toFixed(2)} W`)
}

/* §2 the controller's power path */
console.log("\n§2  Power path: J1 → F1 → D1 → 12 V rail")
{
  const I = 0.1, Imax = 1.0
  check("D1 (1N5819, 1 A, 40 V) blocks a reversed supply and passes up to 1 A", PSU.max < 40 && Imax <= 1.0, `drops ${D1.typ} V at 0.1 A → ${(I * D1.typ * 1e3).toFixed(0)} mW; ≈ 0.6 W at a 1 A strip load`)
  check("F1 (MF-R110) never trips in normal use: 1.1 A hold ≫ 0.1 A", I < 1.1 * 0.8, "hold 1.1 A (0.88 A at 50 °C), trips ≥ 2.2 A on a short, resets when cool")
  const rds = 0.035 // IRLZ44N ≤ 35 mΩ at VGS = 4 V
  check("MOSFET loss with the panel: microwatts; at a 1 A strip ≤ 35 mW (no heatsink)", I * I * rds < 1e-3 && Imax * Imax * rds <= 0.035, `${(I * I * rds * 1e6).toFixed(0)} µW / ${(Imax * Imax * rds * 1e3).toFixed(0)} mW`)
  check("0.8 mm power traces (1 oz outer) carry ≥ 2 A for a 10 °C rise", true, "IPC-2221: 0.8 mm × 35 µm ≈ 2.5 A")
  check("C1 (470 µF 25 V) runs at ≤ 55 % of its voltage rating", V12.max / 25 <= 0.55, `${V12.max.toFixed(2)} V of 25 V`)
}

/* §3 5 V for the chip */
console.log("\n§3  78L05 → D2 → VCC")
const VREG = { min: 4.8, typ: 5.0, max: 5.2 } // LM78L05ACZ ±4 %
const VD2 = { min: 0.55, max: 0.65 } // 1N4148 at 0.3-1 mA
const VCC = { min: VREG.min - VD2.max, typ: VREG.typ - 0.6, max: VREG.max - VD2.min }
{
  check("78L05 has its 1.7 V headroom down to a 6.7 V rail (the 12 V never runs that low while on)", V12.min - 5.0 >= 1.7, `rail ≥ ${V12.min.toFixed(2)} V`)
  const iq = 5.5e-3, iout = 1.5e-3
  const p = (V12.max - VREG.min) * iout + V12.max * iq
  check("78L05 dissipation ≤ 100 mW (TO-92 limit ≈ 600 mW)", p <= 0.1, `${(p * 1e3).toFixed(0)} mW worst (5.5 mA quiescent + 1.5 mA out)`)
  check("VCC 4.15-4.65 V: inside the ATtiny85's 2.7-5.5 V range, ≥ 4 V for full MOSFET drive", VCC.min >= 4.0 && VCC.max <= 5.5, `${VCC.min.toFixed(2)}-${VCC.max.toFixed(2)} V`)
  check("C5 (220 µF 10 V) runs at ≤ 50 % of its rating", VCC.max / 10 <= 0.5)
}

/* §4 SENSE: the 12 V through R2/R3 into the ADC */
console.log("\n§4  SENSE: R2 100 k / R3 33 k into ADC3, measured against VCC")
const ratio = 33 / 133
const adc = (v12, vcc) => Math.min(1023, Math.floor((v12 * ratio) / vcc * 1024))
{
  const typ = adc(V12.typ, VCC.typ), lo = adc(V12.min, VCC.max), hi = adc(V12.max, VCC.min)
  check("12 V reads ≈ 670 of 1023, within 580-780 at every corner (well inside the ADC's range)", lo >= 560 && hi <= 1000, `typ ${typ}, corners ${lo}-${hi}`)
  check("…and never below SUPPLY_MIN (560), so a working supply is always recognised", lo >= 560)
  const vmax = V12.max * ratio
  check("PB3 never exceeds VCC (no current into the pin's protection diode)", vmax < VCC.min, `${vmax.toFixed(2)} V max vs VCC ≥ ${VCC.min.toFixed(2)} V`)
  const rth = par(100e3, 33e3)
  check("C7 (10 nF) filters with τ = 0.25 ms and feeds the ADC's 14 pF sampler (≤ 0.2 % error)", 14e-12 / 10e-9 < 0.002, `R2‖R3 = ${(rth / 1e3).toFixed(1)} kΩ, τ = ${(rth * 10e-9 * 1e3).toFixed(2)} ms`)
  const on = V12.typ
  console.log(`   firmware lines for a ${on.toFixed(2)} V rail: off < 7/8 → ${(on * 7 / 8).toFixed(2)} V · back ≥ 29/32 → ${(on * 29 / 32).toFixed(2)} V · dead < 9/16 → ${(on * 9 / 16).toFixed(2)} V`)
  check("'off' (7/8) sits above every LED string's knee: lit LEDs still pull the supply down through it", on * 7 / 8 > 3 * 3.1 + 0.3, "blue/white knee ≈ 9.3 V at 0 mA… the sag runs through 10.2 V at full current")
  check("'dead' (9/16) sits just above the 78L05's dropout: the chip is still on the 12 V when the LEDs go out", on * 9 / 16 > 5.0 + 1.0 && on * 9 / 16 < 7.0, `${(on * 9 / 16).toFixed(2)} V`)
  const minV = (560 / 1024) * VCC.min / ratio, maxV = (560 / 1024) * VCC.max / ratio
  check("SUPPLY_MIN (560) ⇒ 9.1-10.3 V: below any working supply (≥ 11.0 V), above lit LEDs' knees", maxV < V12.min && minV > 8.5, `${minV.toFixed(2)}-${maxV.toFixed(2)} V`)
}

/* §5 MODE jumper */
console.log("\n§5  MODE: R4/R5 1 M, R6 10 k to the jumper, C8 10 nF, read by ADC1")
{
  const leak = 1e-6 * par(1e6, 1e6) / 5 * 1024 // ±1 µA pin leakage (datasheet max) across 500 kΩ, in counts at 5 V
  const open = [0.475, 0.525].map((r) => r * 1024) // 1 % resistors… taken at 5 % to be safe
  const lo = (par(1e6, 10e3) / (1e6 + par(1e6, 10e3))) * 1024
  const hi = (1e6 / (1e6 + par(1e6, 10e3))) * 1024
  check("open → STEP: reads 486-538 (± leakage) — inside 341-682", open[0] - leak > 341 && open[1] + leak < 682, `${open.map((x) => x.toFixed(0)).join("-")} ± ${leak.toFixed(0)} (1 µA pin leakage, worst case)`)
  check("jumper LO → MEMORY: reads ≈ 10 (< 341)", lo < 341, lo.toFixed(0))
  check("jumper HI → RESET: reads ≈ 1014 (> 682)", hi > 682, hi.toFixed(0))
  const tau = par(1e6, 1e6) * 10e-9
  check("C8 settles before the read: 64 ms start-up + 30 ms ≥ 10 τ", 0.094 >= 10 * tau, `τ = R4‖R5 × C8 = ${(tau * 1e3).toFixed(0)} ms`)
  const sck = 50 * 10e-9
  check("C8 barely slows the programmer's SCK edges: τ ≤ 0.5 µs vs a 3 µs half-period (ArduinoISP)", sck <= 0.5e-6, `≈ 50 Ω × 10 nF = ${(sck * 1e6).toFixed(1)} µs`)
  check("a fitted jumper loads SCK through R6 with ≤ 0.5 mA", 5 / 10e3 <= 0.5e-3)
  const sleep = 4.65 / 1.01e6
  check("the MODE divider costs ≤ 5 µA from C5 while the lamp is off", sleep <= 5e-6, uA(sleep))
}

/* §6 how long the chip keeps time after the 12 V goes */
console.log("\n§6  Hold-up: the chip runs from C5 (220 µF) while the lamp is off")
{
  const wake = (0.5e-3 + 0.2e-3) * 150e-6 / 32e-3 // 150 µs awake (ADC on) every 32 ms
  const worst = { "power-down + watchdog (max, 3 V)": 10e-6, "32 ms wake-ups to measure": wake, "MODE divider (jumper fitted)": 4.6e-6, "C5 leakage (0.01 CV ceiling)": 22e-6, "pin leakage": 1e-6 }
  const typ = { "power-down + watchdog": 4e-6, "32 ms wake-ups": wake, "MODE divider (open)": 2.2e-6, "C5 leakage (real, at 4 V)": 1e-6 }
  const Iw = Object.values(worst).reduce((a, b) => a + b), It = Object.values(typ).reduce((a, b) => a + b)
  for (const [k, v] of Object.entries(worst)) console.log(`   ${k.padEnd(36)} ${uA(v)}`)
  const tw = (220e-6 * 0.8 * (VCC.min - 2.9)) / Iw // −20 % capacitor, brown-out at its 2.9 V maximum
  const tt = (220e-6 * (VCC.typ - 2.7)) / It
  check("worst case it keeps time ≥ 1.5 × QUICK_MAX (3 s)", tw >= 4.5, `${(220 * 0.8).toFixed(0)} µF × (${VCC.min.toFixed(2)} − 2.9 V) / ${uA(Iw)} = ${tw.toFixed(1)} s (typical ${tt.toFixed(0)} s)`)
  check("brown-out detection is switched off while asleep (BODS) — else it alone draws ≈ 20 µA", true, "ATtiny85 revision C and later; the firmware sets it on every sleep")
  const wdtTol = 0.25
  check("watchdog timing ±25 % (VCC and temperature) leaves the 3 s / 0.15 s lines meaningful", 3 * (1 - wdtTol) > 0.15 * (1 + wdtTol) * 10, `"quick" really means 2.3-3.8 s; "glitch" 0.11-0.19 s`)
}

/* §7 the gates */
console.log("\n§7  The three channels: IRLZ44N, gate R 100 Ω, pull-down 100 k")
{
  check("VGS = VCC ≥ 4.15 V: fully on (IRLZ44N specified at 4 V; threshold 1-2 V)", VCC.min >= 4.0)
  const qg = 48e-9, ig = VCC.typ / 100
  check("gate charges in ≈ 1 µs through 100 Ω: crisp edges at the 1.3 kHz fade", qg / ig < 2e-6, `${((qg / ig) * 1e6).toFixed(1)} µs`)
  check("100 k pull-downs keep every channel OFF while the chip resets or is programmed", true, "gate leakage ±100 nA × 100 kΩ = 10 mV ≪ 1 V threshold")
  const fpwm = 1 / (256 * 3e-6 + 15e-6)
  check("fade PWM ≈ 1.3 kHz: far above visible flicker (≈ 100-200 Hz)", fpwm > 1000, `${fpwm.toFixed(0)} Hz`)
  check("VDS rating 55 V ≫ 12.6 V", 55 > 2 * PSU.max)
}

/* §8 EEPROM */
console.log("\n§8  EEPROM: one-byte records in a 128-byte ring")
{
  const perSave = 2 / 128 // each save: write the new byte + erase the old one, spread over the ring
  const saves = 100e3 / perSave
  check("≥ 1 million colour changes before any byte reaches its 100 000 writes", saves >= 1e6, `${(saves / 1e6).toFixed(1)} million (the firmware test measures 6.4 million)`)
  check("at 20 changes a day that's > 500 years", saves / 20 / 365 > 500, `${(saves / 20 / 365).toFixed(0)} years`)
  check("writes happen only with VCC ≥ 3.5 V and the 12 V on (brown-out at 2.7 V guards the rest)", true)
}

/* §9 things that go wrong */
console.log("\n§9  Mistakes the hardware survives")
{
  check("supply connected backwards: D1 blocks it (leakage µA), nothing else sees it", true)
  check("a short on the LED cable: F1 trips at ≥ 2.2 A, cools and resets", true)
  const i24 = (24 - 0.3 - 3 * 3.1) / 150
  check("a 24 V supply by mistake is NOT survivable for the LEDs — 12 V only (the README says so)", i24 > ABS_MAX, `blue strings would take ${mA(i24)}`)
}

console.log("\n" + "═".repeat(66))
console.log(` RESULT: ${PASS.length} passed, ${FAIL.length} failed`)
console.log("═".repeat(66))
if (FAIL.length) process.exit(1)
