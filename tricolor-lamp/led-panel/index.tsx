/**
 * ═════════════════════════════════════════════════════════════════════════
 *  TRI-COLOR LAMP · LED PANEL — designed in tscircuit
 * ═════════════════════════════════════════════════════════════════════════
 *  Run with:   tsci dev led-panel/index.tsx
 *
 *  60 × 5 mm LEDs in three colours, run from 12 V:
 *    BLUE    6 strings × 3 LEDs, 150 Ω each   ≈ 15 mA per string, ≈ 92 mA total
 *    WHITE   6 strings × 3 LEDs, 150 Ω each   ≈ 15 mA per string, ≈ 92 mA total
 *    YELLOW  6 strings × 4 LEDs, 220 Ω each   ≈ 16 mA per string, ≈ 95 mA total
 *
 *  WHY STRINGS AND RESISTORS
 *  An LED needs a fixed forward voltage (≈ 3.1 V blue/white, ≈ 2.1 V
 *  yellow) and then its current rises steeply — so you never connect one
 *  straight to a supply. Putting 3 (or 4) in series uses most of the 12 V
 *  doing light; the resistor drops the rest and sets the current:
 *      I = (V_supply − n · V_f) / R   →  (11.6 − 3 × 3.1) / 150 Ω ≈ 15 mA
 *  (11.6 V: the controller's protection diode takes ≈ 0.4 V.) Six strings
 *  in parallel per colour give the brightness; each string has its own
 *  resistor so the strings share current fairly.
 *
 *  HOW IT CONNECTS
 *  Every string's resistor hangs from +12 V (a copper pour on the bottom
 *  layer feeds all 18 of them). The far end of each colour's strings comes
 *  back to J1, where the controller's MOSFET for that colour switches it
 *  to ground: common anode, switched cathodes — the same wiring as 12 V
 *  "RGB" LED strip.
 *
 *  The 18 resistors are 0207-size metal film rated 0.6 W (e.g. Vishay
 *  MBB0207): they stand upright and dissipate up to ≈ 0.13 W each.
 *
 *  The rows start with a different colour each (B W Y / W Y B / Y B W …)
 *  so each colour is spread across the whole panel and mixes evenly.
 * ═════════════════════════════════════════════════════════════════════════
 */
import "@tscircuit/core"
import { Fragment } from "react"
import { Led5mm, ResistorAxial, ScrewTerminal, MountingHole, FAB_RULES } from "../lib/parts"

type Color = "BLUE" | "WHITE" | "YELLOW"
const STRING: Record<Color, { count: number; ohms: string; ledColor: string }> = {
  BLUE: { count: 3, ohms: "150ohm", ledColor: "blue" },
  WHITE: { count: 3, ohms: "150ohm", ledColor: "white" },
  YELLOW: { count: 4, ohms: "220ohm", ledColor: "yellow" },
}
const ROW_ORDER: Color[][] = [
  ["BLUE", "WHITE", "YELLOW"],
  ["WHITE", "YELLOW", "BLUE"],
  ["YELLOW", "BLUE", "WHITE"],
  ["BLUE", "WHITE", "YELLOW"],
  ["WHITE", "YELLOW", "BLUE"],
  ["YELLOW", "BLUE", "WHITE"],
]
const LED_PITCH = 7.62 // 0.3": 5 mm LEDs with room between them
const R_TO_LED = 6.0 // standing resistor → first LED of its string
const LED_TO_R = 6.8 // last LED of a string → next string's resistor
const ROW_PITCH = 8.0
const RAIL = 4.0 // the +12 V rail runs this far above each row (between the rows)
const X0 = -44
const Y0 = 23

/** every part position in one place, so the board and its traces agree */
const layout = ROW_ORDER.map((order, row) => {
  const y = Y0 - row * ROW_PITCH
  let x = X0
  return order.map((c, k) => {
    const s = STRING[c]
    const n = k + 1 + row * 3 // string number 1..18
    const res = { name: `R${n}`, x }
    const leds = Array.from({ length: s.count }, (_, i) => ({ name: `D${n}${String.fromCharCode(97 + i)}`, x: x + R_TO_LED + i * LED_PITCH }))
    x = leds[leds.length - 1].x + LED_TO_R
    return { net: c, y, res, leds, ohms: s.ohms, ledColor: s.ledColor }
  })
})

