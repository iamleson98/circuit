// svg2png.mjs — convert the render SVGs to PNG via Playwright (no WebGPU needed)
import { chromium } from "playwright"
import { readFileSync, writeFileSync } from "fs"

const jobs = [
  ["render-pcb.svg", "render-pcb.png", 2200],
  ["render-schematic.svg", "render-schematic-hires.png", 4200],
]

const browser = await chromium.launch()
for (const [svgPath, pngPath, width] of jobs) {
  const svg = readFileSync(svgPath, "utf8")
  const page = await browser.newPage({ viewport: { width, height: 1400 } })
  await page.setContent(
    `<html><body style="margin:0;background:#fff">${svg}</body></html>`,
  )
  await page.waitForTimeout(500)
  const buf = await page.screenshot({ fullPage: true })
  writeFileSync(pngPath, buf)
  console.log(`${pngPath}: ${(buf.length / 1024).toFixed(0)} KB`)
  await page.close()
}
await browser.close()
