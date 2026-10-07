# μNode32U4 — a bare-chip ATmega32U4 USB dev board, in tscircuit

A complete, manufacturable 2-layer USB dev board built around **one bare
ATmega32U4 (TQFP-44)** and 35 primary components. No Arduino module, no
dev-board-in-a-board — this is the "roll your own Leonardo from first
principles" project, described entirely in React/TypeScript.

**→ Read `unode32u4-tutorial.pdf` for the full design walkthrough**: theory,
worked math, BOM with orderable part numbers, PCB-craft notes, bootloader
bring-up, and troubleshooting.

## Verified state — every check green

| Check | Command | Result |
|---|---|---|
| TypeScript compiles | `npm run check` | clean (tsc --noEmit, silent) |
| Headless render + structural audit | `npm run verify` | 35 components, 15 nets, 148/153 ports wired (5 deliberately floating), 105/105 traces routed, **0 DRC errors** |
| **Electrical correctness proof** | `npm run proof` | **90/90 machine-checked assertions** — datasheet pinout, USB front-end, decoupling, clock, reset/boot, ICSP grid, Leonardo pin map, indicator wiring, I²C, GND plane |
| tscircuit DRC gate | `tsci build index.tsx` | 1 circuit passed, exit 0 |
| Orderable output | `tsci export index.tsx --format gerbers` | full 2-layer gerber + drill set |

The proof script (`proof.mjs`) is the heart of the verification: it renders
the board and asserts every electrical fact the design depends on — the full
TQFP-44 pinout from the Microchip datasheet, the 22Ω USB series resistors,
the 1µF UCAP cap, the 22pF crystal load caps, the 10k RESET/HWB pull-ups,
the ICSP header's AVR-standard grid, the Leonardo pin-for-pin breakout map,
the TX/RX LED wiring against the Arduino core macros, the I²C pull-ups,
and the bottom-layer GND pour. Any regression fails loudly.

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

After `npm install`, the same scripts used to verify this project:

```bash
npm run build      # compile index.tsx + lib/ → dist/ (tsc, then fix-imports.mjs
                   #   makes the emitted ESM imports resolvable by plain Node)
npm run verify     # structural audit: element counts, nets, wired/dangling
                   #   ports, routed traces, error scan (fails on any DRC error)
npm run proof      # the 90-assertion electrical correctness proof
npm run render     # regenerate render-pcb.svg / render-schematic.svg
```

## Project structure

```
unode-32u4/
├── index.tsx                       # the board: all 35 components + traces,
│                                   #   organized into banner-commented sections
├── lib/
│   ├── atmega32u4.tsx              # reusable bare-chip component (44-pin map
│   │                               #   verified against the Microchip datasheet)
│   └── usb-micro-b.tsx             # micro-USB-B receptacle with a hand-crafted
│                                   #   footprint (smtpad + silkscreen primitives)
├── standalone/
│   └── unode32u4-playground.tsx    # same circuit, one file, for the web editor
├── proof.mjs                       # npm run proof — the electrical correctness
│                                   #   proof (90 machine-checked assertions)
├── verify.mjs                      # npm run verify — structural audit
├── render.mjs / svg2png.mjs        # headless render tooling
├── unode32u4-tutorial.pdf          # the design walkthrough
├── render-pcb.png                  # committed previews of the routed board
├── render-schematic.png            #   and the generated schematic
├── extras/                         # diagram + cover sources used by the PDF
├── tsconfig.json / tsconfig.build.json
└── package.json / package-lock.json
```

## What's on the board

| Section | Components | Notes |
|---|---|---|
| USB front-end | J1, F1 (500mA PTC), R1/R2 (22Ω) | 22Ω series resistors are datasheet-mandated (§2.2.8/9) |
| Power integrity | C1–C9, FB1 | 100nF per VCC pin, 1µF on UCAP, ferrite-bead-fed AVCC, 2×10µF bulk |
| Clock | Y1 16MHz + C10/C11 22pF | CL math in the tutorial; framework DRC enforces ≤10mm / 0-via crystal traces |
| Reset & boot | R3, SW1 (RESET), R4, SW2 (BOOT) | BOOT = HWB pin, active-low bootloader entry (HWBE fuse) |
| GND plane | copperpour | solid bottom-layer pour, thermal reliefs on plated holes |
| ICSP | J3 (2×3) | standard AVR ISP grid (rotated 90° — keyed cables seat correctly); how you flash the blank chip |
| Indicators | LED1-4 + R5-R8 | PWR, L (D13), TX, RX (active-low, matches Arduino core macros) |
| I²C | R9/R10 4.7k pull-ups | on SDA (D2) / SCL (D3) |
| Breakout | J2 (right, digital), J4 (top, analog+bus) | Leonardo-compatible names: D0-D13, A0-A5, SDA/SCL, SPI, HWB |

## Bring-up (short version — full details in the PDF)

1. **Order the board**: `tsci export index.tsx --format gerbers` → upload to JLCPCB/PCBWay (72×50mm, 2-layer).
2. **Assemble** (hand solder or stencil+reflow; TQFP-44 0.8mm pitch needs flux + drag solder or hot air).
3. **Flash the bootloader** with any AVR ISP (USBasp / Arduino-as-ISP) on J3:
   ```bash
   avrdude -c usbasp -p atmega32u4 -U flash:w:caterina-leonardo.hex \
     -U lfuse:w:0xFF:m -U hfuse:w:0xD8:m -U efuse:w:0xCB:m
   ```
4. Plug in USB → PWR LED lights → select **Arduino Leonardo** in the IDE →
   blink D13. The L, TX and RX LEDs will blink on USB traffic automatically.

## Design notes (what changed in the verified revision)

- **Footprint**: `tqfp44_p0.8mm_w10mm` — tscircuit's default tqfp44 pitch is
  0.5mm; the ATmega32U4-AU is a 0.8mm-pitch 10×10mm package. The `_p0.8mm`
  suffix is mandatory or the board won't match the real chip.
- **Board**: 72×50mm (was 64×42) — the extra room gives the fan-out legal
  clearance everywhere and fits 4 mounting holes clear of the headers.
- **Digital header J2**: vertical on the right edge, so the right-side MCU
  ports escape straight out instead of carving through the chip's fan-out —
  the single most important placement decision on the board.
- **GND distribution**: solid bottom-layer copper pour + a few hand-routed
  power lanes (`pcbPath` traces in index.tsx) where the autorouter's MST
  insisted on grazing pads. These are teaching artifacts: read the comments
  to see why each lane exists.

## Credits / sources

- ATmega32U4 TQFP-44 pinout: Microchip [Atmel-7766J datasheet], Fig. 1-1 —
  verified pin-by-pin in `lib/atmega32u4.tsx` and machine-checked by
  `proof.mjs` against the datasheet, the official Arduino Leonardo
  schematic, and the ArduinoCore-avr `leonardo` variant files.
- TX/RX LED wiring matches `ArduinoCore-avr/variants/leonardo/pins_arduino.h`
  (`TXLED0/1` → PD5, `RXLED0/1` → PB0 — active-low).
- Reference design lineage: Arduino Leonardo / Pro Micro (the design *ideas*,
  re-derived from the datasheet — no schematics were copied).
