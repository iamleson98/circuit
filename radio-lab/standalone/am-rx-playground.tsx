/**
 * ═════════════════════════════════════════════════════════════════════════
 *  RADIO LAB · AM RECEIVER — standalone playground
 * ═════════════════════════════════════════════════════════════════════════
 *  A single-file, zero-import version of receiver/index.tsx.
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
 *  RADIO LAB · AM RECEIVER ("AM-RX") — designed in tscircuit
 * ═════════════════════════════════════════════════════════════════════════
 *  Run with:   npm install -g tscircuit   →   tsci dev receiver/index.tsx
 *  (or paste the standalone copy in standalone/ into snippets.tscircuit.com)
 *
 *  WHAT THIS IS
 *  A tuned-radio-frequency (TRF) AM receiver — the direct ancestor of every
 *  radio you've ever owned, small enough to understand completely:
 *
 *    antenna → LC tank (TUNE) → buffer → RF amp → diode detector →
 *    volume → LM386 → speaker
 *
 *  WHY THESE STAGES (each one is a classic radio building block)
 *  · The LC tank (L1 ∥ CV1) is the "tuning" itself: at its resonant
 *    frequency its impedance peaks, so ONLY the station you tuned to
 *    survives onto Q1's base. Turn CV1 → you slide a highlighter across
 *    the whole AM band. It also hears real broadcast stations (VOV1 630/
 *    675 kHz, etc.) with a longer antenna.
 *  · Q1 (emitter follower) buffers the tank so the next stage doesn't
 *    load it — the tank keeps its sharpness (Q).
 *  · Q2 (common emitter, gain ≈ 80) lifts the microvolt/millivolt RF up
 *    to where a diode can do its job.
 *  · D1 (1N34A germanium) rectifies: it keeps only the positive half of
 *    the RF, and C8 fills in the gaps → what's left is the audio
 *    envelope. This is THE detector of the crystal-radio age.
 *  · RV1 (10k pot) is both the detector load and the volume control.
 *  · Q3 + LED2 make a "signal LED" — it glows when a strong station is
 *    tuned in, which makes hunting for the transmitter's carrier a
 *    visual game.
 *  · U1 (LM386) drives the speaker: gain 20, or 200 with SW2 closed
 *    ("weak station" mode).
 *
 *  HOW TO READ THIS FILE
 *  One flat netlist organized like a schematic: power → antenna/tank →
 *  buffer → amplifier → detector → audio → output. Every wire is an
 *  explicit <trace />. Nets touching 3+ places get names (net.V9,
 *  net.GND, net.TANK) exactly like net labels in KiCad.
 *
 *  ALL PARTS ARE THROUGH-HOLE on a 0.1" (2.54mm) grid — the PCB layout
 *  doubles as a perfboard placement guide.
 */
import "@tscircuit/core"

