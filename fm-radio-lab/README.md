# FM Radio Lab — build your own FM station (and hear it work)

A **beginner-friendly FM transmitter + super-regenerative receiver pair**,
designed in [tscircuit](https://tscircuit.com) (React for circuits),
simulated from the routed boards, and buildable with ~$15 of through-hole
parts and one hand-wound coil.

Speak into the transmitter; sweep the receiver's **TUNE** trimmer slowly
across the band until the hiss collapses into your own voice. That collapse
— the quieting *thump* — is the sound of radio-wave capture: **the silence
is the signal**.

The receiver's detector is **the transmitter's oscillator** (same coil, same
trimmer, same padder, same feedback divider — diff the two files), strangled
~70,000 times a second by a two-transistor astable. That is
*super-regeneration*: 10⁴-10⁶ of gain from one transistor, the 1940s way.

```
fm-radio-lab/
├── transmitter/index.tsx    ← FM-TX: mic/aux → preamp → DEV pot → varactor (D1)
│                               on a common-base Colpitts tank (damped by R15,
│                               padded by C17) → 1 pF : 100 pF divider → ≤ 20 cm wire
├── receiver/index.tsx       ← FM-RX: wire → common-base RF buffer (Q5) → 1 pF →
│                               the same Colpitts core (the detector, damped by
│                               R22, padded by C17) quenched by Q2+Q3 (~70 kHz) →
│                               2-pole audio filter → volume → Q4 → follower Q6 → earphone
├── lib/parts.tsx            ← custom radio parts (with courtyards) + FAB_RULES
├── calc/circuit_math.mjs    ← hand calculations, asserted (43 checks)
├── calc/sim_fm.mjs          ← simulates the ROUTED boards (22 checks)
├── calc/spice.mjs           ← the bundled circuit simulator (MNA + Newton,
│                               vendor Gummel-Poon models)
├── calc/board_to_spice.mjs  ← routed board → SPICE deck converter
├── calc/spice/*.cir         ← generated SPICE decks (ngspice / LTspice)
├── standalone/              ← single-file versions for snippets.tscircuit.com
├── docs/fm-radio-lab-tutorial.pdf  ← the theory→build→experiment book (see errata)
├── verify.mjs               ← board audit: errors, parts, topology, values, fab rules
├── layout_check.py          ← quick pre-DRC placement sketch check (receiver)
└── render.mjs / svg2png.mjs ← PCB + schematic renders
```

## Quick start

```bash
cd fm-radio-lab
npm install            # or: npm ci
npm run dev:tx         # interactive PCB/schematic/3D view of the transmitter
npm run dev:rx         # ...and the receiver
```

Zero-install alternative: open <https://snippets.tscircuit.com> and paste in
`standalone/fm-tx-playground.tsx` or `standalone/fm-rx-playground.tsx`.

## The verification suite

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npm run check` | 0 errors |
| Build | `npm run build` | clean (with ESM import fixer) |
| Board audit | `npm run verify` | both boards: 0 DRC errors (every part has a courtyard), exact part lists (43 + 55), topology and critical values asserted on the netlist, vias ≥ 0.30/0.60 mm, traces ≥ 0.15 mm, plated-hole rings ≥ 0.18 mm |
| Design math | `npm run math` | **43/43** |
| Circuit simulation | `npm run build && npm run sim` (~20 min) | **22/22** |
| tscircuit CLI | `tsci build transmitter/index.tsx` / `receiver/index.tsx` | exit 0, both |

`npm run sim` renders each routed board, converts it part-for-part into a
SPICE deck (`calc/spice/*.cir`, re-runnable in ngspice or LTspice), adds the
VHF parasitics a real build has (5 nH leads on the RF capacitors, tank
strays, coil Q 50-150) and simulates it with vendor models for both
transistor types the kit allows (2N2222A, BC547B) and both ends of the
1N4148's capacitance spread. Radiated power is *estimated* from the
simulated currents (small-loop model for the coil, short-monopole model for
the wire) — design margin, not a substitute for a field-strength
measurement.

## Design review — October 2026

An independent review — new simulator, real coil losses and lead
inductance, a radiated-power estimate — found that the original pair could
not be used legally and fixed it:

1. **The transmitter radiated 40-55 dB over the licence-free limit.** An
   undamped Colpitts swings its tank to ~9 V peak, and the original fed that
   through 3.3 pF into a 30-75 cm (quarter-wave) wire: simulated −8 to
   +8 dBm against FCC §15.239's 250 µV/m at 3 m (≈ −47 dBm EIRP). Now R15
   (330 Ω) pins the tank at 0.5-0.8 V for any coil Q or transistor, C13 (1 pF)
   + C15 (100 pF) feed the antenna ~1 % of that, and the wire is ≤ 20 cm:
   worst simulated corner **−62.6 dBm, 14.7 dB under the limit** (the coil
   itself is now the main radiator — so a longer wire must not be fitted).
2. **Its "free" FM was unpredictable.** Modulating the oscillator
   transistor's own junction capacitance gave 0.04-5 kHz/mV, *changing sign*
   with transistor type and tuning. A 1N4148 used as a varactor (D1, biased
   1.15 V by R12/R13, audio through the DEV pot, R14 and DC-block C16) gives
   0.13-0.59 kHz/mV in band, always the same direction. (C16 matters: without
   it the DEV pot drags D1's bias to 7 V.)
3. **Both boards tuned into the aviation band (108-137 MHz).** The TX reached
   115-120 MHz, the RX 119-124 MHz — and a super-regenerative detector
   radiates at whatever it is tuned to. A 12 pF padder (C17) across each tank
   now holds the windows at ≈ 80.9-104.4 MHz (TX) and 80.7-105.2 MHz (RX)
   in every simulated corner, short leads included. (6.8 pF still let a
   BC547B with a low-capacitance 1N4148 reach 110 MHz; 10 pF left < 1 %
   of margin.) The price: 2N2222A builds top out near 101 MHz unless the
   coil is stretched a little.
4. **The receiver re-radiated about −13 dBm** — ~38 dB over §15.109's
   receiver limit, enough to jam FM radios in the house — because the
   antenna sat directly on the oscillating tank. A common-base RF buffer (Q5)
   now feeds the tank through C22 (1 pF) and isolates the wire, and R22
   (1 kΩ) holds bursts to 0.7-1.4 V: worst simulated corner −59.2 dBm with
   a 75 cm wire, 7.5 dB under the limit. A 300 µV carrier still captures
   the detector (ignition 0.43 µs earlier).
5. **32 Ω earbuds got almost nothing.** Q4's 3.3 kΩ collector driving 32 Ω
   gave ≈ 0.06× from Q4's base. An emitter follower (Q6) now gives ≈ 13× into
   32 Ω; R16/R23/C23 reset Q4's gain to ≈ 24×.
6. **Assembly hazards found by adding courtyards.** The custom footprints had
   none, so tscircuit's DRC never checked them. With courtyards it found the
   coil sitting on R15 (TX) and on C22 (RX), and — on the TX — the battery's
   GND pad 0.24 mm of copper from the switch's battery-plus pad: one solder
   blob from shorting the cell. All moved; the battery pads are now marked
   `+ 9V -`.
7. **Fab-grade vias and TO-92 pads** (0.30/0.60 mm vias, 0.2 mm rings), and
   **scripts that couldn't fail** (`check(..., true)`, an RK4 model with a
   lossless tank) replaced by the suite above.
8. **Holes too small for real legs, and no polarity marks.** tscircuit's
   stock footprints drill 0.635 mm for radial capacitors and LEDs and
   0.7 mm for resistors and diodes — a 0.5-0.6 mm leg barely fits once the
   hole is plated — and mark neither the electrolytics' + nor D1's cathode.
   `lib/parts.tsx` now has `Cap`, `ECap`, `Led5mm`, `Res` and `AxialDiode`:
   the same pad positions and courtyards (placement and RF layout
   unchanged), 0.8 mm holes (1.0 mm for the LEDs), a square "+" pad and "+"
   mark on every electrolytic (C1, C5 / C1, C12, C23), a ▶| symbol and
   square cathode pad on D1, and the LED's flat on the cathode side.

## The boards (all through-hole, 0.1" grid)

| | FM-TX | FM-RX |
|---|---|---|
| Size | 91.44 × 55.88 mm | 99.06 × 88.9 mm |
| Parts | 43 | 55 |
| Transistors | 2 (Q2: 2N2222A or BC547B) | 6 (Q1: 2N2222A or BC547B) |
| Tuning (simulated, TRIM 30 → 5 pF) | ≈ 80.9-101.0 MHz (2N2222A) / 82.5-104.4 MHz (BC547B) | ≈ 80.7-102.1 MHz (2N2222A) / 82.1-105.2 MHz (BC547B) |
| Battery (9 V alkaline) | ≈ 7.8 mA (~70 h) | ≈ 13 mA (~40 h; the power LED is ¼ of it) |
| Antenna | **≤ 20 cm** of wire | 30-75 cm of wire |
| Audio | electret mic or AUX in; DEV pot sets deviation | 32 Ω earbuds or crystal earphone |

Both share the same hand-wound coil: **3 turns of 0.5-0.6 mm wire on a 5 mm
form, stretched to ~2.4 mm** (Wheeler: 56 nH, ~60 nH with leads). Squeeze
the turns to tune lower, stretch them to tune higher.

**Using the pair:** set the transmitter on a quiet spot with a normal FM
radio (always confirm you are below 108 MHz), turn DEV up until speech is
loud and clean without splashing onto neighbouring channels, then sweep the
receiver's TUNE until the hiss collapses. Super-regens slope-detect FM: tune
a hair off the carrier for the clearest audio.

## Legal note

FCC §15.239 (US, 88-108 MHz, no licence): field strength ≤ 250 µV/m at 3 m
(≈ −47 dBm EIRP) and the emission inside a 200 kHz band. The simulated
estimate is 14.7 dB under the field-strength limit with the ≤ 20 cm wire;
±75 kHz of deviation fits the 200 kHz band (Carson: 180 kHz), so don't run
DEV higher than needed. The receiver's re-radiation is estimated 7.5 dB
under §15.109's 150 µV/m at 3 m with a 75 cm wire. **Simulation is not a measurement**: compliance
needs a field-strength check, and other countries' rules differ (some ban
unlicensed FM transmitters outright). Never transmit above 108 MHz.

## Tutorial PDF errata

`docs/fm-radio-lab-tutorial.pdf` describes the pre-review design. Its build
scripts (`extras/pdf-sources/`) need ReportLab/matplotlib and hard-coded
paths from the original authoring machine, so it hasn't been regenerated.
Where it disagrees with this README or the code, the code is right:

| PDF topic | Says | Now |
|---|---|---|
| FM mechanism | the oscillator transistor's own junction capacitance; "1.2 kHz/mV" | varactor D1 (1N4148) with R12/R13 bias, DEV pot RV1, R14, C14, C16; 0.13-0.59 kHz/mV |
| TX antenna | 3.3 pF from the tank into a 30-75 cm quarter-wave wire; "a few microwatts" | C13 1 pF : C15 100 pF divider, **≤ 20 cm wire**; ≈ −63 dBm worst case |
| Antenna experiment | try 20/40/75/150 cm on the transmitter, "75 cm dramatically best" | do NOT lengthen the TX wire (it raises radiation above the legal limit); try antenna lengths on the receiver |
| TX tank / range | "89-116 MHz"; no damping | R15 330 Ω damping, C17 12 pF padder; ≈ 80.9-104.4 MHz |
| TX bias | R7 220 Ω, R11 390 Ω | R7 100 Ω (preamp ≈ 19×), R11 680 Ω (Q2 ≈ 1.7 mA) |
| RX front end | antenna through 3.3 pF onto the tank; "86-112 MHz" | Q5 common-base buffer (R18-R21, C21), C3 1 nF, C22 1 pF; R22 1 kΩ damping; C17 12 pF padder; ≈ 80.7-105.2 MHz |
| Quench rate | 1/(0.693·(R9·C8+R8·C7)) ≈ 50 kHz | ≈ 70 kHz: R10/R11 load Q2's collector to ~5 V, so the capacitors only partly recharge (`npm run math` §8) |
| RX audio | R16 560 Ω; Q4 drives the earphone; "32 Ω earbuds work, quieter" | R16 120 Ω + R23 470 Ω ∥ C23 47 µF; Q6 + R24 emitter follower drives 32 Ω earbuds |
| Simulation chapter | RK4 of hand-written ODEs, ideal parts; "21/21", "37/37" | `calc/sim_fm.mjs` simulates the routed boards (22 checks); `calc/circuit_math.mjs` 43 checks |
| BOM | 33 + 42 parts | 43 + 55 parts: TX adds D1, R12-R15, C14-C17, RV1 (DEV); RX adds Q5, Q6, R18-R24, C17, C21-C23 |
| TX-RX overlap | "88-118 vs 86-112 MHz, 23 MHz" | both ≈ 81-105 MHz: the same coil and the same padder give the same window |

## License

MIT — like the rest of this repo.
