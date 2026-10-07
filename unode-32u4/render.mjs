/**
 * render.mjs — render the μNode32U4 circuit JSON to PCB + schematic SVGs,
 * then convert to PNG for the tutorial PDF.
 */
import { Circuit } from "@tscircuit/core"
import { createElement } from "react"
import { circuitJsonToPcbSvg, circuitJsonToSchematicSvg } from "circuit-to-svg"
import { writeFileSync } from "fs"

const Board = (await import("./dist/index.js")).default

const circuit = new Circuit()
circuit.add(createElement(Board))
await circuit.renderUntilSettled()
const json = circuit.getCircuitJson()

const pcbSvg = circuitJsonToPcbSvg(json)
writeFileSync("render-pcb.svg", pcbSvg)
console.log("PCB SVG written:", pcbSvg.length, "bytes")

const schSvg = circuitJsonToSchematicSvg(json)
writeFileSync("render-schematic.svg", schSvg)
console.log("Schematic SVG written:", schSvg.length, "bytes")

// Also save the circuit json for the project
writeFileSync("circuit.json", JSON.stringify(json, null, 2))
console.log("circuit.json written:", json.length, "elements")
