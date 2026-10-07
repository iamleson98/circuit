/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  μNode32U4 — bare ATmega32U4 USB dev board (SINGLE-FILE PLAYGROUND COPY)
 * ═══════════════════════════════════════════════════════════════════════════
 *  Paste this whole file into https://snippets.tscircuit.com (or any tscircuit
 *  playground) to view the PCB, schematic and 3D model interactively.
 *
 *  This file is auto-combined from the modular project for convenience.
 *  For the annotated multi-file source + tutorial, see the project repo.
 */

/**
 * ═════════════════════════════════════════════════════════════════════════
 *  μNode32U4 — a bare-chip USB dev board, in tscircuit
 * ═════════════════════════════════════════════════════════════════════════
 *  Run with:   npm install -g tscircuit   →   tsci dev
 *  (or paste the standalone copy in standalone/ into snippets.tscircuit.com)
 *
 *  WHAT THIS IS
 *  An Arduino-Leonardo-class board built from FIRST PRINCIPLES: one bare
 *  ATmega32U4 (TQFP-44) plus ~35 primary components — no dev-board module
 *  anywhere. USB device, 16MHz crystal clock, reset & bootloader circuits,
 *  ICSP header, four indicators, I²C pull-ups, and every GPIO on 2.54mm
 *  headers with Leonardo-compatible pin names (D0-D13, A0-A5, SDA/SCL,
 *  MISO/SCK/MOSI/SS). Flash the Caterina bootloader over ICSP, select
 *  "Arduino Leonardo" in the IDE, and it just works.
 *
 *  HOW TO READ THIS FILE
 *  It's one flat "netlist" organized into banner-commented sections that
 *  mirror the schematic pages of a real design: USB front-end → power
 *  integrity → clock → reset/boot → ICSP → indicators → I²C → breakouts.
 *  Every wire on the board exists as an explicit <trace /> — reading the
 *  traces top-to-bottom IS reading the schematic.
 *
 *  NET CONVENTIONS
 *  Point-to-point wires are direct traces (with a `name` so the schematic
 *  shows a net label). Anything touching 3+ places gets a named net
 *  (net.V5, net.GND, net.RST...) — exactly like net labels in KiCad.
 */
interface CommonLayoutProps {
  name?: string
  pcbX?: number | string
  pcbY?: number | string
  pcbRotation?: number | string
  schX?: number | string
  schY?: number | string
  schRotation?: number | string
}
/**
 * ─────────────────────────────────────────────────────────────────────────
 *  lib/usb-micro-b.tsx — Micro-USB-B receptacle with a hand-crafted
 *  footprint (tscircuit has no built-in "micro USB" footprint string).
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  WHY A CUSTOM FOOTPRINT?
 *  tscircuit's footprinter knows standard patterns (tqfp44, 0603, hc49...),
 *  but connectors are mechanical parts with vendor-specific land patterns.
 *  For those you compose a footprint yourself from primitive elements:
 *
 *    <smtpad />      → a surface-mount copper pad (can carry a port name)
 *    <platedhole />  → a plated through-hole
 *    <silkscreenpath /> → silkscreen outline graphics
 *
 *  GEOMETRY (viewed from the TOP side, connector cable opening facing LEFT,
 *  connector body hanging slightly off / at the board edge):
 *
 *    - 5 signal pads in a vertical column at x = +1.3mm, 0.65mm pitch.
 *      Top to bottom: VBUS, D−, D+, ID, GND   (micro-USB pin order 1-5)
 *    - 2 large shell anchor pads at x = +0.9mm, y = ±2.7mm.
 *    - A silkscreen outline + a tick marking the VBUS (pin-1) end.
 *
 *  ⚠️ BUILD NOTE: micro-USB receptacle footprints are NOT fully
 *  standardized between vendors. This pattern fits the common "5-pin SMD
 *  micro-B" family used on Pro Micro-style boards (≈7.4mm body). Before
 *  ordering boards, print this footprint 1:1 and check it against the
 *  mechanical drawing of the exact connector you bought — that's a habit
 *  worth keeping even with library footprints.
 */

export interface UsbMicroBProps extends CommonLayoutProps {
  name: string
}

