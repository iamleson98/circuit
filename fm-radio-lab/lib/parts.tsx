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
 *  AirCoil     (inductor)      2     pin1, pin2 — 4 turns on a 5mm form
 *  TrimmerCap  (box)           2     A, B — 5-30pF tuning trimmer
 *  ElectretMic (box)           2     MIC_P (pin1), MIC_N = case (pin2)
 *  AuxJack     (box)           2     TIP, SLE — phone/MP3 player input
 *  EarTerm     (box)           2     TIP, SLE — crystal/high-Z earphone
 *  AntennaPad  (box)           1     ANT — solder 30-75cm of wire
 *  NpnTo92     (npn transistor)3     C/B/E on an in-line 0.1" TO-92 row
 *
 *  Note: Switch / Battery / Potentiometer are imported as explicit class
 *  components because JSX's lowercase <switch> collides with the SVG
 *  <switch> element type.
 */
import "@tscircuit/core"
import type { CommonLayoutProps } from "@tscircuit/props"

export interface PartProps extends CommonLayoutProps {
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
        {/* four "turns" drawn as stacked silkscreen humps */}
        <silkscreenpath
          route={[
            { x: -4.6, y: 0 },
            { x: -4.0, y: 1.4 },
            { x: -3.2, y: 1.4 },
            { x: -2.6, y: 0 },
            { x: -2.0, y: 1.4 },
            { x: -1.2, y: 1.4 },
            { x: -0.6, y: 0 },
            { x: 0.0, y: 1.4 },
            { x: 0.8, y: 1.4 },
            { x: 1.4, y: 0 },
            { x: 2.0, y: 1.4 },
            { x: 2.8, y: 1.4 },
            { x: 3.4, y: 0 },
          ]}
        />
        <silkscreenpath
          route={[
            { x: -4.6, y: 0 },
            { x: 4.6, y: 0 },
          ]}
        />
      </footprint>
    }
  />
)

/* ── tuning trimmer capacitor: 5-30pF ────────────────────────────────────
 * The TUNE knob. A small square plastic-dielectric trimmer (the green or
 * blue kind with a screw slot). 5-30pF is the classic FM-bug range: in
 * series with the 12pF padder it shifts the tank smoothly across the FM
 * band. Two lugs; either way round. (Many trimmers have a third lug that
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
      leftSide: { direction: "top-to-bottom", pins: ["TIP"] },
      rightSide: { direction: "top-to-bottom", pins: ["SLE"] },
    }}
  />
)

/* ── antenna wire attachment point ───────────────────────────────────────
 * ONE pad + a "wire going up" silkscreen arrow. Solder 30-75cm of
 * insulated wire (that wire IS the antenna). At ~100 MHz the wavelength
 * is ~3m, so a 75cm wire is a proper quarter-wave monopole — resonant,
 * efficient, and the length the tutorial's antenna experiments use. */
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
export const NpnTo92 = (props: PartProps) => (
  <transistor
    {...props}
    type="npn"
    footprint="to92_inline_p2.54mm"
  />
)
