/**
 * ═════════════════════════════════════════════════════════════════════════
 *  FM RADIO LAB · FM RECEIVER — standalone playground
 * ═════════════════════════════════════════════════════════════════════════
 *  A single-file, zero-import version of receiver/index.tsx.
 *  Paste the whole file into https://snippets.tscircuit.com (or run
 *  `tsci dev` on it) to explore the board interactively.
 *
 *  The full project — with the tutorial PDF, proofs, and BOM — lives at:
 *  https://github.com/iamleson98/circuit  (fm-radio-lab/)
 */
import "@tscircuit/core"

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  lib/parts.tsx — custom radio parts with hand-crafted footprints
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  WHY CUSTOM PARTS?
 *  tscircuit's footprinter knows standard patterns (to92, radial, axial...),
 *  but radio projects use several *mechanical* parts whose land patterns
 *  vary between vendors: the 9V battery clip, the power switch, the volume
 *  pot, the electret microphone capsule, the VHF air-core coil, the tuning
 *  trimmer, the AUX input, and the antenna wire attachment point.
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
 *  Part (schematic symbol)    Pads   Pinout (silkscreen-marked)
 *  ──────────────────────────────────────────────────────────────
 *  Battery9V   (battery)       2     pin1 = +9V (red), pin2 = GND (black)
 *  PowerSwitch (spst switch)   2     pin1, pin2 (any polarity)
 *  VolumePot   (potentiometer) 3     pin1 = CCW, pin2 = WIPER, pin3 = CW
 *  AirCoil     (inductor)      2     pin1, pin2 — 3 turns on a 5mm form
 *  TrimmerCap  (box)           2     A, B — 5-30pF tuning trimmer
 *  ElectretMic (box)           2     MIC_P (pin1), MIC_N = case (pin2)
 *  AuxJack     (box)           2     TIP, SLE — phone/MP3 player input
 *  EarTerm     (box)           2     TIP, SLE — crystal/high-Z earphone
 *  AntennaPad  (box)           1     ANT — wire: TX ≤ 20cm, RX 30-75cm
 *  NpnTo92     (npn transistor)3     C/B/E on an in-line 0.1" TO-92 row
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
 * Standard 3-wire panel pot (with a knob!). Renders a real potentiometer
 * symbol: pin1 CCW, pin2 wiper, pin3 CW. */
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

/* ── VHF air-core tank coil — 3 turns on a 5mm form ──────────────────────
 * THE tuning element of both FM boards. Wind it yourself: 3 turns of
 * 0.6mm (≈AWG 22-24) enameled or bare copper wire on a 5mm form (M5
 * bolt, 5mm drill shank), then slide it off and GENTLY STRETCH it to
 * about 2.4mm length (a fingernail's gap between turns). Wheeler's
 * formula gives L ≈ 60nH — resonating with ~45pF of tank capacitance
 * (trimmer + transistor strays + feedback divider) at ~98 MHz, smack in
 * the FM broadcast band.
 *
 *   SQUEEZE the turns together  → L rises  → frequency falls
 *   SPREAD the turns apart      → L falls  → frequency rises
 * …which is exactly how you center the tuning range on the FM band
 * (the tutorial's Coil Physics experiment).
 *
 * Footprint: two wire holes 5.08mm apart + a coil-turns silkscreen motif. */
export const AirCoil = (props: PartProps) => (
  <inductor
    {...props}
    inductance="60nH"
    footprint={
      <footprint>
        <platedhole portHints={["pin1"]} pcbX={-2.54} pcbY={0} holeDiameter={1.2} outerDiameter={2.1} shape="circle" />
        <platedhole portHints={["pin2"]} pcbX={2.54} pcbY={0} holeDiameter={1.2} outerDiameter={2.1} shape="circle" />
        {/* three "turns" drawn as humps beside the holes (kept off the pads,
            where a fab would clip the ink) */}
        <silkscreenpath
          route={[
            { x: -4.5, y: 1.4 },
            { x: -3.9, y: 2.6 },
            { x: -2.1, y: 2.6 },
            { x: -1.5, y: 1.4 },
            { x: -0.9, y: 2.6 },
            { x: 0.9, y: 2.6 },
            { x: 1.5, y: 1.4 },
            { x: 2.1, y: 2.6 },
            { x: 3.9, y: 2.6 },
            { x: 4.5, y: 1.4 },
          ]}
        />
        <courtyardrect pcbX={0} pcbY={0} width={7.7} height={6.7} />
      </footprint>
    }
  />
)

