# Simulation — run and SEE these circuits in SPICE

Every board in this repo was designed with simulation in the loop — but until
now the simulators were custom scripts (`radio-lab/calc/sim_am.mjs`,
`fm-radio-lab/calc/*`, `tricolor-lamp/firmware/test/sim_*.c`). This folder
upgrades the whole repo to **tscircuit's built-in SPICE simulation**
(WebAssembly ngspice): the same circuits, expressed as `<board>`s with
probes, runnable three different ways — including **live graphs in your
browser**.

```
cd simulation
npm install            # once
npm run all            # typecheck → build → simulate → plot
```

The plots are committed: [`docs/plots/`](docs/plots/) — you can read them
without running anything.

---

## The three ways to run a simulation

### 1. In the browser — the one you "see" (recommended)

```bash
npm install -g tscircuit     # once (gives you the tsci command)
tsci dev circuits/01-rc-lowpass.tsx
```

A local dev server opens. Click **More views → Analog Simulation** (the tab
appears automatically for boards containing `<analogsimulation />`). You get
the schematic with probe arrows on top and the **live waveform graph**
below, re-run on every file save. This is the closest thing to a bench
oscilloscope: probes are your scope leads, the graph is the screen.

### 2. In the terminal — the quick numeric check

```bash
tsci simulate analog circuits/01-rc-lowpass.tsx
```

