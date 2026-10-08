/**
 * render.mjs — render both fm-radio-lab boards to PCB + schematic SVGs.
 * Output: render-tx-pcb.svg, render-tx-schematic.svg,
 *         render-rx-pcb.svg, render-rx-schematic.svg
 */
import { Circuit } from "@tscircuit/core"
import { createElement } from "react"
import { circuitJsonToPcbSvg, circuitJsonToSchematicSvg } from "circuit-to-svg"
import { writeFileSync } from "fs"

const boards = [
  { key: "tx", module: "./dist/transmitter/index.js" },
  { key: "rx", module: "./dist/receiver/index.js" },
]

for (const b of boards) {
  const Board = (await import(b.module)).default
  const circuit = new Circuit()
  circuit.add(createElement(Board))
  await circuit.renderUntilSettled()
  const json = circuit.getCircuitJson()

  const pcbSvg = circuitJsonToPcbSvg(json)
  writeFileSync(`render-${b.key}-pcb.svg`, pcbSvg)
  console.log(`[${b.key}] PCB SVG written: ${pcbSvg.length} bytes`)

  const schSvg = circuitJsonToSchematicSvg(json)
  writeFileSync(`render-${b.key}-schematic.svg`, schSvg)
  console.log(`[${b.key}] schematic SVG written: ${schSvg.length} bytes`)
}
