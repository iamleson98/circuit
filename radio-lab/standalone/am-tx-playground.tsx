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
 *    <courtyardrect />  → the keep-out the part's body (or the wire terminal's
 *                         label box) needs. Every custom footprint has one, so
 *                         tscircuit's DRC catches bodies that collide — without
 *                         them it silently skipped these parts (it found the coil
 *                         sitting on a resistor and the battery terminals 2.54mm
 *                         from the switch: one solder blob from shorting the cell).
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
 *  Cap / ECap / Led5mm        2     radial, 0.8/1.0 mm holes; ECap + = pin1 (square)
 *  Res / AxialDiode           2     axial, 0.8 mm holes; diode cathode = pin2 (square)
 *
 *  Note: Switch / Battery / Potentiometer are imported as explicit class
 *  components because JSX's lowercase <switch> collides with the SVG
 *  <switch> element type.
 */



/** Manufacturing rules spread into every <board> of this project. tscircuit's
 *  defaults are a fab's ABSOLUTE minimums (0.20mm-drill / 0.30mm vias with a
 *  0.05mm ring); these are comfortable standard 2-layer rules instead. */
export const FAB_RULES = {
  minTraceWidth: "0.15mm",
  minTraceToPadEdgeClearance: "0.15mm",
  minPadEdgeToPadEdgeClearance: "0.15mm",
  minViaEdgeToPadEdgeClearance: "0.15mm",
  minViaHoleDiameter: "0.3mm",
  minViaPadDiameter: "0.6mm",
  pcbStyle: { viaHoleDiameter: "0.3mm", viaPadDiameter: "0.6mm" },
} as const

export interface PartProps extends Record<string, any> {
  name: string
}

/* ── 9V battery clip ─────────────────────────────────────────────────────
 * Two wire terminals 5.08mm apart (roomy for the snap's stranded leads).
 * Renders a real battery symbol in the schematic. pin1 = +, pin2 = −
 * (each board prints "+ 9V -" above the pads: red lead to the "+" hole). */
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
            { x: -4.3, y: -2.0 },
            { x: 4.3, y: -2.0 },
            { x: 4.3, y: 2.0 },
            { x: -4.3, y: 2.0 },
            { x: -4.3, y: -2.0 },
          ]}
        />
        <courtyardrect pcbX={0} pcbY={0} width={8.6} height={4.0} />
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
            { x: -4.3, y: -2.0 },
            { x: 4.3, y: -2.0 },
            { x: 4.3, y: 2.0 },
            { x: -4.3, y: 2.0 },
            { x: -4.3, y: -2.0 },
          ]}
        />
        <courtyardrect pcbX={0} pcbY={0} width={8.6} height={4.0} />
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
        <courtyardrect pcbX={0} pcbY={0} width={8.4} height={4.4} />
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
        <courtyardrect pcbX={0} pcbY={0.3} width={7.2} height={5.0} />
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
        <courtyardrect pcbX={0} pcbY={-1.83} width={5.3} height={6.05} />
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
            { x: -4.3, y: -2.0 },
            { x: 4.3, y: -2.0 },
            { x: 4.3, y: 2.0 },
            { x: -4.3, y: 2.0 },
            { x: -4.3, y: -2.0 },
          ]}
        />
        <courtyardrect pcbX={0} pcbY={0} width={8.6} height={4.0} />
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
        <courtyardcircle pcbX={0} pcbY={0} radius={1.55} />
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

/* ── NPN transistor, in-line TO-92 (BC547/BC548, 2N3904, 2N2222A) ──────
 * tscircuit's <transistor> draws a REAL NPN symbol in the schematic and
 * maps collector→pin1, base→pin2, emitter→pin3. The footprint is spelled
 * out here instead of using the stock "to92_inline" string: that one has
 * 0.72mm holes in 0.95mm-wide pads — a 0.115mm annular ring, below the
 * 0.18mm a fab accepts for plated holes. These pads are 1.2 × 1.8mm with
 * 0.8mm holes (0.2mm ring), still on the 0.1" row so either part fits:
 *
 *    BC547/BC548 (C-B-E): insert with the FLAT FACE toward −Y (silkscreen bar)
 *    2N3904 / 2N2222A in TO-92 (E-B-C): insert rotated 180°
 *
 * Spreading TO-92 legs into a 0.1" row is the first skill every kit
 * builder learns — the tutorial shows it step by step. */
