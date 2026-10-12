/**
 * render.mjs — render both tri-color lamp boards to PCB + schematic SVG and PNG.
 * Output: render-<board>-pcb.svg/.png, render-<board>-schematic.svg/.png  (run `npm run build` first)
 */
import { Circuit } from "@tscircuit/core"
import { createElement } from "react"
import { circuitJsonToPcbSvg, circuitJsonToSchematicSvg } from "circuit-to-svg"
import { Resvg } from "@resvg/resvg-js"
import { writeFileSync } from "fs"

for (const key of ["controller", "led-panel"]) {
  const Board = (await import(`./dist/${key}/index.js`)).default
  const circuit = new Circuit()
  circuit.add(createElement(Board))
  await circuit.renderUntilSettled()
  const json = circuit.getCircuitJson()
  for (const [kind, svg, width, bg] of [["pcb", circuitJsonToPcbSvg(json), 2400, "#000000"], ["schematic", circuitJsonToSchematicSvg(json), 3600, "#ffffff"]]) {
    writeFileSync(`render-${key}-${kind}.svg`, svg)
    const png = new Resvg(svg, { fitTo: { mode: "width", value: width }, background: bg }).render().asPng()
    writeFileSync(`render-${key}-${kind}.png`, png)
    console.log(`render-${key}-${kind}: ${(png.length / 1024).toFixed(0)} KB png`)
  }
}
