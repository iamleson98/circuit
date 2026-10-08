# circuit — learning projects built with [tscircuit](https://github.com/tscircuit/tscircuit)

Design-and-learn electronics: real, manufacturable circuits described as
React components. Each folder is a self-contained project.

## Projects

| Folder | What it is | Difficulty |
|---|---|---|
| [`unode-32u4/`](./unode-32u4) | **μNode32U4** — a bare-chip ATmega32U4 (TQFP-44) USB dev board: USB front-end, 16 MHz crystal, reset/boot circuitry, ICSP, LEDs, I²C pull-ups, full breakout. 35 components, ~105 routed traces. | Intermediate |
| [`radio-lab/`](./radio-lab) | **Radio Lab** — a beginner AM transmitter + receiver pair you can build on perfboard: 4-transistor AM-TX (Colpitts oscillator + modulated final) and 40-part AM-RX (LC tank, 1N34A detector, LM386). Proven by 29 math checks + 7 numerical-simulation tests. | Beginner ★ |

## Quick start (μNode32U4)

```bash
cd unode-32u4
npm install -g tscircuit   # once — provides the `tsci` CLI
tsci dev                   # → http://localhost:3020 (PCB / schematic / 3D views)
```

Zero-install alternative: open <https://snippets.tscircuit.com> and paste in
`unode-32u4/standalone/unode32u4-playground.tsx`.

**Start with `unode-32u4/unode32u4-tutorial.pdf`** — it walks through every
sub-circuit (USB, power integrity, clock, reset/boot, I/O), the worked math
(LED current, crystal load capacitance, fuse selection), a BOM with orderable
part numbers, PCB assembly craft, and bootloader bring-up.

Headless tooling (typecheck / build / netlist audit / SVG render) is described
in the project README.


## Radio Lab — build your own AM radio station

```bash
cd radio-lab
npm install -g tscircuit   # once — provides the `tsci` CLI
npm install
npm run dev:tx             # → transmitter in the browser (PCB / schematic / 3D)
npm run dev:rx             # → receiver
npm run math               # 29 design-equation checks (all pass)
npm run sim                # 7 RK4 simulation proofs: it really oscillates
npm run verify             # board audit: 2 boards, 36+40 parts, zero errors
```

Zero-install alternative: paste `radio-lab/standalone/am-tx-playground.tsx`
or `am-rx-playground.tsx` into <https://snippets.tscircuit.com>.

**Start with `radio-lab/docs/radio-lab-tutorial.pdf`** — a 25-page book: how
radio works, the LC tank, every stage's design math, the simulation story
(including two design flaws it caught before they could bite), the BOM,
perfboard build guide, bring-up ritual, 12 experiments, troubleshooting, and
the regulations picture.
