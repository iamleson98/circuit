/** render.mjs — render one of the repo's real boards (from its dist/ build)
 * to circuit JSON. No side effects; shared by the harness runner, the
 * inspector and the testbenches. */
import { Circuit } from "@tscircuit/core"
import { createElement } from "react"

export async function renderBoard(file) {
  const mod = await import(file)
  const Board = mod.default
  const circuit = new Circuit()
  circuit.add(createElement(Board))
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}

export const BOARDS = [
  { id: "arc-lighter", project: "arc-lighter", file: "dist/board/index.js" },
  { id: "radio-lab-rx", project: "radio-lab", file: "dist/receiver/index.js" },
  { id: "radio-lab-tx", project: "radio-lab", file: "dist/transmitter/index.js" },
  { id: "fm-radio-lab-rx", project: "fm-radio-lab", file: "dist/receiver/index.js" },
  { id: "fm-radio-lab-tx", project: "fm-radio-lab", file: "dist/transmitter/index.js" },
  { id: "tricolor-controller", project: "tricolor-lamp", file: "dist/controller/index.js" },
  { id: "tricolor-led-panel", project: "tricolor-lamp", file: "dist/led-panel/index.js" },
  { id: "unode-32u4", project: "unode-32u4", file: "dist/index.js" },
]
