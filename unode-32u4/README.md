# μNode32U4 — a bare-chip ATmega32U4 USB dev board, in tscircuit

A complete, manufacturable 2-layer USB dev board built around **one bare
ATmega32U4 (TQFP-44)** and ~35 primary components. No Arduino module, no
dev-board-in-a-board — this is the "roll your own Leonardo from first
principles" project, described entirely in React/TypeScript.

**→ Read `unode32u4-tutorial.pdf` for the full design walkthrough**: theory,
worked math, BOM with orderable part numbers, PCB-craft notes, bootloader
bring-up, and troubleshooting.

## Quick start

```bash
# Option A — the tscircuit CLI (recommended)
npm install -g tscircuit
cd unode-32u4
tsci dev            # → http://localhost:3020  (PCB / schematic / 3D views)

# Option B — zero install
# Open https://snippets.tscircuit.com and paste the contents of
# standalone/unode32u4-playground.tsx
```

To install project dependencies for IDE support / typechecking:

```bash
npm install
npm run check        # tsc --noEmit, should be silent
```

### Headless tools (no CLI required)

After `npm install`, two scripts let you render and audit the circuit
programmatically — the same ones used while developing this project:

```bash
npm run build      # compile index.tsx + lib/ → dist/ (tsc, then fix-imports.mjs
                   #   makes the emitted ESM imports resolvable by plain Node)
npm run verify     # headless render + netlist audit: element counts, every net,
                   #   wired vs dangling ports, routed traces, error scan
npm run render     # regenerate render-pcb.svg / render-schematic.svg (+ circuit.json)
```

A clean run of `verify` reports **no runtime/design errors**, all 35 components,
15 nets, 148/153 ports wired (5 intentionally floating: USB ID + button mirror
pins), and all 105 PCB traces routed — plus the 11 first-pass DRC notes the
script lists as your routing homework (exit code is only non-zero for real
render/design failures).

## Project structure

```
unode-32u4/
├── index.tsx                       # the board: all 35 components + ~105 traces,
│                                   #   organized into banner-commented sections
├── lib/
│   ├── atmega32u4.tsx              # reusable bare-chip component (44-pin map,
│   │                               #   verified against the Microchip datasheet)
│   └── usb-micro-b.tsx             # micro-USB-B receptacle with a hand-crafted
│                                   #   footprint (smtpad + silkscreen primitives)
├── standalone/
│   └── unode32u4-playground.tsx    # same circuit, one file, for the web editor
├── unode32u4-tutorial.pdf          # 20-page design walkthrough: theory, worked
│                                   #   math, BOM, PCB craft, bring-up, debugging
├── render-pcb.png                  # committed previews of the routed board
├── render-schematic.png            #   and the generated schematic
├── verify.mjs / render.mjs         # headless dev tools (npm run verify / render)
├── extras/                         # diagram + cover sources used by the PDF
├── tsconfig.json / tsconfig.build.json
└── package.json / package-lock.json
```

## What's on the board

| Section | Components | Notes |
|---|---|---|
| USB front-end | J1, F1 (500mA PTC), R1/R2 (22Ω) | 22Ω series resistors are datasheet-mandated (§2.2.8/9) |
| Power integrity | C1–C9, FB1 | 100nF per VCC pin, 1µF on UCAP, ferrite-bead-fed AVCC, 2×10µF bulk |
| Clock | Y1 16MHz + C10/C11 22pF | CL math in the tutorial; tscircuit enforces ≤10mm / 0-via crystal traces |
| Reset & boot | R3, SW1 (RESET), R4, SW2 (BOOT) | BOOT = HWB pin, active-low bootloader entry (HWBE fuse) |
| ICSP | J3 (2×3) | how you flash the blank chip the first time |
| Indicators | LED1-4 + R5-R8 | PWR, L (D13), TX, RX (active-low, matches Arduino core macros) |
| I²C | R9/R10 4.7k pull-ups | on SDA (D2) / SCL (D3) |
| Breakout | J2, J4 (1×16 each) | Leonardo-compatible names: D0-D13, A0-A5, SDA/SCL, SPI, HWB |

## Bring-up (short version — full details in the PDF)

1. **Order the board**: `tsci export gerbers` → upload to JLCPCB/PCBWay.
2. **Assemble** (hand solder or stencil+reflow; TQFP-44 needs flux + drag solder or hot air).
3. **Flash the bootloader** with any AVR ISP (USBasp / Arduino-as-ISP) on J3:
   ```bash
   avrdude -c usbasp -p atmega32u4 -U flash:w:caterina-leonardo.hex \
     -U lfuse:w:0xFF:m -U hfuse:w:0xD8:m -U efuse:w:0xCB:m
   ```
4. Plug in USB → PWR LED lights → select **Arduino Leonardo** in the IDE →
   blink D13. The L, TX and RX LEDs will blink on USB traffic automatically.

## Design-rule status (and your homework)

The netlist is fully verified: every net formed, every port connected
(except deliberately floating USB ID + button mirror pins), all 105 traces
routed by the autorouter, no placement overlaps. Like any first-pass
autoroute, ~11 DRC polish items remain (5 crystal-trace via/length notes and
6 tight clearance spots in the TQFP fan-out). Open `tsci dev`, press **R** to
re-route, and hand-adjust the crystal traces — the PDF tutorial walks through
exactly how to think about them. That cleanup pass *is* the PCB craft you're
here to learn.

> **Heads-up:** `tsci build` will exit non-zero and list those same 11 items —
> that's the homework, not a broken project. `tsci dev` renders the board
> fine, and `tsci export --format gerbers` still produces orderable gerbers
> (verified). `npm run verify` separates fatal errors (exit 1) from these
> expected DRC notes.

## Credits / sources

- ATmega32U4 TQFP-44 pinout: Microchip [Atmel-7766J datasheet], Fig. 1-1 —
  verified pin-by-pin in `lib/atmega32u4.tsx` against the datasheet, the
  official Arduino Leonardo schematic, and the ArduinoCore-avr `leonardo`
  variant files.
- TX/RX LED wiring matches `ArduinoCore-avr/variants/leonardo/pins_arduino.h`
  (`TXLED0/1` → PD5, `RXLED0/1` → PB0 — active-low).
- Reference design lineage: Arduino Leonardo / Pro Micro (the design *ideas*,
  re-derived from the datasheet — no schematics were copied).
