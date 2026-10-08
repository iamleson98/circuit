/**
 * ═════════════════════════════════════════════════════════════════════════
 *  RADIO LAB · AM TRANSMITTER — standalone playground
 * ═════════════════════════════════════════════════════════════════════════
 *  A single-file, zero-import version of transmitter/index.tsx.
 *  Paste the whole file into https://snippets.tscircuit.com (or run
 *  `tsci dev` on it) to explore the board interactively.
 *
 *  The full project — with the tutorial PDF, proofs, and BOM — lives at:
 *  https://github.com/iamleson98/circuit  (radio-lab/)
 */
/**
 * ─────────────────────────────────────────────────────────────────────────
 *  lib/parts.tsx — custom radio parts with hand-crafted footprints
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  WHY CUSTOM PARTS?
 *  tscircuit's footprinter knows standard patterns (to92, radial, axial,
 *  dip8...), but radio projects use several *mechanical* parts whose land
 *  patterns vary between vendors: the 9V battery clip, the power switch,
 *  the speaker, the electret microphone capsule, the polyvaricon tuning
 *  capacitor, and the antenna wire attachment point.
 *
 *  For those we compose footprints from primitives (like a real radio kit
 *  does with solder lugs / wire terminals):
 *
 *    <platedhole />     → a plated through-hole that can carry a port name
 *    <silkscreenpath /> → silkscreen outline graphics
 *
 *  All pads sit on a 2.54mm (0.1") grid and use generous holes so beginners
 *  can solder them easily, and every part can also be wired off-board
 *  instead of soldered directly — the standard kit-building practice that
 *  removes all vendor-specific footprint risk.
 *
 *  Part (schematic symbol)   Pads   Pinout (silkscreen-marked)
 *  ──────────────────────────────────────────────────────────────
 *  Battery9V  (battery)       2     pin1 = +9V (red), pin2 = GND (black)
 *  PowerSwitch (spst switch)  2     pin1, pin2 (any polarity)
 *  VolumePot  (potentiometer) 3     pin1 = CCW, pin2 = WIPER, pin3 = CW
 *  VarCap     (box)           3     STATOR_A, ROTOR(gnd), STATOR_B
 *  ElectretMic (box)          2     MIC_P (pin1), MIC_N = case (pin2)
 *  SpeakerTerm (box)          2     SPK_P , SPK_N
 *  AntennaPad  (box)          1     ANT — solder 1-2m of insulated wire
 *  Lm386 (dip8 chip)          8     standard LM386 pinout
 *  NpnTo92 (npn transistor)   3     C/B/E on an in-line 0.1" TO-92 row
 *
 *  Note: Switch / Battery / Potentiometer are imported as explicit class
 *  components because JSX's lowercase <switch> collides with the SVG
 *  <switch> element type.
 */



export interface PartProps extends Record<string, any> {
  name: string
}

/* ── 9V battery clip ─────────────────────────────────────────────────────
 * Two wire terminals 5.08mm apart (roomy for the snap's stranded leads).
 * Renders a real battery symbol in the schematic. pin1 = +, pin2 = −. */
export const Battery9V = (props: PartProps) => (
  <battery
    {...props}
    voltage="9V"
    footprint={
      <footprint>
        <platedhole portHints={["pin1"]} pcbX={-2.54} pcbY={0} holeDiameter={1.6} outerDiameter={2.5} shape="circle" />
        <platedhole portHints={["pin2"]} pcbX={2.54} pcbY={0} holeDiameter={1.6} outerDiameter={2.5} shape="circle" />
        <silkscreenpath
          route={[
            { x: -5.2, y: -2.6 },
            { x: 5.2, y: -2.6 },
            { x: 5.2, y: 2.6 },
            { x: -5.2, y: 2.6 },
            { x: -5.2, y: -2.6 },
          ]}
        />
      </footprint>
    }
  />
)

/* ── power switch ────────────────────────────────────────────────────────
 * SPST. Solder any small slide/toggle switch across the pads, or wire an
 * off-board switch. Renders a real switch symbol in the schematic. */
