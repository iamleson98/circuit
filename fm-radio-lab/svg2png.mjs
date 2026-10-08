// svg2png.mjs — convert render SVGs to PNG via resvg (no browser needed)
import { Resvg } from "@resvg/resvg-js"
import { readFileSync, writeFileSync } from "fs"

const jobs = [
  ["render-tx-pcb.svg", "render-tx-pcb.png", 2400],
  ["render-tx-schematic.svg", "render-tx-schematic.png", 4200],
  ["render-rx-pcb.svg", "render-rx-pcb.png", 2600],
  ["render-rx-schematic.svg", "render-rx-schematic.png", 4600],
]

for (const [svgPath, pngPath, width] of jobs) {
  const svg = readFileSync(svgPath, "utf8")
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width }, background: "#ffffff" })
  const buf = resvg.render().asPng()
  writeFileSync(pngPath, buf)
  console.log(`${pngPath}: ${(buf.length / 1024).toFixed(0)} KB`)
}