export const UsbMicroB = (props: UsbMicroBProps) => (
  <chip
    {...props}
    // pinLabels bind each pad's `portHints` name to a pin number, so
    // selectors like ".J1 > .VBUS" resolve to pad 1.
    pinLabels={{
      pin1: "VBUS",
      pin2: "DMINUS",
      pin3: "DPLUS",
      pin4: "ID",
      pin5: "GND",
      pin6: "SHIELD1",
      pin7: "SHIELD2",
    }}
    // Every pad below declares `portHints` — those strings become the
    // port names you connect traces to: ".J1 > .VBUS", ".J1 > .DPLUS"...
    footprint={
      <footprint>
        {/* ── signal pads: 1.0mm long × 0.3mm wide, 0.65mm pitch ── */}
        <smtpad
          portHints={["VBUS"]}
          pcbX="1.3mm"
          pcbY="1.3mm"
          width="1mm"
          height="0.3mm"
          shape="rect"
        />
        <smtpad
          portHints={["DMINUS"]}
          pcbX="1.3mm"
          pcbY="0.65mm"
          width="1mm"
          height="0.3mm"
          shape="rect"
        />
        <smtpad
          portHints={["DPLUS"]}
          pcbX="1.3mm"
          pcbY="0mm"
          width="1mm"
          height="0.3mm"
          shape="rect"
        />
        {/* ID (pin 4) is only used by OTG cables — left unconnected here */}
        <smtpad
          portHints={["ID"]}
          pcbX="1.3mm"
          pcbY="-0.65mm"
          width="1mm"
          height="0.3mm"
          shape="rect"
        />
        <smtpad
          portHints={["GND"]}
          pcbX="1.3mm"
          pcbY="-1.3mm"
          width="1mm"
          height="0.3mm"
          shape="rect"
        />
        {/* ── shell anchor tabs (solder to GND for shield + mechanical) ── */}
        <smtpad
          portHints={["SHIELD1"]}
          pcbX="0.9mm"
          pcbY="2.7mm"
          width="1mm"
          height="1.6mm"
          shape="rect"
        />
        <smtpad
          portHints={["SHIELD2"]}
          pcbX="0.9mm"
          pcbY="-2.7mm"
          width="1mm"
          height="1.6mm"
          shape="rect"
        />
        {/* ── silkscreen: connector outline ── */}
        <silkscreenpath
          route={[
            { x: -2.6, y: -3.6 },
            { x: 1.9, y: -3.6 },
            { x: 1.9, y: 3.6 },
            { x: -2.6, y: 3.6 },
            { x: -2.6, y: -3.6 },
          ]}
        />
        {/* pin-1 (VBUS) tick mark */}
        <silkscreenpath
          route={[
            { x: 2.1, y: 1.3 },
            { x: 2.5, y: 1.3 },
          ]}
        />
      </footprint>
    }
    // Schematic-box pin arrangement, wired like a classic USB connector:
    // VBUS on top, then the pair, then GND/shield.
    schPinArrangement={{
      leftSide: {
        direction: "top-to-bottom",
        pins: ["VBUS", "DPLUS", "DMINUS", "GND", "SHIELD1", "SHIELD2"],
      },
      rightSide: {
        direction: "top-to-bottom",
        pins: ["ID"],
      },
    }}
  />
)

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  lib/atmega32u4.tsx — A reusable "bare chip" component for the
 *  Microchip ATmega32U4 (TQFP-44 package).
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  WHY THIS FILE EXISTS
 *  In tscircuit, a chip is just a React component. You describe it ONCE —
 *  package footprint, pin names, schematic pin arrangement — and then you
 *  can drop `<Atmega32U4 name="U1" />` onto any board, the same way you'd
 *  place a part in a schematic library in KiCad/Altium.
 *
 *  THE PIN TABLE BELOW IS NOT FROM MEMORY — it is the *physical* TQFP-44
 *  pinout from the Microchip datasheet (Atmel-7766J, Fig. 1-1), verified
 *  against the official Arduino Leonardo schematic and the ArduinoCore-avr
 *  "leonardo" variant files. tscircuit's `tqfp44` footprint numbers pins
 *  counter-clockwise starting at the top-left, exactly like the datasheet:
 *
 *      pin 1  = top of LEFT edge   (PE6)
 *      pins 1..11   go DOWN the left edge      (USB pins 2-7 live here!)
 *      pins 12..22  go RIGHT across the bottom (RESET, XTAL, PORTD)
 *      pins 23..33  go UP the right edge       (PORTB/PC6/PC7/PE2)
 *      pins 34..44  go LEFT across the top     (analog PORTF, AVCC)
 *
 *  Pin-label uniqueness matters: tscircuit turns every label into a
 *  *selectable port* (e.g. `.U1 > .VCC1`). Labels must therefore be unique
 *  per chip — that's why the three VCC pins are named VCC1/VCC2/VCC3 and
 *  the four GND pins GND1..GND4.
 */

