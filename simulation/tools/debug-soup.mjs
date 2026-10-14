/** Debug: dump raw simulation soup elements + the generated SPICE netlist. */
import { Circuit } from "@tscircuit/core"
import { createElement } from "react"
import createNgspiceSpiceEngine from "@tscircuit/ngspice-spice-engine"
import { readdirSync } from "node:fs"
import { join, basename, extname } from "node:path"

const DIST = new URL("../dist/circuits", import.meta.url).pathname
const file = join(DIST, `${process.argv[2] ?? "01-rc-lowpass"}.js`)

const Board = (await import(file)).default
const engine = await createNgspiceSpiceEngine()
const circuit = new Circuit({ platform: { spiceEngineMap: { ngspice: engine } } })
circuit.add(createElement(Board))
await circuit.renderUntilSettled()
const soup = circuit.getCircuitJson()

for (const el of soup) {
  if (el.type.startsWith("simulation_")) {
    console.log(JSON.stringify(el, null, 2).slice(0, 2500))
    console.log("---")
  }
}
