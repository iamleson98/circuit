# FM Radio Lab — build your own FM station (and hear it work)

A **beginner-friendly FM transmitter + super-regenerative receiver pair**,
designed in [tscircuit](https://tscircuit.com) (React for circuits), simulated
to prove every claim, and buildable with ~$15 of through-hole parts and one
hand-wound coil.

Speak into the transmitter; sweep the receiver's **TUNE** knob slowly across
the band until the hiss collapses into your own voice. That collapse — the
quieting *thump* — is the sound of radio-wave capture, and **the silence is
the signal**. The receiver also quiets to real broadcast stations with a
longer antenna.

The receiver is the star: its detector is **literally the transmitter's
oscillator** (same coil, same trimmer, same feedback divider — diff the two
files), strangled 50,000 times a second by a two-transistor astable. That is
*super-regeneration* — 10⁴-10⁶ of gain from one transistor, the 1940s way.

```
fm-radio-lab/
├── transmitter/index.tsx    ← FM-TX: mic/aux → preamp → common-base Colpitts
│                               oscillator (the transistor's own junction caps
│                               perform the FM!) → 3.3pF → wire antenna
├── receiver/index.tsx       ← FM-RX: antenna → THE SAME Colpitts core (the
│                               detector) → externally quenched by Q2+Q3
│                               (astable ~50kHz) → 2-pole audio filter →
│                               volume pot → class-A amp → earphone
├── lib/parts.tsx            ← custom radio parts (battery, switch, pot, coil,
│                               trimmer, antenna, earphone, TO-92)
├── calc/circuit_math.mjs    ← every design equation, asserted (37 checks)
├── calc/sim_fm.mjs          ← RK4 numerical proof at 2-picosecond steps: the
│                               oscillator starts at the HONEST transistor α,
│                               FM tracks the audio at ±75kHz, the detector
│                               self-quenches on schedule, quiets to a carrier,
│                               and slope-detects FM end-to-end (21 checks)
├── standalone/              ← single-file versions for snippets.tscircuit.com
├── docs/fm-radio-lab-tutorial.pdf  ← the 21-page theory→build→experiment book
├── verify.mjs               ← headless board audit (components/nets/traces)
├── layout_check.py          ← instant courtyard-overlap placement checker
└── render.mjs / svg2png.mjs ← PCB + schematic renders
```

## Quick start

```bash
cd fm-radio-lab
npm install -g tscircuit   # once — provides the `tsci` CLI
npm install
npm run dev:tx             # → transmitter in the browser (PCB / schematic / 3D)
npm run dev:rx             # → receiver
```

Zero-install alternative: open <https://snippets.tscircuit.com> and paste in
`standalone/fm-tx-playground.tsx` or `standalone/fm-rx-playground.tsx`.

**Start with `docs/fm-radio-lab-tutorial.pdf`** — FM theory in ten minutes,
both boards stage by stage, the super-regeneration story (including *why*
this design uses an external quench — a genuinely interesting transistor
lesson), the build + bring-up ritual, experiments, and a troubleshooting tree.

## Verification (all re-runnable on your machine)

| Gate | Command | Result | What it proves |
|---|---|---|---|
| Design math | `npm run math` | **37/37** | Every bias point, tank range, quench rate, filter corner, battery budget, and the 23 MHz TX↔RX tuning overlap |
| Numerical simulation | `npm run sim` (~6 min) | **21/21** | Oscillator start-up (4.6 Vp), tuning sweep, FM sensitivity (1.2 kHz/mV), ±75 kHz deviation with phase agreement, one-burst-per-quench-cycle, quieting, **end-to-end FM slope detection at 21× noise floor** |
| Typecheck | `npm run check` | clean | The boards are valid TypeScript + tscircuit |
| Build | `npm run build` | clean | Compiles to runnable ESM |
| Board audit | `npm run verify` | **0 errors** | 33+42 components, 14+3 nets, 155/155 ports wired, 121 traces routed, zero DRC errors |
| Renders | `npm run render` + `node svg2png.mjs` | PNGs | PCB + schematic for both boards |
| Placement | `python3 layout_check.py` | clean | No courtyard overlaps (instant, pre-DRC) |

The simulation is not decorative. It runs the exact nonlinear ODEs (Ebers-Moll
with **voltage-dependent junction capacitances** — because that voltage
dependence IS the FM mechanism) at 2 ps steps with an honest 2N2222A model at
98 MHz (α = 0.67 from fT ≈ 200 MHz — the folklore value of 0.92 implies a
1.7 GHz transistor). Two would-be-fatal design errors were caught and fixed
this way. The tutorial's Chapter 5 tells that story.

## The boards

| | FM-TX | FM-RX |
|---|---|---|
| Transistors | 2 (2N2222A-class) | 4 |
| Parts | 33 | 42 |
| Size | 99 × 64 mm | 99 × 89 mm |
| Traces routed | 52 | 69 |
| Current | ~7 mA | ~8.2 mA |
| Battery (9 V alkaline) | ≈ 75 h | ≈ 67 h |
| Band | 89-116 MHz (TUNE) | 86-112 MHz (TUNE) |

Both share the same hand-wound coil: **3 turns of 0.5-0.6 mm wire on a 5 mm
form, stretched to ~2.4 mm** (~60 nH). Gerbers export cleanly via
`tsci export --format gerbers`.

## Legal note

Unlicensed FM transmission is legal only at micro-power levels (e.g. FCC
§15.239 in the US: 250 µV/m at 3 m). This design's 3.3 pF antenna coupling
and short wire keep it in that territory — a room, maybe a small house.
Keep it there.

## Headless tooling notes

- `npm run sim` writes `sim-*.csv` plots data (gitignored) used by the
  tutorial's figures — regenerated on every run.
- `verify.mjs` distinguishes nothing: any error element fails the build.
- `tsci build` on the standalone files is the web-editor compatibility check
  (both pass).
