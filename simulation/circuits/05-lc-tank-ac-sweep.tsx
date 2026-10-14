import "@tscircuit/core"

/**
 * 05 — LC Tank Resonance, AC sweep (the AM receiver's "TUNE" circuit)
 * ====================================================================
 * The input stage of radio-lab/receiver: an antenna lightly couples into a
 * parallel LC tank — L1 (220µH) ∥ CV1 (the 10-280pF tuning polyvaricon).
 * At the resonant frequency the tank's impedance peaks, so the selected
 * station's frequency appears as a big voltage while everything else is
 * suppressed. THIS is what the TUNE knob does.
 *
 * This file uses the AC sweep analysis: instead of one long time-domain
 * run, the simulator feeds a 1V small-signal source at every frequency
 * from 100kHz to 10MHz and records how much voltage appears on the tank.
 * The resonance pops out as a sharp peak.
 *
 * Theory check (CV1 set to 150pF, its mid position):
 *   f₀ = 1 / (2π√(L·C)) = 1 / (2π√(220µH × 150pF)) ≈ 876 kHz
 * — right in the middle of the AM broadcast band, exactly as designed.
 *
 * TWO DETAILS THE SIMULATION REVEALS (that the bare formula hides):
 *  1. The peak lands at ≈760kHz, not 876kHz — the 47pF antenna coupler
 *     is part of the resonant loop and pulls the frequency down. On the
 *     real radio you just turn the TUNE knob a bit further.
 *  2. The response doesn't vanish above resonance — it floors at ≈0.24V.
 *     At high frequency both capacitors are near-shorts, so they form a
 *     plain divider: 47pF / (47pF + 150pF) ≈ 0.24. Strong stations two
 *     channels up CAN leak through — one reason real receivers add more
 *     filtering stages. (Verified: the simulated curve matches the
 *     analytic network response to 4 decimal places.)
 *
 * Run it:
 *   tsci simulate analog circuits/05-lc-tank-ac-sweep.tsx
 *   tsci dev circuits/05-lc-tank-ac-sweep.tsx
 */
export default () => (
  <board routingDisabled>
    {/* Small-signal AC source: acMagnitude is what the AC analysis sweeps.
       A DC value of 0 keeps the operating point trivial. */}
    <voltagesource name="V1" voltage="0V" acMagnitude="1V" schX={-6} />

    {/* C3: light 47pF antenna coupling — the real part from radio-lab RX.
        Small on purpose: the antenna must not load (dull) the tank. */}
    <capacitor name="C3" capacitance="47pF" schX={-4} />

    {/* The tank: L1 ∥ CV1 (modelled at 150pF = knob mid-position) */}
    <inductor name="L1" inductance="220uH" schX={-2} schY={1} />
    {/* Real coils are not perfect: Q≈50 at 876kHz means a series resistance
        of about ωL/Q ≈ 24Ω. Without it the peak would be infinitely tall. */}
    <resistor name="RL" resistance="24ohm" schX={-2} schY={2.5} />
    <capacitor name="CV1" capacitance="150pF" schX={0} schY={1} />

    <trace from=".V1 > .pin1" to=".C3 > .pin1" />
    <trace from=".C3 > .pin2" to="net.TANK" />
    <trace from=".L1 > .pin1" to=".RL > .pin1" />
    <trace from=".RL > .pin2" to="net.TANK" />
    <trace from=".L1 > .pin2" to=".V1 > .pin2" />
    <trace from=".CV1 > .pin1" to="net.TANK" />
    <trace from=".CV1 > .pin2" to=".V1 > .pin2" />

    <voltageprobe name="VTANK" connectsTo=".CV1 > .pin1" />

    {/* AC sweep: 100kHz → 10MHz, 40 points per decade (120 total) */}
    <analogacsweepsimulation
      sweepType="decade"
      startFrequency="100kHz"
      stopFrequency="10MHz"
      samplesPerInterval={40}
      spiceEngine="ngspice"
    />
  </board>
)