/* ── tuning trimmer capacitor: 5-30pF ────────────────────────────────────
 * The TUNE knob. A small square plastic-dielectric trimmer (the green or
 * blue kind with a screw slot). 5-30pF is the classic FM-bug range:
 * directly across the tank it sweeps the FM band (on both boards the 12pF
 * padder C17 keeps the top end below the 108 MHz aviation band). Two lugs; either way round. (Many trimmers have a third lug that
 * is internally tied to the middle one — ignore it or solder it in
 * parallel with its neighbor, see tutorial · Troubleshooting.) */
export const TrimmerCap = (props: PartProps) => (
  <chip
    {...props}
    pinLabels={{ pin1: "A", pin2: "B" }}
    footprint={
      <footprint>
        <platedhole portHints={["A"]} pcbX={-2.54} pcbY={0} holeDiameter={1.2} outerDiameter={2.1} shape="circle" />
        <platedhole portHints={["B"]} pcbX={2.54} pcbY={0} holeDiameter={1.2} outerDiameter={2.1} shape="circle" />
        {/* the schematic symbol for a variable cap: two plates + arrow */}
        <silkscreenpath
          route={[
            { x: -3.6, y: -2.2 },
            { x: 3.6, y: -2.2 },
            { x: 3.6, y: 2.6 },
            { x: -3.6, y: 2.6 },
            { x: -3.6, y: -2.2 },
          ]}
        />
        <silkscreenpath route={[{ x: -4.4, y: 3.0 }, { x: 4.4, y: 3.0 }]} />
        <silkscreenpath
          route={[
            { x: 1.2, y: 4.0 },
            { x: 4.4, y: 3.0 },
            { x: 3.2, y: 1.6 },
          ]}
        />
        <courtyardrect pcbX={0} pcbY={0.2} width={7.2} height={4.8} />
      </footprint>
    }
    schPinArrangement={{
      leftSide: { direction: "top-to-bottom", pins: ["A"] },
      rightSide: { direction: "top-to-bottom", pins: ["B"] },
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

/* ── AUX input: phone / MP3 player / signal generator ────────────────────
 * Two wire terminals for a 3.5mm stereo jack's TIP and SLEEVE (bridge
 * left+right together at the jack, or use a mono cable). Feeding a known
 * tone in here turns the transmitter into a clean FM test signal source —
 * the tutorial's favorite debugging trick. */
export const AuxJack = (props: PartProps) => (
  <chip
    {...props}
    pinLabels={{ pin1: "TIP", pin2: "SLE" }}
    footprint={
      <footprint>
        <platedhole portHints={["TIP"]} pcbX={-2.54} pcbY={0} holeDiameter={1.6} outerDiameter={2.5} shape="circle" />
        <platedhole portHints={["SLE"]} pcbX={2.54} pcbY={0} holeDiameter={1.6} outerDiameter={2.5} shape="circle" />
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
      leftSide: { direction: "top-to-bottom", pins: ["TIP"] },
      rightSide: { direction: "top-to-bottom", pins: ["SLE"] },
    }}
  />
)

/* ── earphone terminals ──────────────────────────────────────────────────
 * A crystal or high-impedance magnetic earphone (the classic radio-lab
 * kind) connects here. 32Ω earbuds work too — just quieter (see
 * tutorial · Upgrades for adding an LM386 speaker stage). */
export const EarTerm = (props: PartProps) => (
  <chip
    {...props}
    pinLabels={{ pin1: "TIP", pin2: "SLE" }}
    footprint={
      <footprint>
        <platedhole portHints={["TIP"]} pcbX={-2.54} pcbY={0} holeDiameter={1.6} outerDiameter={2.5} shape="circle" />
        <platedhole portHints={["SLE"]} pcbX={2.54} pcbY={0} holeDiameter={1.6} outerDiameter={2.5} shape="circle" />
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
      leftSide: { direction: "top-to-bottom", pins: ["TIP"] },
      rightSide: { direction: "top-to-bottom", pins: ["SLE"] },
    }}
  />
)

/* ── antenna wire attachment point ───────────────────────────────────────
 * ONE pad + a "wire going up" silkscreen arrow. Solder insulated wire
 * here (that wire IS the antenna). At ~100 MHz the wavelength is ~3m, so
 * a 75cm wire is a quarter-wave monopole — resonant and efficient.
 *   FM-RX: 30-75cm. The RF buffer keeps the detector's bursts off it.
 *   FM-TX: 20cm MAXIMUM. Licence-free FM (FCC §15.239) allows only about
 *          −47 dBm EIRP; a longer wire radiates more (see transmitter §6). */
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

/* ── BC547/BC548 NPN transistor, in-line TO-92 ───────────────────────────
 * tscircuit's <transistor> draws a REAL NPN symbol in the schematic and
 * maps collector→pad1, base→pad2, emitter→pad3. We use the IN-LINE to92
 * footprint (3 holes in a row, 0.1" pitch):
 *
 *    BC547/BC548 (C-B-E): insert with the FLAT FACE toward the board edge
 *    2N2222A/2N3904 (E-B-C): insert rotated 180° (flat face the other way)
 *
 * Spreading TO-92 legs into a 0.1" row is the first skill every kit
 * builder learns — the tutorial shows it step by step. */
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
 *  FM RADIO LAB · FM RECEIVER ("FM-RX") — designed in tscircuit
 * ═════════════════════════════════════════════════════════════════════════
 *  Run with:   npm install -g tscircuit   →   tsci dev receiver/index.tsx
 *  (or paste the standalone copy in standalone/ into snippets.tscircuit.com)
 *
 *  WHAT THIS IS
 *  A four-transistor SUPER-REGENERATIVE receiver for the FM broadcast band
 *  (88-108 MHz) — the simplest receiver architecture with real sensitivity
 *  at these frequencies, and the classic first-VHF-radio design:
 *
 *    wire → RF buffer Q5 → ┌ detector Q1 ─┐→ 2-pole audio filter → volume
 *                          │ THE TX CORE  │       → audio amp Q4 → earphone
 *                          └ strangled by ┘
 *                          └ quench astable Q2+Q3 (~70 kHz)
 *
 *  THE RECEIVER IS THE TRANSMITTER
 *  Q1 is the same common-base Colpitts oscillator as the FM-TX — same
 *  coil, same trimmer, same 22p/47p feedback divider, same 15k/3.9k base
 *  divider. Open transmitter/index.tsx side by side and compare. The
 *  difference is WHO feeds the base. On the TX the divider sets a steady
 *  bias and the oscillator runs forever. Here, R10 (4.7k from the quench
 *  oscillator) and R11 (1k to ground) join the divider, and the quench
 *  oscillator GATES that bias ~70,000 times a second (simulated):
 *
 *    astable LOW  → V_B ≈ 0.39V → Q1 cut off; the burst dies out. DEAD.
 *    astable RAMP → V_B rises toward ≈1.07V — the loop gain crosses 1
 *                   and a burst IGNITES, seeded by whatever rides the
 *                   tank: thermal noise (the HISS) or a carrier
 *                   (QUIETING + audio). The burst grows in ~1µs — a µV
 *                   seed becomes a ~1-volt burst: gain in TIME, the
 *                   10⁴-10⁶ amplification of super-regeneration.
 *    (Q2's collector only reaches ~4.9V, not 9V, because R10/R11 load it
 *    — that is why the GROW level is 1.07V and not the 1.6V an unloaded
 *    astable would give. The detector still oscillates strongly there.)
 *    …then the astable drops again. Repeat. Ultrasonic — you hear none
 *    of it, only the audio it carries.
 *
 *  WHY AN RF BUFFER (Q5) AND A DAMPED TANK
 *  A super-regenerative detector is an oscillator, and it radiates. With
 *  the antenna wired straight onto the tank (the classic hobby circuit)
 *  this receiver simulated at about −13 dBm of re-radiated power — some
 *  38 dB above FCC §15.109's limit for receivers (150 µV/m at 3 m), and
 *  enough to jam other FM radios in the house. Q5, a common-base stage,
 *  passes the antenna's signal INTO the tank through C22 (1pF) but
 *  barely passes the tank's bursts back OUT; R22 (1k) caps the burst
 *  amplitude (0.7-1.4V in simulation, for 2N2222A or BC547B and coil Q
 *  50-150) so the 3-turn coil itself radiates less. Simulated: ≥ 7 dB
 *  under the limit even with a 75cm antenna, and weak-signal capture is
 *  as good or better.
 *
 *  WHY EXTERNAL QUENCH (the design lesson this board teaches)
 *  Armstrong's original super-regens self-quenched — the oscillator's own
 *  rectified grid current slowly strangled it. A BJT cannot copy that
 *  trick: its rectified base current pushes the base UP (anti-quenching —
 *  the grid-leak story inverts for transistors), and an emitter-side
 *  quench capacitor would short-circuit the Colpitts feedback divider
 *  (a nF cap is 0.2Ω at 98 MHz; the divider's 47pF leg is 345Ω). So the
 *  factory answer — used by every production super-regen since the 1940s
 *  — is a SEPARATE oscillator doing the strangling, deterministically,
 *  at a frequency you choose. Q2+Q3 are a textbook astable multivibrator
 *  (the unloaded formula T = 0.693·(R9·C8 + R8·C7) ≈ 20µs; the R10/R11
 *  load shortens it to ≈14µs, ~70 kHz — still ultrasonic). Q2's collector
 *  waveform — snap down, long low, exponential rise — is exactly the
 *  "smooth ramp, sharp drop" shape the super-regen literature prescribes.
 *
 *  THE FM TRICK — SLOPE DETECTION
 *  A super-regen is natively an AM detector. To hear FM, tune the TUNE
 *  trimmer slightly OFF the station: on the tank's response slope, the
 *  station's ±75kHz frequency wobble becomes an amplitude wobble, every
 *  burst's seed wobbles with it, and the burst envelope carries the
 *  audio. Tune a hair high or a hair low (both work — opposite polarity).
 *  THE SILENCE IS THE SIGNAL: sweep TUNE across a live carrier and the
 *  loud hiss collapses into the station — the carrier seeds every
 *  regrowth and there's nothing left to hiss about. That quieting
 *  "thump" is the sound of radio-wave capture.
 *
 *  PROVEN, NOT HOPED
 *  calc/spice/ holds standard SPICE decks of this board and calc/sim_fm.mjs
 *  re-runs the checks with a bundled circuit simulator and vendor
 *  transistor models: the astable starts from a cold power-up, the
 *  detector is killed and re-ignites once per quench cycle, an injected
 *  carrier advances the ignition (capture), and re-radiation stays under
 *  the §15.109 limit.
 *
 *  HOW TO READ THIS FILE
 *  One flat netlist organized like the schematic pages of a real radio:
 *  power → antenna+tank → detector → quench astable → audio → earphone.
 *  Every wire is an explicit <trace />.
 *
 *  ALL PARTS ARE THROUGH-HOLE on a 0.1" (2.54mm) grid.
 */

export default () => (
  <board width="99.06mm" height="88.9mm" name="fm-rx" {...FAB_RULES}>
    {/* ═══════════════════════ §1 POWER ENTRY ═════════════════════════════
        9V battery → slide switch → the V9 rail. C1 (47µF) bulk, C2 (100nF)
        fast decoupling, LED1 + R1 power light (~3mA). The astable and the
        detector both draw pulses from this rail — the local decouplers in
        §3/§4 keep those pulses local. */}

    <Battery9V name="BT1" pcbX={-40.64} pcbY={-38.1} schX={-16} schY={-8} />
    <PowerSwitch name="SW1" pcbX={-27.94} pcbY={-38.1} schX={-12} schY={-8} />
    <ECap name="C1" capacitance="47uF" pitch={5} pcbX={-40.64} pcbY={-27.94} schX={-15} schY={-4} />
    <Cap name="C2" capacitance="100nF" pcbX={-36.83} pcbY={-19.05} schX={-12} schY={-4} />
    <Led5mm name="LED1" color="green" pcbX={-44.45} pcbY={-19.05} schX={-8} schY={-8} />
    <Res name="R1" resistance="2.2kohm" pitch={10.16} pcbX={-40.64} pcbY={-12.7} schX={-6} schY={-8} />

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

    {/* ═══════════════════════ §2 ANTENNA + TANK ══════════════════════════
        30-75cm of wire feeds the RF buffer Q5 (§2b), which feeds the tank
        through C22 (1pF) — the antenna no longer touches the tank, so
        antenna length barely detunes it and the detector's bursts stay
        off the wire.
        The tank is THE MIRROR IMAGE of the transmitter's: the same 3-turn
        5mm-form air coil (≈60nH) resonates with the trimmer, strays, and
        the transistor's junction caps. TRIM1 (5-30pF directly across the
        tank) is YOUR TUNE KNOB — turn it and the receiver's window slides
        across the FM band hunting for the transmitter. C17 (12pF) is the
        padder, like the transmitter's C17: without it the trimmer tuned
        the detector up to 119-124 MHz — a third of the knob's travel in
        the aviation band (108-137 MHz), where a super-regen's bursts
        should never be — and BC547-built boards couldn't reach the bottom
        of the FM band. With it: ≈81-102 MHz (2N2222A) / 82-105 MHz
        (BC547B), even with short leads — the same window as the
        transmitter. C15/C16 give the coil's supply end a proper RF
        ground. */}

    <AntennaPad name="ANT1" pcbX={-44.45} pcbY={21.59} schX={-18} schY={10} />
    <Cap name="C3" capacitance="1nF" pcbX={-44.45} pcbY={12.7} schX={-16} schY={10} />
    <AirCoil name="L1" pcbX={-34.29} pcbY={12.7} schX={-14} schY={12} />
    <TrimmerCap name="TRIM1" pcbX={-34.29} pcbY={30.48} schX={-14} schY={15} />
    <Cap name="C15" capacitance="100nF" pcbX={-25.4} pcbY={19.05} schX={-16} schY={13} />
    <Cap name="C16" capacitance="1nF" pcbX={-19.05} pcbY={30.48} schX={-16} schY={11} />
    <Cap name="C17" capacitance="12pF" pcbX={-25.4} pcbY={30.48} schX={-12.5} schY={15} />

    <trace from=".ANT1 > .ANT" to=".C3 > .pin1" />
    <trace from=".C3 > .pin2" to="net.Q5E" />
    <trace from=".L1 > .pin1" to="net.TANK" />
    <trace from=".L1 > .pin2" to="net.V9" />
    <trace from=".TRIM1 > .A" to="net.TANK" />
    <trace from=".TRIM1 > .B" to="net.GND" />
    <trace from=".C17 > .pin1" to="net.TANK" />
    <trace from=".C17 > .pin2" to="net.GND" />
    <trace from=".C15 > .pin1" to="net.V9" />
    <trace from=".C15 > .pin2" to="net.GND" />
    <trace from=".C16 > .pin1" to="net.V9" />
    <trace from=".C16 > .pin2" to="net.GND" />
    {/* R22 loads the tank: bursts ~0.7-1.4V instead of ~9V (see header) */}
    <Res name="R22" resistance="1kohm" pitch={7.62} pcbX={-34.29} pcbY={22.86} schX={-12} schY={13} />
    <trace from=".R22 > .pin1" to="net.TANK" />
    <trace from=".R22 > .pin2" to="net.V9" />

    {/* ═══════════════════════ §2b RF BUFFER (Q5) ═════════════════════════
        A common-base amplifier: the antenna drives Q5's emitter (C3, low
        impedance), the base is RF-grounded by C21, and the collector
        (R21 load) drives the tank through C22 (1pF). Signal flows antenna →
        tank; the tank's bursts flow back only through Q5's tiny internal
        collector-emitter capacitance — ~60 dB of isolation in simulation.
        R19/R20 bias the base at ~1.6V → ~0.9mA through R18. */}

    <NpnTo92 name="Q5" pcbX={-43.18} pcbY={1.27} schX={-15} schY={6} />
    <Res name="R18" resistance="1kohm" pitch={10.16} pcbX={-35.56} pcbY={-3.81} pcbRotation={90} schX={-15} schY={3} />
    <Res name="R19" resistance="47kohm" pitch={10.16} pcbX={-33.02} pcbY={-3.81} pcbRotation={90} schX={-17} schY={4} />
    <Res name="R20" resistance="10kohm" pitch={10.16} pcbX={-30.48} pcbY={-3.81} pcbRotation={90} schX={-17} schY={2} />
    <Res name="R21" resistance="1kohm" pitch={10.16} pcbX={-38.1} pcbY={-3.81} pcbRotation={90} schX={-13} schY={4} />
    <Cap name="C21" capacitance="1nF" pcbX={-44.45} pcbY={-5.08} schX={-18} schY={6} />
    <Cap name="C22" capacitance="1pF" pcbX={-38.1} pcbY={6.35} schX={-13} schY={8} />

    <trace from=".Q5 > .emitter" to="net.Q5E" />
    <trace from=".R18 > .pin1" to="net.Q5E" />
    <trace from=".R18 > .pin2" to="net.GND" />
    <trace from=".Q5 > .base" to="net.Q5B" />
    <trace from=".R19 > .pin1" to="net.V9" />
    <trace from=".R19 > .pin2" to="net.Q5B" />
    <trace from=".R20 > .pin1" to="net.Q5B" />
    <trace from=".R20 > .pin2" to="net.GND" />
    <trace from=".C21 > .pin1" to="net.Q5B" />
    <trace from=".C21 > .pin2" to="net.GND" />
    <trace from=".Q5 > .collector" to="net.Q5C" />
    <trace from=".R21 > .pin1" to="net.V9" />
    <trace from=".R21 > .pin2" to="net.Q5C" />
    <trace from=".C22 > .pin1" to="net.Q5C" />
    <trace from=".C22 > .pin2" to="net.TANK" />

    {/* ═══════════════════════ §3 SUPER-REGENERATIVE DETECTOR (Q1) ════════
        The star of the show — the transmitter's oscillator core:
        · R2 (15k) / R3 (3.9k): the SAME bias divider as the TX.
        · C4 (220pF): the base's RF ground — small enough (≈10kΩ at the
          ~70kHz quench rate) that it does NOT shunt the quench feed.
        · R4 (470Ω) sets the emitter current ~2mA; C5 (47pF) grounds the
          emitter at RF; C6 (22pF) feeds a slice of the tank swing back —
          the same 22p/47p feedback divider as the TX. Compare §5 of
          transmitter/index.tsx!
        · With R10/R11 (§4) joining the base, V_B toggles between ≈0.39V
          (dead) and ≈1.07V (oscillating) as the astable swings.
        · The detected audio rides Q1's emitter (the rectified burst
          envelope) — §5 listens there. */}

    <NpnTo92 name="Q1" pcbX={-12.7} pcbY={12.7} schX={-9} schY={10} />
    <Res name="R2" resistance="15kohm" pitch={10.16} pcbX={-19.05} pcbY={38.1} schX={-9} schY={13} />
    <Res name="R3" resistance="3.9kohm" pitch={10.16} pcbX={-22.86} pcbY={5.08} schX={-10.5} schY={7} />
    <Cap name="C4" capacitance="220pF" pcbX={-12.7} pcbY={2.54} schX={-13} schY={7} />
    <Res name="R4" resistance="470ohm" pitch={10.16} pcbX={-22.86} pcbY={-5.08} schX={-7} schY={7} />
    <Cap name="C5" capacitance="47pF" pcbX={-12.7} pcbY={-5.08} schX={-5} schY={7} />
    <Cap name="C6" capacitance="22pF" pcbX={-5.08} pcbY={-5.08} schX={-11} schY={12} />

    <trace from=".R2 > .pin1" to="net.V9" />
    <trace from=".R2 > .pin2" to="net.OSCB" />
    <trace from=".Q1 > .base" to="net.OSCB" />
    <trace from=".R3 > .pin1" to="net.OSCB" />
    <trace from=".R3 > .pin2" to="net.GND" />
    <trace from=".C4 > .pin1" to="net.OSCB" />
    <trace from=".C4 > .pin2" to="net.GND" />
    <trace from=".Q1 > .collector" to="net.TANK" />
    <trace from=".Q1 > .emitter" to="net.RFE" />
    <trace from=".R4 > .pin1" to="net.RFE" />
    <trace from=".R4 > .pin2" to="net.GND" />
    <trace from=".C5 > .pin1" to="net.RFE" />
    <trace from=".C5 > .pin2" to="net.GND" />
    <trace from=".C6 > .pin1" to="net.TANK" />
    <trace from=".C6 > .pin2" to="net.RFE" />

    {/* ═══════════════════════ §4 THE QUENCH ASTABLE (Q2, Q3) ═════════════
        The strangler — a textbook two-transistor astable multivibrator:
          · unloaded textbook timing: 0.693·R9·C8 ≈ 12.5µs (kill) +
            0.693·R8·C7 ≈ 7.6µs (rise) → 20µs. R10/R11 load Q2's
            collector (it tops out at ~4.9V), so the real cycle is ≈14µs:
            f_quench ≈ 70kHz (simulated) — ultrasonic either way
          · Q2's collector rises with τ ≈ R5·C7 — the smooth ramp
        Its output (Q2's collector) feeds Q1's base through R10 (4.7k);
        R11 (1k, base to ground) completes the divider so V_B toggles
        ≈0.39V ↔ 1.07V. The astable starts by itself on power-up
        (simulated from a cold start, fresh and worn battery).
        The tutorial's Super-Regen chapter walks the whole cycle on a
        simulation plot — burst, collapse, quiet, ramp, ignition. */}

    <NpnTo92 name="Q2" pcbX={-15.24} pcbY={-20.32} schX={3} schY={1} />
    <NpnTo92 name="Q3" pcbX={-1.27} pcbY={-20.32} schX={9} schY={1} />
    <Res name="R5" resistance="4.7kohm" pitch={10.16} pcbX={-15.24} pcbY={-33.02} schX={2} schY={4} />
    <Res name="R6" resistance="4.7kohm" pitch={10.16} pcbX={-1.27} pcbY={-33.02} schX={10} schY={4} />
    <Cap name="C7" capacitance="1nF" pcbX={-6.35} pcbY={-26.67} schX={6.5} schY={4} />
    <Cap name="C8" capacitance="1nF" pcbX={-8.89} pcbY={-12.7} schX={5.5} schY={-1} />
    <Res name="R9" resistance="18kohm" pitch={10.16} pcbX={-19.05} pcbY={-13.97} schX={3} schY={-2} />
    <Res name="R8" resistance="11kohm" pitch={10.16} pcbX={1.27} pcbY={-11.43} schX={9} schY={-2} />
    <Res name="R10" resistance="4.7kohm" pitch={10.16} pcbX={-24.13} pcbY={-27.94} schX={0} schY={4} />
    <Res name="R11" resistance="1kohm" pitch={10.16} pcbX={-26.67} pcbY={-21.59} schX={-3} schY={4} />

    <trace from=".R5 > .pin1" to="net.V9" />
    <trace from=".R5 > .pin2" to="net.Q2C" />
    <trace from=".Q2 > .collector" to="net.Q2C" />
    <trace from=".R6 > .pin1" to="net.V9" />
    <trace from=".R6 > .pin2" to="net.Q3C" />
    <trace from=".Q3 > .collector" to="net.Q3C" />
    <trace from=".C7 > .pin1" to="net.Q2C" />
    <trace from=".C7 > .pin2" to="net.Q3B" />
    <trace from=".Q3 > .base" to="net.Q3B" />
    <trace from=".R8 > .pin1" to="net.V9" />
    <trace from=".R8 > .pin2" to="net.Q3B" />
    <trace from=".C8 > .pin1" to="net.Q3C" />
    <trace from=".C8 > .pin2" to="net.Q2B" />
    <trace from=".Q2 > .base" to="net.Q2B" />
    <trace from=".R9 > .pin1" to="net.V9" />
    <trace from=".R9 > .pin2" to="net.Q2B" />
    <trace from=".Q2 > .emitter" to="net.GND" />
    <trace from=".Q3 > .emitter" to="net.GND" />
    <trace from=".R10 > .pin1" to="net.Q2C" />
    <trace from=".R10 > .pin2" to="net.OSCB" />
    <trace from=".R11 > .pin1" to="net.OSCB" />
    <trace from=".R11 > .pin2" to="net.GND" />

    {/* ═══════════════════════ §5 AUDIO: FILTER → VOLUME → AMP ════════════
        Q1's emitter carries the recovered audio (the rectified burst
        envelope) — buried under ~70kHz quench residue. R12+C9 and R13+C10
        (two RC poles at 3.4kHz; loaded by each other and the volume pot,
        −3dB at ≈2.2kHz) knock the quench down ≈47dB while speech-band
        audio passes (−3dB at 2.4kHz), into the volume pot. The wiper feeds Q4, a
        class-A common-emitter amp: R16 (120Ω) stays unbypassed for
        linearity, R23 (470Ω) is bypassed by C23, so the gain is
        ≈ R17/(R16 + r_e) ≈ 24× (the damped detector's bursts are smaller,
        so its audio is ~12 dB lower than an undamped one) and the bias
        stays at ~1.3mA. Q4's 3.3k collector can't drive a 32Ω earbud by
        itself (that load would cut the stage's gain to ~0.2×), so Q6, an
        emitter follower biased at ~2.7mA by R24, drives the earphone through
        C12 from a ~25Ω source: ≈ 14× from Q4's base into 32Ω earbuds, and
        the full ~24× into a high-impedance or crystal earphone. For 32Ω
        earbuds this is comfortable; a crystal earphone is louder. For a
        SPEAKER, add the LM386 stage from the AM radio-lab receiver —
        the tutorial's Upgrades page shows the wiring. */}

    <Res name="R12" resistance="4.7kohm" pitch={10.16} pcbX={5.08} pcbY={12.7} schX={14} schY={8} />
    <Cap name="C9" capacitance="10nF" pcbX={15.24} pcbY={6.35} schX={14} schY={5} />
    <Res name="R13" resistance="4.7kohm" pitch={10.16} pcbX={20.32} pcbY={12.7} schX={16} schY={8} />
    <Cap name="C10" capacitance="10nF" pcbX={22.86} pcbY={6.35} schX={16} schY={5} />
    <VolumePot name="RV1" pcbX={31.75} pcbY={12.7} schX={18} schY={8} />
    <Cap name="C11" capacitance="100nF" pcbX={24.13} pcbY={24.13} schX={19} schY={11} />
    <NpnTo92 name="Q4" pcbX={33.02} pcbY={25.4} schX={21} schY={8} />
    <Res name="R14" resistance="220kohm" pitch={10.16} pcbX={22.86} pcbY={40.64} schX={22} schY={11} />
    <Res name="R15" resistance="47kohm" pitch={10.16} pcbX={36.83} pcbY={40.64} schX={23} schY={5} />
    <Res name="R16" resistance="120ohm" pitch={10.16} pcbX={42.545} pcbY={12.7} schX={23} schY={8} />
    <Res name="R23" resistance="470ohm" pitch={10.16} pcbX={40.64} pcbY={-6.35} schX={24} schY={6} />
    <ECap name="C23" capacitance="47uF" pitch={2.54} pcbX={40.64} pcbY={-13.97} schX={25.5} schY={6} />
    <Res name="R17" resistance="3.3kohm" pitch={10.16} pcbX={35.56} pcbY={34.29} schX={19} schY={11} />
    <ECap name="C12" capacitance="47uF" pitch={5} pcbX={43.18} pcbY={20.32} schX={25} schY={8} />
    <NpnTo92 name="Q6" pcbX={33.02} pcbY={-22.86} schX={23.5} schY={10} />
    <Res name="R24" resistance="1.5kohm" pitch={10.16} pcbX={33.02} pcbY={-30.48} schX={24.5} schY={12} />

    <trace from=".R12 > .pin1" to="net.RFE" />
    <trace from=".R12 > .pin2" to="net.AF1" />
    <trace from=".C9 > .pin1" to="net.AF1" />
    <trace from=".C9 > .pin2" to="net.GND" />
    <trace from=".R13 > .pin1" to="net.AF1" />
    <trace from=".R13 > .pin2" to="net.AF2" />
    <trace from=".C10 > .pin1" to="net.AF2" />
    <trace from=".C10 > .pin2" to="net.GND" />
    <trace from=".RV1 > .pin1" to="net.AF2" />
    <trace from=".RV1 > .pin3" to="net.GND" />
    <trace from=".RV1 > .pin2" to=".C11 > .pin1" />
    <trace from=".C11 > .pin2" to="net.Q4B" />
    <trace from=".Q4 > .base" to="net.Q4B" />
    <trace from=".R14 > .pin1" to="net.V9" />
    <trace from=".R14 > .pin2" to="net.Q4B" />
    <trace from=".R15 > .pin1" to="net.Q4B" />
    <trace from=".R15 > .pin2" to="net.GND" />
    <trace from=".Q4 > .emitter" to=".R16 > .pin1" />
    <trace from=".R16 > .pin2" to="net.Q4E2" />
    <trace from=".R23 > .pin1" to="net.Q4E2" />
    <trace from=".R23 > .pin2" to="net.GND" />
    <trace from=".C23 > .pin1" to="net.Q4E2" />
    <trace from=".C23 > .pin2" to="net.GND" />
    <trace from=".R17 > .pin1" to="net.V9" />
    <trace from=".R17 > .pin2" to="net.Q4C" />
    <trace from=".Q4 > .collector" to="net.Q4C" />
    <trace from=".Q6 > .base" to="net.Q4C" />
    <trace from=".Q6 > .collector" to="net.V9" />
    <trace from=".Q6 > .emitter" to="net.AOUT" />
    <trace from=".R24 > .pin1" to="net.AOUT" />
    <trace from=".R24 > .pin2" to="net.GND" />
    <trace from=".C12 > .pin1" to="net.AOUT" />
    <trace from=".C12 > .pin2" to="net.EAR" />

    {/* ═══════════════════════ §6 EARPHONE ════════════════════════════════
        Ordinary 32Ω earbuds work (the Q6 follower drives them); a crystal
        or high-impedance earphone is louder still. The recovered audio at
        the wiper is mV-scale — real radio, not hi-fi. Turn the volume down
        while tuning: the super-regen hiss between stations is LOUD. */}

    <EarTerm name="EAR1" pcbX={43.18} pcbY={3.81} schX={26} schY={8} />

    <trace from=".EAR1 > .TIP" to="net.EAR" />
    <trace from=".EAR1 > .SLE" to="net.GND" />

    {/* ═══════════════════════ §7 SILKSCREEN MANUAL ═══════════════════════ */}

    <silkscreentext text="FM-RX  SUPER-REGEN" pcbX={2} pcbY={42.5} fontSize="1.6mm" />
    <silkscreentext text="TUNE" pcbX={-34.29} pcbY={36.5} fontSize="1.2mm" />
    <silkscreentext text="L1: 3T ON 5MM FORM" pcbX={-34.29} pcbY={17.1} fontSize="1.0mm" />
    <silkscreentext text="ANT 30-75CM" pcbX={-44.45} pcbY={17.9} fontSize="1.0mm" />
    <silkscreentext text="VOL" pcbX={30.48} pcbY={17.5} fontSize="1.2mm" />
    <silkscreentext text="EAR" pcbX={43.18} pcbY={0.6} fontSize="1.2mm" />
    <silkscreentext text="+" pcbX={-43.18} pcbY={-33.5} fontSize="1.2mm" />
    <silkscreentext text="9V" pcbX={-40.64} pcbY={-33.5} fontSize="1.2mm" />
    <silkscreentext text="-" pcbX={-38.1} pcbY={-33.5} fontSize="1.2mm" />
    <silkscreentext text="ON" pcbX={-27.94} pcbY={-33.5} fontSize="1.2mm" />
    <silkscreentext text="Q1 RF: BC548/BC547 FLAT DOWN" pcbX={-12.7} pcbY={17} fontSize="1.1mm" />
    <silkscreentext text="2N2222A: ROTATE 180" pcbX={-12.7} pcbY={15} fontSize="1.1mm" />
    <silkscreentext text="QUENCH ASTABLE ~70KHZ" pcbX={-11} pcbY={-36.5} fontSize="1.1mm" />
    <silkscreentext text="RF BUFFER" pcbX={-43.18} pcbY={4.8} fontSize="1.0mm" />

    {/* ═══════════════════════ §8 GROUND POUR ═════════════════════════════
        Solid GND, bottom layer, thermal reliefs — same VHF practice as
        the transmitter. */}

    <copperpour
      connectsTo="net.GND"
      layer="bottom"
      padMargin="0.45mm"
      useThermalReliefs
    />
  </board>
)
