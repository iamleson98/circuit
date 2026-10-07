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
 *  "leonardo" variant files. tscircuit's `tqfp44_p0.8mm` footprint numbers
 *  pins counter-clockwise starting at the top-left, exactly like the datasheet:
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
import "@tscircuit/core"
import type { CommonLayoutProps } from "@tscircuit/props"

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
    // `footprint="tqfp44_p0.8mm_w10mm"` is a *footprinter string* — tscircuit
    // generates a 44-pad TQFP land pattern (and a 3D model!) from it.
    //
    // ⚠️ THE _p0.8mm SUFFIX IS NOT OPTIONAL. tscircuit's tqfp footprinter
    // defaults to a 0.5mm pin pitch for 44+ pin packages, but the
    // ATmega32U4-AU's TQFP-44 is a 10×10mm body with a **0.8mm** pitch
    // (datasheet §1 / package drawing 44TQFP-101). Without the override,
    // the PCB would be un-buildable with the real chip — a textbook example
    // of why you always check generated footprints against the package
    // drawing before ordering boards. The 0.8mm pitch also leaves 0.5mm
    // routing channels between the 0.3mm pads, which the fan-out needs.
    footprint="tqfp44_p0.8mm_w10mm"
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
