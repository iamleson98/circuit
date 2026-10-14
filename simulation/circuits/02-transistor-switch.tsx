import "@tscircuit/core"

/**
 * 02 — Transistor Switch (the workhorse stage of radio-lab & fm-radio-lab)
 * ========================================================================
 * A common-emitter NPN switch — the same pattern as Q4 in the AM transmitter
 * and the audio amp in the FM receiver: small base current controls a large
 * collector current (that's what "gain" buys you).
 *
 *   V9 ── R_COLLECTOR ──┬── collector
 *                      └── VCOLLECTOR probe (this is the "output")
 *   base ◄── R_BASE ◄── SW1 (toggles at 1 kHz in simulation)
 *   emitter ── GND
 *
 * What to watch for:
 *  - SW1 closed  → base current flows → transistor saturates → collector
 *    pulled to ~0.1V (VCE(sat)).
 *  - SW1 open    → no base current → transistor cuts off → collector rises
 *    to 9V (pulled up by R_COLLECTOR).
 *  - The output is the INVERSE of the input: high in, low out.
 *
 * Run it:
 *   tsci simulate analog circuits/02-transistor-switch.tsx
 *   tsci dev circuits/02-transistor-switch.tsx
 */
export default () => (
  <board routingDisabled>
    {/* 9V rail, exactly like the battery-powered radio projects */}
    <voltagesource name="V1" voltage="9V" schX={-4} />

    {/* Base drive: 10k from the switch to the base (limits base current) */}
    <resistor name="R_BASE" resistance="10k" schY={2} />

    {/* A timed switch: simSwitchFrequency makes SW1 toggle automatically
        during simulation — stand-in for the ATtiny GPIO pin or a keying
        signal. (Type "switch" also has physical positions.) */}
    <switch name="SW1" simSwitchFrequency="1kHz" schX={1.5} schY={2} />

    <transistor name="Q1" type="npn" footprint="to92" schX={2} schY={0.3} />

    {/* Collector load: 10k pull-up. When Q1 is off, VCOLLECTOR = 9V. */}
    <resistor name="R_COLLECTOR" resistance="10k" schY={-2} />

    <trace from=".V1 > .pin1" to=".R_BASE > .pin1" />
    <trace from=".R_BASE > .pin2" to=".SW1 > .pin1" />
    <trace from=".SW1 > .pin2" to=".Q1 > .base" />

    <trace from=".V1 > .pin1" to=".R_COLLECTOR > .pin1" />
    <trace from=".R_COLLECTOR > .pin2" to=".Q1 > .collector" />

    <trace from=".Q1 > .emitter" to=".V1 > .pin2" />

    <voltageprobe name="VCOLLECTOR" connectsTo=".R_COLLECTOR > .pin2" />
    <voltageprobe name="VBASE" connectsTo=".Q1 > .base" />

    <analogsimulation
      duration="4ms"
      timePerStep="0.05ms"
      spiceEngine="ngspice"
    />
  </board>
)
