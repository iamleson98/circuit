/** Debug: dump the generated SPICE netlist + raw engine output for a circuit. */
import { Circuit } from "@tscircuit/core"
import { createElement } from "react"
import { createEngine } from "./engine.mjs"
import { join } from "node:path"

const DIST = new URL("../dist/circuits", import.meta.url).pathname
const file = join(DIST, `${process.argv[2] ?? "01-rc-lowpass"}.js`)

const realEngine = await createEngine()
const loggingEngine = {
  simulate: async (spiceString) => {
    console.log("════════ SPICE NETLIST ════════")
    console.log(spiceString)
    console.log("════════════════════════════════")
    const result = await realEngine.simulate(spiceString)
    console.log("engine result keys:", Object.keys(result ?? {}))
    return result
  },
}

const Board = (await import(file)).default
const circuit = new Circuit({
  platform: { spiceEngineMap: { ngspice: loggingEngine } },
})
circuit.add(createElement(Board))
await circuit.renderUntilSettled()
const soup = circuit.getCircuitJson()
const simEls = soup.filter((el) => el.type.startsWith("simulation_"))
console.log(`\nsoup simulation elements: ${simEls.length}`)
for (const el of simEls) {
  console.log(" -", el.type, el.name ?? el.netName ?? "")
}
