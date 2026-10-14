import "@tscircuit/core"

/** Vishay 1N4148 model card — spliced over the generic default by
 *  tools/sim.mjs at simulation time (same trick as the 2N3904 in circuit
 *  07; see that file for the full explanation). The N=1.9 emission
 *  coefficient is what makes the knee wide enough to see clearly. */
export const netlistPatch = {
  ".MODEL D D":
    ".MODEL D D (IS=4.352e-9 N=1.9061 RS=0.6452 CJO=4p M=.3333 VJ=.5 TT=4.32e-6)",
}

/**
 * 06 — Diode V-I curve, DC sweep (the AM detector's secret)
 * ==========================================================
 * The AM receiver's detector is a diode: it passes only the positive half
 * of the RF envelope. Everything about "why rectification works" lives in
 * the diode's V-I curve — the forward "knee" below which almost nothing
 * conducts.
 *
 * This file uses the DC sweep analysis: the source voltage steps from 0V
 * to 1.0V and the simulator records the branch current at every step.
 *
 * The current isn't probed with an <ammeter /> (still rough in current
 * tscircuit — see the simulation README) but measured the bench way: a
 * 47Ω series resistor to ground, one probe on its top node, then Ohm's
 * law: I = VSI_A / 47Ω. The math channel is defined in tools/recipes.mjs
 * and shows up in the plot as I_DIODE.
 *
 * Run it:
 *   tsci simulate analog circuits/06-diode-iv-dc-sweep.tsx
 *   tsci dev circuits/06-diode-iv-dc-sweep.tsx
 */
export default () => (
  <board routingDisabled>
    {/* The swept source: 0 → 1.0V in 5mV steps (201 points) */}
    <voltagesource name="V1" voltage="0V" schX={-5} />

    {/* The detector diode (real 1N4148 model via netlistPatch above) +
        47Ω current-sense (shunt) resistor */}
    <diode name="D1" schX={-2} schY={1.5} />
    <resistor name="RS1" resistance="47ohm" schX={0} schY={1.5} />

    <trace from=".V1 > .pin1" to=".D1 > .anode" />
    <trace from=".D1 > .cathode" to=".RS1 > .pin1" />
    <trace from=".RS1 > .pin2" to=".V1 > .pin2" />

    <voltageprobe name="VSI_A" connectsTo=".RS1 > .pin1" />

    <analogdcsweepsimulation
      sweepSource=".V1"
      sweepStart="0V"
      sweepStop="1V"
      sweepStep="0.005V"
      spiceEngine="ngspice"
    />
  </board>
)
