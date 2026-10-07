# circuit — learning projects built with [tscircuit](https://github.com/tscircuit/tscircuit)

Design-and-learn electronics: real, manufacturable circuits described as
React components. Each folder is a self-contained project.

## Projects

| Folder | What it is | Difficulty |
|---|---|---|
| [`unode-32u4/`](./unode-32u4) | **μNode32U4** — a bare-chip ATmega32U4 (TQFP-44) USB dev board: USB front-end, 16 MHz crystal, reset/boot circuitry, ICSP, LEDs, I²C pull-ups, full breakout. 35 components, ~105 routed traces. | Intermediate |

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