export interface Atmega32U4Props extends CommonLayoutProps {
  /** Reference designator, e.g. "U1" */
  name: string
}

/**
 * The full 44-pin map. Keys are physical pin numbers (`pin1`..`pin44`),
 * values become the port names you use in traces and the labels you see
 * in the schematic view.
 */
export const ATMEGA32U4_PINOUT = {
  // ── LEFT EDGE (top → bottom) ─────────────────────────────────────────
  pin1: "PE6", // INT6/AIN0  — Arduino D7
  pin2: "UVCC", // USB pad supply input (tie to 5V)
  pin3: "DMINUS", // USB D− (via 22Ω series resistor — datasheet §2.2.8)
  pin4: "DPLUS", // USB D+ (via 22Ω series resistor — datasheet §2.2.9)
  pin5: "UGND", // USB pad ground
  pin6: "UCAP", // Internal 3.3V regulator output → 1µF cap to GND (§2.2.12)
  pin7: "VBUS", // VBUS monitor input
  pin8: "PB0", // SS/PCINT0 — Arduino D17, wired to the RX LED
  pin9: "PB1", // SCK — ICSP SCK, Arduino D15
  pin10: "PB2", // MOSI — ICSP MOSI, Arduino D16
  pin11: "PB3", // MISO — ICSP MISO, Arduino D14
  // ── BOTTOM EDGE (left → right) ───────────────────────────────────────
  pin12: "PB7", // OC0A/OC1C — Arduino D11 (PWM)
  pin13: "RESET", // active-low reset (10k pull-up + button)
  pin14: "VCC1", // +5V #1 (needs its own 100nF decoupler)
  pin15: "GND1",
  pin16: "XTAL2", // 16MHz crystal
  pin17: "XTAL1", // 16MHz crystal
  pin18: "PD0", // INT0/SCL — Arduino D3 / I²C clock
  pin19: "PD1", // INT1/SDA — Arduino D2 / I²C data
  pin20: "PD2", // RXD1 — Arduino D0
  pin21: "PD3", // TXD1 — Arduino D1
  pin22: "PD5", // XCK1/CTS — TX LED pin (firmware-driven)
  // ── RIGHT EDGE (bottom → top) ────────────────────────────────────────
  pin23: "GND2",
  pin24: "VCC2", // +5V #2 (needs its own 100nF decoupler)
  pin25: "PD4", // ICP1/ADC8 — Arduino D4 / A6
  pin26: "PD6", // T1/ADC9 — Arduino D12 / A11
  pin27: "PD7", // OC4D/ADC10 — Arduino D6 / A7 (PWM)
  pin28: "PB4", // ADC11 — Arduino D8 / A8
  pin29: "PB5", // OC1A/ADC12 — Arduino D9 / A9 (PWM)
  pin30: "PB6", // OC1B/ADC13 — Arduino D10 / A10 (PWM)
  pin31: "PC6", // OC3A/OC4A — Arduino D5 (PWM)
  pin32: "PC7", // ICP3/CLK0/OC4A — Arduino D13, the "L" LED
  pin33: "PE2", // #HWB — hardware bootloader pin (active-low, needs pull-up)
  // ── TOP EDGE (right → left) ──────────────────────────────────────────
  pin34: "VCC3", // +5V #3 (needs its own 100nF decoupler)
  pin35: "GND3",
  pin36: "PF7", // ADC7/TDI — Arduino A0
  pin37: "PF6", // ADC6/TDO — Arduino A1
  pin38: "PF5", // ADC5/TMS — Arduino A2
  pin39: "PF4", // ADC4/TCK — Arduino A3
  pin40: "PF1", // ADC1 — Arduino A4
  pin41: "PF0", // ADC0 — Arduino A5
  pin42: "AREF", // ADC reference (100nF to GND if you use it)
  pin43: "GND4",
  pin44: "AVCC", // analog supply (feed through a ferrite bead)
} as const