export default () => (
  <board width="100mm" height="64mm" name="tricolor-led-panel" {...FAB_RULES}>
    {layout.flat().map((st, i) => (
      <Fragment key={st.res.name}>
        <ResistorAxial name={st.res.name} resistance={st.ohms} pitch={2.54} pcbX={st.res.x} pcbY={st.y} schX={-12 + (i % 3) * 9} schY={10 - Math.floor(i / 3) * 3} />
        {st.leds.map((d, j) => (
          <Led5mm key={d.name} name={d.name} color={st.ledColor} pcbX={d.x} pcbY={st.y} schX={-10 + (i % 3) * 9 + j * 1.6} schY={10 - Math.floor(i / 3) * 3} />
        ))}
        <trace from={`.${st.res.name} > .pin2`} to={`.${st.leds[0].name} > .anode`} />
        {st.leds.slice(1).map((d, j) => (
          <Fragment key={d.name}>
            <trace from={`.${st.leds[j].name} > .cathode`} to={`.${d.name} > .anode`} />
          </Fragment>
        ))}
        <trace from={`.${st.leds[st.leds.length - 1].name} > .cathode`} to={`net.${st.net}_N`} />
      </Fragment>
    ))}

    {/* +12 V, hand-routed (pcbPath waypoints are relative to the starting
        part's centre): a rail 4 mm above each row links its three
        resistors, a spine down the left edge links the rows, and one feed
        runs to J1. Drawn by hand so the autorouter only has the short LED
        links and the three colour returns left to place. */}
    {layout.map((row, r) => (
      <Fragment key={`rail${r}`}>
        {row.slice(1).map((st, k) => (
          <Fragment key={st.res.name}>
            <trace from={`.${row[k].res.name} > .pin1`} to={`.${st.res.name} > .pin1`} width="0.6mm"
              pcbPath={[{ x: -1.27, y: RAIL }, { x: st.res.x - row[k].res.x - 1.27, y: RAIL }, `.${st.res.name} > .pin1`]} />
          </Fragment>
        ))}
        {r > 0 && <trace from={`.${layout[r - 1][0].res.name} > .pin1`} to={`.${row[0].res.name} > .pin1`} width="0.6mm" pcbPath={[`.${row[0].res.name} > .pin1`]} />}
      </Fragment>
    ))}
    <trace from={`.${layout[5][0].res.name} > .pin1`} to=".J1 > .V12IN" width="0.6mm"
      pcbPath={[{ x: -1.27, y: -5.5 }, { x: -7.62 - layout[5][0].res.x, y: -5.5 }, ".J1 > .V12IN"]} />
    {layout.flat().map((st) => <Fragment key={`v${st.res.name}`}><trace from={`.${st.res.name} > .pin1`} to="net.V12" /></Fragment>)}

    {/* J1: the 4-wire cable from the controller's J4, pin for pin */}
    <ScrewTerminal name="J1" labels={["V12IN", "BLUE", "WHITE", "YELLOW"]} pcbX={0} pcbY={-26.6} schX={-16} schY={0} />
    <trace from=".J1 > .V12IN" to="net.V12" />
    <trace from=".J1 > .BLUE" to="net.BLUE_N" width="0.6mm" />
    <trace from=".J1 > .WHITE" to="net.WHITE_N" width="0.6mm" />
    <trace from=".J1 > .YELLOW" to="net.YELLOW_N" width="0.6mm" />

    <MountingHole name="H1" pcbX={-46} pcbY={-28} />
    <MountingHole name="H2" pcbX={46} pcbY={-28} />
    <MountingHole name="H3" pcbX={-46} pcbY={29.5} />
    <MountingHole name="H4" pcbX={46} pcbY={29.5} />
    <silkscreentext text="+12V  BLUE  WHITE  YELLOW" pcbX={0} pcbY={-21.4} fontSize="1mm" />
    <silkscreentext text="TRI-COLOR LAMP - LED PANEL" pcbX={-30} pcbY={-28.6} fontSize="1.1mm" />
    <copperpour connectsTo="net.V12" layer="bottom" padMargin="0.4mm" boardEdgeMargin="0.5mm" useThermalReliefs />
  </board>
)
