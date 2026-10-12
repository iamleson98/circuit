/**
 * ─────────────────────────────────────────────────────────────────────────
 *  lib/usb-micro-b.tsx — Micro-USB-B receptacle: Amphenol ICC 10118194-0001LF
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  WHY A HAND-BUILT FOOTPRINT?
 *  tscircuit's footprinter knows standard patterns (tqfp44, 0603, hc49...),
 *  but connectors are mechanical parts with vendor-specific land patterns.
 *  For those you compose a footprint from primitive elements:
 *
 *    <smtpad />       → a surface-mount copper pad (can carry a port name)
 *    <platedhole />   → a plated through-hole (here: oval "pill" shell legs)
 *    <silkscreenpath /> → silkscreen outline graphics
 *
 *  SOURCE OF EVERY NUMBER BELOW
 *  The pads are transcribed from the KiCad library footprint
 *  Connector_USB:USB_Micro-B_Amphenol_10118194_Horizontal, which the KiCad
 *  library team builds from Amphenol's 10118194 customer drawing. Only a
 *  rotation was applied: KiCad's origin is kept, and its "+Y = toward the
 *  board edge" axis becomes −X here, so the cable opening faces LEFT.
 *  A footprint is part-specific: order exactly 10118194-0001LF (or another
 *  10118194-xxxxLF variant with the same drawing).
 *
 *  GEOMETRY (top view, opening facing −X):
 *    - 5 signal pads 1.35 × 0.40 mm, 0.65 mm pitch, centred at x = +1.40
 *      top → bottom: 1 VBUS, 2 D−, 3 D+, 4 ID, 5 GND
 *    - 4 oval through-hole shell legs (the mechanical anchor that makes a
 *      micro-B connector survive real cable abuse) + 4 SMD shell pads
 *    - PCB EDGE at x = −2.75: the connector body overhangs it by 0.70 mm,
 *      so a plug's overmold clears the board. Place the component so that
 *      pcbX − 2.75 equals the board's left edge.
 */
import "@tscircuit/core"
import type { CommonLayoutProps } from "@tscircuit/props"

export interface UsbMicroBProps extends CommonLayoutProps {
  name: string
}

/** distance from the footprint origin to the board edge it must sit on */
export const USB_MICRO_B_EDGE_OFFSET_MM = 2.75

export const UsbMicroB = (props: UsbMicroBProps) => (
  <chip
    {...props}
    manufacturerPartNumber="10118194-0001LF"
    // pinLabels bind each pad's `portHints` name to a pin number, so
    // selectors like ".J1 > .VBUS" resolve to pad 1. The six SHIELD ports
    // are the shell: every one of them is tied to GND in index.tsx.
    pinLabels={{
      pin1: "VBUS",
      pin2: "DMINUS",
      pin3: "DPLUS",
      pin4: "ID",
      pin5: "GND",
      pin6: "SHIELD1",
      pin7: "SHIELD2",
      pin8: "SHIELD3",
      pin9: "SHIELD4",
      pin10: "SHIELD5",
      pin11: "SHIELD6",
    }}
    footprint={
      <footprint>
        {/* ── signal pads (KiCad pads 1-5: 0.40 × 1.35 at y = −1.40) ── */}
        <smtpad portHints={["VBUS"]} pcbX="1.4mm" pcbY="1.3mm" width="1.35mm" height="0.4mm" shape="rect" />
        <smtpad portHints={["DMINUS"]} pcbX="1.4mm" pcbY="0.65mm" width="1.35mm" height="0.4mm" shape="rect" />
        <smtpad portHints={["DPLUS"]} pcbX="1.4mm" pcbY="0mm" width="1.35mm" height="0.4mm" shape="rect" />
        {/* ID (pin 4) is only used by OTG cables — left unconnected here */}
        <smtpad portHints={["ID"]} pcbX="1.4mm" pcbY="-0.65mm" width="1.35mm" height="0.4mm" shape="rect" />
        <smtpad portHints={["GND"]} pcbX="1.4mm" pcbY="-1.3mm" width="1.35mm" height="0.4mm" shape="rect" />

        {/* ── rear shell legs: oval holes 0.55 × 0.85, pads 0.95 × 1.25 ── */}
        <platedhole portHints={["SHIELD1"]} shape="pill" pcbX="1.4mm" pcbY="2.5mm" outerWidth="0.95mm" outerHeight="1.25mm" holeWidth="0.55mm" holeHeight="0.85mm" />
        <platedhole portHints={["SHIELD2"]} shape="pill" pcbX="1.4mm" pcbY="-2.5mm" outerWidth="0.95mm" outerHeight="1.25mm" holeWidth="0.55mm" holeHeight="0.85mm" />

        {/* ── front shell legs: oval holes 1.15 × 0.50 with their SMD tabs ── */}
        <platedhole portHints={["SHIELD3"]} shape="pill" pcbX="-1.3mm" pcbY="3.5mm" outerWidth="1.55mm" outerHeight="0.89mm" holeWidth="1.15mm" holeHeight="0.5mm" />
        <smtpad portHints={["SHIELD3"]} pcbX="-1.3mm" pcbY="3.025mm" width="1.55mm" height="1.45mm" shape="rect" />
        <platedhole portHints={["SHIELD4"]} shape="pill" pcbX="-1.3mm" pcbY="-3.5mm" outerWidth="1.55mm" outerHeight="0.89mm" holeWidth="1.15mm" holeHeight="0.5mm" />
        <smtpad portHints={["SHIELD4"]} pcbX="-1.3mm" pcbY="-3.025mm" width="1.55mm" height="1.45mm" shape="rect" />

        {/* ── inner SMD shell pads ── */}
        <smtpad portHints={["SHIELD5"]} pcbX="-1.3mm" pcbY="1mm" width="1.55mm" height="1.5mm" shape="rect" />
        <smtpad portHints={["SHIELD6"]} pcbX="-1.3mm" pcbY="-1mm" width="1.55mm" height="1.5mm" shape="rect" />

        {/* ── silkscreen: body sides (kept clear of every pad) ── */}
        <silkscreenpath route={[{ x: -2.75, y: 4.3 }, { x: 0.6, y: 4.3 }]} />
        <silkscreenpath route={[{ x: -2.75, y: -4.3 }, { x: 0.6, y: -4.3 }]} />
        {/* pin-1 (VBUS) tick behind the signal pads */}
        <silkscreenpath route={[{ x: 2.4, y: 1.3 }, { x: 2.9, y: 1.3 }]} />
      </footprint>
    }
    // Schematic-box pin arrangement, wired like a classic USB connector:
    // VBUS on top, then the pair, then GND/shield.
    schPinArrangement={{
      leftSide: {
        direction: "top-to-bottom",
        pins: ["VBUS", "DPLUS", "DMINUS", "GND", "SHIELD1", "SHIELD2", "SHIELD3", "SHIELD4", "SHIELD5", "SHIELD6"],
      },
      rightSide: {
        direction: "top-to-bottom",
        pins: ["ID"],
      },
    }}
  />
)