export default () => (
  <board
    width="99.06mm"
    height="60.96mm"
    name="am-rx"
  >
    {/* ═══════════════════════ §1 POWER ENTRY ═════════════════════════════ */}

    <Battery9V name="BT1" pcbX={-38.1} pcbY={-24.13} schX={-14} schY={-8} />
    <PowerSwitch name="SW1" pcbX={-30.48} pcbY={-24.13} schX={-10} schY={-8} />
    <capacitor name="C1" capacitance="100uF" footprint="radial_p5mm" pcbX={-38.1} pcbY={-13.97} schX={-12} schY={-4} />
    <capacitor name="C2" capacitance="100nF" footprint="radial_p2.54mm" pcbX={-29.21} pcbY={-13.97} schX={-9} schY={-4} />
    <led name="LED1" color="green" footprint="radial_p2.54mm" pcbX={-21.59} pcbY={-22.86} schX={-6} schY={-7} />
    <resistor name="R1" resistance="2.2kohm" footprint="axial_p10.16mm" pcbX={-11.43} pcbY={-22.86} schX={-4} schY={-7} />

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

    {/* ═══════════════════════ §2 ANTENNA + LC TANK ═══════════════════════
        The heart of the receiver. L1 (220µH) in parallel with CV1
        (10-280pF, the polyvaricon "TUNE" knob) resonates at
            f = 1 / (2π√(L·C))  →  ~0.6 to 1.7 MHz
        which spans the entire AM broadcast band (526.5-1606.5 kHz in ITU
        region 3 / Vietnam, 9kHz channels) AND the companion AM-TX's
        0.8-1.45 MHz range. C3 (47pF) couples the 1-2m wire antenna into
        the tank lightly, so the antenna doesn't dull the tank's
        sharpness. C4 passes the selected RF to Q1 while blocking the DC
        path through the coil (a coil is a short circuit at DC!). */}

    <AntennaPad name="ANT1" pcbX={-46.99} pcbY={15.24} schX={-17} schY={9} />
    <capacitor name="C3" capacitance="47pF" footprint="radial_p2.54mm" pcbX={-44.45} pcbY={10.16} schX={-15} schY={9} />
    <inductor name="L1" inductance="220uH" footprint="radial_p5mm" pcbX={-35.56} pcbY={10.16} schX={-13} schY={11} />
    <VarCap name="CV1" pcbX={-36.83} pcbY={26.67} schX={-13} schY={14} />
    <capacitor name="C4" capacitance="100nF" footprint="radial_p2.54mm" pcbX={-25.4} pcbY={2.54} schX={-11} schY={9} />

    <trace from=".ANT1 > .ANT" to=".C3 > .pin1" name="ANT" />
    <trace from=".C3 > .pin2" to="net.TANK" />
    <trace from=".L1 > .pin1" to="net.TANK" />
    <trace from=".CV1 > .STATOR_A" to="net.TANK" />
    <trace from=".C4 > .pin1" to="net.TANK" />
    <trace from=".L1 > .pin2" to="net.GND" />
    <trace from=".CV1 > .ROTOR" to="net.GND" />

    {/* ═══════════════════════ §3 BUFFER (Q1) + RF AMP (Q2) ═══════════════
        Q1: emitter follower, deliberately biased LIGHT (R2/R3 = 1M/470k
        ≈ 320k input resistance) so the tank stays sharp. It reproduces
        the tank voltage without loading it.
        Q2: common-emitter RF amplifier. R5/R6/R7 bias it at ~1mA; C6
        makes its emitter an RF ground → gain ≈ R8/r_e ≈ 2.2k/26 ≈ 80×.
        1mV of selected RF becomes ~80mV — enough for the detector. */}

    <NpnTo92 name="Q1" pcbX={-19.05} pcbY={10.16} schX={-8} schY={9} />
    <resistor name="R2" resistance="1Mohm" footprint="axial_p10.16mm" pcbX={-22.86} pcbY={26.67} schX={-8} schY={12} />
    <resistor name="R3" resistance="470kohm" footprint="axial_p10.16mm" pcbX={-25.4} pcbY={19.05} schX={-9.5} schY={6} />
    <resistor name="R4" resistance="2.2kohm" footprint="axial_p10.16mm" pcbX={-19.05} pcbY={-13.97} schX={-6.5} schY={6} />
    <capacitor name="C5" capacitance="100nF" footprint="radial_p2.54mm" pcbX={-12.7} pcbY={2.54} schX={-5.5} schY={9} />

    <trace from=".C4 > .pin2" to=".Q1 > .base" name="RF_IN" />
    <trace from=".R2 > .pin1" to="net.V9" />
    <trace from=".R2 > .pin2" to=".Q1 > .base" />
    <trace from=".R3 > .pin1" to=".Q1 > .base" />
    <trace from=".R3 > .pin2" to="net.GND" />
    <trace from=".Q1 > .collector" to="net.V9" />
    <trace from=".Q1 > .emitter" to=".R4 > .pin1" />
    <trace from=".R4 > .pin2" to="net.GND" />
    <trace from=".Q1 > .emitter" to=".C5 > .pin1" />

    <NpnTo92 name="Q2" pcbX={-5.08} pcbY={10.16} schX={-2} schY={9} />
    <resistor name="R5" resistance="220kohm" footprint="axial_p10.16mm" pcbX={-8.89} pcbY={26.67} schX={-2} schY={12} />
    <resistor name="R6" resistance="47kohm" footprint="axial_p10.16mm" pcbX={-15.24} pcbY={-5.08} schX={-3.5} schY={6} />
    <resistor name="R7" resistance="820ohm" footprint="axial_p10.16mm" pcbX={-2.54} pcbY={-5.08} schX={-0.5} schY={6} />
    <resistor name="R8" resistance="2.2kohm" footprint="axial_p10.16mm" pcbX={3.81} pcbY={26.67} schX={0} schY={12} />
    <capacitor name="C6" capacitance="100nF" footprint="radial_p2.54mm" pcbX={1.27} pcbY={2.54} schX={1} schY={4} />
    <capacitor name="C7" capacitance="100nF" footprint="radial_p2.54mm" pcbX={8.89} pcbY={2.54} schX={1.5} schY={11} />

    <trace from=".C5 > .pin2" to=".Q2 > .base" name="RF_AMP_IN" />
    <trace from=".R5 > .pin1" to="net.V9" />
    <trace from=".R5 > .pin2" to=".Q2 > .base" />
    <trace from=".R6 > .pin1" to=".Q2 > .base" />
    <trace from=".R6 > .pin2" to="net.GND" />
    <trace from=".Q2 > .emitter" to=".R7 > .pin1" />
    <trace from=".R7 > .pin2" to="net.GND" />
    <trace from=".Q2 > .emitter" to=".C6 > .pin1" />
    <trace from=".C6 > .pin2" to="net.GND" />
    <trace from=".R8 > .pin1" to="net.V9" />
    <trace from=".R8 > .pin2" to=".Q2 > .collector" />
    <trace from=".Q2 > .collector" to=".C7 > .pin1" />

    {/* ═══════════════════════ §4 DIODE DETECTOR + SIGNAL LED ═════════════
        The magic moment where radio becomes audio. C7 passes the amplified
        RF into D1 but blocks DC, so the DET node rests at 0V with no
        station. D1 conducts only on RF peaks and charges C8; RV1 (10k)
        bleeds it off. The result across RV1: the RF's envelope = the
        original audio. Time constant check: R·C = 10k × 4.7nF = 47µs —
        fast enough to track ~3kHz audio, slow enough to bridge the 1µs
        RF cycles. (That compromise is a whole page in the tutorial.)
        Q3 + LED2 + R9 watch the DET node: strong carrier → DET jumps to
        a volt or more → LED glows. A visual "you found a station!". */}

    <diode name="D1" footprint="axial_p10.16mm" pcbX={6.35} pcbY={10.16} schX={5} schY={9} />
    <capacitor name="C8" capacitance="4.7nF" footprint="radial_p2.54mm" pcbX={15.24} pcbY={2.54} schX={7} schY={11} />
    <potentiometer
      name="RV1"
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
      pcbX={11.43}
      pcbY={-13.97}
      schX={7}
      schY={5}
    />

    <trace from=".C7 > .pin2" to=".D1 > .anode" name="DET_IN" />
    <trace from=".D1 > .cathode" to="net.DET" />
    <trace from=".RV1 > .pin1" to="net.DET" />
    <trace from=".C8 > .pin1" to="net.DET" />
    <trace from=".C8 > .pin2" to="net.GND" />
    <trace from=".RV1 > .pin3" to="net.GND" />

    <NpnTo92 name="Q3" pcbX={21.59} pcbY={10.16} schX={10} schY={13} />
    <resistor name="R9" resistance="47kohm" footprint="axial_p10.16mm" pcbX={10.16} pcbY={19.05} schX={8} schY={14} />
    <resistor name="R10" resistance="1kohm" footprint="axial_p10.16mm" pcbX={17.78} pcbY={26.67} schX={10} schY={17} />
    <led name="LED2" color="yellow" footprint="radial_p2.54mm" pcbX={25.4} pcbY={19.05} schX={12} schY={17} />

    <trace from=".R9 > .pin1" to="net.DET" />
    <trace from=".R9 > .pin2" to=".Q3 > .base" />
    <trace from=".Q3 > .emitter" to="net.GND" />
    <trace from=".R10 > .pin1" to="net.V9" />
    <trace from=".R10 > .pin2" to=".LED2 > .anode" />
    <trace from=".LED2 > .cathode" to=".Q3 > .collector" />

    {/* ═══════════════════════ §5 AUDIO: VOLUME → LM386 → SPEAKER ════════
        The wiper of RV1 picks off a slice of the recovered audio → C9
        (10µF) blocks DC into the LM386's +input. LM386 app circuit,
        straight from the datasheet: gain 20 as-is; close SW2 to strap a
        10µF across pins 1-8 → gain 200 for weak stations. C10 on BYPASS
        (pin 7) and the 10Ω + 50nF "Zobel" on the output keep it stable
        into a speaker. C13 couples OUT to the 8Ω speaker; SPK pads also
        fit headphones (they'll be loud!). */}

    <capacitor name="C9" capacitance="10uF" footprint="radial_p2.54mm" pcbX={25.4} pcbY={-5.08} schX={9} schY={5} />
    <Lm386 name="U1" pcbX={34.29} pcbY={2.54} schX={12} schY={2} />
    <PowerSwitch name="SW2" pcbX={44.45} pcbY={19.05} schX={15} schY={8} />
    <capacitor name="C11" capacitance="10uF" footprint="radial_p2.54mm" pcbX={43.18} pcbY={15.24} schX={15} schY={5.5} />
    <capacitor name="C10" capacitance="100nF" footprint="radial_p2.54mm" pcbX={44.45} pcbY={1.27} schX={15.5} schY={3} />
    <capacitor name="C12" capacitance="100nF" footprint="radial_p2.54mm" pcbX={44.45} pcbY={8.89} schX={13.5} schY={6} />
    <capacitor name="C13" capacitance="220uF" footprint="radial_p5mm" pcbX={41.91} pcbY={-11.43} schX={16} schY={-1} />
    <resistor name="R11" resistance="10ohm" footprint="axial_p10.16mm" pcbX={29.21} pcbY={-13.97} schX={13} schY={-3} />
    <capacitor name="C14" capacitance="47nF" footprint="radial_p2.54mm" pcbX={19.05} pcbY={-13.97} schX={11} schY={-3} />
    <SpeakerTerm name="SPK1" pcbX={43.18} pcbY={-24.13} schX={16.5} schY={-5} />

    <trace from=".RV1 > .pin2" to=".C9 > .pin1" name="AUD" />
    <trace from=".C9 > .pin2" to=".U1 > .IN_POS" />
    <trace from=".U1 > .IN_NEG" to="net.GND" />
    <trace from=".U1 > .GND" to="net.GND" />
    <trace from=".U1 > .VS" to="net.V9" />
    <trace from=".C12 > .pin1" to="net.V9" />
    <trace from=".C12 > .pin2" to="net.GND" />
    <trace from=".U1 > .BYPASS" to=".C10 > .pin1" />
    <trace from=".C10 > .pin2" to="net.GND" />
    {/* gain strap: GAIN_A — SW2 — C11 — GAIN_B (closed = gain 200) */}
    <trace from=".U1 > .GAIN_A" to=".SW2 > .pin1" />
    <trace from=".SW2 > .pin2" to=".C11 > .pin1" />
    <trace from=".C11 > .pin2" to=".U1 > .GAIN_B" />
    {/* output */}
    <trace from=".U1 > .OUT" to=".C13 > .pin1" name="AMP_OUT" />
    <trace from=".C13 > .pin2" to=".SPK1 > .SPK_P" />
    <trace from=".SPK1 > .SPK_N" to="net.GND" />
    <trace from=".U1 > .OUT" to=".R11 > .pin1" />
    <trace from=".R11 > .pin2" to=".C14 > .pin1" />
    <trace from=".C14 > .pin2" to="net.GND" />

    {/* ═══════════════════════ §6 SILKSCREEN MANUAL ═══════════════════════ */}

    <silkscreentext text="AM-RX" pcbX={10.16} pcbY={-2.54} fontSize="1.6mm" />
    <silkscreentext text="TUNE" pcbX={-36.83} pcbY={29.21} fontSize="1.2mm" />
    <silkscreentext text="ANT WIRE" pcbX={-44.45} pcbY={23.5} fontSize="1.2mm" />
    <silkscreentext text="VOL" pcbX={11.43} pcbY={-17.5} fontSize="1.2mm" />
    <silkscreentext text="GAIN 20/200" pcbX={41.91} pcbY={22.86} fontSize="1.2mm" />
    <silkscreentext text="SPKR" pcbX={43.18} pcbY={-20.32} fontSize="1.2mm" />
    <silkscreentext text="9V" pcbX={-38.1} pcbY={-20.32} fontSize="1.2mm" />
    <silkscreentext text="ON" pcbX={-30.48} pcbY={-20.32} fontSize="1.2mm" />
    <silkscreentext text="BC547: FLAT FACE DOWN" pcbX={-6} pcbY={-8} fontSize="1.1mm" />
    <silkscreentext text="2N3904: ROTATE 180" pcbX={-6} pcbY={-10.5} fontSize="1.1mm" />

    {/* ═══════════════════════ §7 GROUND POUR ═════════════════════════════ */}
    <copperpour
      connectsTo="net.GND"
      layer="bottom"
      padMargin="0.45mm"
      useThermalReliefs
    />
  </board>
)