export const NpnTo92 = (props: PartProps) => (
  <transistor
    {...props}
    type="npn"
    footprint={
      <footprint>
        <platedhole portHints={["pin1"]} shape="pill" pcbX={-2.54} pcbY={0} outerWidth={1.2} outerHeight={1.8} holeWidth={0.8} holeHeight={0.8} />
        <platedhole portHints={["pin2"]} shape="pill" pcbX={0} pcbY={0} outerWidth={1.2} outerHeight={1.8} holeWidth={0.8} holeHeight={0.8} />
        <platedhole portHints={["pin3"]} shape="pill" pcbX={2.54} pcbY={0} outerWidth={1.2} outerHeight={1.8} holeWidth={0.8} holeHeight={0.8} />
        {/* flat face (−Y) and the rounded back of the body */}
        <silkscreenpath route={[{ x: -2.2, y: -1.6 }, { x: 2.2, y: -1.6 }]} />
        <silkscreenpath
          route={[40, 60, 80, 100, 120, 140].map((a) => ({
            x: 2.5 * Math.cos((a * Math.PI) / 180),
            y: 2.5 * Math.sin((a * Math.PI) / 180),
          }))}
        />
        {/* pin-1 (collector) dot */}
        <silkscreenpath route={[{ x: -3.6, y: 0.4 }, { x: -3.6, y: -0.4 }]} />
        <courtyardrect pcbX={0} pcbY={0.45} width={6.8} height={4.6} />
      </footprint>
    }
  />
)

/* ── capacitors and LEDs, with holes sized for real leads ──────────────────
 * tscircuit's stock "radial_p2.54mm" footprint drills 0.635 mm holes: a
 * 0.5-0.6 mm capacitor or LED leg barely fits once the hole is plated, and
 * it has no polarity mark. These keep the stock pad positions and body
 * outlines (so placement and routing are unchanged) but drill lead + 0.2 mm
 * or more, and mark polarity:
 *   Cap      ceramic / film, any way round           0.8 mm holes
 *   ECap     aluminium electrolytic: + = pin1 = the SQUARE pad, marked "+";
 *            the can's stripe (−) goes on the other side   0.8 mm holes
 *   Led5mm   anode = pin1 (round pad, long leg); cathode = pin2 (square
 *            pad, the flat on the rim)               1.0 mm holes (0.5 mm
 *            square legs are 0.71 mm corner to corner) */
const rimPath = (r: number, from: number, to: number) =>
  Array.from({ length: 41 }, (_, i) => {
    const a = ((from + ((to - from) * i) / 40) * Math.PI) / 180
    return { x: r * Math.cos(a), y: r * Math.sin(a) }
  })

export const Cap = (props: PartProps & { capacitance: string }) => (
  <capacitor
    {...props}
    capacitance={props.capacitance}
    footprint={
      <footprint>
        <platedhole portHints={["pin1"]} pcbX={-1.27} pcbY={0} holeDiameter={0.8} outerDiameter={1.4} shape="circle" />
        <platedhole portHints={["pin2"]} pcbX={1.27} pcbY={0} holeDiameter={0.8} outerDiameter={1.4} shape="circle" />
        <silkscreenpath route={rimPath(2.6, 0, 360)} />
        <courtyardcircle pcbX={0} pcbY={0} radius={2.79} />
      </footprint>
    }
  />
)

export const ECap = (props: PartProps & { capacitance: string; pitch: 2.54 | 5 }) => {
  const big = props.pitch === 5
  const p = big ? 5 : 2.54
  const r = big ? 5.1 : 2.6
  const pad = big ? 1.6 : 1.5
  const { pitch: _p, ...rest } = props
  return (
    <capacitor
      {...rest}
      capacitance={props.capacitance}
      polarized
      footprint={
        <footprint>
          <platedhole portHints={["pin1", "pos"]} pcbX={-p / 2} pcbY={0} holeDiameter={0.8} rectPadWidth={pad} rectPadHeight={pad} holeShape="circle" padShape="rect" holeOffsetX={0} holeOffsetY={0} shape="circular_hole_with_rect_pad" />
          <platedhole portHints={["pin2", "neg"]} pcbX={p / 2} pcbY={0} holeDiameter={0.8} outerDiameter={pad} shape="circle" />
          <silkscreenpath route={rimPath(r, 0, 360)} />
          {/* "+" beside the square pad */}
          <silkscreenpath route={[{ x: -p / 2 - 0.45, y: r * 0.55 }, { x: -p / 2 + 0.45, y: r * 0.55 }]} />
          <silkscreenpath route={[{ x: -p / 2, y: r * 0.55 - 0.45 }, { x: -p / 2, y: r * 0.55 + 0.45 }]} />
          <courtyardcircle pcbX={0} pcbY={0} radius={big ? 5.25 : 2.79} />
        </footprint>
      }
    />
  )
}

