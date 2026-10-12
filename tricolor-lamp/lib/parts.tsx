/**
 * ─────────────────────────────────────────────────────────────────────────
 *  lib/parts.tsx — the tri-color lamp's parts (all through-hole)
 * ─────────────────────────────────────────────────────────────────────────
 *  Every part with a polarity or a non-standard lead gets a footprint
 *  written out here, each pad tagged with the tscircuit pin it is and
 *  checked against the datasheet pinout:
 *
 *    IRLZ44N  TO-220   1 GATE · 2 DRAIN · 3 SOURCE (tab = drain)   (Infineon)
 *    78L05    TO-92    1 OUTPUT · 2 GND · 3 INPUT (flat face toward you) (TI LM78L05ACZ)
 *    ATtiny85 DIP-8    1 PB5/RESET · 2 PB3 · 3 PB4 · 4 GND · 5 PB0 · 6 PB1 · 7 PB2 · 8 VCC
 *    LEDs     5 mm     long lead = anode; the flat on the rim marks the cathode
 *    diodes   axial    the band marks the cathode
 *
 *  tscircuit's own pin order is MOSFET 1 drain · 2 source · 3 gate, and
 *  diode/LED 1 anode · 2 cathode (their pads carry both names, or tscircuit
 *  can't draw the schematic symbol); a stock "to220" string would therefore put
 *  the gate where the drain goes. Holes are sized for the real leads (lead
 *  + 0.2 mm or more): 1.0 mm for 5 mm LEDs (0.5 mm square leads = 0.71 mm
 *  corner to corner), 0.9 mm for ¼ W resistors and small capacitors,
 *  1.1 mm for DO-41 diodes and the fuse, 1.2 mm for TO-220 legs.
 *  Every footprint carries a courtyard so the design-rule check catches
 *  parts whose bodies would collide.
 * ─────────────────────────────────────────────────────────────────────────
 */
import "@tscircuit/core"
import { Fragment } from "react"
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

const hole = (hint: string | string[], x: number, y: number, d: number, pad: number, square = false) =>
  square ? (
    <platedhole portHints={Array.isArray(hint) ? hint : [hint]} pcbX={x} pcbY={y} holeDiameter={d} rectPadWidth={pad} rectPadHeight={pad} holeShape="circle" padShape="rect" holeOffsetX={0} holeOffsetY={0} shape="circular_hole_with_rect_pad" />
  ) : (
    <platedhole portHints={Array.isArray(hint) ? hint : [hint]} pcbX={x} pcbY={y} holeDiameter={d} outerDiameter={pad} shape="circle" />
  )

/* ── ATtiny85-20PU (DIP-8, in a socket) ─────────────────────────────────── */
export const Attiny85Dip = (props: PartProps) => (
  <chip
    {...props}
    manufacturerPartNumber="ATTINY85-20PU"
    footprint="dip8"
    pinLabels={{ pin1: "RESET", pin2: "PB3", pin3: "PB4", pin4: "GND", pin5: "PB0", pin6: "PB1", pin7: "PB2", pin8: "VCC" }}
    schPinArrangement={{
      leftSide: { direction: "top-to-bottom", pins: ["VCC", "RESET", "PB3", "PB2", "GND"] },
      rightSide: { direction: "top-to-bottom", pins: ["PB0", "PB1", "PB4"] },
    }}
  />
)

/* ── IRLZ44N logic-level N-MOSFET (TO-220, standing up) ─────────────────────
 * 55 V, 47 A, R_DS(on) ≤ 25 mΩ at V_GS = 5 V: fully on from the ATtiny's
 * 4.3 V. Huge overkill for 0.1 A of LEDs — and exactly why it needs no
 * heatsink up to 2 A of LED strip. */
export const LogicMosfetTo220 = (props: PartProps) => (
  <mosfet
    {...props}
    channelType="n"
    mosfetMode="enhancement"
    manufacturerPartNumber="IRLZ44NPBF"
    footprint={
      <footprint>
        {hole("pin3", -2.54, 0, 1.2, 2.0, true)}
        {hole("pin1", 0, 0, 1.2, 2.0)}
        {hole("pin2", 2.54, 0, 1.2, 2.0)}
        {/* body outline: the metal tab side is +Y */}
        <silkscreenpath route={[{ x: -5.2, y: -1.6 }, { x: 5.2, y: -1.6 }, { x: 5.2, y: 3.0 }, { x: -5.2, y: 3.0 }, { x: -5.2, y: -1.6 }]} />
        <silkscreenpath route={[{ x: -5.2, y: 2.0 }, { x: 5.2, y: 2.0 }]} />
        <courtyardrect pcbX={0} pcbY={0.7} width={10.9} height={5.2} />
      </footprint>
    }
  />
)

