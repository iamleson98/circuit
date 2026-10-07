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
import "@tscircuit/core"
import type { CommonLayoutProps } from "@tscircuit/props"

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
