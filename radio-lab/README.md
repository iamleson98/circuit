# Radio Lab — build your own AM radio station (and hear it work)

A **beginner-friendly AM transmitter + receiver pair**, designed in
[tscircuit](https://tscircuit.com) (React for circuits), simulated to prove it
oscillates, and buildable on a perfboard with ~$15 of through-hole parts.

Speak into the transmitter's microphone; tune the receiver across the band
until you find yourself. Turn **TUNE** on either board and listen to the
station slide away — that knob IS the physics lesson. The receiver also hears
real broadcast stations (VOV1 630/675 kHz etc.) with a longer antenna.

```
radio-lab/
├── transmitter/index.tsx    ← AM-TX: mic → preamp → modulator → Colpitts
│                               oscillator → modulated final → wire antenna
├── receiver/index.tsx       ← AM-RX: antenna → LC tank → buffer → RF amp →
│                               1N34A detector → volume → LM386 → speaker
├── lib/parts.tsx            ← custom radio parts (battery, switch, mic,
│                               speaker, polyvaricon, antenna, LM386, TO-92)
├── calc/circuit_math.mjs    ← every design equation, asserted (29 checks)
├── calc/sim_colpitts.mjs    ← RK4 numerical proof: the oscillator starts,
│                               tunes 666-847 kHz, and the final stage
│                               amplitude-modulates (7 checks)
├── standalone/              ← single-file versions for snippets.tscircuit.com
├── docs/radio-lab-tutorial.pdf  ← the 24-page theory→build→experiment book
├── verify.mjs               ← headless board audit (components/nets/traces)
└── render.mjs / svg2png.mjs ← PCB + schematic renders
```

## Quick start

```bash
git clone https://github.com/iamleson98/circuit
cd circuit/radio-lab
npm install            # or: npm ci
npm run dev:tx         # interactive PCB/schematic/3D view of the transmitter
npm run dev:rx         # ...and the receiver
```

Zero-install alternative: open <https://snippets.tscircuit.com> and paste in
`standalone/am-tx-playground.tsx` or `standalone/am-rx-playground.tsx`.

## The full verification suite

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npm run check` | 0 errors |
| Build | `npm run build` | clean (with ESM import fixer) |
| Board audit | `npm run verify` | 2 boards, 0 errors — AM-TX: 36 parts, 58 traces; AM-RX: 40 parts, 64 traces |
| Design math | `npm run math` | **29/29 assertions pass** |
| Oscillator simulation | `npm run sim` | **7/7 tests pass** (RK4, Ebers-Moll) |
| tscircuit CLI | `tsci build transmitter/index.tsx` / `receiver/index.tsx` | exit 0, both |
| Manufacturing | `tsci export <board> --format gerbers` | full 13-file set, both |
| Visual | renders + VLM inspection | no overlaps, no shorts, labels legible |

### Two design flaws the simulation caught (and fixed)

1. **Tank topology** — the first draft hung the tank coil from collector to
   ground. At DC a coil is a short circuit, so the collector would sit at 0V,
   deep in saturation: a dead oscillator. The classic fix (coil from collector
   to the supply rail — it doubles as the DC feed) is in the final design.
2. **Feedback strength** — a "textbook" symmetric 220pF/220pF feedback pair
   presents a negative resistance of ~−20kΩ against a ~20kΩ tank: provably
   unable to start. The shipped 680pF/680pF pair yields ~−2.3kΩ with a 2.2×
   margin (worst case 1.57× at the slow end of the band).

That's the workflow this repo teaches: **design → prove → build**.

## The boards (all through-hole, 0.1" grid)

| | AM-TX | AM-RX |
|---|---|---|
| Size | 91.44 × 55.88 mm | 99.06 × 60.96 mm |
| Active parts | 4× BC547/2N3904 | 3× BC547/2N3904, 1N34A, LM386 |
| Tuning | CV1 (10-280pF polyvaricon): 633-836 kHz (ideal) | CV1: 614 kHz-1.8 MHz |
| Battery | 9V, ~6.5mA (~80h) | 9V, ~10mA (~50h) |
| Extras | mic, 1-2m wire antenna | 10k volume pot, GAIN 20/200 switch, signal LED, 8Ω speaker |

Both PCBs use a 2.54mm placement grid and a bottom-layer GND pour — the
layout doubles as a perfboard placement guide.

## Documentation

**Read `docs/radio-lab-tutorial.pdf`** — it covers how radio actually works
(waves, AM, resonance, detection), every stage's design math, the BOM with
part numbers, perfboard build guide, the TX→RX tuning procedure, 12
experiments, troubleshooting, and the regulations picture.

## Legal note

The transmitter's DC input to the final stage is ~5mW — far below the 100mW
of the US FCC Part 15.219 unlicensed rules (which also cap the antenna at 3m
— keep the wire ≤ 2m). Other countries have similar low-power exemptions;
check yours before transmitting. The receiver, of course, is always legal.

## License

MIT — like the rest of this repo.
