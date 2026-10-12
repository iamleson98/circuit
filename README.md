# circuit — learning projects built with [tscircuit](https://github.com/tscircuit/tscircuit)

Design-and-learn electronics: real, manufacturable circuits described as
React components. Each folder is a self-contained project.

## 📚 New to electronics? Start with `learn/`

[`learn/`](./learn) is a from-zero course in reading, writing and
understanding the two drawings every project here is made of — the
**schematic** and the **PCB layout** — including the classic beginner
question *why does the schematic show separate little parts instead of
the whole circuit connected?* It then walks you through every board in
this repo, guided, part by part. No background required:
**[`learn/README.md`](./learn/README.md)** is the map.

## Projects

| Folder | What it is | Difficulty |
|---|---|---|
| [`unode-32u4/`](./unode-32u4) | **μNode32U4** — a bare-chip ATmega32U4 (TQFP-44) USB dev board: USB front-end (Amphenol micro-B, PTC fuse, ≤ 10 µF VBUS), 16 MHz crystal, reset/boot circuitry, ICSP, LEDs, I²C pull-ups, full breakout. 36 components, 110 routed traces, 0 DRC errors, 102-assertion electrical/manufacturing proof against the datasheet. | Intermediate |
| [`radio-lab/`](./radio-lab) | **Radio Lab** — a beginner AM transmitter + receiver pair you can build on perfboard: 4-transistor AM-TX (Colpitts oscillator + modulated final with a tuned output tank) and 41-part AM-RX (LC tank, 1N34A voltage-doubler detector, LM386). Proven by 22 math checks + 17 checks simulated on the routed boards. | Beginner ★ |
| [`fm-radio-lab/`](./fm-radio-lab) | **FM Radio Lab** — the FM sibling: a 2-transistor varactor-modulated FM-TX (damped tank, 1 pF : 100 pF antenna feed, ≤ 20 cm wire) and a 6-transistor super-regenerative FM-RX — the transmitter's oscillator core, buffered from the antenna and strangled ~70,000×/s by an astable. Proven by 43 math checks + 22 checks simulated on the routed boards (tuning stays below 108 MHz, radiation estimates under the FCC limits, capture, audio). | Beginner ★ |
| [`tricolor-lamp/`](./tricolor-lamp) | **Tri-Color Lamp** — a 12 V LED lamp that steps blue → white → yellow each time you flip the wall switch, like store-bought "3-colour" ceiling lamps, without touching mains (a certified 12 V supply does that). An ATtiny85 controller that times power-offs on a 220 µF reservoir, measures the supply's sag with its ADC, remembers the colour in a wear-levelled EEPROM journal; a 60-LED panel. Proven by a 2-board audit, 47 worst-case math checks, 23 checks simulated on both routed boards joined by their cable, 33 firmware unit tests, the real firmware run against a model of the lamp in 15 switch scenarios, and 12/12 planted bugs caught. Explained from zero. | Beginner ★ |
| [`arc-lighter/`](./arc-lighter) | **Arc Lighter** — a USB-rechargeable electric arc lighter: MCP73831 charger, LOCK switch, an ATtiny85 safety supervisor (hold-to-fire, 8 s limit, low-battery and coil-fault cut-offs), and a current-limited self-oscillating driver for a bought high-voltage coil. Proven by a board audit (hand-routed 0.8 mm current loop), 28 math checks, 14 checks simulated across 12 coil corners and 2 faults, and 28 firmware tests. **Makes ~10 kV — read its safety section first.** | Intermediate |

All boards were reviewed in October 2026: every fix is listed in the
project READMEs, and each tutorial PDF (which predates the review) has an
errata table there. The two newest projects (tricolor-lamp, arc-lighter)
carry their full tutorial in their README instead of a PDF.

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


## FM Radio Lab — build your own FM station

```bash
cd fm-radio-lab
npm install -g tscircuit   # once — provides the `tsci` CLI
npm install
npm run dev:tx             # → transmitter in the browser (PCB / schematic / 3D)
npm run dev:rx             # → receiver
npm run build              # compile the boards (verify and sim import dist/)
npm run verify             # board audit: 2 boards, 43+55 parts, zero DRC errors
npm run math               # 43 design-equation checks
npm run sim                # 22 checks simulated on the routed boards (~20 min)
```

Zero-install alternative: open <https://snippets.tscircuit.com> and paste in
`fm-radio-lab/standalone/fm-tx-playground.tsx` or `fm-rx-playground.tsx`.
**Start with `fm-radio-lab/docs/fm-radio-lab-tutorial.pdf`** — the 21-page
theory→build→experiment book, including why the receiver is the transmitter
(read it with the errata table in `fm-radio-lab/README.md`: the antenna
feed, modulator, padders and receiver front end changed in the review).

## Tri-Color Lamp — a lamp that changes colour with the wall switch

```bash
cd tricolor-lamp
npm install -g tscircuit   # once — provides the `tsci` CLI
npm install
npm run dev:controller     # → the controller board in the browser
npm run dev:panel          # → the LED panel
npm run build              # compile the boards (verify, sim and render import dist/)
npm run verify             # board audit: both boards + the cable between them
npm run math               # 47 worst-case design checks
npm run sim                # 23 checks simulated on both routed boards (~20 s)
npm run test:firmware      # 33 logic tests + the real firmware in 15 switch scenarios
npm run test:mutants       # 12 planted bugs — all must be caught
```

**Start with `tricolor-lamp/README.md` §1** — the whole idea explained from
zero (water-pipe analogies, a moment-by-moment walk-through), then every
block of the circuit, the firmware, parts, soldering, programming, first
power-up and wiring it to the wall switch.

## Arc Lighter — a rechargeable electric arc lighter

```bash
cd arc-lighter
npm install
npm run dev                # → the board in the browser
npm run build && npm run verify
npm run math               # 28 design checks
npm run sim                # 14 checks: the driver with 12 coil corners + 2 faults (~1.5 min)
npm run test:firmware      # 28 firmware tests
```

**Read `arc-lighter/README.md` — "Start here" and §1 Safety first.** It
explains how a 3.7 V cell makes a 10 kV arc, every block of the board,
the firmware's safety rules, parts, programming and a staged bring-up.

## Radio Lab — build your own AM radio station

```bash
cd radio-lab
npm install -g tscircuit   # once — provides the `tsci` CLI
npm install
npm run dev:tx             # → transmitter in the browser (PCB / schematic / 3D)
npm run dev:rx             # → receiver
npm run build              # compile the boards (verify and sim import dist/)
npm run math               # 22 design-equation checks (all pass)
npm run sim                # 17 checks simulated on the routed boards (~2 min)
npm run verify             # board audit: 2 boards, 39+41 parts, zero errors
```

Zero-install alternative: paste `radio-lab/standalone/am-tx-playground.tsx`
or `am-rx-playground.tsx` into <https://snippets.tscircuit.com>.

**Start with `radio-lab/docs/radio-lab-tutorial.pdf`** — a 25-page book: how
radio works, the LC tank, every stage's design math, the simulation story
(including two design flaws it caught before they could bite), the BOM,
perfboard build guide, bring-up ritual, 12 experiments, troubleshooting, and
the regulations picture (see the errata table in `radio-lab/README.md`).
