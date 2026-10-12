/**
 * ─────────────────────────────────────────────────────────────────────────
 *  lib/parts.tsx — the arc lighter's parts, with hand-checked footprints
 * ─────────────────────────────────────────────────────────────────────────
 *  Why not just footprint="sot23"? Because a footprint string only says
 *  WHERE the pads are, and tscircuit numbers a component's pins in its own
 *  order (MOSFET: 1 drain, 2 source, 3 gate · NPN: 1 collector, 2 base,
 *  3 emitter · diode/LED: 1 anode, 2 cathode). Real parts number their pads
 *  differently (an AO3401's pad 1 is its GATE, a BC847's pad 1 is its BASE,
 *  and an SMA diode's pad 1 is its CATHODE). Using the stock strings here
 *  would solder these transistors in backwards. So every polarised part
 *  below spells out its pads, each tagged with the tscircuit pin it is,
 *  checked against the manufacturer's datasheet pinout:
 *
 *    AO3401   SOT-23   pad 1 G · 2 S · 3 D            (Alpha & Omega)
 *    BC847    SOT-23   pad 1 B · 2 E · 3 C            (Nexperia/onsemi)
 *    FZT851   SOT-223  pad 1 B · 2 C · 3 E · tab C    (Diodes Inc.)
 *    MCP73831 SOT-23-5 1 STAT · 2 VSS · 3 VBAT · 4 VDD · 5 PROG (Microchip)
 *    ATtiny85 SOIC-8   1 PB5/RESET · 2 PB3 · 3 PB4 · 4 GND · 5 PB0 · 6 PB1 ·
 *                      7 PB2 · 8 VCC                  (Microchip)
 *    SS14 / SMCJ33A    SMA / SMC, cathode = the banded end (pad on the left)
 *
 *  Diode and LED pads carry both names (pin1 + "anode", pin2 + "cathode"):
 *  without the names tscircuit can't draw their schematic symbols.
 *  Every custom footprint also carries a courtyard, so the design-rule
 *  check catches parts whose bodies would collide.
 * ─────────────────────────────────────────────────────────────────────────
 */
import "@tscircuit/core"
import type { CommonLayoutProps } from "@tscircuit/props"

export interface PartProps extends CommonLayoutProps {
  name: string
}

/** fab rules: standard 2-layer (6 mil traces, 0.3 mm drills, 0.15 mm clearances) */
export const FAB_RULES = {
  minTraceWidth: "0.15mm",
  minTraceToPadEdgeClearance: "0.15mm",
  minPadEdgeToPadEdgeClearance: "0.15mm",
  minViaEdgeToPadEdgeClearance: "0.15mm",
  minBoardEdgeClearance: "0.4mm",
  minViaHoleDiameter: "0.3mm",
  minViaPadDiameter: "0.6mm",
  pcbStyle: { viaHoleDiameter: "0.3mm", viaPadDiameter: "0.6mm" },
} as const

/* SOT-23 pad positions (IPC nominal, same as tscircuit's "sot23") */
const SOT23 = { p1: { x: -1.137, y: 0.95 }, p2: { x: -1.137, y: -0.95 }, p3: { x: 1.137, y: 0 }, w: 1.325, h: 0.6 }
const Sot23Outline = () => (
  <>
    <silkscreenpath route={[{ x: -0.3, y: 1.55 }, { x: 0.7, y: 1.55 }, { x: 0.7, y: 0.6 }]} />
    <silkscreenpath route={[{ x: -0.3, y: -1.55 }, { x: 0.7, y: -1.55 }, { x: 0.7, y: -0.6 }]} />
    <courtyardrect pcbX={0} pcbY={0} width={3.9} height={3.6} />
  </>
)

/* ── ATtiny85 (SOIC-8): the lighter's brain ─────────────────────────────── */
export const Attiny85 = (props: PartProps) => (
  <chip
    {...props}
    manufacturerPartNumber="ATTINY85-20SU"
    footprint="soic8"
    pinLabels={{ pin1: "RESET", pin2: "PB3", pin3: "PB4", pin4: "GND", pin5: "PB0", pin6: "PB1", pin7: "PB2", pin8: "VCC" }}
    schPinArrangement={{
      leftSide: { direction: "top-to-bottom", pins: ["VCC", "RESET", "PB3", "PB4", "GND"] },
      rightSide: { direction: "top-to-bottom", pins: ["PB0", "PB1", "PB2"] },
    }}
  />
)

