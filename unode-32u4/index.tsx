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
import "@tscircuit/core"
import { Atmega32U4 } from "./lib/atmega32u4"
import { UsbMicroB } from "./lib/usb-micro-b"

export default () => (
  <board
    width="72mm"
    height="50mm"
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

    <UsbMicroB name="J1" pcbX={-29.3} pcbY={0} schX={-16} schY={0} />
    {/* F1 sits BELOW the D+/D− pair on purpose: its V5 exit then runs
        under the USB lines to the bulk caps instead of crossing them. */}
    <fuse
      name="F1"
      footprint="1206"
      currentRating="500mA"
      voltageRating="15V"
      pcbX={-24}
      pcbY={-2.2}
      schX={-10}
      schY={3}
    />
    {/* R1/R2 sit ~3mm from the MCU pads — datasheet §2.2.8/9 wants the
        series resistors “as close as possible” to the chip side. */}
    <resistor name="R1" resistance="22ohm" footprint="0603" pcbX={-12.5} pcbY={1.75} schX={-10} schY={0.5} />
    <resistor name="R2" resistance="22ohm" footprint="0603" pcbX={-12.5} pcbY={3.35} schX={-10} schY={-1} />

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
    {/* Placement discipline: one decoupler ~2-3mm from the pin it serves,
        pin facing its pad. Each cap's pin1 is its V5/AVCC side.
        C3→VCC1 (bottom-left), C4→VCC2 (right), C5→VCC3 (top),
        C8→UVCC (top-left), C7 is the UCAP 1µF, C6 rides the ferrite-bead
        AVCC island, C9 bypasses AREF. */}
    {/* Bulk caps stand vertical — pin1 (V5) up, pin2 (GND) down — so the
        VBUS→V5 arrival from above and the GND return from the connector
        never have to cross each other at the power entry. */}
    <capacitor name="C1" capacitance="10uF" footprint="0805" pcbX={-19.5} pcbY={-3.5} pcbRotation={270} schX={-10} schY={-4} />
    <capacitor name="C2" capacitance="10uF" footprint="0805" pcbX={-15} pcbY={-4.5} pcbRotation={270} schX={-10} schY={-5.5} />
    <capacitor name="C3" capacitance="100nF" footprint="0603" pcbX={-8.5} pcbY={-10.5} pcbRotation={90} schX={-4} schY={-6} />
    {/* C4 tucks under the chip's bottom-right corner, vertical, pin1 (V5)
        on top: the VCC2/GND2 escapes drop straight down to it and never
        have to cross the right-edge signal corridor. */}
    <capacitor name="C4" capacitance="100nF" footprint="0603" pcbX={7.6} pcbY={-7.6} pcbRotation={270} schX={4} schY={-6} />
    {/* C5 sits right of the other top caps: its GND pin then exits right
        toward J3.GND (the only GND member on that side of the board) while
        V5 arrives from the left — opposite shoulders, no squeeze. */}
    <capacitor name="C5" capacitance="100nF" footprint="0603" pcbX={5} pcbY={9} pcbRotation={90} schX={4} schY={6} />
    {/* C6 is vertical with pin1 (AVCC) UP: the ferrite bead feeds it from
        the side, and GND4's escape reaches the bottom GND pin without
        wrapping past the AVCC pin. */}
    <capacitor name="C6" capacitance="100nF" footprint="0603" pcbX={-7} pcbY={9.4} pcbRotation={270} schX={-4} schY={6} />
    {/* C7 is rotated 180° so pin1 faces the MCU — the UCAP trace exits
        straight out of the pad, no detour around the cap body. */}
    <capacitor name="C7" capacitance="1uF" footprint="0603" pcbX={-13.5} pcbY={-2} pcbRotation={180} schX={-6} schY={-2.5} />
    <capacitor name="C8" capacitance="100nF" footprint="0603" pcbX={-11.5} pcbY={6} schX={-6} schY={4.5} />
    <capacitor name="C9" capacitance="100nF" footprint="0603" pcbX={-5} pcbY={9} pcbRotation={90} schX={0} schY={6.5} />
    <inductor name="FB1" inductance="1uH" footprint="0603" pcbX={-9.8} pcbY={8.5} schX={-6} schY={7} />

    {/* VCC2↔VCC3 hand-routed up the body's x=2.6 lane — the autorouter's
        version cuts diagonally through the ring and grazes SCL/MOSI. */}
    <trace
      from=".U1 > .VCC2"
      to=".U1 > .VCC3"
      pcbPath={[{ x: 4.6, y: -3.2 }, { x: 4.6, y: 5.64 }, ".U1 > .VCC3"]}
    />

    {/* GND3↔GND4 hand-routed UNDER the top pad row (y=4.5 lane, below
        every pad tip at y=4.9): the autorouter sends this edge straight
        through the pad row, grazing AREF's pad. */}
    <trace
      from=".U1 > .GND3"
      to=".U1 > .GND4"
      pcbPath={[{ x: 3.2, y: 4.5 }, { x: -3.2, y: 4.5 }, ".U1 > .GND4"]}
    />

    {/* MCU power hookup — every pin explicit, because that's the lesson */}
    <trace from=".U1 > .VBUS" to="net.V5" />
    <trace from=".U1 > .UVCC" to="net.V5" />
    <trace from=".U1 > .VCC1" to="net.V5" />
    <trace from=".U1 > .VCC2" to="net.V5" />
    <trace from=".U1 > .VCC3" to="net.V5" />
    <trace from=".U1 > .UGND" to="net.GND" />
    <trace from=".U1 > .GND1" to="net.GND" width="0.2mm" />
    <trace from=".U1 > .GND2" to="net.GND" />
    <trace from=".U1 > .GND3" to="net.GND" />
    <trace from=".U1 > .GND4" to="net.GND" />

    {/* Bulk + per-pin decouplers (each cap spans V5↔GND, placed at its pin) */}
    <trace from=".C1 > .pin1" to="net.V5" />
    <trace from=".C1 > .pin2" to="net.GND" />
    <trace from=".C2 > .pin1" to="net.V5" />
    <trace from=".C2 > .pin2" to="net.GND" />
    <trace
      from=".U1 > .VCC1"
      to=".C3 > .pin1"
      maxLength="15mm"
      pcbPath={[{ x: -2.4, y: -6.9 }, { x: -7.5, y: -6.9 }, { x: -7.5, y: -11.3 }, ".C3 > .pin1"]}
    />
    <trace from=".C8 > .pin1" to="net.V5" />
    <trace from=".C8 > .pin2" to="net.GND" />
    {/* GND1 and VCC1 reach C3 through separate hand-routed lanes — the
        autorouter runs both as parallel diagonals that graze each other. */}
    <trace
      from=".U1 > .GND1"
      to=".C3 > .pin2"
      maxLength="15mm"
      pcbPath={[{ x: -1.6, y: -9.7 }, { x: -6.5, y: -9.7 }, ".C3 > .pin2"]}
    />
    <trace from=".C4 > .pin1" to="net.V5" />
    <trace from=".C4 > .pin2" to="net.GND" />
    <trace from=".C5 > .pin1" to="net.V5" />
    <trace from=".C5 > .pin2" to="net.GND" />

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
        derivation is in the tutorial PDF.

        LAYOUT IS PART OF THE SPEC: tscircuit's crystal DRC enforces
        ≤10mm traces and 0 vias on both crystal nets (you can relax it with
        the maxTraceLength prop — don't). We keep every segment under 3mm:
        the caps sit between the chip and the crystal, one under each XTAL
        pad, and the crystal's pins are cross-assigned (pin1→XTAL2,
        pin2→XTAL1 — a crystal has no polarity, so this is free) so no
        trace crosses its neighbor. HC-49/S through-hole can = trivial to
        hand-solder; swap to a 3225 SMD crystal if you prefer. */}
    <crystal
      name="Y1"
      frequency="16MHz"
      loadCapacitance="15pF"
      footprint="hc49"
      pcbX={-0.8}
      pcbY={-14}
      schX={0}
      schY={-7}
    />
    {/* Crystal FIRST, caps BEHIND it: Y1 sits directly under the XTAL pads;
      C11/C10 hang vertically below Y1's own pads (crystal pin up, GND pin
      down), so every connection is a short axial drop and the load caps
      tie straight onto the crystal pins — the classic ATmega app-note
      arrangement. Y1 cross-assigned (pin1→XTAL2, pin2→XTAL1; no polarity). */}
    <capacitor name="C10" capacitance="22pF" footprint="0603" pcbX={1.64} pcbY={-18.5} pcbRotation={270} schX={-3} schY={-9} />
    <capacitor name="C11" capacitance="22pF" footprint="0603" pcbX={-3.24} pcbY={-18.5} pcbRotation={270} schX={3} schY={-9} />

    {/* Net-based on purpose: with Y1 between the pads and its caps, the
        minimum spanning tree pairs pad↔Y1 and Y1↔cap — exactly the two
        short axial hops the layout provides. */}
    <trace from=".U1 > .XTAL2" to="net.XTAL2" />
    <trace from=".Y1 > .pin1" to="net.XTAL2" />
    <trace from=".C11 > .pin1" to="net.XTAL2" />
    <trace from=".C11 > .pin2" to="net.GND" />
    <trace from=".U1 > .XTAL1" to="net.XTAL1" />
    <trace from=".Y1 > .pin2" to="net.XTAL1" />
    <trace from=".C10 > .pin1" to="net.XTAL1" />
    <trace from=".C10 > .pin2" to="net.GND" />

    {/* ═════════════════════ §5 RESET & BOOTLOADER ═════════════════════════
        RESET (pin 13, active-low): 10k pull-up to 5V + tactile button to
        GND (SW1). tscircuit's pushbutton has 4 pins, internally connected
        in pairs (1=2, 3=4), so wiring pin1 + pin3 is enough.

        BOOT (PE2 / pin 33 / #HWB): 10k pull-up keeps normal boot. Hold SW2
        while pressing reset and the chip enters its bootloader *if* the
        HWBE fuse is programmed (datasheet §27.5.3) — a dead-simple,
        fuse-based recovery path. PE2 is also a GPIO (Arduino D-routed on
        the HWB header pin) so the button doubles as a user input. */}
    <resistor name="R3" resistance="10kohm" footprint="0603" pcbX={-19.5} pcbY={2.3} schX={10} schY={-3} />
    <pushbutton name="SW1" footprint="pushbutton" pcbX={-19.5} pcbY={10} schX={14} schY={-3} />
    <resistor name="R4" resistance="10kohm" footprint="0603" pcbX={-24.5} pcbY={-16.5} schX={10} schY={-6} />
    <pushbutton name="SW2" footprint="pushbutton" pcbX={-30.5} pcbY={-15} schX={14} schY={-6} />

    {/* R3/R4 V5 feed: explicit daisy-chain R3←R4←J2.V5. A plain net.V5
        connection would let the MST wrap R3's feed around C2's GND pin
        (both bulk caps have their GND pin on the bottom) — this way the
        pull-ups draw from the header pin through the quiet corner. */}
    <trace from=".R3 > .left" to="net.V5" />
    <trace from=".R4 > .left" to="net.V5" />
    <trace from=".R3 > .right" to="net.RST" />
    <trace from=".U1 > .RESET" to="net.RST" />
    <trace from=".SW1 > .pin1" to="net.RST" />
    <trace from=".SW1 > .pin3" to="net.GND" />

    <trace from=".R4 > .right" to="net.HWB" />
    <trace from=".U1 > .PE2" to="net.HWB" />
    <trace from=".SW2 > .pin1" to="net.HWB" />
    <trace from=".SW2 > .pin3" to="net.GND" />

    {/* ══════════════════════════ §6 ICSP HEADER ═══════════════════════════
        Standard 2×3 AVR ISP header — this is how you program the BLANK chip
        the first time (bootloader + fuses).

        ⚠️ LABEL ORDER MATTERS. With doubleRow + pcbRotation={90}, tscircuit
        numbers the pads in a ring: pin1 bottom-left, pin2 bottom-right,
        pin3 mid-right, pin4 top-right, pin5 top-left, pin6 mid-left. The
        pinLabels array below is arranged so the PHYSICAL layout comes out
        as the standard AVR ISP grid every programmer cable expects:

              MISO   VCC
              SCK    MOSI
              RESET  GND

        Get this wrong and a keyed ISP cable would put VCC where GND
        belongs — the proof script (npm run proof) asserts the physical
        arrangement, so it can never silently regress. */}
    <pinheader
      name="J3"
      pinCount={6}
      doubleRow
      pitch="2.54mm"
      pinLabels={["RESET", "GND", "MOSI", "VCC", "MISO", "SCK"]}
      showSilkscreenPinLabels
      pcbX={-22}
      pcbY={-12}
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
        Four LEDs in a row under the top header, each with a worked current
        calculation in the tutorial:
        • PWR  — green,   V5 → LED → 1k → GND      (always on; ~3mA)
        • L    — amber,   PC7 → 1k → LED → GND     (Arduino D13, active-HIGH)
        • TX   — amber,   V5 → LED → 1k → PD5      (active-LOW: the Arduino
          core's TXLED1 macro drives the pin LOW to light it)
        • RX   — amber,   V5 → LED → 1k → PB0      (active-LOW, RXLED1 macro)
        LED pins: .pos = anode, .neg = cathode. */}
    <led name="LED1" color="green" footprint="led0603" pcbX={-9.5} pcbY={16} schX={-10} schY={-11} />
    <resistor name="R5" resistance="1kohm" footprint="0603" pcbX={-6} pcbY={16} schX={-8} schY={-11} />
    <led name="LED2" color="amber" footprint="led0603" pcbX={1} pcbY={16} schX={-10} schY={-13.5} />
    <resistor name="R6" resistance="1kohm" footprint="0603" pcbX={-2.5} pcbY={16} schX={-8} schY={-13.5} />
    <led name="LED3" color="amber" footprint="led0603" pcbX={4.5} pcbY={16} schX={-10} schY={-16} />
    <resistor name="R7" resistance="1kohm" footprint="0603" pcbX={8} pcbY={16} schX={-8} schY={-16} />
    <led name="LED4" color="amber" footprint="led0603" pcbX={11.5} pcbY={16} schX={-10} schY={-18.5} />
    <resistor name="R8" resistance="1kohm" footprint="0603" pcbX={15} pcbY={16} schX={-8} schY={-18.5} />

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
    {/* The LED3→LED4 V5 hop is hand-routed BELOW the LED row (pcbPath):
        the autorouter prefers the lane above the row, where it fights the
        SPI traces going to the top header. */}
    <trace from=".LED3 > .pos" to=".LED4 > .pos" pcbPathRelativeTo=".LED3 > .pos" pcbPath={[{ x: 0, y: -1.3 }, { x: 6.17, y: -1.3 }, ".LED4 > .pos"]} />
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
    <resistor name="R9" resistance="4.7kohm" footprint="0603" pcbX={7.6} pcbY={-14.8} pcbRotation={180} schX={10} schY={4} />
    <resistor name="R10" resistance="4.7kohm" footprint="0603" pcbX={7.6} pcbY={-13} pcbRotation={180} schX={10} schY={1.5} />

    <trace from=".R9 > .left" to="net.V5" />
    <trace from=".R9 > .right" to="net.SDA" />
    <trace from=".U1 > .PD1" to="net.SDA" />
    <trace from=".R10 > .left" to="net.V5" />
    <trace from=".R10 > .right" to="net.SCL" />
    <trace from=".U1 > .PD0" to="net.SCL" />

    {/* ══════════════════════ §9 BREAKOUT HEADERS ══════════════════════════
        J2 (right edge, vertical): the digital bus — D0-D13 in Leonardo
        order, power at the bottom end. Running it down the right edge
        means the right-side MCU ports (PB4-PB7, PC6/PC7, PD4/4/6/7)
        escape STRAIGHT OUT instead of carving through the chip's fan-out
        — the single most important placement decision on this board.
        J4 (top): analog + I²C + SPI + HWB + AREF, power at the USB end.
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
      pcbX={34}
      pcbY={0}
      pcbRotation={90}
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
      pcbY={22}
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
    <hole name="H1" diameter="3.2mm" pcbX={-32} pcbY={22} />
    <hole name="H2" diameter="3.2mm" pcbX={28} pcbY={22} />
    <hole name="H3" diameter="3.2mm" pcbX={28} pcbY={-22} />
    <hole name="H4" diameter="3.2mm" pcbX={-32} pcbY={-22} />

    <silkscreentext text="uNode32U4" pcbX={19} pcbY={-5} fontSize="1.2mm" />
    <silkscreentext text="bare ATmega32U4" pcbX={19} pcbY={-7} fontSize="0.8mm" />
    <silkscreentext text="RST" pcbX={-19.5} pcbY={4.9} fontSize="1mm" />
    <silkscreentext text="BOOT" pcbX={-30.5} pcbY={-19.4} fontSize="1mm" />
    <silkscreentext text="ICSP" pcbX={-22} pcbY={-8.2} fontSize="1mm" />

    {/* ═══════════════════════ §10 GROUND POUR ═══════════════════════════
        The single biggest upgrade from "beginner board" to "real board":
        a solid GND plane on the bottom layer. Every GND pin gets a short
        via to the plane instead of a long routed trace, return currents
        flow under their signals, EMI drops, and the top layer keeps
        almost all the routing room for signals. Thermal reliefs keep
        through-hole pads solderable (heat doesn't flood into the plane).
        This is THE standard 2-layer stackup: signals on top, GND below. */}
    <copperpour
      connectsTo="net.GND"
      layer="bottom"
      padMargin="0.45mm"
      useThermalReliefs
    />
  </board>
)
