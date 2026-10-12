/**
 * render.mjs — render the arc lighter board to PCB + schematic SVG and PNG.
 * Output: render-pcb.svg/.png, render-schematic.svg/.png   (run `npm run build` first)
 */
import { Circuit } from "@tscircuit/core"
import { createElement } from "react"
import { circuitJsonToPcbSvg, circuitJsonToSchematicSvg } from "circuit-to-svg"
import { Resvg } from "@resvg/resvg-js"
import { writeFileSync } from "fs"

const Board = (await import("./dist/board/index.js")).default
const circuit = new Circuit()
circuit.add(createElement(Board))
await circuit.renderUntilSettled()
const json = circuit.getCircuitJson()
for (const [kind, svg, width, bg] of [["pcb", circuitJsonToPcbSvg(json), 2400, "#000000"], ["schematic", circuitJsonToSchematicSvg(json), 3600, "#ffffff"]]) {
  writeFileSync(`render-${kind}.svg`, svg)
  const png = new Resvg(svg, { fitTo: { mode: "width", value: width }, background: bg }).render().asPng()
  writeFileSync(`render-${kind}.png`, png)
  console.log(`render-${kind}: ${(svg.length / 1024).toFixed(0)} KB svg, ${(png.length / 1024).toFixed(0)} KB png`)
}
