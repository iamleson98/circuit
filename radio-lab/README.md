# Radio Lab — build your own AM radio station (and hear it work)

> 📖 **Reading guide:** [`learn/05-tour-am-radio-lab.md`](../learn/05-tour-am-radio-lab.md) walks through both boards' schematics and PCBs (and the [`learn/`](../learn) course teaches schematic/PCB reading from zero).

A **beginner-friendly AM transmitter + receiver pair**, designed in
[tscircuit](https://tscircuit.com) (React for circuits), simulated from the
routed boards, and buildable on a perfboard with ~$15 of through-hole parts.

Speak into the transmitter's microphone; tune the receiver across the band
until you find yourself. Turn **TUNE** on either board and listen to the
station slide away — that knob IS the physics lesson. The receiver also hears
real broadcast stations with a longer antenna.

```
radio-lab/
├── transmitter/index.tsx    ← AM-TX: mic → preamp → supply modulator (VMD) →
│                               Colpitts oscillator (steady 9V) → modulated
│                               final with tuned PEAK tank → wire antenna
├── receiver/index.tsx       ← AM-RX: antenna → LC tank → buffer → RF amp →
│                               1N34A voltage-doubler detector → volume →
│                               LM386 → speaker
├── lib/parts.tsx            ← custom radio parts + FAB_RULES (board rules)
├── calc/circuit_math.mjs    ← hand calculations, asserted (22 checks)
├── calc/sim_am.mjs          ← simulates the ROUTED boards (17 checks)
├── calc/spice.mjs           ← the bundled circuit simulator (MNA + Newton,
│                               vendor Gummel-Poon models)
├── calc/board_to_spice.mjs  ← routed board → SPICE deck converter
├── calc/spice/*.cir         ← generated SPICE decks (ngspice / LTspice)
├── standalone/              ← single-file versions for snippets.tscircuit.com
├── docs/radio-lab-tutorial.pdf  ← the theory→build→experiment book (see errata)
├── verify.mjs               ← board audit: errors, parts, topology, fab rules
└── render.mjs / svg2png.mjs ← PCB + schematic renders
```

## Quick start

```bash
cd radio-lab
npm install            # or: npm ci
npm run dev:tx         # interactive PCB/schematic/3D view of the transmitter
npm run dev:rx         # ...and the receiver
```

Zero-install alternative: open <https://snippets.tscircuit.com> and paste in
`standalone/am-tx-playground.tsx` or `standalone/am-rx-playground.tsx`.

## The verification suite

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npm run check` | 0 errors |
| Build | `npm run build` | clean (with ESM import fixer) |
| Board audit | `npm run verify` | both boards: 0 DRC errors (every part has a courtyard), exact part lists (39 + 41), topology asserted on the netlist, vias ≥ 0.30/0.60 mm, traces ≥ 0.15 mm, plated-hole rings ≥ 0.18 mm |
| Design math | `npm run math` | **22/22** |
| Circuit simulation | `npm run build && npm run sim` (~2 min) | **17/17** |

> These are custom physics checks. To *see* this project's key stages run as live
> SPICE waveforms — the Colpitts carrier, the input tank, the detector — open
> [`../simulation/`](../simulation) (`tsci dev` shows the graphs in your browser).

| tscircuit CLI | `tsci build transmitter/index.tsx` / `receiver/index.tsx` | exit 0, both |

`npm run sim` does not simulate a hand-copied schematic: it renders each
routed board, converts it to a SPICE deck part-for-part (`calc/spice/*.cir`,
re-runnable in ngspice or LTspice) and simulates that with vendor transistor
models (BC547B, 2N3904) — checking oscillator start-up in every corner (both
transistors, coil Q 25-60, both ends of TUNE), harmonic levels with PEAK
tuned, modulation depth vs voice level, receiver tuning/selectivity, detector
output and the signal LED.

## Design review — October 2026

An independent review (new simulator, real coil losses, the real modulator
output impedance) found and fixed:

1. **The receiver's detector couldn't hold DC.** C7 blocks DC, and the lone
   series diode D1 had no DC return, so it charged C7 and stopped conducting:
   the detected DC stayed below 90 mV at any signal level, audio *fell* as the
   signal got stronger, and **the signal LED could never light**. D2 now makes
   it the standard voltage-doubler detector (≥ 38 mV of audio from a 3 mV
   antenna signal; the LED lights on strong stations).
2. **The transmitter's oscillator ran on the audio rail (VMD).** Speech
   frequency-modulated the carrier by up to ±27 kHz — wider than the
   receiver's passband, so loud speech distorted. L1 and the oscillator bias
   now return to the steady 9 V rail; only the final amplifier is modulated
   (residual carrier swing ≤ 1.2 kHz).
3. **The transmitter radiated strong harmonics.** The hard-driven final with
   a resistor load put the 3rd harmonic only 15-19 dB below the carrier;
   FCC §15.219(c) requires ≥ 20 dB outside 510-1705 kHz. The final now drives
   a tuned output tank (L2 + C18 + the **PEAK** capacitor CV2): ≥ 28 dB down
   in every simulated corner. C17 was cut to 100 pF so the final doesn't pull
   the oscillator.
4. **Fab-grade vias and pads.** tscircuit's defaults (0.20 mm-drill /
   0.30 mm vias, TO-92 pads with a 0.115 mm ring) are below what fabs accept
   for standard 2-layer boards; `lib/parts.tsx` now sets 0.30/0.60 mm vias and
   a TO-92 footprint with a 0.2 mm ring.
5. **A battery short waiting to happen.** The custom footprints had no
   courtyards, so the DRC never checked them. With courtyards it showed the
   battery's GND pad 0.24 mm of copper from the switch's battery-plus pad on
   both boards — one solder blob across a 9 V cell with no fuse. BT1 moved
   a hole-pitch left (2.78 mm gap), its pads are marked `+ 9V -`, the AM-RX
   GAIN switch moved off C11, and RV1 uses the shared `VolumePot` part.
6. **Scripts that couldn't fail.** The old simulator modelled VMD as an ideal
   voltage source and the coil as lossless, and the math script had checks
   like `check(..., true)`. Both were replaced.
7. **Holes too small for real legs, and no polarity marks.** tscircuit's
   stock footprints drill 0.635 mm for radial capacitors and LEDs and
   0.7 mm for resistors and diodes — a 0.5-0.6 mm leg barely fits once the
   hole is plated — and mark neither the electrolytics' + nor the diodes'
   cathodes. `lib/parts.tsx` now has `Cap`, `ECap`, `Led5mm`, `Res` and
   `AxialDiode`: the same pad positions and courtyards (placement
   unchanged), 0.8 mm holes (1.0 mm for the LEDs), a square "+" pad and
   "+" mark on every electrolytic (C1, C4 / C1, C9, C11, C13 — the DC
   operating point confirms pin 1 is the + side of each), a ▶| symbol and
   square cathode pad on D1/D2, and the LEDs' flat on the cathode side.
   C3/C5 on the transmitter stay non-polarised: use film or MLCC (C5's
   base end sits 0.5 V above its collector end).

## The boards (all through-hole, 0.1" grid)

| | AM-TX | AM-RX |
|---|---|---|
| Size | 91.44 × 55.88 mm | 99.06 × 60.96 mm |
| Active parts | 4× BC547B / 2N3904 | 3× BC547B / 2N3904, 2× 1N34A, LM386 |
| Tuning | CV1 TUNE: ≈ 650-830 kHz (simulated); CV2 PEAK | CV1: ≈ 620 kHz-1.85 MHz |
| Battery | 9 V, ≈ 7.6 mA (~70 h) | 9 V, ≈ 9-10 mA (~55 h) |
| Extras | mic, 1-2 m wire antenna | 10 k volume pot, GAIN 20/200 switch, signal LED, 8 Ω speaker |

**Using the transmitter:** set TUNE to a quiet spot on an AM radio, then turn
PEAK for the loudest signal (that tunes the output tank onto your carrier).
Talk close to the mic: ~5 mV of voice gives ≈ 8 % modulation, a shout ≈ 22 %.

## Legal note

FCC §15.219 (US, 510-1705 kHz, no licence): **(a)** DC input to the final
≤ 100 mW — here ≈ 8 mW; **(b)** antenna + feed + ground lead ≤ 3 m — use 1-2 m
of wire; **(c)** emissions outside 510-1705 kHz ≥ 20 dB below the carrier —
simulated ≥ 28 dB with PEAK tuned. Simulation is not a measurement, and other
countries have different (often stricter) rules: check yours before you
transmit. The receiver doesn't radiate meaningfully.

## Tutorial PDF errata

`docs/radio-lab-tutorial.pdf` describes the pre-review design. Its build
scripts (`extras/pdf-sources/`) need ReportLab/matplotlib and hard-coded paths
from the original authoring machine, so it hasn't been regenerated. Where it
disagrees with this README or the code, the code is right:

| PDF topic | Says | Now |
|---|---|---|
| AM-TX oscillator | L1 and the base bias hang from VMD | both return to V9; VMD feeds only the final (Q4) |
| AM-TX final | R17 2.2 kΩ collector load, R16 560 Ω, C17 1 nF, C16 100 pF | tuned tank L2 100 µH + C18 330 pF + CV2 PEAK; R16 1 kΩ; C17 100 pF; C16 47 pF; C19 100 nF bypasses VMD |
| AM-TX range / numbers | 633-836 kHz, "sim 666-847 kHz", m ≈ 0.23-0.33 | ≈ 650-830 kHz; m ≈ 8 % (5 mV voice) to 22 % (20 mV) |
| AM-TX harmonics / legality | compliant because input power ≤ 100 mW | input power is only rule (a); rule (c) needed the output tank |
| AM-RX detector | single 1N34A behind C7 | 1N34A voltage doubler (D1 + D2) |
| Simulation chapter | RK4 of the oscillator with an ideal VMD and lossless coil; "7/7" | `calc/sim_am.mjs` simulates the routed boards; 17 checks |
| BOM | 36 + 40 parts; one polyvaricon per board | 39 + 41 parts: AM-TX adds L2 (100 µH), C18 (330 pF), C19 (100 nF) and a second polyvaricon (PEAK); AM-RX adds D2 (1N34A); R17 removed |

## License

MIT — like the rest of this repo.