export const Led5mm = (props: PartProps & { color: string }) => (
  <led
    {...props}
    footprint={
      <footprint>
        <platedhole portHints={["pin1", "anode"]} pcbX={-1.27} pcbY={0} holeDiameter={1.0} outerDiameter={1.6} shape="circle" />
        <platedhole portHints={["pin2", "cathode"]} pcbX={1.27} pcbY={0} holeDiameter={1.0} rectPadWidth={1.6} rectPadHeight={1.6} holeShape="circle" padShape="rect" holeOffsetX={0} holeOffsetY={0} shape="circular_hole_with_rect_pad" />
        {/* the rim, with its flat on the cathode side */}
        <silkscreenpath route={rimPath(2.9, 60, 300)} />
        <silkscreenpath route={[{ x: 1.45, y: 2.51 }, { x: 1.45, y: -2.51 }]} />
        <courtyardcircle pcbX={0} pcbY={0} radius={2.95} />
      </footprint>
    }
  />
)

/* ── axial resistors and diodes (lying flat), 0.8 mm holes ─────────────────
 * Same pads, pitch and courtyard as the stock "axial_pX" footprints, but
 * 0.8 mm holes (¼ W resistor legs are ≈ 0.6 mm; the stock 0.7 mm is tight),
 * and diodes show which end is which: the cathode (pin2, the banded end of
 * the real diode) gets the SQUARE pad and the bar of a ▶| symbol. */
const axialFootprint = (p: number, diode: boolean) => (
  <footprint>
    <platedhole portHints={diode ? ["pin1", "anode"] : ["pin1"]} pcbX={-p / 2} pcbY={0} holeDiameter={0.8} outerDiameter={1.4} shape="circle" />
    {diode ? (
      <platedhole portHints={["pin2", "cathode"]} pcbX={p / 2} pcbY={0} holeDiameter={0.8} rectPadWidth={1.4} rectPadHeight={1.4} holeShape="circle" padShape="rect" holeOffsetX={0} holeOffsetY={0} shape="circular_hole_with_rect_pad" />
    ) : (
      <platedhole portHints={["pin2"]} pcbX={p / 2} pcbY={0} holeDiameter={0.8} outerDiameter={1.4} shape="circle" />
    )}
    {diode ? (
      <>
        <silkscreenpath route={[{ x: -(p / 2 - 1.75), y: 0 }, { x: -0.7, y: 0 }]} />
        <silkscreenpath route={[{ x: 0.7, y: 0 }, { x: p / 2 - 1.75, y: 0 }]} />
        <silkscreenpath route={[{ x: -0.7, y: 0.8 }, { x: 0.7, y: 0 }, { x: -0.7, y: -0.8 }, { x: -0.7, y: 0.8 }]} />
        <silkscreenpath route={[{ x: 0.7, y: 0.8 }, { x: 0.7, y: -0.8 }]} />
      </>
    ) : (
      <silkscreenpath route={[{ x: -(p / 2 - 1.75), y: 0 }, { x: p / 2 - 1.75, y: 0 }]} />
    )}
    <courtyardrect pcbX={0} pcbY={0} width={p + 2.0} height={2.1} />
  </footprint>
)

export const Res = (props: PartProps & { resistance: string; pitch: 7.62 | 10.16 }) => {
  const { pitch, ...rest } = props
  return <resistor {...rest} resistance={props.resistance} footprint={axialFootprint(pitch, false)} />
}