export const PowerSwitch = (props: PartProps) => (
  <switch
    {...props}
    type="spst"
    footprint={
      <footprint>
        <platedhole portHints={["pin1"]} pcbX={-2.54} pcbY={0} holeDiameter={1.2} outerDiameter={2.1} shape="circle" />
        <platedhole portHints={["pin2"]} pcbX={2.54} pcbY={0} holeDiameter={1.2} outerDiameter={2.1} shape="circle" />
        <silkscreenpath
          route={[
            { x: -5.2, y: -2.6 },
            { x: 5.2, y: -2.6 },
            { x: 5.2, y: 2.6 },
            { x: -5.2, y: 2.6 },
            { x: -5.2, y: -2.6 },
          ]}
        />
      </footprint>
    }
  />
)

/* ── volume control: 10k linear potentiometer ────────────────────────────
 * Standard 3-wire panel pot (with a knob!) wired to the pads. Renders a
 * real potentiometer symbol: pin1 CCW, pin2 wiper, pin3 CW. */
export const VolumePot = (props: PartProps) => (
  <potentiometer
    {...props}
    maxResistance="10k"
    pinVariant="three_pin"
    footprint={
      <footprint>
        <platedhole portHints={["pin1"]} pcbX={-2.54} pcbY={0} holeDiameter={1.2} outerDiameter={2.1} shape="circle" />
        <platedhole portHints={["pin2"]} pcbX={0} pcbY={0} holeDiameter={1.2} outerDiameter={2.1} shape="circle" />
        <platedhole portHints={["pin3"]} pcbX={2.54} pcbY={0} holeDiameter={1.2} outerDiameter={2.1} shape="circle" />
        <silkscreenpath
          route={[
            { x: -4.2, y: -2.2 },
            { x: 4.2, y: -2.2 },
            { x: 4.2, y: 2.2 },
            { x: -4.2, y: 2.2 },
            { x: -4.2, y: -2.2 },
          ]}
        />
      </footprint>
    }
  />
)

/* ── tuning capacitor: AM polyvaricon 10-280pF ───────────────────────────
 * A "polyvaricon" is the plastic-dielectric dual-gang variable capacitor
 * used in every pocket AM radio. Three solder lugs: two stators (A, B)
 * and the common rotor (G). We use STATOR_A + ROTOR as the LC-tank
 * tuning element; STATOR_B is a spare (parallel it for extra range —
 * see tutorial · Experiments). */
export const VarCap = (props: PartProps) => (
  <chip
    {...props}
    pinLabels={{ pin1: "STATOR_A", pin2: "ROTOR", pin3: "STATOR_B" }}
    footprint={
      <footprint>
        <platedhole portHints={["STATOR_A"]} pcbX={-2.54} pcbY={0} holeDiameter={1.2} outerDiameter={2.1} shape="circle" />
        <platedhole portHints={["ROTOR"]} pcbX={0} pcbY={0} holeDiameter={1.2} outerDiameter={2.1} shape="circle" />
        <platedhole portHints={["STATOR_B"]} pcbX={2.54} pcbY={0} holeDiameter={1.2} outerDiameter={2.1} shape="circle" />
        <silkscreenpath
          route={[
            { x: -3.6, y: -2.2 },
            { x: 3.6, y: -2.2 },
            { x: 3.6, y: 2.8 },
            { x: -3.6, y: 2.8 },
            { x: -3.6, y: -2.2 },
          ]}
        />
      </footprint>
    }
    schPinArrangement={{
      leftSide: { direction: "top-to-bottom", pins: ["STATOR_A"] },
      rightSide: { direction: "top-to-bottom", pins: ["ROTOR", "STATOR_B"] },
    }}
  />
)

/* ── electret microphone capsule ─────────────────────────────────────────
 * 2-terminal capsule. MIC_P = the pin NOT connected to the metal case,
 * MIC_N = case. Solder the capsule directly or wire it off-board. */
