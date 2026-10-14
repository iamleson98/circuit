import "@tscircuit/core"

/**
 * 04 — Boost Converter (the principle inside the arc-lighter's HV coil)
 * =====================================================================
 * The arc lighter's high voltage comes from the SAME physics as a boost
 * converter: an inductor stores energy while a switch is closed, then
 * RELEASES it at high voltage when the switch opens (the flyback spike —
 * L·di/dt with nowhere to go). Scaled down and slowed down, that is exactly
 * this textbook stage (the official tscircuit "Power Converters" example,
 * retuned):
 *
 *   5V ── L1 ──┬── D1 ──┬── C1 ──┐
 *              │        │        ├── R1 (load) ── GND
 *              └── M1 (switch)   │
 *   V2: 1 kHz square wave drives M1's gate at 68% duty
 *
 * What to watch for:
 *  - VOUT rises cycle by cycle as C1 charges through D1.
 *  - It settles well ABOVE 5V — the theoretical ideal is
 *    Vout = Vin / (1 − duty) = 5 / 0.32 ≈ 15.6V; the diode drop, MOSFET
 *    loss and load bleed make the real value lower.
 *  - The arc-lighter's coil does the same trick ~10,000× faster, with a
 *    secondary winding multiplying the flyback to kilovolts.
 *
 * Run it:
 *   tsci simulate analog circuits/04-boost-converter.tsx
 *   tsci dev circuits/04-boost-converter.tsx
 */
export default () => (
  <board routingDisabled>
    {/* Input rail */}
    <voltagesource name="V1" voltage="5V" schX={-5} schY={2} />

    {/* Gate drive: 0/10V square, 68% duty, 1kHz */}
    <voltagesource
      name="V2"
      voltage="10V"
      waveShape="square"
      dutyCycle={0.68}
      frequency="1kHz"
      schX={-3}
      schY={-2}
    />

    <inductor name="L1" inductance="1H" schX={-1} schY={3} />
    <diode name="D1" schX={2.1} schY={3} />
    <capacitor name="C1" capacitance="10uF" polarized schX={3} schY={1} />
    <resistor name="R1" resistance="1k" schX={6} schY={1} />
    <mosfet
      name="M1"
      channelType="n"
      mosfetMode="enhancement"
      footprint="sot23"
      schX={0}
      schY={-1}
    />

    {/* Power path: 5V → L → diode → output node (C1 ∥ R1 to ground) */}
    <trace from=".V1 > .pin1" to=".L1 > .pin1" />
    <trace from=".L1 > .pin2" to=".D1 > .anode" />
    <trace from=".D1 > .cathode" to=".C1 > .pin1" />
    <trace from=".D1 > .cathode" to=".R1 > .pin1" />
    <trace from=".C1 > .pin2" to=".R1 > .pin2" />
    <trace from=".R1 > .pin2" to=".V1 > .pin2" />

    {/* The switch: L's right end to GND while M1 conducts */}
    <trace from=".L1 > .pin2" to=".M1 > .drain" />
    <trace from=".M1 > .source" to=".V1 > .pin2" />
    <trace from=".M1 > .gate" to=".V2 > .pin1" />
    <trace from=".V2 > .pin2" to=".V1 > .pin2" />

    <voltageprobe name="VIN" connectsTo=".V1 > .pin1" />
    <voltageprobe name="VOUT" connectsTo=".R1 > .pin1" />

    {/* Slow enough to watch the output climb cycle by cycle: 100ms,
        200µs per sample = 501 points */}
    <analogsimulation
      duration="100ms"
      timePerStep="0.2ms"
      spiceEngine="ngspice"
    />
  </board>
)