export const AxialDiode = (props: PartProps & { pitch: 7.62 | 10.16 }) => {
  const { pitch, ...rest } = props
  return <diode {...rest} footprint={axialFootprint(pitch, true)} />
}

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
 *    WIGGLES WITH YOUR VOICE — the "modulated supply". It feeds ONLY the
 *    final amplifier.
 *  · Q3 is a common-base Colpitts oscillator on the steady 9V rail: L1 +
 *    CV1 + C14/C15 set the carrier frequency (TUNE: ~0.65-0.85 MHz).
 *  · Q4 is the modulated FINAL amplifier with a tuned output tank (L2 +
 *    CV2 "PEAK" + C18): its collector swing is bounded by VMD, so the
 *    output's AMPLITUDE FOLLOWS THE MODULATED SUPPLY — voice on VMD ⇒
 *    amplitude modulation — and the tank strips the harmonics a hard-
 *    driven stage makes. That is exactly how the big transmitters do
 *    "high-level AM".
 *
 *  PROVEN, NOT HOPED
 *  calc/spice/ holds standard SPICE decks of this board (run them in
 *  ngspice or LTspice), and calc/sim_am.mjs re-runs the checks with a
 *  bundled circuit simulator using vendor transistor models: start-up at
 *  every TUNE setting for BC547B and 2N3904 with coil Q 25-60, harmonics
 *  ≥ 27 dB below the carrier, modulation depth vs voice level.
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
  <board width="91.44mm" height="55.88mm" name="am-tx" {...FAB_RULES}>
    {/* ═══════════════════════ §1 POWER ENTRY ═════════════════════════════
        9V battery → slide switch → the V9 rail. C1 (100µF) is the bulk
        reservoir for audio peaks; C2 (100nF) is the fast local decoupler.
        LED1 + R1 give a ~3mA power light: (9V − 2V) / 2.2k ≈ 3mA. */}

    <Battery9V name="BT1" pcbX={-40.64} pcbY={-22.86} schX={-14} schY={-7} />
    <PowerSwitch name="SW1" pcbX={-30.48} pcbY={-22.86} schX={-10} schY={-7} />
    <ECap name="C1" capacitance="100uF" pitch={5} pcbX={-38.1} pcbY={-13.97} schX={-12} schY={-3} />
    <Cap name="C2" capacitance="100nF" pcbX={-29.21} pcbY={-13.97} schX={-9} schY={-3} />
    <Led5mm name="LED1" color="green" pcbX={-21.59} pcbY={-22.86} schX={-6} schY={-6} />
    <Res name="R1" resistance="2.2kohm" pitch={10.16} pcbX={-11.43} pcbY={-22.86} schX={-4} schY={-6} />

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
    <Res name="R2" resistance="2.2kohm" pitch={10.16} pcbX={-33.02} pcbY={21.59} schX={-14} schY={11} />
    <Cap name="C3" capacitance="1uF" pcbX={-25.4} pcbY={2.54} schX={-12} schY={9} />

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
    <Res name="R3" resistance="68kohm" pitch={10.16} pcbX={-12.7} pcbY={15.24} schX={-9} schY={12} />
    <Res name="R4" resistance="10kohm" pitch={10.16} pcbX={-15.24} pcbY={2.54} schX={-9} schY={6} />
    <Res name="R5" resistance="4.7kohm" pitch={10.16} pcbX={-25.4} pcbY={15.24} schX={-11.5} schY={9} />
    <Res name="R6" resistance="560ohm" pitch={10.16} pcbX={-10.16} pcbY={-4.45} schX={-7} schY={6} />
    <ECap name="C4" capacitance="100uF" pitch={5} pcbX={-19.05} pcbY={-13.97} schX={-5} schY={4} />

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
        VMD idles at ~4.7V. ONLY the final amplifier (§6) hangs on VMD: the
        final's output swing IS this rail, which is how the audio gets
        stamped onto the carrier. C19 (100nF) is VMD's RF ground — the
        output tank's coil returns its RF current through it — while still
        passing audio (the follower's ~25Ω output × 100nF ≈ 60kHz corner).
        Speak close to the mic: ~5mV of voice gives ~6% modulation, a shout
        ~25%; push harder and you overmodulate (the tutorial's experiment). */}

    <NpnTo92 name="Q2" pcbX={-1.27} pcbY={8.89} schX={-2} schY={9} />
    <Res name="R7" resistance="10kohm" pitch={10.16} pcbX={-8.89} pcbY={21.59} schX={-2} schY={12} />
    <Res name="R8" resistance="15kohm" pitch={10.16} pcbX={1.27} pcbY={15.24} schX={-2} schY={6} />
    <Cap name="C5" capacitance="1uF" pcbX={-5.08} pcbY={2.54} schX={-5} schY={12} />

    <trace from=".Q1 > .collector" to=".C5 > .pin1" name="AF_OUT" />
    <trace from=".C5 > .pin2" to=".Q2 > .base" />
    <trace from=".R7 > .pin1" to="net.V9" />
    <trace from=".R7 > .pin2" to=".Q2 > .base" />
    <trace from=".R8 > .pin1" to=".Q2 > .base" />
    <trace from=".R8 > .pin2" to="net.GND" />
    <trace from=".Q2 > .collector" to="net.V9" />
    <trace from=".Q2 > .emitter" to="net.VMD" />
    <Cap name="C19" capacitance="100nF" pcbX={29.21} pcbY={-19.05} schX={1} schY={6} />
    <trace from=".C19 > .pin1" to="net.VMD" />
    <trace from=".C19 > .pin2" to="net.GND" />

    {/* ═══════════════════════ §5 CARRIER OSCILLATOR (Q3) + TANK ══════════
        A common-base Colpitts — the workhorse oscillator of simple radios.
        It runs from the STEADY V9 rail, never from VMD: an oscillator on a
        rail that carries audio is frequency-modulated by it (simulation of
        that arrangement: ~±27kHz of carrier swing on loud speech — more
        than an AM receiver's ±7kHz passband) and the AM radio hears
        distortion. Clean AM = steady oscillator, modulated FINAL.
        · R10/R11 (56k/10k from V9) bias the base at ~1.36V; C6 (2.2nF)
          grounds it at RF. R12 sets the emitter current (~0.7mA).
        · The TANK: L1 hangs from the collector to V9 (the coil IS the DC
          feed — at DC it's a near-short, at RF it's high impedance), and
          the tank capacitance to ground is CV1 ∥ (C14 series C15).
              C14=C15=680pF in series = 340pF, plus CV1 10-280pF
              → ~350-630pF with L1=100µH → ~0.65 to 0.85 MHz
        · C14/C15 also form the feedback divider: the emitter sits at their
          midpoint, feeding a fraction of the collector swing back in phase.
          Simulated with real BC547B / 2N3904 models and coil Q from 25 to
          60 it starts at every TUNE setting. */}

    <NpnTo92 name="Q3" pcbX={12.7} pcbY={8.89} schX={5} schY={9} />
    <Res name="R10" resistance="56kohm" pitch={10.16} pcbX={5.08} pcbY={21.59} schX={5} schY={12} />
    <Res name="R11" resistance="10kohm" pitch={10.16} pcbX={13.97} pcbY={15.24} schX={5} schY={6} />
    <Res name="R12" resistance="1kohm" pitch={10.16} pcbX={8.89} pcbY={-4.45} schX={7} schY={6} />
    <Cap name="C6" capacitance="2.2nF" pcbX={15.24} pcbY={2.54} schX={7} schY={3.5} />
    <Cap name="C14" capacitance="680pF" pcbX={21.59} pcbY={2.54} schX={7.5} schY={10} />
    <Cap name="C15" capacitance="680pF" pcbX={19.05} pcbY={-4.45} schX={8.5} schY={6} />
    <inductor name="L1" inductance="100uH" footprint="radial_p5mm" pcbX={38.1} pcbY={-4.45} schX={9} schY={11} />
    <VarCap name="CV1" pcbX={33.02} pcbY={21.59} schX={9} schY={7} />

    <trace from=".R10 > .pin1" to="net.V9" />
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
    {/* the coil's other end is the steady supply (V9 is RF-grounded by C2) */}
    <trace from=".L1 > .pin2" to="net.V9" />
    <trace from=".CV1 > .ROTOR" to="net.GND" />

    {/* ═══════════════════════ §6 MODULATED FINAL (Q4) + OUTPUT TANK ══════
        The broadcast trick: a power amplifier whose SUPPLY is the
        modulated rail. C17 (100pF — light, so Q4 barely pulls the
        oscillator) couples the steady carrier into Q4's base; R14/R15 bias
        it from V9 and R16 sets ~1.7mA. Q4's collector load is a TUNED
        TANK — L2 from VMD with CV2 ("PEAK") + C18 to ground — so the
        collector swings symmetrically about VMD and its amplitude follows
        VMD: audio on VMD becomes amplitude modulation on the carrier.
        WHY A TANK, NOT A RESISTOR: an overdriven stage makes harmonics.
        With the earlier resistor load the antenna saw the 3rd harmonic only
        15-19 dB below the carrier; FCC §15.219(c) demands ≥ 20 dB outside
        510-1705 kHz. The tank filters them: simulated worst case across
        transistor, coil Q and TUNE setting is ≥ 27 dB down.
        PEAK: after setting TUNE, turn CV2 for the strongest signal on a
        nearby AM radio — that tunes the output tank onto your carrier. */}

    <NpnTo92 name="Q4" pcbX={25.4} pcbY={8.89} schX={11} schY={9} />
    <Res name="R14" resistance="27kohm" pitch={10.16} pcbX={17.78} pcbY={21.59} schX={11} schY={12} />
    <Res name="R15" resistance="10kohm" pitch={10.16} pcbX={5.08} pcbY={2.54} schX={11} schY={6} />
    <Res name="R16" resistance="1kohm" pitch={10.16} pcbX={25.4} pcbY={-13.97} schX={13} schY={6} />
    <Cap name="C17" capacitance="100pF" pcbX={27.94} pcbY={2.54} schX={9.5} schY={9} />
    <inductor name="L2" inductance="100uH" footprint="radial_p5mm" pcbX={38.1} pcbY={-19.05} schX={13} schY={12} />
    <Cap name="C18" capacitance="330pF" pcbX={22.86} pcbY={-19.05} schX={14.5} schY={11} />
    <VarCap name="CV2" pcbX={15.24} pcbY={-22.86} schX={15} schY={7} />

    <trace from=".C17 > .pin1" to="net.TANK" />
    <trace from=".C17 > .pin2" to=".Q4 > .base" />
    <trace from=".R14 > .pin1" to="net.V9" />
    <trace from=".R14 > .pin2" to=".Q4 > .base" />
    <trace from=".R15 > .pin1" to=".Q4 > .base" />
    <trace from=".R15 > .pin2" to="net.GND" />
    <trace from=".Q4 > .emitter" to=".R16 > .pin1" />
    <trace from=".R16 > .pin2" to="net.GND" />
    {/* the OUTPUT tank: L2 ∥ (CV2 + C18), coil fed from the modulated rail */}
    <trace from=".Q4 > .collector" to="net.RF_OUT" />
    <trace from=".L2 > .pin1" to="net.RF_OUT" />
    <trace from=".L2 > .pin2" to="net.VMD" />
    <trace from=".C18 > .pin1" to="net.RF_OUT" />
    <trace from=".C18 > .pin2" to="net.GND" />
    <trace from=".CV2 > .STATOR_A" to="net.RF_OUT" />
    <trace from=".CV2 > .ROTOR" to="net.GND" />

    {/* ═══════════════════════ §7 ANTENNA ═════════════════════════════════
        At ~0.75 MHz the wavelength is ~400m, so a 1-2m wire is an
        "electrically short" antenna: mostly a ~15-30pF capacitor to the
        world. C16 (47pF) feeds it from the output tank — light enough
        that the antenna barely detunes PEAK.
        FCC §15.219 (US, 510-1705 kHz, no licence): (a) DC input to the
        final ≤ 100mW — here VMD × I(Q4) ≈ 8mW; (b) antenna + feed + ground
        lead ≤ 3m — use 1-2m of wire; (c) emissions outside 510-1705 kHz
        ≥ 20 dB below the carrier — the output tank (§6). Other countries
        have different rules: check yours before you transmit. */}

    <Cap name="C16" capacitance="47pF" pcbX={35.56} pcbY={8.89} schX={14} schY={9} />
    <AntennaPad name="ANT1" pcbX={40.64} pcbY={8.89} schX={16} schY={9} />

    <trace from=".C16 > .pin1" to="net.RF_OUT" />
    <trace from=".C16 > .pin2" to=".ANT1 > .ANT" name="ANT" />

    {/* ═══════════════════════ §8 SILKSCREEN MANUAL ═══════════════════════
        The board labels itself: what each knob/pad does and the transistor
        orientation trick (BC547 flat face down / 2N3904 rotated 180°). */}

    <silkscreentext text="AM-TX" pcbX={0} pcbY={26} fontSize="1.6mm" />
    <silkscreentext text="MIC" pcbX={-36} pcbY={12.7} fontSize="1.2mm" />
    <silkscreentext text="TUNE" pcbX={33.02} pcbY={17.78} fontSize="1.2mm" />
    <silkscreentext text="PEAK" pcbX={15.24} pcbY={-18.8} fontSize="1.2mm" />
    <silkscreentext text="ANT WIRE" pcbX={40.64} pcbY={4.06} fontSize="1.2mm" />
    <silkscreentext text="+" pcbX={-43.18} pcbY={-19.05} fontSize="1.2mm" />
    <silkscreentext text="9V" pcbX={-40.64} pcbY={-19.05} fontSize="1.2mm" />
    <silkscreentext text="-" pcbX={-38.1} pcbY={-19.05} fontSize="1.2mm" />
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