export const ElectretMic = (props: PartProps) => (
  <chip
    {...props}
    pinLabels={{ pin1: "MIC_P", pin2: "MIC_N" }}
    footprint={
      <footprint>
        <platedhole portHints={["MIC_P"]} pcbX={-1.27} pcbY={0} holeDiameter={1.0} outerDiameter={1.9} shape="circle" />
        <platedhole portHints={["MIC_N"]} pcbX={1.27} pcbY={0} holeDiameter={1.0} outerDiameter={1.9} shape="circle" />
        {/* circle hint for the round capsule body */}
        <silkscreencircle pcbX={0} pcbY={-2.2} radius={2.4} />
      </footprint>
    }
    schPinArrangement={{
      leftSide: { direction: "top-to-bottom", pins: ["MIC_P"] },
      rightSide: { direction: "top-to-bottom", pins: ["MIC_N"] },
    }}
  />
)

/* ── speaker terminals ─────────────────────────────────────────────────── */
export const SpeakerTerm = (props: PartProps) => (
  <chip
    {...props}
    pinLabels={{ pin1: "SPK_P", pin2: "SPK_N" }}
    footprint={
      <footprint>
        <platedhole portHints={["SPK_P"]} pcbX={-2.54} pcbY={0} holeDiameter={1.6} outerDiameter={2.5} shape="circle" />
        <platedhole portHints={["SPK_N"]} pcbX={2.54} pcbY={0} holeDiameter={1.6} outerDiameter={2.5} shape="circle" />
        <silkscreenpath
          route={[
            { x: -5.2, y: -2.6 },
            { x: 5.2, y: -2.6 },
            { x: 5.2, y: 2.6 },
            { x: -5.2, y: 2.6 },
            { x: -5.2, y: -2.6 },
          ]}
        />
      </footprint>
    }
    schPinArrangement={{
      leftSide: { direction: "top-to-bottom", pins: ["SPK_P"] },
      rightSide: { direction: "top-to-bottom", pins: ["SPK_N"] },
    }}
  />
)

/* ── antenna wire attachment point ───────────────────────────────────────
 * ONE pad + a "wire going up" silkscreen arrow. Solder 1-2m of insulated
 * wire (that wire IS the antenna). At ~1 MHz the wavelength is ~300m, so
 * any wire we can fit is an "electrically short" antenna. */
export const AntennaPad = (props: PartProps) => (
  <chip
    {...props}
    pinLabels={{ pin1: "ANT" }}
    footprint={
      <footprint>
        <platedhole portHints={["ANT"]} pcbX={0} pcbY={0} holeDiameter={1.6} outerDiameter={2.6} shape="circle" />
        {/* classic antenna symbol: a diagonal wire rising to the right */}
        <silkscreenpath
          route={[
            { x: -1.8, y: 1.8 },
            { x: 2.2, y: 5.8 },
          ]}
        />
        <silkscreenpath
          route={[
            { x: 0.9, y: 4.9 },
            { x: 2.2, y: 5.8 },
            { x: 1.3, y: 4.5 },
          ]}
        />
      </footprint>
    }
    schPinArrangement={{
      leftSide: { direction: "top-to-bottom", pins: ["ANT"] },
      rightSide: { direction: "top-to-bottom", pins: [] },
    }}
  />
)

/* ── LM386 audio power amplifier (DIP-8) ────────────────────────────────
 * The classic "one-chip speaker driver" found in a thousand kits.
 *   1/8  = GAIN (10µF between them → gain 200, open → gain 20)
 *   2    = IN−  (ground for single-ended use)
 *   3    = IN+  (audio in)
 *   4    = GND
 *   5    = OUT (→ 220µF → speaker)
 *   6    = VS (+9V)
 *   7    = BYPASS (100nF → GND keeps it stable) */
export const Lm386 = (props: PartProps) => (
  <chip
    {...props}
    pinLabels={{
      pin1: "GAIN_A",
      pin2: "IN_NEG",
      pin3: "IN_POS",
      pin4: "GND",
      pin5: "OUT",
      pin6: "VS",
      pin7: "BYPASS",
      pin8: "GAIN_B",
    }}
    footprint="dip8"
    schPinArrangement={{
      leftSide: {
        direction: "top-to-bottom",
        pins: ["IN_POS", "IN_NEG", "BYPASS", "GND"],
      },
      rightSide: {
        direction: "top-to-bottom",
        pins: ["VS", "OUT", "GAIN_A", "GAIN_B"],
      },
    }}
  />
)

