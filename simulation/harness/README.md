# The simulation harness — this repo's REAL boards, simulated

The [SPICE lab](../) teaches with seven standalone circuits. **This harness
simulates the actual boards**: every `index.tsx` in the repo's five projects is
rendered, netlisted and simulated straight from its routed source — the same
parts, values, and nets you see in the schematic — with only the *off-board*
world (battery, USB port, antenna, coil, the inside of chips) modelled at the
pads. Every run also prints physics **checks** against the design's own
numbers, so a passing run means *verified*, not just *ran*.

```
cd simulation
npm install                                   # once (this folder)
cd ../<project> && npm install && npm run build   # once per project you want
cd ../simulation
npm run harness            # simulate every board (≈ 10 min — see the table)
npm run harness:plots      # → harness/out/plots/*.png  (committed already)
npm run harness -- unode-32u4 arc-lighter     # just some boards
node harness/tools/inspect-board.mjs          # what SPICE sees on any board
```

Plots, decks and (decimated) data are committed — you can read everything
without running anything.

---

## What gets simulated (all green as of the last run)

| Board | Scenario | What you see | Verified numbers |
|---|---|---|---|
| **μNode32U4** (ATmega32U4 dev board) — *first-ever sim coverage* | [`usb-hotplug`](out/plots/unode-32u4.usb-hotplug.png) | VBUS steps 0→5 V through the polyfuse into the bulk caps | 5.7 A inrush peak, τ = 5.0 µs vs R·C theory 5.4 µs, V5 settles at 4.91 V |
| | [`avcc-isolation`](out/plots/unode-32u4.avcc-isolation.png) | AC sweep: ferrite beads + 100 nF vs rail noise | −9.4 dB @ 1 MHz (just past the bead-cap series resonance!), −54 dB @ 10 MHz, −56 dB @ 100 MHz |
| | [`crystal-resonance`](out/plots/unode-32u4.crystal-resonance.png) | the 16 MHz crystal's razor-thin series-resonance dip | dip at 15.9987 MHz (theory 15.9973), 5.9× contrast, Q ≈ 6,450 |
| | [`crystal-ring`](out/plots/unode-32u4.crystal-ring.png) | pluck the crystal; it rings thousands of cycles | 15.9968 MHz, τ = 84 µs → ring-down Q ≥ 4,200 (rated 10,000 — see honest notes) |
| | [`indicators`](out/plots/unode-32u4.indicators.png) | DC operating point of the four LEDs | 2.96 / 2.89 / 2.89 / 2.89 mA — and *why* TX/RX are active-LOW |
| **Arc lighter** | [`firing`](out/plots/arc-lighter.firing.png) | the blocking oscillator running: collector flyback, current limit, arc | 15,000 strikes/s, 3.0 A peak (limit 3.6), collector clamped at 39 V, 1.9 A battery average |
| **Radio Lab AM-TX** | [`am-modulation`](out/plots/radio-lab-tx.am-modulation.png) | voice in, AM out: the envelope IS the audio | 753 kHz carrier, m = 19.9 %, envelope at 1,003 Hz for a 1 kHz tone |
| **Radio Lab AM-RX** | [`receiving`](out/plots/radio-lab-rx.receiving.png) | a 30 mV station arrives; the set receives it | tank peaks at 819 kHz, 194 mVpk at the detector, ×9 through the LM386 to 1.8 Vpk |
| **FM Radio Lab TX** | [`fm-deviation`](out/plots/fm-radio-lab-tx.fm-deviation.png) | the FM modulation characteristic itself | 90.32 MHz carrier, −0.45 kHz/mV of voice (±23 kHz over ±50 mV) |
| **FM Radio Lab RX** | [`super-regen`](out/plots/fm-radio-lab-rx.super-regen.png) | the super-regen: RF bursts once per quench cycle | quench 69.4 kHz (ultrasonic), bursts at 92.1 MHz, 0.87 Vpk, ignition 2.0 µs after each edge |
| **Tricolor lamp** (controller + LED panel, **two boards as one deck**) | [`pwm-channel`](out/plots/tricolor-lamp.pwm-channel.png) | 35 % PWM end-to-end: gate → MOSFET → LED strings | 16.1 mA peak (the panel's own design number for a yellow string), 5.6 mA average = 35 % × peak, rail ≥ 11.7 V |

Everything above is **the boards' own netlist**: the passives, diodes,
transistors, pots and switches come from the rendered `index.tsx` via
`board_to_spice.mjs`, so if the board changes, the simulation changes.

---

## How it works

```
<project>/index.tsx          the real board (React/tscircuit source)
   │  @tscircuit/core renders it
   ▼
circuit JSON                 every part, pin and trace (tools/render.mjs)
   │  harness/tools/board_to_spice.mjs
   │    • R/C/L/D/LED/transistor/pot/switch → SPICE elements, own refdes+values
   │    • every OTHER part (chips, connectors, the off-board world) must have
   │      a handler in its testbench — the netlister REFUSES to guess
   ▼
SPICE deck (.cir)            harness/out/decks/*.cir — plain SPICE text:
   │                         open it, read it, run it in ngspice/LTspice too
   │  harness/tools/spice.mjs  (a compact MNA simulator: DC/AC/transient,
   │   Gummel-Poon BJTs, coupled inductors, switches, a spark-gap element)
   ▼
series + checks              harness/run.mjs  →  out/data/*.json + console ✓/✗
   │  harness/plot.py
   ▼
out/plots/*.png              waveforms, sweeps and result cards
```

Three ideas make this a *harness* rather than a pile of scripts:

1. **The board is the netlist.** Each project's board is rendered from its
   actual source at run time — nothing is transcribed by hand.
2. **Everything SPICE can't know is explicit.** A part without a model
   (battery, antenna, the ATmega32U4's internals…) must be described by a
   small handler in `testbenches/*.mjs`, or the run stops. The behavioural
   stand-ins (LM386, 78L05, the crystal's motional arm, the arc coil) are
   documented inline, next to their use.
3. **Every scenario checks itself.** Each one ends with assertions that
   compare the simulation against the design's own math (R·C time constants,
   modulation depth, Q, current limits…) — the run exits non-zero if any
   fails, so the harness is CI-able.

## Reading the decks, and running them elsewhere

`harness/out/decks/<board>.<scenario>.cir` is generated SPICE text with a
comment header for every modelled part. It uses standard SPICE syntax
(`.model`, `R/L/C/D/Q`, `PULSE`, `SIN`, `.tran`) plus three elements from the
harness's own engine: `S` (a switch set by test code), `Y` (a spark gap) and
`K` (mutual coupling) — the first two you'd replace by a voltage-controlled
switch / a breakdown model in another simulator.

## Writing your own scenario

A testbench is one file in `testbenches/` exporting a list of scenarios:

```js
export default {
  id: "my-board", title: "My board", project: "my-board", boardFile: "dist/index.js",
  scenarios: [(ctx) => {
    // ctx: { json, boardToSpice, MODELS, Circuit, freq, amp, mean, ... }
    const { deck } = ctx.boardToSpice(ctx.json, {
      title: "my scenario",
      parts: {
        BT1: ({ node }) => `VBT1 bt 0 9`,      // off-board parts, at their pads
        U1: ({ node }) => `* U1: stubbed`,      // chips: acknowledge explicitly
      },
    })
    return {
      name: "my-scenario", what: "one-line story",
      deck: ctx.MODELS + deck, cirTrailer: ".tran 1u 1m",
      run() {
        const c = new ctx.Circuit(this.deck)
        const r = c.tran({ tstop: 1e-3, h: 1e-6, probes: ["out"] })
        return {
          series: [{ label: "OUT", unit: "V", kind: "transient",
                     x: r.t.map(t => t*1e3), y: r.out }],
          checks: [{ label: "settles near 5 V", ok: Math.abs(r.out.at(-1) - 5) < 0.1 }],
          summary: `final ${r.out.at(-1).toFixed(2)} V`,
        }
      },
    }
  }],
}
```

Run `node harness/tools/inspect-board.mjs <board-id>` first — it prints every
part with its ftype and every net, plus the pins of the parts that need
handlers.

## Honest notes (read before trusting any simulator)

- **Chips are stubs, deliberately.** The ATmega32U4, ATtiny85, MCP73831 and
  LM386 are behavioural stand-ins at their pins (documented in each handler).
  The scenarios are about what happens *around* the chips.
- **High-Q rings and time-step damping.** The crystal scenario's ring-down
  decays faster than pure physics (τ 84 µs measured vs 199 µs theoretical)
  because a trapezoidal integrator at finite step size damps very high-Q
  resonators a little — that's why the resonance's Q is measured two ways,
  and why the AC (frequency-domain) number is the better one. Real SPICE has
  the same property.
- **Numerical noise floors.** A µV-level crystal ring on a 2.5 V bias is near
  the solver's convergence floor; the crystal scenarios run with tightened
  tolerances (`reltol/vntol 1e-9` — SPICE's classic knobs) to resolve it.
- **Driven starts.** Oscillators are seeded explicitly (a current kick, a
  noise burst) because a cold start from numerical nothing takes ms of
  simulated time; the seeding is documented in each deck.

## Where this sits among the repo's simulators

- `simulation/circuits/` — the [teaching lab](../README.md): seven standalone
  circuits with `<analogsimulation>`, viewable live in the browser (`tsci dev`).
- **this harness** — the real boards, headless, with physics checks and plots.
- `<project>/calc/` — each project's own *deep* verification (corner sweeps,
  FCC limits, brown-out behaviour…). The harness reuses its modelling
  conventions; when you want the full Monte, go there.