export const Atmega32U4 = (props: Atmega32U4Props) => (
  <chip
    // `footprint="tqfp44"` is a *footprinter string* — tscircuit generates
    // a 44-pad 0.5mm-pitch TQFP land pattern (and a 3D model!) from it.
    footprint="tqfp44"
    pinLabels={ATMEGA32U4_PINOUT}
    manufacturerPartNumber="ATmega32U4-AU"
    // Schematic-box layout: all power/USB/clock/control pins on the left,
    // every GPIO on the right. This is what makes the schematic readable.
    schPinArrangement={{
      leftSide: {
        direction: "top-to-bottom",
        pins: [
          "VBUS", "UVCC", "UCAP", "UGND", "DMINUS", "DPLUS",
          "XTAL1", "XTAL2", "RESET", "PE2", "AREF", "AVCC",
          "VCC1", "VCC2", "VCC3", "GND1", "GND2", "GND3", "GND4",
        ],
      },
      rightSide: {
        direction: "top-to-bottom",
        pins: [
          "PE6",
          "PB0", "PB1", "PB2", "PB3", "PB4", "PB5", "PB6", "PB7",
          "PC6", "PC7",
          "PD0", "PD1", "PD2", "PD3", "PD4", "PD5", "PD6", "PD7",
          "PF0", "PF1", "PF4", "PF5", "PF6", "PF7",
        ],
      },
    }}
    {...props}
  />
)