/* ── BC547 / 2N3904 NPN transistor, in-line TO-92 ────────────────────────
 * tscircuit's <transistor> draws a REAL NPN symbol in the schematic and
 * maps collector→pad1, base→pad2, emitter→pad3. We use the IN-LINE to92
 * footprint (3 holes in a row, 0.1" pitch) so either transistor works:
 *
 *    BC547  (C-B-E): insert with the FLAT FACE toward the board edge
 *    2N3904 (E-B-C): insert rotated 180° (flat face the other way)
 *
 * Spreading TO-92 legs into a 0.1" row is the first skill every kit
 * builder learns — the tutorial shows it step by step. */
export const NpnTo92 = (props: PartProps) => (
  <transistor
    {...props}
    type="npn"
    footprint="to92_inline_p2.54mm"
  />
)

/**
 * ═════════════════════════════════════════════════════════════════════════
 *  RADIO LAB · AM TRANSMITTER ("AM-TX") — designed in tscircuit
 * ═════════════════════════════════════════════════════════════════════════
 *  Run with:   npm install -g tscircuit   →   tsci dev transmitter/index.tsx
 *  (or paste the standalone copy in standalone/ into snippets.tscircuit.com)
 *
 *  WHAT THIS IS
 *  A four-transistor AM (amplitude modulation) transmitter for the medium
 *  wave band (~0.65-0.85 MHz). Speak into an electret microphone and a
 *  nearby AM radio (or the companion AM-RX receiver) hears you. It uses
 *  the same ARCHITECTURE as a broadcast station, scaled to microwatts:
 *
 *    mic → audio preamp → modulator → ┌ stable carrier oscillator ┐→ modulated
 *                                      └ (Colpitts, TUNE knob)     ┘ final amp → wire
 *
 *  WHY FOUR STAGES (each one is a real broadcast concept, shrunk)
 *  · Q1 amplifies the millivolt microphone signal to volts (audio chain).
 *  · Q2 is an emitter follower whose output (net.VMD) is a power rail that
 *    WIGGLES WITH YOUR VOICE — the "modulated supply".
 *  · Q3 is a common-base Colpitts oscillator: L1 + CV1 + C14/C15 set the
 *    carrier frequency. It self-limits to a steady amplitude — a clean,
 *    stable carrier (turning CV1 slides it across 0.65-0.85 MHz).
 *  · Q4 is the modulated FINAL amplifier: driven hard by the carrier, its
 *    output can only swing between ground and VMD — so the output's
 *    AMPLITUDE EQUALS THE MODULATED SUPPLY. Voice on VMD ⇒ amplitude
 *    modulation stamped onto the carrier. That is exactly how the big
 *    transmitters do "high-level AM".
 *
 *  PROVEN, NOT HOPED
 *  calc/sim_colpitts.mjs integrates this exact oscillator (RK4, Ebers-Moll
 *  transistor, real bias network): it starts from a 1mV seed, lands within
 *  2% of the predicted frequency, tunes monotonically 666-847 kHz, never
 *  drops out under voice swings, and the final stage measures m ≈ 0.23
 *  modulation depth. calc/circuit_math.mjs re-derives every bias point.
 *
 *  HOW TO READ THIS FILE
 *  One flat netlist organized like the schematic pages of a real radio:
 *  power → microphone → preamp → modulator → oscillator → final → antenna.
 *  Every wire is an explicit <trace /> — reading the traces IS reading the
 *  schematic. Nets touching 3+ places get names (net.V9, net.GND, net.VMD,
 *  net.TANK) exactly like net labels in KiCad.
 *
 *  ALL PARTS ARE THROUGH-HOLE on a 0.1" (2.54mm) grid — the PCB layout
 *  doubles as a perfboard placement guide if you don't order boards.
 */
