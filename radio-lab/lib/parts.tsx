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
import "@tscircuit/core"
import type { CommonLayoutProps } from "@tscircuit/props"

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

export interface PartProps extends CommonLayoutProps {
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
