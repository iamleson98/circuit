import "@tscircuit/core"

/**
 * 07 — Colpitts Oscillator (the AM transmitter's carrier stage, for real)
 * ========================================================================
 * This is Q3 of radio-lab/transmitter — the common-base Colpitts that
 * generates the AM carrier. Same values as the board:
 *
 *   · R10 56k + R11 10k bias the base at 9V×10/66 ≈ 1.36V; C6 2.2nF
 *     grounds the base at RF (that's what makes it common-base).
 *   · R12 1k sets the emitter current ≈ 0.7mA.
 *   · The TANK: L1 100µH from collector to the 9V rail (RF-grounded by
 *     C2 100nF), tuned by CV1 ∥ (C14 series C15):
 *       C14=C15=680pF → 340pF, plus CV1=150pF (knob mid) → 490pF
 *       f₀ = 1/(2π√(100µH × 490pF)) ≈ 719 kHz
 *   · C14/C15 are also the feedback divider: the emitter sits at their
 *     midpoint, feeding half the collector swing back in phase.
 *
 * A REAL TRANSISTOR MODEL — the trick every SPICE user eventually learns:
 * tscircuit's netlister emits a generic `.MODEL NPN NPN` for <transistor>.
 * The ON Semiconductor 2N3904 model card below is spliced over that line
 * at simulation time by tools/sim.mjs (see the netlistPatch export). With
 * `tsci simulate` / `tsci dev` you get the generic model — still a working
 * oscillator, just with idealized startup.
 *
 * What to watch for:
 *  · Nothing at t=0 — then oscillation BUILDS exponentially out of the
 *    turn-on transient noise. That's the Barkhausen criterion at work:
 *    |loop gain| > 1 amplifies noise until the transistor's nonlinearity
 *    clamps the amplitude (AGC by physics).
 *  · Measure the period: ~1.4µs ⇒ ~719kHz carrier. Change CV1's value and
 *    re-run — the frequency slides. That IS the TUNE knob.
 *
 * Run it:
 *   tsci simulate analog circuits/07-colpitts-oscillator.tsx
 *   tsci dev circuits/07-colpitts-oscillator.tsx
 *   npm run sim        (applies the real 2N3904 model, then plots)
 */

/** ON Semiconductor 2N3904 — the widely published SPICE model card. */
export const netlistPatch = {
  // splice the real model over the generic one the netlister emits
  ".MODEL NPN NPN": `.MODEL NPN NPN (
+ IS=6.734f Xti=3 Eg=1.11 Vaf=74.03 Bf=416.4 Ne=1.259
+ Ise=6.734f Ikf=66.78m Xtb=1.5 Br=.7371 Nc=2 Isc=0 Ikr=0
+ Rc=1 Cjc=4.493p Mjc=.2593 Vjc=.75 Fc=.5 Cje=7.306p Mje=.3416
+ Vje=.75 Tr=239.5n Tf=301.2p Itf=.4 Vtf=4 Xtf=2 Rb=10 )`,
}

export default () => (
  <board routingDisabled>
    {/* 9V rail (V9). Square @ 1kHz = a clean 0→9V turn-on edge at t=0 that
        stays high for the first 500µs — the startup kick every oscillator
        needs (a perfectly-at-rest circuit has no noise to grow from). */}
    <voltagesource
      name="V9"
      voltage="9V"
      waveShape="square"
      frequency="1kHz"
      schX={-6}
      schY={-2}
    />

    <transistor name="Q3" type="npn" footprint="to92" schX={4} schY={0} />

    {/* Bias network (values from the real board) */}
    <resistor name="R10" resistance="56kohm" schX={2} schY={3} />
    <resistor name="R11" resistance="10kohm" schX={2} schY={-2.5} />
    <capacitor name="C6" capacitance="2.2nF" schX={4} schY={-2.5} />
    <resistor name="R12" resistance="1kohm" schX={6} schY={-2.5} />

    {/* Tank + feedback divider */}
    <inductor name="L1" inductance="100uH" schX={8} schY={3} />
    <capacitor name="CV1" capacitance="150pF" schX={10} schY={1} />
    <capacitor name="C14" capacitance="680pF" schX={8} schY={-1} />
    <capacitor name="C15" capacitance="680pF" schX={10} schY={-1} />

    {/* Rail decoupling: C2 makes V9 an RF ground (real board value) */}
    <capacitor name="C2" capacitance="100nF" schX={-4} schY={-3} />

    {/* Bias: R10 V9→base, R11 base→GND, C6 base→GND */}
    <trace from=".R10 > .pin1" to=".V9 > .pin1" />
    <trace from=".R10 > .pin2" to="net.BASE" />
    <trace from=".R11 > .pin1" to="net.BASE" />
    <trace from=".R11 > .pin2" to=".V9 > .pin2" />
    <trace from=".C6 > .pin1" to="net.BASE" />
    <trace from=".C6 > .pin2" to=".V9 > .pin2" />
    <trace from=".Q3 > .base" to="net.BASE" />

    {/* Emitter: R12 to GND; C14/C15 midpoint */}
    <trace from=".Q3 > .emitter" to=".R12 > .pin1" />
    <trace from=".R12 > .pin2" to=".V9 > .pin2" />
    <trace from=".Q3 > .emitter" to=".C14 > .pin1" />
    <trace from=".Q3 > .emitter" to=".C15 > .pin1" />
    <trace from=".C15 > .pin2" to=".V9 > .pin2" />

    {/* Tank: collector ↔ L1 ↔ C14, CV1 tank→GND, L1 top to V9(=RF GND) */}
    <trace from=".Q3 > .collector" to="net.TANK" />
    <trace from=".C14 > .pin2" to="net.TANK" />
    <trace from=".L1 > .pin1" to="net.TANK" />
    <trace from=".CV1 > .pin1" to="net.TANK" />
    <trace from=".L1 > .pin2" to=".V9 > .pin1" />
    <trace from=".CV1 > .pin2" to=".V9 > .pin2" />

    <trace from=".C2 > .pin1" to=".V9 > .pin1" />
    <trace from=".C2 > .pin2" to=".V9 > .pin2" />

    <voltageprobe name="VTANK" connectsTo=".L1 > .pin1" />
    <voltageprobe name="VEMIT" connectsTo=".Q3 > .emitter" />

    {/* 400µs of startup, 0.1µs/step = 4001 points — enough to watch the
        amplitude grow and clamp (~350 carrier cycles) */}
    <analogsimulation
      duration="0.4ms"
      timePerStep="0.1us"
      spiceEngine="ngspice"
    />
  </board>
)