Prints the waveform as a table (time, each probe's voltage, source current).
Great for piping into other tools, bad for "seeing" — which is what way 1
and way 3 are for.

### 3. Headless, with real transistor models — what `npm run sim` does

```bash
npm run build               # compile circuits/*.tsx → dist/
npm run sim                 # simulate all of them, save data as JSON
npm run plots               # render docs/plots/*.png (needs python3 + matplotlib)
```

`tools/sim.mjs` does what `tsci simulate` does, but keeps the data and adds
two powers the CLI doesn't have yet:

- **Real vendor model cards.** tscircuit's netlister currently emits a
  generic `.MODEL NPN NPN` for transistors and a bare `.MODEL D D` for
  diodes. A circuit file can export a `netlistPatch` — plain
  find-and-replace on the generated SPICE netlist — and `sim.mjs` splices a
  real ON Semiconductor 2N3904 (circuit 07) or Vishay 1N4148 (circuit 06)
  model over the generic one before running. This is the classic SPICE
  workflow: vendor model cards in, netlist text out.
- **Math channels** (`tools/recipes.mjs`): derived series like
  `I_LED = (VR_TOP − VDRAIN) / 82Ω` — current measured the bench way, with
  a shunt resistor and Ohm's law, exactly like an oscilloscope's MATH trace.

---

## The seven circuits

Each file is heavily commented and stands alone. Together they cover **all
four classic SPICE analyses** and every analog stage family in this repo.

| # | File | Analysis | Teaches | Mirrors |
|---|------|----------|---------|---------|
| 01 | [rc-lowpass](circuits/01-rc-lowpass.tsx) | transient | time constants, cutoff frequency, why square waves come out rounded | every RC filter in the repo (detector, decoupling) |
| 02 | [transistor-switch](circuits/02-transistor-switch.tsx) | transient | saturation vs cutoff, base current → collector current (gain) | Q4 in the AM transmitter, the FM audio amps |
| 03 | [led-pwm-channel](circuits/03-led-pwm-channel.tsx) | transient | low-side MOSFET switching, PWM dimming, why PWM wastes no power | one channel of the tricolor lamp |
| 04 | [boost-converter](circuits/04-boost-converter.tsx) | transient | inductor flyback, duty-cycle → output voltage | the principle inside the arc-lighter's HV coil |
| 05 | [lc-tank-ac-sweep](circuits/05-lc-tank-ac-sweep.tsx) | **AC sweep** | resonance, Q, what the TUNE knob does; two second-order effects the bare formula hides | the AM receiver's input tank |
| 06 | [diode-iv-dc-sweep](circuits/06-diode-iv-dc-sweep.tsx) | **DC sweep** | the forward knee that makes rectification/detection work | the AM receiver's detector diode |
| 07 | [colpitts-oscillator](circuits/07-colpitts-oscillator.tsx) | transient | oscillator startup (Barkhausen), frequency vs tank values, real 2N3904 model | Q3, the AM transmitter's carrier stage |

The four analyses in one line each:

- **transient** — watch voltages vs *time* (switching, oscillation, startup)
- **AC sweep** — feed every *frequency* in, get the response curve out (filters, resonance)
- **DC sweep** — step a source *voltage*, get the operating curve (diode knees, transistor characteristics)
- **operating point** — the DC steady state of every node at once (element: `<analogdcoperatingpointsimulation />` — see the [docs](https://docs.tscircuit.com))

## What each plot shows (verified numbers)

- **01** — VOUT at the first half-period edge: 1.968 V vs theory
  `5·(1−e^(−0.5)) = 1.967 V`.
- **02** — collector swings 0.03 V (saturated) ↔ 8.99 V (cutoff, pulled to
  the 9 V rail).
- **03** — gate at 5 V → LED string current ≈ 46 mA (generic LED model);
  gate at 0 V → off, drain parked at 8.1 V (nA of ngspice "gmin" leakage
  through the LEDs — real LEDs leak too).
- **04** — output climbs to 15.3 V from a 5 V source at 68% duty
  (ideal `5/(1−0.68) = 15.6 V`).
- **05** — resonance peak at 760 kHz (not the bare-tank 876 kHz: the 47 pF
  antenna coupler is part of the resonant loop) with a 0.24 V high-frequency
  floor (the two capacitors form a divider: `47/(47+150)`). The simulated
  curve matches the analytic network response to 4 decimal places.
- **06** — 1N4148 knee: 0.66 V at 1 mA; 0.69 V across the diode itself at
  5 mA (datasheet: ~0.72 V).
- **07** — oscillation builds from the turn-on step and sustains at ~10 Vp;
  measured period 1.400 µs → **714 kHz vs theory 719 kHz (0.7% error)**.

## How it works, end to end

```
circuits/01-rc-lowpass.tsx          your board: parts + traces + probes
        │  tscircuit core renders it
        ▼
circuit-json "soup"                 source_* elements, and simulation_*
        │  elements: experiments, probes, sources, switches…
        ▼
SPICE netlist                       RR1 VIN VOUT 1K …  .tran … UIC
        │  (optionally patched with a real model card)
        ▼
WebAssembly ngspice (eecircuit)     the actual 50-year-old SPICE kernel
        ▼
graph elements → table / SVG graph / JSON → matplotlib PNG
```

The probes are the glue: `<voltageprobe name="VOUT" connectsTo="…" />`
becomes a named node in the netlist, a `V(VOUT)` column in the result, and a
curve in every view. `<voltagesource waveShape="square" … />` becomes a
`PULSE(...)` line; `<switch simSwitchFrequency="1kHz" />` becomes a
voltage-controlled switch driven by its own pulse source.

## Requirements & quirks (honest notes)

- **`tsci dev` / `tsci simulate`** need the [tscircuit
  CLI](https://docs.tscircuit.com) (`npm i -g tscircuit`). The in-browser
  engine is fetched from tscircuit's CDN on first run — you need network the
  first time.
- **`npm run sim`** works under plain Node ≥ 18 (a small shim in
  `tools/engine.mjs` converts the engine's `blob:` URL import into a `data:`
  URL — Node's loader rejects blob URLs; Bun works out of the box).
- **`npm run plots`** needs Python 3 with `numpy` + `matplotlib`. The PNGs
  are committed, so this is only for regenerating.
- **`<ammeter />`** (series current probe) is still rough in current
  tscircuit: wired via its `connections` prop it shorts the two nets
  ("shorted VSRC"); wired via traces it disconnects them. This repo measures
  current the bench way instead — shunt resistor + two voltage probes +
  Ohm's law (`tools/recipes.mjs`). Watch [tscircuit's
  roadmap](https://github.com/tscircuit/tscircuit) — this will get fixed.
- **`<spicemodel />`** (attaching vendor subcircuits to parts) is documented
  but not yet in the released core — that's why `netlistPatch` exists.
- The `pcb_missing_footprint_error`s you may see in `tsci dev`'s error view
  are expected: these files are `routingDisabled` simulation views; the real
  footprints live in each project's board.
- Circuit 07 runs everywhere: with the CLI you get the generic transistor
  model (still oscillates); with `npm run sim` you get the real 2N3904.

## Where to read more

- tscircuit SPICE guide: <https://docs.tscircuit.com/category/spice-simulation>
- The `<analogsimulation />` element reference:
  <https://docs.tscircuit.com/elements/analogsimulation>
- This repo's course chapter on simulation:
  [`learn/11-simulation.md`](../learn/11-simulation.md)
- The custom physics simulators that preceded this (deep math, per project):
  `radio-lab/calc/`, `fm-radio-lab/calc/`, `tricolor-lamp/firmware/test/`
