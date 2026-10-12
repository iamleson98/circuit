# μNode32U4 — a bare-chip ATmega32U4 USB dev board, in tscircuit

A complete, manufacturable 2-layer USB dev board built around **one bare
ATmega32U4 (TQFP-44)** and 36 primary components. No Arduino module, no
dev-board-in-a-board — this is the "roll your own Leonardo from first
principles" project, described entirely in React/TypeScript.

**→ `unode32u4-tutorial.pdf` is the full design walkthrough** (theory,
worked math, PCB craft, bring-up). It predates the October 2026 design
review — **read the [errata](#tutorial-pdf-errata) below first**; where the
PDF and this README/the code disagree, the code and this README are right.

## Verified state — every check green

| Check | Command | Result |
|---|---|---|
| TypeScript compiles | `npm run check` | clean (tsc --noEmit) |
| Headless render + structural audit | `npm run verify` | 36 components, 16 nets, 154/159 ports wired (5 deliberately floating), 110 PCB traces, **0 DRC errors** |
| **Electrical + manufacturing proof** | `npm run proof` | **102/102 machine-checked assertions** |
| tscircuit DRC gate | `tsci build index.tsx` | 1 circuit passed |
| Orderable output | `tsci export index.tsx --format gerbers` | full 2-layer gerber + drill set |

`proof.mjs` checks the board against **independent** references, so it can
fail: the ATmega32U4 pin table is keyed by *physical pin number* from the
Microchip datasheet (Atmel-7766J Fig. 1-1) and compared with the pad numbers
tscircuit generated, and every pin's *function* is checked against the net
it lands on. It also proves the USB front-end (series resistors, fuse, shell
grounding, connector **on the board edge**, ≤10 µF on VBUS), both
ferrite-filtered AVCC rails, the clock, reset/boot, the ICSP grid, the
Leonardo pin map, the indicators, I²C, **fab rules** (≥0.30/0.60 mm vias,
≥0.15 mm traces), USB-pair routing (no vias, length-matched) and zero DRC
errors. Run against the pre-review design it reports 17 failures — including
the pin-24 error described below.

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

Headless tools (after `npm install`):

```bash
npm run build      # compile index.tsx + lib/ → dist/ (tsc + fix-imports.mjs)
npm run verify     # structural audit + DRC error scan (fails on any error)
npm run proof      # the 102-assertion electrical/manufacturing proof
npm run render     # regenerate render-pcb.svg / render-schematic.svg
python3 extras/build_standalone.py   # regenerate the single-file playground
```

## Project structure

```
unode-32u4/
├── index.tsx                       # the board: all 36 components + traces
├── lib/
│   ├── atmega32u4.tsx              # bare-chip component, datasheet pin map
│   ├── usb-micro-b.tsx             # Amphenol 10118194-0001LF footprint
│   └── ferrite-bead.tsx            # 0603 ferrite bead (real MPN, no fake µH)
├── standalone/unode32u4-playground.tsx   # GENERATED single-file copy
├── extras/build_standalone.py      # …the generator
├── proof.mjs / verify.mjs          # npm run proof / verify
├── render.mjs / svg2png.mjs        # headless render tooling
└── unode32u4-tutorial.pdf          # the design walkthrough (see errata)
```

## What's on the board

| Section | Components | Notes |
|---|---|---|
| USB front-end | J1 (Amphenol 10118194-0001LF), F1 (500 mA PTC), R1/R2 (22 Ω) | 22 Ω series resistors per datasheet §2.2.8/9; J1 overhangs the board edge 0.7 mm per its drawing; all 4 shell legs + 4 shell tabs to GND |
| Power integrity | C1 4.7 µF + C2 1 µF bulk, C3/C5 (VCC), C8 (UVCC), C7 1 µF (UCAP), FB1+C6 (AVCC2), FB2+C4 (AVCC1), C9 (AREF) | ≈6.4 µF total on VBUS (USB 2.0 limit 10 µF) |
| Clock | Y1 16 MHz (CL 15 pF) + C10/C11 22 pF | framework DRC enforces ≤10 mm / 0-via crystal traces |
| Reset & boot | R3, SW1 (RESET), R4, SW2 (BOOT/HWB) | see *Bring-up* for what BOOT does |
| GND plane | copper pour | bottom layer |
| ICSP | J3 (2×3) | standard AVR ISP grid, rotated 90° — **pin 1 (MISO) is top-right; the square pad marks RESET** |
| Indicators | LED1-4 + R5-R8 | PWR, L (D13), TX, RX (active-low, matches Arduino core macros) |
| I²C | R9/R10 4.7 k | on SDA (D2) / SCL (D3) |
| Breakout | J2 (right, digital), J4 (top, analog+bus) | Leonardo names: D0-D13, A0-A5, SDA/SCL, SPI, HWB |

### Manufacturing rules (enforced by the DRC gate and `proof.mjs`)

2 layers, 1.6 mm FR-4, 1 oz copper. Vias 0.30 mm drill / 0.60 mm pad
(0.15 mm ring). Traces ≥ 0.15 mm. Copper clearance ≥ 0.115 mm (standard
JLCPCB/PCBWay minimum is 0.10 mm); via-to-pad ≥ 0.15 mm. USB D+/D− routed
on one layer with no vias, matched to 0.2 mm. The routing is deterministic:
the same source always produces the same copper.

## Bring-up

1. **Order the board**: `tsci export index.tsx --format gerbers` → JLCPCB/PCBWay (72×50 mm, 2-layer).
2. **Assemble** (TQFP-44 at 0.8 mm pitch: flux + drag solder or hot air). Buy
   exactly the BOM's **10118194-0001LF** micro-B receptacle — the footprint
   is specific to that part.
3. **First program — two ways:**
   * **USB, no programmer (factory-fresh chip).** ATmega32U4-AU parts ship
     with a USB DFU bootloader and the HWBE fuse programmed (datasheet p. 1,
     Table 28-3). Hold **BOOT (SW2)**, tap **RESET (SW1)**, release BOOT → the
     chip enumerates as a DFU device; flash application `.hex` files with
     `dfu-programmer atmega32u4 erase && dfu-programmer atmega32u4 flash app.hex`.
     DFU cannot replace itself or change fuses, so to turn the board into a
     Leonardo use the ISP route.
   * **ISP (makes it a Leonardo).** Any AVR ISP (USBasp / Arduino-as-ISP) on J3:
     ```bash
     avrdude -c usbasp -p atmega32u4 -U flash:w:Caterina-Leonardo.hex:i \
       -U lfuse:w:0xFF:m -U hfuse:w:0xD8:m -U efuse:w:0xCB:m
     ```
     These are Arduino's Leonardo fuses: lfuse 0xFF = full-swing crystal,
     no clock divide; hfuse 0xD8 = BOOTRST programmed, BOOTSZ = 00 (4096-word
     boot section; Caterina's 4 KB image sits in its upper half), EESAVE unprogrammed,
     JTAG off; efuse 0xCB = brown-out at 2.6 V, **HWBE unprogrammed**.
4. Plug in USB → PWR LED lights → select **Arduino Leonardo** in the IDE →
   blink D13. With BOOTRST programmed the chip always starts in Caterina:
   after power-up it jumps straight to the sketch, but after a RESET press
   (or the IDE's upload reset) it waits ~8 s for an upload — so a crashing
   sketch can always be replaced. SW2 is then just a user button on PE2
   (Caterina never reads it).

**Power notes.** The V5 header pins are the USB 5 V rail *after* the PTC.
Don't feed external 5 V into them while USB is plugged in (that back-powers
the host through F1). There is no ESD array on D+/D−; for a product that will
see real-world cable abuse, add a USBLC6-2-class TVS at J1.

## Design review — October 2026

Fixed in this revision (all now asserted by `proof.mjs`):

- **Pin 24 is AVCC, not VCC.** The ATmega32U4 has two VCC pins (14, 34) and
  two AVCC pins (24, 44). The old pin table called pin 24 "VCC2" and tied it
  straight to +5 V, which also bypassed FB1's filtering. Both AVCC pins now
  get their own ferrite bead + 100 nF, as datasheet Fig. 24-10 asks.
- **Real USB connector footprint at the board edge.** The old footprint was a
  generic placeholder with only two shell pads, and its mating face sat ~4 mm
  inside the board edge, where a plug's overmold would hit the PCB. It is now
  the Amphenol 10118194-0001LF land pattern, overhanging the edge by 0.7 mm.
- **Fab-grade vias and traces.** All 112 old vias were 0.20 mm drill / 0.30 mm
  pad (0.05 mm ring) and some power traces were 0.10 mm — tscircuit's
  absolute-minimum defaults. Now 0.30/0.60 mm vias and ≥ 0.15 mm traces.
- **USB inrush.** 2 × 10 µF bulk exceeded USB 2.0's 10 µF limit; now 4.7 µF + 1 µF.
- **FB1 is a real ferrite bead** (BLM18PG221SN1D), not a "1 µH inductor".
- **USB pair** now has no vias and is length-matched (previously 2 vias each).

Known, accepted limitation: C3 (VCC1, pin 14) is ~12 mm of trace from its pin
because the bottom-edge fan-out (crystal, RESET, PD port) leaves no closer
spot; C5 decouples the other VCC pin at ~4 mm and the bulk caps back both up.

## Tutorial PDF errata

| PDF location | Says | Correct |
|---|---|---|
| §3 Table 3-2, §4.2 | pin 24 = "VCC2"; "three VCC pins (14, 24, 34)" | pin 24 = **AVCC**; two VCC (14, 34) + two AVCC (24, 44) |
| §4.2 Table 4-1 | C4 decouples VCC pin 24; one bead on AVCC | C4 + FB2 filter AVCC1 (pin 24); C6 + FB1 filter AVCC2 (pin 44) |
| §4.2, §9 | 2 × 10 µF bulk | 4.7 µF + 1 µF (USB 2.0 ≤ 10 µF) |
| §4.2, §8.3 | "every supply pin's 100 nF within a couple of mm" | true except C3 (VCC1), ~12 mm |
| §6 intro | "a bare chip arrives from the factory blank" | ATmega32U4-AU ships with a USB DFU bootloader (datasheet p. 1) |
| §6.2, §10.4 | "hold BOOT, tap RESET" enters the bootloader with Caterina | true only on a factory-fresh chip (DFU, HWBE programmed); with the Leonardo fuses HWBE is *un*programmed and a plain RESET press already enters Caterina for ~8 s |
| §6.3 Table 6-1 | hfuse 0xD8: "BOOTSZ=01, EESAVE=0"; efuse 0xCB: "HWBE=0 (programmed)" | 0xD8: BOOTSZ=00, EESAVE=1 (unprogrammed); 0xCB: HWBE=1 (**unprogrammed**), BODLEVEL=011 (2.6 V) |
| §8.4 | "0.3 mm pads on the USB connector … routine" | J1 is the Amphenol 10118194 pattern (0.40 × 1.35 mm signal pads) |
| §9 BOM | J1 "generic 7.4 mm-body part"; FB1 "~600 Ω bead"; 35 parts | J1 = **10118194-0001LF**; FB1/FB2 = BLM18PG221SN1D (any 120-600 Ω @ 100 MHz, DCR ≤ 0.3 Ω); 36 parts |
| §10.3 | "pin 1 is MISO, marked on silkscreen" | pin 1 (MISO) is top-right; the square pad marks RESET (the header is rotated) |

## Credits / sources

- ATmega32U4 pinout, fuses and app circuits: Microchip Atmel-7766J datasheet
  (Fig. 1-1, Fig. 21-3, Fig. 24-10, Fig. 27-3, Tables 28-3…28-5).
- J1 land pattern: KiCad library `Connector_USB:USB_Micro-B_Amphenol_10118194_Horizontal`
  (built from Amphenol's 10118194 drawing).
- TX/RX LED wiring matches `ArduinoCore-avr/variants/leonardo/pins_arduino.h`
  (`TXLED0/1` → PD5, `RXLED0/1` → PB0 — active-low).
- Reference design lineage: Arduino Leonardo / Pro Micro (ideas re-derived
  from the datasheet — no schematics were copied).