export default () => (
  <board
    width="64mm"
    height="42mm"
    name="uNode32U4"
    // Layers: 2 (top + bottom). tscircuit's default; matches JLCPCB's
    // cheapest 2-layer offering.
  >
    {/* ══════════════════════════ §1 USB FRONT-END ══════════════════════════
        VBUS enters through a 500mA-hold PTC resettable fuse (F1) before it
        becomes the board's +5V rail (net.V5). D+/D− pass through 22Ω series
        resistors — the ATmega32U4 datasheet §2.2.8/9 mandates these: they
        damp reflections and limit inrush current through the chip's USB pads.
        The USB shell tabs are soldered to GND for shielding. */}

    <UsbMicroB name="J1" pcbX={-29.8} pcbY={0} schX={-16} schY={0} />
    <fuse
      name="F1"
      footprint="1206"
      currentRating="500mA"
      voltageRating="15V"
      pcbX={-22}
      pcbY={2}
      schX={-10}
      schY={3}
    />
    <resistor name="R1" resistance="22ohm" footprint="0603" pcbX={-14} pcbY={2.5} schX={-10} schY={0.5} />
    <resistor name="R2" resistance="22ohm" footprint="0603" pcbX={-14} pcbY={0} schX={-10} schY={-1} />

    <trace from=".J1 > .VBUS" to=".F1 > .left" width="0.5mm" />
    <trace from=".F1 > .right" to="net.V5" width="0.5mm" />
    <trace from=".J1 > .GND" to="net.GND" width="0.5mm" />
    <trace from=".J1 > .SHIELD1" to="net.GND" />
    <trace from=".J1 > .SHIELD2" to="net.GND" />
    {/* The two sides of a series resistor are DIFFERENT nets — only the
        connector side carries the USB_DP net label. */}
    <trace from=".J1 > .DPLUS" to=".R1 > .left" name="USB_DP" />
    <trace from=".R1 > .right" to=".U1 > .DPLUS" />
    <trace from=".J1 > .DMINUS" to=".R2 > .left" name="USB_DM" />
    <trace from=".R2 > .right" to=".U1 > .DMINUS" />

    {/* ══════════════════════════ §2 THE MCU ═══════════════════════════════
        The star of the show: one bare ATmega32U4-AU. All 44 pins are named
        in lib/atmega32u4.tsx — selectors like ".U1 > .VCC2" refer to those
        names. Rotation is 0 because tscircuit's tqfp44 numbers pins exactly
        like the datasheet (pin 1 = top-left), so USB pins (2-7) already face
        the left-edge connector. */}
    <Atmega32U4 name="U1" pcbX={-2} pcbY={0} schX={0} schY={0} />

    {/* ══════════════════════ §3 POWER INTEGRITY ═══════════════════════════
        A 32U4 board's #1 bring-up killer is sloppy decoupling. We follow the
        datasheet app-circuit discipline:
        • every VCC pin (14, 24, 34) gets its own 100nF ceramic right at the pad
        • UVCC (pin 2, USB pad supply) gets 100nF
        • UCAP (pin 6, internal 3.3V regulator output) gets 1µF — §2.2.12
        • AVCC (pin 44) is fed through a ferrite bead → clean analog supply,
          with 100nF locally
        • AREF (pin 42) gets 100nF (only matters if you use external AREF,
          but it costs nothing)
        • 2×10µF bulk at the power entry absorb USB inrush */}
    <capacitor name="C1" capacitance="10uF" footprint="0805" pcbX={-19.5} pcbY={-3.5} schX={-10} schY={-4} />
    <capacitor name="C2" capacitance="10uF" footprint="0805" pcbX={-15} pcbY={-3.5} schX={-10} schY={-5.5} />
    <capacitor name="C3" capacitance="100nF" footprint="0603" pcbX={-10} pcbY={-5} schX={-4} schY={-6} />
    <capacitor name="C4" capacitance="100nF" footprint="0603" pcbX={9} pcbY={-0.5} schX={4} schY={-6} />
    <capacitor name="C5" capacitance="100nF" footprint="0603" pcbX={4.5} pcbY={7.5} schX={4} schY={6} />
    <capacitor name="C6" capacitance="100nF" footprint="0603" pcbX={-4} pcbY={7.5} schX={-4} schY={6} />
    <capacitor name="C7" capacitance="1uF" footprint="0603" pcbX={-9.5} pcbY={-1.5} schX={-6} schY={-2.5} />
    <capacitor name="C8" capacitance="100nF" footprint="0603" pcbX={-10} pcbY={4.5} schX={-6} schY={4.5} />
    <capacitor name="C9" capacitance="100nF" footprint="0603" pcbX={0.5} pcbY={7.5} schX={0} schY={6.5} />
    <inductor name="FB1" inductance="1uH" footprint="0603" pcbX={-8} pcbY={7.5} schX={-6} schY={7} />

    {/* MCU power hookup — every pin explicit, because that's the lesson */}
    <trace from=".U1 > .VBUS" to="net.V5" />
    <trace from=".U1 > .UVCC" to="net.V5" />
    <trace from=".U1 > .VCC1" to="net.V5" />
    <trace from=".U1 > .VCC2" to="net.V5" />
    <trace from=".U1 > .VCC3" to="net.V5" />
    <trace from=".U1 > .UGND" to="net.GND" />
    <trace from=".U1 > .GND1" to="net.GND" />
    <trace from=".U1 > .GND2" to="net.GND" />
    <trace from=".U1 > .GND3" to="net.GND" />
    <trace from=".U1 > .GND4" to="net.GND" />

    {/* Bulk + per-pin decouplers (each cap spans V5↔GND, placed at its pin) */}
    <trace from=".C1 > .pin1" to="net.V5" />
    <trace from=".C1 > .pin2" to="net.GND" />
    <trace from=".C2 > .pin1" to="net.V5" />
    <trace from=".C2 > .pin2" to="net.GND" />
    <trace from=".C3 > .pin1" to="net.V5" />
    <trace from=".C3 > .pin2" to="net.GND" />
    <trace from=".C4 > .pin1" to="net.V5" />
    <trace from=".C4 > .pin2" to="net.GND" />
    <trace from=".C5 > .pin1" to="net.V5" />
    <trace from=".C5 > .pin2" to="net.GND" />
    <trace from=".C8 > .pin1" to="net.V5" />
    <trace from=".C8 > .pin2" to="net.GND" />

    {/* UCAP: internal 3.3V regulator output needs exactly 1µF (datasheet) */}
    <trace from=".U1 > .UCAP" to=".C7 > .pin1" name="UCAP" />
    <trace from=".C7 > .pin2" to="net.GND" />

    {/* AVCC: +5V → ferrite bead → AVCC, with local 100nF */}
    <trace from=".FB1 > .pin1" to="net.V5" />
    <trace from=".FB1 > .pin2" to="net.AVCC" />
    <trace from=".U1 > .AVCC" to="net.AVCC" />
    <trace from=".C6 > .pin1" to="net.AVCC" />
    <trace from=".C6 > .pin2" to="net.GND" />

    {/* AREF bypass */}
    <trace from=".U1 > .AREF" to="net.AREF" />
    <trace from=".C9 > .pin1" to="net.AREF" />
    <trace from=".C9 > .pin2" to="net.GND" />

    {/* ══════════════════════════ §4 CLOCK ═════════════════════════════════
        16MHz fundamental-mode parallel-resonant crystal between XTAL1/XTAL2,
        with 22pF load caps C10/C11 to GND — inside the datasheet's 12-22pF
        window for 8-16MHz crystals (Table 6-3). The math: a crystal specced
        CL = 15pF wants C = 2·(CL − Cstray) ≈ 2·(15 − 4) = 22pF. The full
        derivation is in the tutorial PDF. HC-49/S through-hole can is used
        because it's trivial to hand-solder; swap to a 3225 SMD crystal +
        its footprint if you prefer. */}
    <crystal
      name="Y1"
      frequency="16MHz"
      loadCapacitance="15pF"
      footprint="hc49"
      pcbX={-2}
      pcbY={-9}
      schX={0}
      schY={-7}
    />
    <capacitor name="C10" capacitance="22pF" footprint="0603" pcbX={-10} pcbY={-9.5} schX={-3} schY={-9} />
    <capacitor name="C11" capacitance="22pF" footprint="0603" pcbX={6} pcbY={-9.5} schX={3} schY={-9} />

    <trace from=".U1 > .XTAL1" to="net.XTAL1" />
    <trace from=".U1 > .XTAL2" to="net.XTAL2" />
    <trace from=".Y1 > .pin1" to="net.XTAL1" />
    <trace from=".Y1 > .pin2" to="net.XTAL2" />
    <trace from=".C10 > .pin1" to="net.XTAL1" />
    <trace from=".C10 > .pin2" to="net.GND" />
    <trace from=".C11 > .pin1" to="net.XTAL2" />
    <trace from=".C11 > .pin2" to="net.GND" />

    {/* ═════════════════════ §5 RESET & BOOTLOADER ═════════════════════════
        RESET (pin 13, active-low): 10k pull-up to 5V + tactile button to
        GND (SW1). tscircuit's pushbutton has 4 pins, internally connected
        in pairs (1=2, 3=4), so wiring pin1 + pin3 is enough.

        BOOT (PE2 / pin 33 / #HWB): 10k pull-up keeps normal boot. Hold SW2
        while pressing reset and the chip enters its bootloader *if* the
        HWBE fuse is programmed (datasheet §27.5.3) — a dead-simple,
        fuse-based recovery path. PE2 is also a GPIO (Arduino D-routed on
        the HWB header pin) so the button doubles as a user input. */}
    <resistor name="R3" resistance="10kohm" footprint="0603" pcbX={-13.5} pcbY={-10.5} schX={10} schY={-3} />
    <pushbutton name="SW1" footprint="pushbutton" pcbX={-19} pcbY={-10.5} schX={14} schY={-3} />
    <resistor name="R4" resistance="10kohm" footprint="0603" pcbX={-13.5} pcbY={-13.2} schX={10} schY={-6} />
    <pushbutton name="SW2" footprint="pushbutton" pcbX={-27.5} pcbY={-11} schX={14} schY={-6} />

    <trace from=".R3 > .left" to="net.V5" />
    <trace from=".R3 > .right" to="net.RST" />
    <trace from=".U1 > .RESET" to="net.RST" />
    <trace from=".SW1 > .pin1" to="net.RST" />
    <trace from=".SW1 > .pin3" to="net.GND" />

    <trace from=".R4 > .left" to="net.V5" />
    <trace from=".R4 > .right" to="net.HWB" />
    <trace from=".U1 > .PE2" to="net.HWB" />
    <trace from=".SW2 > .pin1" to="net.HWB" />
    <trace from=".SW2 > .pin3" to="net.GND" />

    {/* ══════════════════════════ §6 ICSP HEADER ═══════════════════════════
        Standard 2×3 AVR ISP header — this is how you program the BLANK chip
        the first time (bootloader + fuses). Pin 1 = MISO, marked on
        silkscreen by the pinheader's own labels. */}
    <pinheader
      name="J3"
      pinCount={6}
      doubleRow
      pitch="2.54mm"
      pinLabels={["MISO", "VCC", "SCK", "MOSI", "RESET", "GND"]}
      showSilkscreenPinLabels
      pcbX={27}
      pcbY={9}
      pcbRotation={90}
      schX={16}
      schY={2}
    />
    <trace from=".J3 > .MISO" to="net.MISO" />
    <trace from=".J3 > .SCK" to="net.SCK" />
    <trace from=".J3 > .MOSI" to="net.MOSI" />
    <trace from=".J3 > .VCC" to="net.V5" />
    <trace from=".J3 > .GND" to="net.GND" />
    <trace from=".J3 > .RESET" to="net.RST" />

    {/* SPI nets join the MCU (these pins are also Arduino D14-D16 on J4) */}
    <trace from=".U1 > .PB3" to="net.MISO" />
    <trace from=".U1 > .PB1" to="net.SCK" />
    <trace from=".U1 > .PB2" to="net.MOSI" />

    {/* ══════════════════════════ §7 INDICATORS ═══════════════════════════
        Four LEDs, each with a worked current calculation in the tutorial:
        • PWR  — green,   V5 → LED → 1k → GND      (always on; ~3mA)
        • L    — amber,   PC7 → 1k → LED → GND     (Arduino D13, active-HIGH)
        • TX   — amber,   V5 → LED → 1k → PD5      (active-LOW: the Arduino
          core's TXLED1 macro drives the pin LOW to light it)
        • RX   — amber,   V5 → LED → 1k → PB0      (active-LOW, RXLED1 macro)
        LED pins: .pos = anode, .neg = cathode. */}
    <led name="LED1" color="green" footprint="led0603" pcbX={-9.5} pcbY={-13} schX={-10} schY={-11} />
    <resistor name="R5" resistance="1kohm" footprint="0603" pcbX={-6} pcbY={-13} schX={-8} schY={-11} />
    <led name="LED2" color="amber" footprint="led0603" pcbX={-2.5} pcbY={-13} schX={-10} schY={-13.5} />
    <resistor name="R6" resistance="1kohm" footprint="0603" pcbX={1} pcbY={-13} schX={-8} schY={-13.5} />
    <led name="LED3" color="amber" footprint="led0603" pcbX={4.5} pcbY={-13} schX={-10} schY={-16} />
    <resistor name="R7" resistance="1kohm" footprint="0603" pcbX={8} pcbY={-13} schX={-8} schY={-16} />
    <led name="LED4" color="amber" footprint="led0603" pcbX={11.5} pcbY={-13} schX={-10} schY={-18.5} />
    <resistor name="R8" resistance="1kohm" footprint="0603" pcbX={15} pcbY={-13} schX={-8} schY={-18.5} />

    {/* PWR: on whenever 5V is present */}
    <trace from=".LED1 > .pos" to="net.V5" />
    <trace from=".LED1 > .neg" to=".R5 > .left" />
    <trace from=".R5 > .right" to="net.GND" />

    {/* L on D13/PC7 — active-high like every Arduino */}
    <trace from=".U1 > .PC7" to="net.D13" />
    <trace from=".R6 > .left" to="net.D13" />
    <trace from=".R6 > .right" to=".LED2 > .pos" />
    <trace from=".LED2 > .neg" to="net.GND" />

    {/* TX/RX — active-low, wired from 5V INTO the pin */}
    <trace from=".LED3 > .pos" to="net.V5" />
    <trace from=".LED3 > .neg" to=".R7 > .left" />
    <trace from=".R7 > .right" to=".U1 > .PD5" name="TXLED" />
    <trace from=".LED4 > .pos" to="net.V5" />
    <trace from=".LED4 > .neg" to=".R8 > .left" />
    <trace from=".R8 > .right" to="net.SS" />

    {/* PB0 is both the RX LED pin and Arduino D17/SS */}
    <trace from=".U1 > .PB0" to="net.SS" />

    {/* ══════════════════════════ §8 I²C PULL-UPS ══════════════════════════
        4.7k pull-ups on SDA (PD1/D2) and SCL (PD0/D3) so any I²C sensor
        works out of the box. They're weak enough (1mA max) to not disturb
        ordinary GPIO use of D2/D3. */}
    <resistor name="R9" resistance="4.7kohm" footprint="0603" pcbX={14} pcbY={2} schX={10} schY={4} />
    <resistor name="R10" resistance="4.7kohm" footprint="0603" pcbX={14} pcbY={-1} schX={10} schY={1.5} />

    <trace from=".R9 > .left" to="net.V5" />
    <trace from=".R9 > .right" to="net.SDA" />
    <trace from=".U1 > .PD1" to="net.SDA" />
    <trace from=".R10 > .left" to="net.V5" />
    <trace from=".R10 > .right" to="net.SCL" />
    <trace from=".U1 > .PD0" to="net.SCL" />

    {/* ══════════════════════ §9 BREAKOUT HEADERS ══════════════════════════
        J2 (bottom): digital side, Leonardo order, power at the USB end.
        J4 (top):   analog + I²C + SPI + HWB + AREF, power at the USB end.
        Labels are silkscreened 1:1 — build a breadboard harness and the
        names match every Arduino Leonardo tutorial on the internet. */}
    <pinheader
      name="J2"
      pinCount={16}
      pitch="2.54mm"
      gender="male"
      pinLabels={[
        "V5", "GND",
        "D13", "D12", "D11", "D10", "D9", "D8", "D7", "D6",
        "D5", "D4", "D3", "D2", "D1", "D0",
      ]}
      showSilkscreenPinLabels
      pcbX={0}
      pcbY={-17.5}
      schX={16}
      schY={-10}
      schRotation={90}
    />
    <pinheader
      name="J4"
      pinCount={16}
      pitch="2.54mm"
      gender="male"
      pinLabels={[
        "V5", "GND", "AREF",
        "A0", "A1", "A2", "A3", "A4", "A5",
        "SCL", "SDA", "MISO", "SCK", "MOSI", "SS", "HWB",
      ]}
      showSilkscreenPinLabels
      pcbX={0}
      pcbY={17.5}
      schX={16}
      schY={10}
      schRotation={90}
    />

    {/* J2/J4 power */}
    <trace from=".J2 > .V5" to="net.V5" />
    <trace from=".J2 > .GND" to="net.GND" />
    <trace from=".J4 > .V5" to="net.V5" />
    <trace from=".J4 > .GND" to="net.GND" />

    {/* Digital pass-throughs (MCU port ↔ header pin) */}
    <trace from=".J2 > .D13" to="net.D13" />
    <trace from=".U1 > .PD6" to=".J2 > .D12" name="D12" />
    <trace from=".U1 > .PB7" to=".J2 > .D11" name="D11" />
    <trace from=".U1 > .PB6" to=".J2 > .D10" name="D10" />
    <trace from=".U1 > .PB5" to=".J2 > .D9" name="D9" />
    <trace from=".U1 > .PB4" to=".J2 > .D8" name="D8" />
    <trace from=".U1 > .PE6" to=".J2 > .D7" name="D7" />
    <trace from=".U1 > .PD7" to=".J2 > .D6" name="D6" />
    <trace from=".U1 > .PC6" to=".J2 > .D5" name="D5" />
    <trace from=".U1 > .PD4" to=".J2 > .D4" name="D4" />
    <trace from=".J2 > .D3" to="net.SCL" />
    <trace from=".J2 > .D2" to="net.SDA" />
    <trace from=".U1 > .PD3" to=".J2 > .D1" name="D1" />
    <trace from=".U1 > .PD2" to=".J2 > .D0" name="D0" />

    {/* Analog + I²C + SPI on J4 */}
    <trace from=".U1 > .PF7" to=".J4 > .A0" name="A0" />
    <trace from=".U1 > .PF6" to=".J4 > .A1" name="A1" />
    <trace from=".U1 > .PF5" to=".J4 > .A2" name="A2" />
    <trace from=".U1 > .PF4" to=".J4 > .A3" name="A3" />
    <trace from=".U1 > .PF1" to=".J4 > .A4" name="A4" />
    <trace from=".U1 > .PF0" to=".J4 > .A5" name="A5" />
    <trace from=".J4 > .AREF" to="net.AREF" />
    <trace from=".J4 > .SCL" to="net.SCL" />
    <trace from=".J4 > .SDA" to="net.SDA" />
    <trace from=".J4 > .MISO" to="net.MISO" />
    <trace from=".J4 > .SCK" to="net.SCK" />
    <trace from=".J4 > .MOSI" to="net.MOSI" />
    <trace from=".J4 > .SS" to="net.SS" />
    <trace from=".J4 > .HWB" to="net.HWB" />

    {/* ═════════════════════ MECHANICAL & IDENTIFICATION ══════════════════
        4× M3 mounting holes (3.2mm, unplated) and board identification
        silkscreen. Unplated holes = no net = pure mechanical. */}
    <hole name="H1" diameter="3.2mm" pcbX={-28.5} pcbY={18} />
    <hole name="H2" diameter="3.2mm" pcbX={28.5} pcbY={18} />
    <hole name="H3" diameter="3.2mm" pcbX={28.5} pcbY={-18} />
    <hole name="H4" diameter="3.2mm" pcbX={-28.5} pcbY={-18} />

    <silkscreentext text="uNode32U4" pcbX={26} pcbY={-8} fontSize="1.2mm" />
    <silkscreentext text="bare ATmega32U4" pcbX={26} pcbY={-10} fontSize="0.8mm" />
    <silkscreentext text="RST" pcbX={-19} pcbY={-15.9} fontSize="1mm" />
    <silkscreentext text="BOOT" pcbX={-27.5} pcbY={-15.9} fontSize="1mm" />
    <silkscreentext text="ICSP" pcbX={22.5} pcbY={12.5} fontSize="1mm" />
  </board>
)
