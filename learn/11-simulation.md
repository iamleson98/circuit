# Chapter 11 — Simulation: run the circuits before you build them

> **What you will be able to do afterwards:** run every circuit in this
> repo in a SPICE simulator, read the waveforms like an oscilloscope screen,
> know the four kinds of analysis and when each is the right tool, and
> understand what the simulator is actually *doing* under the hood (it is
> not magic — it is arithmetic). Everything runs from the
> [`simulation/`](../simulation) folder with two commands.

Every board in this repo was born twice: once in simulation and once as a
design. The radio-lab transmitter's oscillator, for example, was proven to
start **before** any copper was laid — and the simulation caught two
would-have-been-fatal design flaws first (a coil that shorted the
transistor's power, and a feedback pair that could never oscillate). That is
the job of simulation: it is the cheapest possible prototype. It costs
nothing to be wrong in a simulator.

This chapter teaches you to use it. The practical home for everything here
is [`simulation/`](../simulation) — seven ready-made circuits, each one a
self-contained lesson with heavy comments.

---

## 11.1 What a simulator actually does

A circuit simulator is a **physics calculator**. You describe a circuit
(parts + how they connect), and it solves one question, over and over:

> "Given these components and this instant in time, what voltage must every
> node sit at so that no law of physics is violated?"

The "laws" are the two you may know from school, plus one per part:

- **Kirchhoff's current law** — current into any point equals current out.
- **Kirchhoff's voltage law** — voltages around any loop add to zero.
- **Part equations** — each component's personality: a resistor's
  `V = I·R`, a diode's steep exponential, a capacitor's "current only flows
  when its voltage is *changing*", an inductor's mirror-image behavior.

No formula exists that solves that system for a real circuit in one shot.
So the simulator **discretizes time**: it chops your 10 milliseconds into
thousands of slices, assumes the capacitors and inductors hold still for
each tiny slice, solves the whole simultaneous equation set (hundreds of
equations, solved by matrix algebra at each step), and steps forward. That
is why `<analogsimulation duration="10ms" timePerStep="0.05ms" />` exists:
you are literally telling the solver how finely to slice time. Too coarse
and the answer is wrong; too fine and you wait all day.

The engine doing this in our repo is **ngspice** — an open-source
descendant of SPICE, the simulator written at Berkeley in 1973 that the
entire electronics industry still runs on. tscircuit compiles it to
WebAssembly so it runs in your browser and in Node.

## 11.2 The four kinds of analysis

All of SPICE boils down to four questions. Learn them as a matched set:

| Analysis | The question it answers | You give it | You get back |
|---|---|---|---|
| **Transient** (`tran`) | "What happens *over time*?" | a duration + time step | waveforms — the oscilloscope view |
| **Operating point** (`op`) | "Where does it *rest*?" | nothing (just the circuit) | one voltage per node, DC steady state |
| **DC sweep** (`dc`) | "How does the answer move as I *turn one knob*?" | a source + start/stop/step | a curve of output vs the knob |
| **AC sweep** (`ac`) | "Which *frequencies* get through?" | a frequency range | a frequency response curve |

Two mnemonics that stick:

- Transient is **time**; AC sweep is **frequency**. They are two windows
  onto the same circuit (and Fourier's theorem says they are secretly the
  same information).
- Operating point is the DC sweep's "one knob, zero turns" special case.

In tscircuit each analysis is an element you drop inside the board:

```tsx
<analogsimulation duration="10ms" timePerStep="0.05ms" spiceEngine="ngspice" />
<analogdcsweepsimulation sweepSource=".V1" sweepStart="0V" sweepStop="1V" sweepStep="0.005V" />
<analogacsweepsimulation sweepType="decade" startFrequency="100kHz" stopFrequency="10MHz" samplesPerInterval={40} />
```

And you cannot see anything without **probes** — the simulator computes
every node's voltage anyway, but only probed nodes are saved and drawn:

```tsx
<voltageprobe name="VOUT" connectsTo=".C1 > .pin1" />
```

Think of probes exactly like oscilloscope leads: clip one anywhere, and that
point's voltage becomes a curve. Probes exist only in simulation — they
cost nothing and appear on no PCB.

## 11.3 Hands-on: run your first simulation (2 minutes)

```bash
cd simulation
npm install                    # once
npm run dev:01                 # starts tsci dev on circuit 01
```

The browser opens. Click **More views → Analog Simulation**. That is the
whole trick — you are now looking at a live oscilloscope:

- the **schematic** on top, with arrows marking where your probes point
- the **waveform graph** below, re-simulated every time you save the file.

Change `resistance="1k"` to `resistance="100k"` in
`circuits/01-rc-lowpass.tsx`, save, and watch the output flatten — you just
moved the filter's cutoff frequency `f_c = 1/(2πRC)` from 159 Hz down to
1.6 Hz, live. That feedback loop — edit, save, *see* — is the entire
addiction of simulation-driven design.

Two more ways to run the same file, no browser needed:

```bash
tsci simulate analog circuits/01-rc-lowpass.tsx   # prints a numeric table
npm run build && npm run sim && npm run plots     # headless → PNG plots
```

The second one is worth understanding, not just running — see §11.6.

## 11.4 The seven circuits, in reading order

Each file in [`simulation/circuits/`](../simulation/circuits) opens with a
comment block explaining what it is, which real board it mirrors, and what
to watch for. The short course:

**01 — RC low-pass (transient).** The "hello world": a square wave into a
resistor-capacitor pair. Watch the output charge *most of the way* each
half period but never finish — that partial charge IS the filtering. The
verification number to remember: after one half-period the output reads
1.968 V; the formula `5·(1−e^(−0.5))` predicts 1.967 V. When simulator and
formula agree to three decimals, you can start trusting both.

**02 — Transistor switch (transient).** A 1 kHz switch on the base, a
resistor on the collector. When the switch closes, a tiny base current
(≈0.7 mA) commands a large collector current — the collector slams to
0.03 V (saturated). When it opens, the collector floats up to 8.99 V.
That on/off pair is the atom of all digital electronics, and it is the
exact stage the AM transmitter uses for its final amplifier.

**03 — LED channel + PWM (transient).** One channel of the tricolor lamp:
a logic-level MOSFET switching a 12 V LED string, driven by a 35%-duty
square wave — the same PWM the lamp's firmware uses for its fade mode. The
gate plot is the *logic* world (0/5 V); the drain plot is the *power*
world (12 V / near-0 V); the current plot (a math channel, §11.6) shows
the LED gulping ~46 mA exactly 35% of the time. Your eye averages the
gulps into "dimmer" — and because the LED is never *half* on, almost no
energy is wasted as heat. That is why PWM is everywhere.

**04 — Boost converter (transient).** 5 V in, 15.3 V out, no transformer —
just an inductor, a switch, a diode and a capacitor. The theory line
`Vout = Vin/(1−duty)` predicts 15.6 V for 68% duty; the sim says 15.3 V
(the diode's 0.7 V and other losses eat the difference — also a lesson).
This is the principle inside the arc lighter's high-voltage coil, slowed
down 10,000× so you can watch the output climb cycle by cycle.

**05 — LC tank, AC sweep.** The AM receiver's TUNE circuit. Instead of one
long time run, the analyzer asks "if I fed you every frequency from 100 kHz
to 10 MHz, how much of each would appear on the tank?" The answer is a
curve with a sharp peak — resonance, at ~760 kHz. Two honest details the
sim surfaced that the textbook formula (876 kHz) hides: the antenna's 47 pF
coupling capacitor is part of the resonance and drags it down, and above
resonance the response floors at 0.24 V instead of vanishing (the two
capacitors form a divider — strong nearby stations can leak through, which
is why real receivers add filter stages). **A simulation you believe is one
you have cross-checked against an independent calculation** — here the
curve matches the analytic network equation to four decimal places.

**06 — Diode V-I, DC sweep.** The "knob" being turned is the source
voltage, 0 → 1 V in 5 mV steps. The diode's current stays at essentially
zero until ~0.6 V and then climbs a wall — the forward knee. That wall is
why the receiver's detector can slice the positive half of an RF wave off
the negative half. This circuit also carries a real **vendor model card**
(§11.5) — a Vishay 1N4148, whose 0.69 V drop at 5 mA matches the
datasheet's 0.72 V within model tolerance.

**07 — Colpitts oscillator (transient).** The crown jewel: the AM
transmitter's actual carrier oscillator, component values straight off the
board, running on a real 2N3904 model. Watch nothing at t = 0, then
watch the oscillation *grow itself* out of the turn-on step and settle at
~10 V peak. Physics does its own automatic gain control: the loop gain is
>1 while the amplitude is small (Barkhausen's criterion — it amplifies
noise), and <1 once the transistor's nonlinearity bites. Measure the
period on the detail panel: 1.400 µs → **714 kHz, versus the design's
719 kHz**. Then change `CV1 capacitance="150pF"` to `"280pF"`, re-run, and
watch the carrier slide down the band — you have just turned the TUNE
knob.

## 11.5 Models: the difference between a cartoon and a component

SPICE does not simulate "a 2N3904" — it evaluates an **equation set with
two dozen numbers** (IS, BF, CJE, TF…): the *model card*. The numbers come
from the manufacturer. Get them right and the simulation tracks the real
part; get them wrong and you simulated a different transistor.

tscircuit's netlister currently emits a **generic** card for `<transistor>`
(`.MODEL NPN NPN` — ngspice's 1975 defaults) and a bare one for `<diode>`.
Fine for switching demos; too ideal for oscillator startup margins. Circuit
07 shows the professional fix, using the same trick engineers have used
since punch cards: **patch the netlist text**. The file exports

```ts
export const netlistPatch = {
  ".MODEL NPN NPN": `.MODEL NPN NPN ( IS=6.734f ... Rb=10 )`,  // real 2N3904
}
```

and `tools/sim.mjs` splices it over the generated netlist before running.
The values are ON Semiconductor's published card — the same numbers any
SPICE user pastes in from a datasheet CD or a vendor website. (tscircuit's
own `<spicemodel />` element will make this unnecessary once it ships in a
release — the README's "quirks" section tracks that.)

The two model worlds are worth seeing side by side: run circuit 07 with
`tsci simulate` (generic model — still oscillates) and with `npm run sim`
(real model — 714 kHz, matching the board's design math).

## 11.6 Measuring current: a bench lesson from a simulator limitation

tscircuit's `<ammeter />` (series current probe) is still young — in
current releases it either shorts its two nodes together or disconnects
them. Rather than wait, the simulation folder measures current the way
every bench in the world does it:

1. put a small **shunt resistor** of known value in series where you want
   the current,
2. probe the voltage across it,
3. apply **Ohm's law**: `I = V / R`.

That is exactly what your multimeter does internally. In circuit 06 it is
one probe (`I = VSI_A / 47Ω`); in circuit 03 the shunt floats, so two
probes and a subtraction (`I = (VR_TOP − VDRAIN) / 82Ω`). The
subtractions live in [`tools/recipes.mjs`](../simulation/tools/recipes.mjs)
as "math channels" — the same feature name oscilloscopes use for derived
traces.

The general lesson outlives this repo: **when a tool can't measure
something, measure something it can and derive the rest.**

## 11.7 What simulation will and won't tell you

Trust the simulator for **topology and first-order behavior** — does the
oscillator start, where is the resonance, how big is the LED current,
which stage clips first. This repo exists because those questions were
answered in simulation first.

Distrust it for **the last 10%**: real parts have tolerances (±20% on some
capacitors), parasitics (every trace is a tiny inductor; every pad adds
capacitance), temperature drift, and noise the model never heard of. The
FM receiver in this repo is a monument to that gap: its "textbook"
self-quenching topology *simulated fine with idealized transistors* and
latches solid with honest ones — the final design needed an external
quench oscillator, found by studying the physics the idealized sim hid.
(That whole detective story is in `fm-radio-lab/calc/` and its tutorial
PDF.)

The working rule used throughout this repo: **simulate until you believe
the topology, then design margins as if the simulation is 20% wrong,
then measure the real board and reconcile.**

## 11.8 Your turn

1. Run all seven: `npm run all`, then open `docs/plots/` and match each
   plot to the "verified numbers" list in the simulation README.
2. Break circuit 01 on purpose: set `timePerStep` to `2ms` (coarser than
   the signal) and watch the plot degrade — you have met *undersampling*.
3. Re-tune circuit 05 for the top of the AM band: solve `1/(2π√(220µH·C))
   = 1.6 MHz` for C, set CV1, re-run, and check yourself against the peak.
4. Change circuit 07's CV1 from 150 pF to 280 pF and verify the carrier
   lands where `1/(2π√(100µH·(340pF+C)))` says it should.
5. Open `tsci dev` on circuit 03, set `dutyCycle` to 0.1, and watch the
   LED current pulses thin out — that is what the lamp's FADE mode does
   to your eyes.

Where to go next: the [tscircuit SPICE simulation
guide](https://docs.tscircuit.com/category/spice-simulation) (official,
with more element examples), and for the deep end, the ngspice manual
itself — everything in this chapter is the first 40 pages of a
500-page iceberg.
