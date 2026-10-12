/**
 * ─────────────────────────────────────────────────────────────────────────
 *  lib/ferrite-bead.tsx — 0603 chip ferrite bead
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  tscircuit has no dedicated ferrite-bead element, and modelling a bead as
 *  an <inductor> puts a misleading "µH" value on the schematic and BOM. A
 *  bead is specified by its IMPEDANCE at 100 MHz (and its DC resistance and
 *  current rating), so it is described here as a two-pin part carrying its
 *  real manufacturer part number.
 *
 *  Default part: Murata BLM18PG221SN1D — 220 Ω @ 100 MHz, 0603, low DCR.
 *  Any 0603 bead of 120-600 Ω @ 100 MHz with DCR ≤ 0.3 Ω and ≥ 200 mA rating
 *  works for the ATmega32U4's AVCC pins (they draw well under 10 mA).
 */
import "@tscircuit/core"
import type { CommonLayoutProps } from "@tscircuit/props"

export interface FerriteBeadProps extends CommonLayoutProps {
  name: string
  manufacturerPartNumber?: string
}

export const FerriteBead = ({ manufacturerPartNumber = "BLM18PG221SN1D", ...props }: FerriteBeadProps) => (
  <chip
    {...props}
    footprint="0603"
    manufacturerPartNumber={manufacturerPartNumber}
    pinLabels={{ pin1: "IN", pin2: "OUT" }}
    schPinArrangement={{
      leftSide: { direction: "top-to-bottom", pins: ["IN"] },
      rightSide: { direction: "top-to-bottom", pins: ["OUT"] },
    }}
  />
)