/* ── MCP73831: single-cell Li-ion/LiPo linear charger (SOT-23-5) ─────────── */
export const Mcp73831 = (props: PartProps) => (
  <chip
    {...props}
    manufacturerPartNumber="MCP73831T-2ACI/OT"
    footprint="sot25"
    pinLabels={{ pin1: "STAT", pin2: "VSS", pin3: "VBAT", pin4: "VDD", pin5: "PROG" }}
    schPinArrangement={{
      leftSide: { direction: "top-to-bottom", pins: ["VDD", "PROG", "VSS"] },
      rightSide: { direction: "top-to-bottom", pins: ["VBAT", "STAT"] },
    }}
  />
)

/* ── AO3401: P-channel MOSFET, the arc power switch (SOT-23) ─────────────── */
export const Ao3401 = (props: PartProps) => (
  <mosfet
    {...props}
    channelType="p"
    mosfetMode="enhancement"
    manufacturerPartNumber="AO3401A"
    footprint={
      <footprint>
        <smtpad portHints={["pin3"]} pcbX={SOT23.p1.x} pcbY={SOT23.p1.y} width={SOT23.w} height={SOT23.h} shape="rect" />
        <smtpad portHints={["pin2"]} pcbX={SOT23.p2.x} pcbY={SOT23.p2.y} width={SOT23.w} height={SOT23.h} shape="rect" />
        <smtpad portHints={["pin1"]} pcbX={SOT23.p3.x} pcbY={SOT23.p3.y} width={SOT23.w} height={SOT23.h} shape="rect" />
        <Sot23Outline />
      </footprint>
    }
  />
)

/* ── BC847: small NPN, the peak-current limiter (SOT-23) ─────────────────── */
export const Bc847 = (props: PartProps) => (
  <transistor
    {...props}
    type="npn"
    manufacturerPartNumber="BC847B"
    footprint={
      <footprint>
        <smtpad portHints={["pin2"]} pcbX={SOT23.p1.x} pcbY={SOT23.p1.y} width={SOT23.w} height={SOT23.h} shape="rect" />
        <smtpad portHints={["pin3"]} pcbX={SOT23.p2.x} pcbY={SOT23.p2.y} width={SOT23.w} height={SOT23.h} shape="rect" />
        <smtpad portHints={["pin1"]} pcbX={SOT23.p3.x} pcbY={SOT23.p3.y} width={SOT23.w} height={SOT23.h} shape="rect" />
        <Sot23Outline />
      </footprint>
    }
  />
)

/* ── FZT851: 60 V / 6 A NPN, the coil switch (SOT-223) ─────────────────────
 * Pads 1-3 on the left (B, C, E), the big collector tab on the right — the
 * tab is the heat path, so the board gives it a generous copper area. */
export const Fzt851 = (props: PartProps) => (
  <transistor
    {...props}
    type="npn"
    manufacturerPartNumber="FZT851TA"
    footprint={
      <footprint>
        <smtpad portHints={["pin2"]} pcbX={-3.15} pcbY={2.3} width={2} height={1.5} shape="rect" />
        <smtpad portHints={["pin1"]} pcbX={-3.15} pcbY={0} width={2} height={1.5} shape="rect" />
        <smtpad portHints={["pin3"]} pcbX={-3.15} pcbY={-2.3} width={2} height={1.5} shape="rect" />
        <smtpad portHints={["pin1"]} pcbX={3.15} pcbY={0} width={2} height={3.8} shape="rect" />
        <silkscreenpath route={[{ x: -1.7, y: 3.6 }, { x: 1.7, y: 3.6 }]} />
        <silkscreenpath route={[{ x: -1.7, y: -3.6 }, { x: 1.7, y: -3.6 }]} />
        <courtyardrect pcbX={0} pcbY={0} width={8.9} height={7.6} />
      </footprint>
    }
  />
)

/* ── polarised two-terminal SMD parts: cathode pad on the left, banded ───── */
const cathodeLeft = (padX: number, padW: number, padH: number, cyW: number, cyH: number) => (
  <footprint>
    <smtpad portHints={["pin2", "cathode"]} pcbX={-padX} pcbY={0} width={padW} height={padH} shape="rect" />
    <smtpad portHints={["pin1", "anode"]} pcbX={padX} pcbY={0} width={padW} height={padH} shape="rect" />
    {/* cathode bar beside the cathode pad */}
    <silkscreenpath route={[{ x: -padX - padW / 2 - 0.35, y: padH / 2 }, { x: -padX - padW / 2 - 0.35, y: -padH / 2 }]} />
    <courtyardrect pcbX={0} pcbY={0} width={cyW} height={cyH} />
  </footprint>
)