/* ── 78L05 regulator (TO-92, in line) ──────────────────────────────────────
 * Pads carry their pin numbers, not names: a regulator is a plain chip
 * here. OUT · GND · IN, flat face toward −Y. */
export const Reg78L05 = (props: PartProps) => (
  <chip
    {...props}
    manufacturerPartNumber="LM78L05ACZ"
    pinLabels={{ pin1: "OUT", pin2: "GND", pin3: "IN" }}
    footprint={
      <footprint>
        <platedhole portHints={["OUT"]} shape="pill" pcbX={-2.54} pcbY={0} outerWidth={1.2} outerHeight={1.8} holeWidth={0.8} holeHeight={0.8} />
        <platedhole portHints={["GND"]} shape="pill" pcbX={0} pcbY={0} outerWidth={1.2} outerHeight={1.8} holeWidth={0.8} holeHeight={0.8} />
        <platedhole portHints={["IN"]} shape="pill" pcbX={2.54} pcbY={0} outerWidth={1.2} outerHeight={1.8} holeWidth={0.8} holeHeight={0.8} />
        <silkscreenpath route={[{ x: -2.2, y: -1.6 }, { x: 2.2, y: -1.6 }]} />
        <silkscreenpath route={[40, 60, 80, 100, 120, 140].map((a) => ({ x: 2.5 * Math.cos((a * Math.PI) / 180), y: 2.5 * Math.sin((a * Math.PI) / 180) }))} />
        <courtyardrect pcbX={0} pcbY={0.45} width={6.8} height={4.6} />
      </footprint>
    }
    schPinArrangement={{ leftSide: { direction: "top-to-bottom", pins: ["IN"] }, rightSide: { direction: "top-to-bottom", pins: ["OUT", "GND"] } }}
  />
)

/* ── 5 mm LED: anode = pin1 (round pad, long lead), cathode = pin2 (square
 * pad, the flat on the rim). 1.0 mm holes take the 0.5 mm square leads
 * (0.71 mm corner to corner) with the usual 0.2 mm to spare. ── */
export const Led5mm = (props: PartProps & { color: string; mpn?: string }) => (
  <led
    {...props}
    manufacturerPartNumber={props.mpn}
    footprint={
      <footprint>
        {hole(["pin1", "anode"], -1.27, 0, 1.0, 1.7)}
        {hole(["pin2", "cathode"], 1.27, 0, 1.0, 1.7, true)}
        {/* the 5.8 mm rim with its flat on the cathode side */}
        <silkscreenpath route={Array.from({ length: 31 }, (_, i) => { const a = (-60 + (300 * i) / 30) * (Math.PI / 180); return { x: -2.9 * Math.cos(a) + 0, y: 2.9 * Math.sin(a) } })} />
        <silkscreenpath route={[{ x: 1.45, y: 2.51 }, { x: 1.45, y: -2.51 }]} />
        <courtyardcircle pcbX={0} pcbY={0} radius={3.15} />
      </footprint>
    }
  />
)

/* ── axial resistor, ¼ W: flat (pitch 7.62 / 10.16) or standing (2.54) ───── */
export const ResistorAxial = (props: PartProps & { resistance: string; pitch?: number }) => {
  const p = props.pitch ?? 10.16
  const standing = p < 5
  return (
    <resistor
      {...props}
      resistance={props.resistance}
      footprint={
        <footprint>
          {hole("pin1", -p / 2, 0, 0.9, 1.7)}
          {hole("pin2", p / 2, 0, 0.9, 1.7)}
          {standing ? (
            <silkscreencircle pcbX={-p / 2} pcbY={0} radius={1.35} />
          ) : (
            <silkscreenpath route={[{ x: -3.2, y: -1.25 }, { x: 3.2, y: -1.25 }, { x: 3.2, y: 1.25 }, { x: -3.2, y: 1.25 }, { x: -3.2, y: -1.25 }]} />
          )}
          {standing ? <courtyardrect pcbX={-0.4} pcbY={0} width={p + 3.3} height={3.3} /> : <courtyardrect pcbX={0} pcbY={0} width={p + 2.2} height={3.0} />}
        </footprint>
      }
    />
  )
}