import "@tscircuit/core"

export default () => (
  <board width="91.44mm" height="55.88mm" name="am-tx">
    {/* ═══════════════════════ §1 POWER ENTRY ═════════════════════════════
        9V battery → slide switch → the V9 rail. C1 (100µF) is the bulk
        reservoir for audio peaks; C2 (100nF) is the fast local decoupler.
        LED1 + R1 give a ~3mA power light: (9V − 2V) / 2.2k ≈ 3mA. */}

    <Battery9V name="BT1" pcbX={-38.1} pcbY={-22.86} schX={-14} schY={-7} />
    <PowerSwitch name="SW1" pcbX={-30.48} pcbY={-22.86} schX={-10} schY={-7} />
    <capacitor name="C1" capacitance="100uF" footprint="radial_p5mm" pcbX={-38.1} pcbY={-13.97} schX={-12} schY={-3} />
    <capacitor name="C2" capacitance="100nF" footprint="radial_p2.54mm" pcbX={-29.21} pcbY={-13.97} schX={-9} schY={-3} />
    <led name="LED1" color="green" footprint="radial_p2.54mm" pcbX={-21.59} pcbY={-22.86} schX={-6} schY={-6} />
    <resistor name="R1" resistance="2.2kohm" footprint="axial_p10.16mm" pcbX={-11.43} pcbY={-22.86} schX={-4} schY={-6} />

    <trace from=".BT1 > .pin1" to=".SW1 > .pin1" />
    <trace from=".SW1 > .pin2" to="net.V9" />
    <trace from=".BT1 > .pin2" to="net.GND" />
    <trace from=".C1 > .pin1" to="net.V9" />
    <trace from=".C1 > .pin2" to="net.GND" />
    <trace from=".C2 > .pin1" to="net.V9" />
    <trace from=".C2 > .pin2" to="net.GND" />
    <trace from=".R1 > .pin1" to="net.V9" />
    <trace from=".R1 > .pin2" to=".LED1 > .anode" />
    <trace from=".LED1 > .cathode" to="net.GND" />

    {/* ═══════════════════════ §2 MICROPHONE ══════════════════════════════
        An electret capsule is a mic + built-in FET. R2 (2.2k) powers that
        FET from V9: ~0.3mA flows, and the pin sits a few volts below V9,
        carrying your voice as ±10-30mV of AC. C3 blocks that DC and passes
        the AC into Q1's base. (1µF film/MLCC — no polarity worries.) */}

    <ElectretMic name="MIC1" pcbX={-40.64} pcbY={8.89} schX={-16} schY={9} />
    <resistor name="R2" resistance="2.2kohm" footprint="axial_p10.16mm" pcbX={-33.02} pcbY={21.59} schX={-14} schY={11} />
    <capacitor name="C3" capacitance="1uF" footprint="radial_p2.54mm" pcbX={-25.4} pcbY={2.54} schX={-12} schY={9} />

    <trace from=".MIC1 > .MIC_P" to=".R2 > .pin2" name="MIC" />
    <trace from=".MIC1 > .MIC_P" to=".C3 > .pin1" />
    <trace from=".MIC1 > .MIC_N" to="net.GND" />
    <trace from=".R2 > .pin1" to="net.V9" />
    <trace from=".C3 > .pin2" to=".Q1 > .base" name="AUD" />

    {/* ═══════════════════════ §3 AUDIO PREAMP (Q1) ═══════════════════════
        A classic common-emitter stage: R3/R4 bias the base at ~1.15V,
        R6 sets the emitter (and collector) current to ~0.8mA, R5 is the
        load. C4 shorts R6 at audio frequencies → voltage gain ≈ R5/r_e ≈
        4.7k/33Ω ≈ 140×. The ~20mV mic signal becomes volts at the
        collector — plenty to drive the modulator. */}

    <NpnTo92 name="Q1" pcbX={-15.24} pcbY={8.89} schX={-9} schY={9} />
    <resistor name="R3" resistance="68kohm" footprint="axial_p10.16mm" pcbX={-12.7} pcbY={15.24} schX={-9} schY={12} />
    <resistor name="R4" resistance="10kohm" footprint="axial_p10.16mm" pcbX={-15.24} pcbY={2.54} schX={-9} schY={6} />
    <resistor name="R5" resistance="4.7kohm" footprint="axial_p10.16mm" pcbX={-25.4} pcbY={15.24} schX={-11.5} schY={9} />
    <resistor name="R6" resistance="560ohm" footprint="axial_p10.16mm" pcbX={-10.16} pcbY={-4.45} schX={-7} schY={6} />
    <capacitor name="C4" capacitance="100uF" footprint="radial_p5mm" pcbX={-19.05} pcbY={-13.97} schX={-5} schY={4} />

    <trace from=".R3 > .pin1" to="net.V9" />
    <trace from=".R3 > .pin2" to=".Q1 > .base" />
    <trace from=".R4 > .pin1" to=".Q1 > .base" />
    <trace from=".R4 > .pin2" to="net.GND" />
    <trace from=".R5 > .pin1" to="net.V9" />
    <trace from=".R5 > .pin2" to=".Q1 > .collector" />
    <trace from=".Q1 > .emitter" to=".R6 > .pin1" />
    <trace from=".R6 > .pin2" to="net.GND" />
    <trace from=".Q1 > .emitter" to=".C4 > .pin1" />
    <trace from=".C4 > .pin2" to="net.GND" />

    {/* ═══════════════════════ §4 SUPPLY MODULATOR (Q2) ═══════════════════
        Q2 is an emitter follower whose BASE carries the audio (C5 couples
        it from Q1's collector) and whose EMITTER becomes net.VMD — a power
        rail that wiggles with your voice. R7/R8 hold the base at ~5.4V, so
        VMD idles at ~4.7V and swings several volts with speech. The final
        amplifier's output ceiling IS this rail — that's how the audio gets
        stamped onto the carrier (see §6). Shout and you can overmodulate
        (hear it distort) — the tutorial turns that into an experiment. */}

    <NpnTo92 name="Q2" pcbX={-1.27} pcbY={8.89} schX={-2} schY={9} />
    <resistor name="R7" resistance="10kohm" footprint="axial_p10.16mm" pcbX={-8.89} pcbY={21.59} schX={-2} schY={12} />
    <resistor name="R8" resistance="15kohm" footprint="axial_p10.16mm" pcbX={1.27} pcbY={15.24} schX={-2} schY={6} />
    <capacitor name="C5" capacitance="1uF" footprint="radial_p2.54mm" pcbX={-5.08} pcbY={2.54} schX={-5} schY={12} />

    <trace from=".Q1 > .collector" to=".C5 > .pin1" name="AF_OUT" />
    <trace from=".C5 > .pin2" to=".Q2 > .base" />
    <trace from=".R7 > .pin1" to="net.V9" />
    <trace from=".R7 > .pin2" to=".Q2 > .base" />
    <trace from=".R8 > .pin1" to=".Q2 > .base" />
    <trace from=".R8 > .pin2" to="net.GND" />
    <trace from=".Q2 > .collector" to="net.V9" />
    <trace from=".Q2 > .emitter" to="net.VMD" />

    {/* ═══════════════════════ §5 CARRIER OSCILLATOR (Q3) + TANK ══════════
        A common-base Colpitts — the workhorse oscillator of simple radios.
        · C6 (2.2nF) grounds the base at RF but is transparent at audio —
          the base bias (R10/R11 from VMD) stays put, giving a rock-stable
          carrier. (Making C6 huge would couple audio into the bias and
          wobble the carrier — a real design subtlety the tutorial covers.)
        · The TANK: L1 hangs from the collector to VMD (the coil IS the DC
          feed — at DC it's a near-short, at RF it's high impedance), and
          the tank capacitance to ground is CV1 ∥ (C14 series C15).
              C14=C15=680pF in series = 340pF, plus CV1 10-280pF
              → ~350-630pF with L1=100µH → ~0.65 to 0.84 MHz
        · C14/C15 also form the feedback divider: the emitter sits at their
          midpoint, feeding a fraction of the collector swing back in phase.
          The pair presents a NEGATIVE RESISTANCE  −gm·X(C14)·X(C15)  in
          parallel with the tank; with |R_neg| ≈ 2kΩ against a ~20kΩ tank it
          starts reliably and self-limits to a steady ~1.3V carrier.
        · R12 sets the emitter current (~0.6mA → gm ≈ 24mS). */}

    <NpnTo92 name="Q3" pcbX={12.7} pcbY={8.89} schX={5} schY={9} />
    <resistor name="R10" resistance="27kohm" footprint="axial_p10.16mm" pcbX={5.08} pcbY={21.59} schX={5} schY={12} />
    <resistor name="R11" resistance="10kohm" footprint="axial_p10.16mm" pcbX={13.97} pcbY={15.24} schX={5} schY={6} />
    <resistor name="R12" resistance="1kohm" footprint="axial_p10.16mm" pcbX={8.89} pcbY={-4.45} schX={7} schY={6} />
    <capacitor name="C6" capacitance="2.2nF" footprint="radial_p2.54mm" pcbX={15.24} pcbY={2.54} schX={7} schY={3.5} />
    <capacitor name="C14" capacitance="680pF" footprint="radial_p2.54mm" pcbX={21.59} pcbY={2.54} schX={7.5} schY={10} />
    <capacitor name="C15" capacitance="680pF" footprint="radial_p2.54mm" pcbX={19.05} pcbY={-4.45} schX={8.5} schY={6} />
    <inductor name="L1" inductance="100uH" footprint="radial_p5mm" pcbX={38.1} pcbY={-4.45} schX={9} schY={11} />
    <VarCap name="CV1" pcbX={33.02} pcbY={21.59} schX={9} schY={7} />

    <trace from=".R10 > .pin1" to="net.VMD" />
    <trace from=".R10 > .pin2" to=".Q3 > .base" />
    <trace from=".R11 > .pin1" to=".Q3 > .base" />
    <trace from=".R11 > .pin2" to="net.GND" />
    <trace from=".C6 > .pin1" to=".Q3 > .base" />
    <trace from=".C6 > .pin2" to="net.GND" />
    <trace from=".Q3 > .emitter" to=".R12 > .pin1" />
    <trace from=".R12 > .pin2" to="net.GND" />
    <trace from=".Q3 > .emitter" to=".C14 > .pin1" />
    <trace from=".Q3 > .emitter" to=".C15 > .pin1" />
    <trace from=".C15 > .pin2" to="net.GND" />
    {/* the TANK: everyone who resonates together */}
    <trace from=".Q3 > .collector" to="net.TANK" />
    <trace from=".C14 > .pin2" to="net.TANK" />
    <trace from=".L1 > .pin1" to="net.TANK" />
    <trace from=".CV1 > .STATOR_A" to="net.TANK" />
    {/* the coil's other end is the MODULATED supply (not ground!) */}
    <trace from=".L1 > .pin2" to="net.VMD" />
    <trace from=".CV1 > .ROTOR" to="net.GND" />

    {/* ═══════════════════════ §6 MODULATED FINAL (Q4) ════════════════════
        The broadcast trick: a power amplifier whose SUPPLY is the
        modulated rail. C17 couples the steady carrier from the tank into
        Q4's base; R14/R15 bias it; R16 (560Ω, unbypassed) sets the gain at
        R17/R16 ≈ 3.9 — deliberately MORE than needed, so the stage is
        overdriven and its output can only slam between ground and VMD.
        The output amplitude therefore EQUALS the modulated rail: audio on
        VMD becomes amplitude modulation on the carrier. Exactly one
        transistor replaces the modulation transformer of the classic
        kits — and the math is cleaner to explain. */}

    <NpnTo92 name="Q4" pcbX={25.4} pcbY={8.89} schX={11} schY={9} />
    <resistor name="R14" resistance="27kohm" footprint="axial_p10.16mm" pcbX={17.78} pcbY={21.59} schX={11} schY={12} />
    <resistor name="R15" resistance="10kohm" footprint="axial_p10.16mm" pcbX={5.08} pcbY={2.54} schX={11} schY={6} />
    <resistor name="R16" resistance="560ohm" footprint="axial_p10.16mm" pcbX={25.4} pcbY={-13.97} schX={13} schY={6} />
    <resistor name="R17" resistance="2.2kohm" footprint="axial_p10.16mm" pcbX={27.94} pcbY={15.24} schX={13} schY={12} />
    <capacitor name="C17" capacitance="1nF" footprint="radial_p2.54mm" pcbX={27.94} pcbY={2.54} schX={9.5} schY={9} />

    <trace from=".C17 > .pin1" to="net.TANK" />
    <trace from=".C17 > .pin2" to=".Q4 > .base" />
    <trace from=".R14 > .pin1" to="net.VMD" />
    <trace from=".R14 > .pin2" to=".Q4 > .base" />
    <trace from=".R15 > .pin1" to=".Q4 > .base" />
    <trace from=".R15 > .pin2" to="net.GND" />
    <trace from=".Q4 > .emitter" to=".R16 > .pin1" />
    <trace from=".R16 > .pin2" to="net.GND" />
    <trace from=".R17 > .pin1" to="net.VMD" />
    <trace from=".R17 > .pin2" to=".Q4 > .collector" />

    {/* ═══════════════════════ §7 ANTENNA ═════════════════════════════════
        At ~0.75 MHz the wavelength is ~400m, so a 1-2m wire is an
        "electrically short" antenna: mostly a ~30pF capacitor to the world.
        C16 (100pF) feeds it a controlled sliver of the modulated carrier —
        big enough to reach across a room, small enough to stay in
        license-exempt territory (DC input to the final ≈ 5mW, far below
        the 100mW of e.g. FCC Part 15.219). Solder 1-2m of any insulated
        wire to the ANT pad. */}

    <capacitor name="C16" capacitance="100pF" footprint="radial_p2.54mm" pcbX={35.56} pcbY={8.89} schX={14} schY={9} />
    <AntennaPad name="ANT1" pcbX={40.64} pcbY={8.89} schX={16} schY={9} />

    <trace from=".C16 > .pin1" to=".Q4 > .collector" name="RF_OUT" />
    <trace from=".C16 > .pin2" to=".ANT1 > .ANT" name="ANT" />

    {/* ═══════════════════════ §8 SILKSCREEN MANUAL ═══════════════════════
        The board labels itself: what each knob/pad does and the transistor
        orientation trick (BC547 flat face down / 2N3904 rotated 180°). */}

    <silkscreentext text="AM-TX" pcbX={0} pcbY={26} fontSize="1.6mm" />
    <silkscreentext text="MIC" pcbX={-36} pcbY={12.7} fontSize="1.2mm" />
    <silkscreentext text="TUNE" pcbX={33.02} pcbY={17.78} fontSize="1.2mm" />
    <silkscreentext text="ANT WIRE" pcbX={40.64} pcbY={4.06} fontSize="1.2mm" />
    <silkscreentext text="9V" pcbX={-38.1} pcbY={-19.05} fontSize="1.2mm" />
    <silkscreentext text="ON" pcbX={-30.48} pcbY={-19.05} fontSize="1.2mm" />
    <silkscreentext text="BC547: FLAT FACE DOWN" pcbX={5} pcbY={-9.53} fontSize="1.1mm" />
    <silkscreentext text="2N3904: ROTATE 180" pcbX={5} pcbY={-11.43} fontSize="1.1mm" />

    {/* ═══════════════════════ §9 GROUND POUR ═════════════════════════════
        Solid GND on the bottom layer: short returns for every stage, less
        hum, better-behaved RF. Thermal reliefs keep through-hole pads
        solderable. This is the standard 2-layer stackup for anything RF. */}
    <copperpour
      connectsTo="net.GND"
      layer="bottom"
      padMargin="0.45mm"
      useThermalReliefs
    />
  </board>
)