/** SS14: 1 A / 40 V Schottky (SMA) */
export const SchottkySma = (props: PartProps & { mpn?: string }) => (
  <diode {...props} manufacturerPartNumber={props.mpn ?? "SS14"} footprint={cathodeLeft(2.0, 2.5, 1.8, 7.4, 3.2)} />
)

/** SMCJ33A: 1500 W unidirectional TVS (SMC). It clamps the coil's leakage
 *  spike every cycle (simulated: up to ≈2.7 W while arcing), so it gets the
 *  big package — 6.5 W steady-state rating, ≈3× an SMB's thermal mass — with
 *  its anode on the ground pour. */
export const TvsSmc = (props: PartProps & { mpn?: string }) => (
  <diode {...props} manufacturerPartNumber={props.mpn ?? "SMCJ33A"} footprint={cathodeLeft(3.4, 2.5, 3.3, 9.8, 6.4)} />
)

/** 0805 indicator LED (anode = pin1 on the right, cathode bar on the left) */
export const Led0805 = (props: PartProps & { color: string; mpn?: string }) => (
  <led {...props} manufacturerPartNumber={props.mpn} footprint={cathodeLeft(0.95, 1.0, 1.25, 3.4, 1.9)} />
)

/* ── wire pads: battery, lock switch, fire button and coil leads ────────────
 * A lighter is built into a case: the cell, the slide lock, the button and
 * the high-voltage coil are wired, not board-mounted. 1.0 mm holes take
 * 24-28 AWG wire; the 2.0 mm pads leave a 0.5 mm ring for an easy joint. */
export const WirePad = (props: PartProps & { label: string }) => (
  <chip
    {...props}
    pinLabels={{ pin1: props.label }}
    footprint={
      <footprint>
        <platedhole portHints={[props.label]} pcbX={0} pcbY={0} holeDiameter={1.0} outerDiameter={2.0} shape="circle" />
        <courtyardcircle pcbX={0} pcbY={0} radius={1.25} />
      </footprint>
    }
  />
)

/* ── AVR ISP header, 2×3 on 2.54 mm (standard AVR pinout, pin 1 square) ─────
 *    1 MISO  2 VCC
 *    3 SCK   4 MOSI
 *    5 RESET 6 GND
 *  (The square pin-1 pad spells out holeShape/padShape/holeOffset: without
 *  the offsets tscircuit's connectivity check computes a NaN pad outline.) */
export const IspHeader = (props: PartProps) => (
  <chip
    {...props}
    pinLabels={{ pin1: "MISO", pin2: "VCC", pin3: "SCK", pin4: "MOSI", pin5: "RESET", pin6: "GND" }}
    footprint={
      <footprint>
        <platedhole portHints={["MISO"]} pcbX={-2.54} pcbY={1.27} holeDiameter={1.0} rectPadWidth={1.7} rectPadHeight={1.7} holeShape="circle" padShape="rect" holeOffsetX={0} holeOffsetY={0} shape="circular_hole_with_rect_pad" />
        <platedhole portHints={["VCC"]} pcbX={-2.54} pcbY={-1.27} holeDiameter={1.0} outerDiameter={1.7} shape="circle" />
        <platedhole portHints={["SCK"]} pcbX={0} pcbY={1.27} holeDiameter={1.0} outerDiameter={1.7} shape="circle" />
        <platedhole portHints={["MOSI"]} pcbX={0} pcbY={-1.27} holeDiameter={1.0} outerDiameter={1.7} shape="circle" />
        <platedhole portHints={["RESET"]} pcbX={2.54} pcbY={1.27} holeDiameter={1.0} outerDiameter={1.7} shape="circle" />
        <platedhole portHints={["GND"]} pcbX={2.54} pcbY={-1.27} holeDiameter={1.0} outerDiameter={1.7} shape="circle" />
        <silkscreenpath route={[{ x: -4.0, y: 2.7 }, { x: 4.0, y: 2.7 }, { x: 4.0, y: -2.7 }, { x: -4.0, y: -2.7 }, { x: -4.0, y: 2.7 }]} />
        <courtyardrect pcbX={0} pcbY={0} width={8.4} height={5.8} />
      </footprint>
    }
    schPinArrangement={{
      leftSide: { direction: "top-to-bottom", pins: ["MISO", "SCK", "RESET"] },
      rightSide: { direction: "top-to-bottom", pins: ["VCC", "MOSI", "GND"] },
    }}
  />
)