/* ── axial diodes: cathode = pin2 = the banded end (right) ─────────────────── */
const axialDiode = (p: number, d: number, pad: number, bodyW: number, bodyH: number) => (
  <footprint>
    {hole(["pin1", "anode"], -p / 2, 0, d, pad)}
    {hole(["pin2", "cathode"], p / 2, 0, d, pad, true)}
    <silkscreenpath route={[{ x: -bodyW / 2, y: -bodyH / 2 }, { x: bodyW / 2, y: -bodyH / 2 }, { x: bodyW / 2, y: bodyH / 2 }, { x: -bodyW / 2, y: bodyH / 2 }, { x: -bodyW / 2, y: -bodyH / 2 }]} />
    <silkscreenpath route={[{ x: bodyW / 2 - 0.7, y: -bodyH / 2 }, { x: bodyW / 2 - 0.7, y: bodyH / 2 }]} />
    <courtyardrect pcbX={0} pcbY={0} width={p + pad + 0.5} height={Math.max(bodyH, pad) + 0.6} />
  </footprint>
)
/** 1N5819: 1 A / 40 V Schottky, DO-41 (0.8 mm leads → 1.1 mm holes) */
export const Schottky1N5819 = (props: PartProps) => (
  <diode {...props} manufacturerPartNumber="1N5819" footprint={axialDiode(10.16, 1.1, 2.2, 5.6, 2.9)} />
)
/** 1N4148: small-signal diode, DO-35 */
export const Diode1N4148 = (props: PartProps) => (
  <diode {...props} manufacturerPartNumber="1N4148" footprint={axialDiode(7.62, 0.9, 1.7, 4.2, 2.0)} />
)

/* ── ceramic capacitor (radial, 2.54 mm leads), 0.9 mm holes ─────────────── */
export const CeramicCap = (props: PartProps & { capacitance: string }) => (
  <capacitor
    {...props}
    capacitance={props.capacitance}
    footprint={
      <footprint>
        {hole("pin1", -1.27, 0, 0.9, 1.6)}
        {hole("pin2", 1.27, 0, 0.9, 1.6)}
        <silkscreenpath route={[{ x: -2.4, y: -1.35 }, { x: 2.4, y: -1.35 }, { x: 2.4, y: 1.35 }, { x: -2.4, y: 1.35 }, { x: -2.4, y: -1.35 }]} />
        <courtyardrect pcbX={0} pcbY={0} width={5.1} height={3.0} />
      </footprint>
    }
  />
)

/* ── aluminium electrolytic capacitor (radial, polarized) ──────────────────
 * + = pin1: the SQUARE pad, marked "+". The can's stripe (−) goes on the
 * other side. Fitting one backwards can make it burst — check twice. ── */
export const ElectrolyticCap = (props: PartProps & { capacitance: string; diameter: number; pitch: number; mpn?: string }) => {
  const r = props.diameter / 2
  const p = props.pitch
  return (
    <capacitor
      {...props}
      capacitance={props.capacitance}
      polarized
      manufacturerPartNumber={props.mpn}
      footprint={
        <footprint>
          {hole(["pin1", "pos"], -p / 2, 0, 0.9, 1.7, true)}
          {hole(["pin2", "neg"], p / 2, 0, 0.9, 1.7)}
          <silkscreenpath route={Array.from({ length: 49 }, (_, i) => ({ x: (r + 0.15) * Math.cos((i * Math.PI) / 24), y: (r + 0.15) * Math.sin((i * Math.PI) / 24) }))} />
          {/* "+" beside the square pad, inside the outline */}
          <silkscreenpath route={[{ x: -p / 2 - 0.55, y: r * 0.55 }, { x: -p / 2 + 0.55, y: r * 0.55 }]} />
          <silkscreenpath route={[{ x: -p / 2, y: r * 0.55 - 0.55 }, { x: -p / 2, y: r * 0.55 + 0.55 }]} />
          <courtyardcircle pcbX={0} pcbY={0} radius={r + 0.4} />
        </footprint>
      }
    />
  )
}

/* ── resettable fuse (PTC), radial, 5.08 mm lead spacing, 0.81 mm (20 AWG)
 * leads → 1.1 mm holes ─────────────────────────────────────────────────── */
export const PtcFuse = (props: PartProps & { mpn: string }) => (
  <chip
    {...props}
    manufacturerPartNumber={props.mpn}
    pinLabels={{ pin1: "A", pin2: "B" }}
    footprint={
      <footprint>
        {hole("A", -2.54, 0, 1.1, 2.0)}
        {hole("B", 2.54, 0, 1.1, 2.0)}
        <silkscreenpath route={[{ x: -4.0, y: -1.6 }, { x: 4.0, y: -1.6 }, { x: 4.0, y: 1.6 }, { x: -4.0, y: 1.6 }, { x: -4.0, y: -1.6 }]} />
        <courtyardrect pcbX={0} pcbY={0} width={8.6} height={3.8} />
      </footprint>
    }
  />
)

/* ── screw terminals, 5.08 mm pitch (2 or 4 ways), 1.3 mm holes ───────────
 * The wire goes in on the side nearer the pins (the screws are on top).
 * wiresFrom says which edge of the board that opening faces. ──────────── */
export const ScrewTerminal = (props: PartProps & { labels: string[]; wiresFrom?: "top" | "bottom" }) => {
  const n = props.labels.length
  const pins = Object.fromEntries(props.labels.map((l, i) => [`pin${i + 1}`, l]))
  const s = props.wiresFrom === "top" ? -1 : 1 // mirror the body for wires from +Y
  const { wiresFrom: _w, ...rest } = props
  return (
    <chip
      {...rest}
      pinLabels={pins}
      footprint={
        <footprint insertionDirection={props.wiresFrom === "top" ? "from_top" : "from_bottom"}>
          {props.labels.map((l, i) => <Fragment key={l}>{hole(l, (i - (n - 1) / 2) * 5.08, 0, 1.3, 2.5, i === 0)}</Fragment>)}
          <silkscreenpath route={[{ x: -n * 2.54, y: -3.6 * s }, { x: n * 2.54, y: -3.6 * s }, { x: n * 2.54, y: 4.4 * s }, { x: -n * 2.54, y: 4.4 * s }, { x: -n * 2.54, y: -3.6 * s }]} />
          {/* the wire opening */}
          <silkscreenpath route={[{ x: -n * 2.54 + 0.6, y: -3.0 * s }, { x: n * 2.54 - 0.6, y: -3.0 * s }]} />
          <courtyardrect pcbX={0} pcbY={0.4 * s} width={n * 5.08 + 0.5} height={8.6} />
        </footprint>
      }
      schPinArrangement={{ leftSide: { direction: "top-to-bottom", pins: props.labels } }}
    />
  )
}

/* ── AVR ISP header, 2 × 3 on 2.54 mm (standard pinout, pin 1 square) ───────
 *    1 MISO  2 VCC  /  3 SCK  4 MOSI  /  5 RESET  6 GND                     */
export const IspHeader = (props: PartProps) => (
  <chip
    {...props}
    pinLabels={{ pin1: "MISO", pin2: "VCC", pin3: "SCK", pin4: "MOSI", pin5: "RESET", pin6: "GND" }}
    footprint={
      <footprint insertionDirection="from_above">
        {hole("MISO", -2.54, 1.27, 1.0, 1.7, true)}
        {hole("VCC", -2.54, -1.27, 1.0, 1.7)}
        {hole("SCK", 0, 1.27, 1.0, 1.7)}
        {hole("MOSI", 0, -1.27, 1.0, 1.7)}
        {hole("RESET", 2.54, 1.27, 1.0, 1.7)}
        {hole("GND", 2.54, -1.27, 1.0, 1.7)}
        <silkscreenpath route={[{ x: -4.0, y: 2.7 }, { x: 4.0, y: 2.7 }, { x: 4.0, y: -2.7 }, { x: -4.0, y: -2.7 }, { x: -4.0, y: 2.7 }]} />
        <courtyardrect pcbX={0} pcbY={0} width={8.4} height={5.8} />
      </footprint>
    }
    schPinArrangement={{ leftSide: { direction: "top-to-bottom", pins: ["MISO", "SCK", "RESET"] }, rightSide: { direction: "top-to-bottom", pins: ["VCC", "MOSI", "GND"] } }}
  />
)

/* ── 3-pin jumper header: [ GND | MODE | VCC ] ─────────────────────────── */
export const ModeJumper = (props: PartProps) => (
  <chip
    {...props}
    pinLabels={{ pin1: "LO", pin2: "MID", pin3: "HI" }}
    footprint={
      <footprint insertionDirection="from_above">
        {hole("LO", -2.54, 0, 1.0, 1.7, true)}
        {hole("MID", 0, 0, 1.0, 1.7)}
        {hole("HI", 2.54, 0, 1.0, 1.7)}
        <silkscreenpath route={[{ x: -3.9, y: -1.4 }, { x: 3.9, y: -1.4 }, { x: 3.9, y: 1.4 }, { x: -3.9, y: 1.4 }, { x: -3.9, y: -1.4 }]} />
        <courtyardrect pcbX={0} pcbY={0} width={8.2} height={3.2} />
      </footprint>
    }
    schPinArrangement={{ leftSide: { direction: "top-to-bottom", pins: ["LO", "MID", "HI"] } }}
  />
)

/* ── M3 mounting hole (3.2 mm, unplated) with a keep-clear courtyard ─────── */
export const MountingHole = (props: { name: string; pcbX: number; pcbY: number }) => (
  <hole name={props.name} pcbX={props.pcbX} pcbY={props.pcbY} diameter="3.2mm" />
)
