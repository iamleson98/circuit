# Tri-Color Lamp — a lamp that changes colour every time you flip the switch

Flip the wall switch on: the lamp glows **blue**. Flip it off and on again:
**white**. Again: **yellow**. Again: blue … exactly like the "3-colour"
LED ceiling lamps sold everywhere — but this one is yours, runs on safe
12 V, and every part of it is explained here from zero.

```
 wall switch ─► certified 12 V power supply ─► CONTROLLER board ─► LED PANEL board
  (mains)        (store-bought, sealed)        (the brain)          (60 LEDs: blue, white, yellow)
```

Two boards designed in [tscircuit](https://tscircuit.com): a **controller**
(80 × 56 mm) with a tiny ATtiny85 computer, and an **LED panel**
(100 × 64 mm). Everything is through-hole — big parts with wire legs,
easy to solder by hand.

> **⚠ You never touch mains electricity in this project.** A certified
> power supply turns the dangerous 230/120 V into 12 V. Our boards only
> ever see 12 V. If the supply has to be wired into a ceiling or a wall,
> **an electrician does that part** (§12).

## Contents

0. [What's in this folder](#0-whats-in-this-folder)
1. [The whole idea, explained simply (start here)](#1-the-whole-idea-explained-simply-start-here)
2. [Safety](#2-safety)
3. [Words you'll meet](#3-words-youll-meet)
4. [How the store-bought lamps do it](#4-how-the-store-bought-lamps-do-it)
5. [The circuit, block by block](#5-the-circuit-block-by-block)
6. [The firmware (the program in the chip)](#6-the-firmware-the-program-in-the-chip)
7. [Parts list](#7-parts-list)
8. [Getting the boards made](#8-getting-the-boards-made)
9. [Soldering it together](#9-soldering-it-together)
10. [Programming the ATtiny85](#10-programming-the-attiny85)
11. [First power-up, step by step](#11-first-power-up-step-by-step)
12. [Putting it on the wall switch](#12-putting-it-on-the-wall-switch)
13. [Using it](#13-using-it)
14. [Troubleshooting](#14-troubleshooting)
15. [How the design was checked](#15-how-the-design-was-checked)
16. [Design notes: things we learned](#16-design-notes-things-we-learned)
17. [Ideas for next steps](#17-ideas-for-next-steps)

---

## 0. What's in this folder

```
tricolor-lamp/
├── controller/index.tsx      ← the controller PCB: parts, connections, placement
├── led-panel/index.tsx       ← the LED panel PCB: 18 strings of LEDs, hand-drawn 12 V rails
├── lib/parts.tsx             ← every footprint, drawn from the datasheets, pin by pin
├── firmware/tricolor_lamp/   ← the C program for the ATtiny85
│   ├── main.c                ← the hardware side: ADC, pins, sleep, the fade
│   ├── lamp.c / lamp.h       ← the decisions: which colour, is the 12 V on, the EEPROM notebook
│   ├── Makefile              ← build, flash and fuse commands (avr-gcc + avrdude)
│   └── platformio.ini        ← the same with PlatformIO
├── firmware/test/
│   ├── test_lamp.c           ← 33 checks of the decisions, on your computer
│   ├── sim_firmware.c        ← runs the REAL main.c against a model of the lamp: 15 switch scenarios
│   ├── sim_avr/              ← stand-in AVR headers that connect main.c to that model
│   └── mutation_test.py      ← plants 12 bugs, one at a time, and checks the tests catch each
├── calc/circuit_math.mjs     ← every design equation, worst case, asserted (47 checks)
├── calc/sim_lamp.mjs         ← circuit simulation of BOTH routed boards joined by the cable (23 checks)
├── calc/spice.mjs            ← the circuit simulator itself
├── calc/board_to_spice.mjs   ← routed board → simulator netlist
├── calc/spice/lamp.cir       ← the generated netlist (its S lines are this simulator's simple switch)
├── verify.mjs                ← audits both boards: errors, parts, wiring, values, holes, fab rules
├── render.mjs                ← makes the pictures below
└── render-*.png / .svg
```

Quick start (needs [Bun](https://bun.sh) or [Node.js](https://nodejs.org),
and `npm install -g tscircuit`):

```bash
cd tricolor-lamp
npm install
npm run dev:controller   # the controller in your browser: PCB, schematic, 3D
npm run dev:panel        # the LED panel
npm run build            # compile the boards (verify, sim and render need this)
npm run verify           # audit both boards
npm run math             # the design equations
npm run sim              # circuit simulation (~20 s)
npm run test:firmware    # firmware tests (needs any C compiler: cc, clang or gcc)
npm run test:mutants     # do the tests really catch bugs? (~1 min)
```

| | Controller | LED panel |
|---|---|---|
| PCB | ![controller PCB](render-controller-pcb.png) | ![panel PCB](render-led-panel-pcb.png) |
| Schematic | ![controller schematic](render-controller-schematic.png) | ![panel schematic](render-led-panel-schematic.png) |

---

## 1. The whole idea, explained simply (start here)

### 1.1 Electricity is like water in pipes

You can't see electricity, so it helps to imagine water:

| Electricity | Water picture | Unit |
|---|---|---|
| **Voltage** — how hard electricity is pushed | water **pressure** | volts (V) |
| **Current** — how much electricity flows | how much **water flows** each second | amperes (A); 1 mA = 1/1000 A |
| **Resistor** — makes it harder to flow | a **narrow pipe** | ohms (Ω) |
| **Ground (GND)** — where it all flows back to | the **drain** | 0 V |
| **Capacitor** — stores a little electricity | a **bucket** that fills up and can empty again | farads (F); µF = millionth |
| **Diode** — lets it flow one way only | a **one-way valve** | |
| **LED** — a diode that **glows** when current flows | a one-way valve that lights up | |
| **Switch / transistor** | a **tap** | |

The most useful rule in electronics, **Ohm's law**, is just common sense
about pipes: *more pressure → more flow; narrower pipe → less flow*.

```
current = voltage ÷ resistance          I = V / R
```

Example: 2.4 V pushing through a 150 Ω resistor → 2.4 / 150 = 0.016 A =
**16 mA**. You'll see that exact number again in §5.7.

### 1.2 The lamp's problem: it can't see the switch

The wall switch is the lamp's only "button". But the switch is far away,
on the mains side — the lamp can't see it. All the lamp can see is: *is
my power here or not?*

So how can it tell "you flipped the switch off and on quickly (please
change colour)" from "the lamp was off all night"? **It times how long
the power was gone.**

### 1.3 A brain with a stopwatch and a bucket

On the controller board sits a tiny computer, an **ATtiny85** (as big as
a fingernail; it runs a program we write in C). The trick:

1. **A bucket of electricity keeps the brain awake.** Next to the chip is a
   capacitor, C5. While the lamp is on, it fills up. When the power goes
   away, the bucket keeps the chip alive for **about 30 seconds** (at
   least 5). The chip spends that time asleep, using almost nothing —
   but it wakes up 30 times a second to look at the power and tick its
   stopwatch.
2. **When the power comes back, it looks at the stopwatch:**
   - gone for **less than 0.15 s**? That wasn't you — just a hiccup. Same colour.
   - gone for **up to 3 s**? You flipped the switch quickly. **Next colour!**
   - gone longer (or the bucket ran dry and the chip had to start from
     scratch)? A real "off". What happens then is your choice — see the
     MODE jumper below.
3. **A notebook that remembers.** The chip has a tiny memory, the
   **EEPROM**, that keeps what's written in it even with no power at all,
   for years. The chip writes the current colour there, so after a night
   off it still knows what came last.
4. **Three taps.** The chip controls three electronic taps (**MOSFETs**),
   one per colour. Opening a tap lets current flow through that colour's
   LEDs.

### 1.4 How it notices the power going away (the clever bit)

You'd think "power off" means the voltage drops to zero. It doesn't — not
at once. A power supply is full of buckets (capacitors) too, so when you
flip the switch off, its 12 V holds for a moment and then **sags**, like a
bathtub draining after you pull the plug.

You don't wait for the bathtub to be *empty* to know the plug is out — you
notice the water level dropping. The chip does the same: it measures the
12 V about **a thousand times a second**, and the moment it falls **1/8
below normal** (12 V → about 10.2 V), it knows: the switch is off.

### 1.5 What happens, moment by moment, when you flip off and on

| Time | You | The power supply | The chip |
|---|---|---|---|
| 0 s | flip **OFF** | keeps going on its stored energy for a moment, then its voltage starts falling | sees the 12 V fall 1/8 within a few ms; starts its stopwatch; goes to sleep |
| 0-1 s | | voltage keeps falling; the lit LEDs (still blue, dimming) drain it | wakes every 32 ms: measures, adds 32 ms to the stopwatch. When the 12 V is clearly gone (~6.5 V), switches the LEDs off |
| 1 s | flip **ON** | starts up again (takes ~0.3 s), 12 V is back | sees 12 V back. Stopwatch: ~1 s → "a quick flip" → **next colour: white** |
| 1.3-1.6 s | | | fades white in smoothly over 0.3 s. Once it is fully lit and the power holds, writes "white" in its notebook |

### 1.6 The three MODEs

What should happen after a *long* off (> 3 s)? You choose with a little
jumper (a tiny plug) on the controller, J3:

| Jumper | Mode | After a long off | Like… |
|---|---|---|---|
| none | **STEP** | the next colour | the original lamp: every off/on steps |
| on **MEM** side | **MEMORY** | the same colour as before | "keep my favourite colour" |
| on **RESET** side | **RESET** | always blue | "always start the same" |

A **quick** flip always steps to the next colour, in every mode.

---

## 2. Safety

**Mains (230/120 V) can kill.** This design keeps you away from it on
purpose:

- Use a **certified, sealed 12 V supply** (CE/UKCA/UL marks) — a plug-in
  adapter or an LED driver (§7). Never open it, never build your own.
- If the supply must be wired to house wiring (a ceiling box, behind the
  wall switch), **have an electrician do it**. Everything on the 12 V
  side is yours.
- Switch off at the breaker before touching any light fitting.

**12 V is safe to touch**, but it can still deliver several amps into a
short circuit: wires get hot, thin wires melt. The controller has a
resettable fuse (F1) for that.

**Use 12 V only.** A 24 V supply would push 4-6 times too much current
through the LEDs and destroy them in seconds (calc §9).

**Polarity matters** for the diodes, the LEDs, the two electrolytic
capacitors (C1, C5) and the chip. A backwards electrolytic capacitor can
pop. §9 has a checklist.

**Don't stare into the LEDs** at close range, especially the blue ones.

---

## 3. Words you'll meet

| Word | Meaning |
|---|---|
| **ADC** | Analog-to-Digital Converter: the part of the chip that measures a voltage and turns it into a number (0-1023 here). |
| **Anode / cathode** | The + and − ends of a diode or LED. Current flows anode → cathode. On an LED the cathode is the **short leg** and the **flat edge** of the rim. |
| **Brown-out** | The chip's supply sinking too low. The chip's brown-out detector then holds it in reset instead of letting it run wrongly. Ours triggers at 2.7 V. |
| **Capacitor** | A bucket for charge. Ceramic ones are small, any way round. **Electrolytic** ones are big (µF) and **have a + and a −**: the stripe on the can is −. |
| **Courtyard** | The space a part's body needs on the board. The design checker makes sure no two courtyards overlap. |
| **DIP** | "Dual In-line Package": a chip with two rows of legs that fits in a socket. |
| **EEPROM** | Memory that keeps its contents without power. Each byte survives about 100 000 rewrites. |
| **Firmware** | The program inside the chip. |
| **Footprint** | The pattern of copper pads and holes on the board where a part is soldered. |
| **Forward voltage (Vf)** | The voltage an LED or diode "uses up" while conducting: ≈ 3.1 V for blue/white, ≈ 2.05 V for yellow, ≈ 0.3 V for D1. |
| **Fuse (PTC)** | F1 is a resettable fuse: it heats up and blocks current on a short circuit, then recovers when it cools. |
| **Gate** | The control pin of a MOSFET. Voltage on the gate opens the tap between drain and source. |
| **GND** | Ground: the 0 V reference everything returns to. |
| **ISP** | In-System Programming: loading firmware into the chip through 6 pins (J2), with the chip on the board. |
| **Jumper** | A tiny plug that connects two neighbouring pins. |
| **LED string** | A few LEDs in a row, one after another, plus a resistor. |
| **MOSFET** | A transistor used as an electronic tap. Ours (IRLZ44N) is fully open with ≥ 4 V on its gate. |
| **Net** | One electrical connection: all the pins that are wired together (V12, GND, VCC…). |
| **PCB** | Printed Circuit Board: the green (here: blue) board with copper tracks. |
| **Pull-down resistor** | A resistor that gently holds a pin at 0 V when nothing else drives it. |
| **PWM** | Pulse-Width Modulation: switching something on and off very fast; the fraction of time it's on sets the average (brightness). |
| **Regulator** | A part that makes a steady voltage (5 V) from a higher, rougher one (12 V). |
| **Resistor** | A narrow pipe. Its colour bands tell its value. |
| **Schematic** | The circuit drawn as symbols and lines: what connects to what. |
| **Schottky diode** | A diode that wastes less voltage (0.3 V instead of 0.7 V). |
| **Trace / track** | A copper "wire" printed on the board. |
| **Via** | A small plated hole that takes a trace from one side of the board to the other. |
| **VCC** | The chip's supply (≈ 4.4 V here). |
| **Watchdog timer** | A timer inside the chip that can wake it from sleep at regular intervals (every 32 ms here). |

---

## 4. How the store-bought lamps do it

Open a typical "3-colour switching" LED ceiling lamp and you find:

- an **LED driver** wired straight to the mains: it makes a constant
  current for the LEDs;
- two or three groups of LEDs (often cool-white and warm-white; a
  "neutral" step lights both);
- a small **segment-switching chip** that decides which group is lit.
  It does exactly what our ATtiny85 does: it keeps itself alive on a
  capacitor for a few seconds after the power drops, and if the power
  comes back before that capacitor runs flat, it moves on to the next
  group. Many also have a tiny memory.

Ours works the same way, with three differences: **it never touches
mains** (a certified 12 V supply does that part), **it's
programmable** (you can read and change every rule), and it **measures**
the power instead of just reacting to it, so it copes with any
supply's way of switching off.

---

## 5. The circuit, block by block

Open `controller/index.tsx` alongside: each block below is a numbered
section there (§1-§6). The schematic picture is in §0.

### 5.1 12 V in: J1, F1, D1, C1, C2

```
 J1 +12V ──[F1 fuse]──►|── D1 ──┬───────────── V12 (the 12 V rail)
                                 │   │
                              C1 + ═ ═ C2
                             470µF│   │100nF
 J1 −  ──────────────────────────┴───┴───────── GND
```

- **J1** — screw terminal for the 12 V supply's two wires.
- **F1** — resettable fuse (MF-R110): passes up to 1.1 A all day, cuts off
  above 2.2 A (a short circuit), and **recovers** when it cools down.
- **D1** — a one-way valve (1N5819 Schottky). Connect the supply the
  wrong way round and D1 simply blocks it: nothing gets damaged. It costs
  0.3 V.
- **C1** (470 µF) — a big bucket that smooths the 12 V and supplies the
  quick gulps of current when an LED colour switches on. **C2** (100 nF)
  catches fast, tiny spikes that a big electrolytic is too slow for.

### 5.2 5 V for the brain, and its bucket: U1, C3, C4, D2, C5

```
 V12 ──┬── U1 78L05 ──┬── VREG ──►|── D2 ──┬──── VCC (≈ 4.4 V, the chip's supply)
       │   IN   OUT   │                     │
      C3   GND       C4                  C5 + 220 µF   ← the bucket
       │    │         │                     │
 GND ──┴────┴─────────┴─────────────────────┴──
```

- **U1 (78L05)** is a **regulator**: whatever comes in (7-30 V), 5.0 V
  comes out. C3 and C4 keep it stable (its datasheet asks for them).
- **D2** — another one-way valve, and the key to the whole lamp. When the
  12 V disappears, the regulator stops — and without D2, the bucket C5
  would empty backwards into the regulator in a moment. **D2 keeps the
  bucket's charge for the chip alone.** (It costs 0.6 V, so the chip runs
  on ≈ 4.4 V — fine, the ATtiny85 is happy anywhere from 2.7 to 5.5 V.)
- **C5** (220 µF) — the bucket. A sleeping ATtiny85 needs only about
  15 millionths of an amp, so C5 keeps it alive for ≈ 30 s (≥ 5 s in the
  worst case, calc §6). That's how the chip can time the switch.

### 5.3 The brain: U2, ATtiny85

```
            ┌───────────┐
   RST ── 1 │ RESET  VCC│ 8 ── VCC
 SENSE ── 2 │ PB3    PB2│ 7 ── MODE
    G3 ── 3 │ PB4    PB1│ 6 ── G2
   GND ── 4 │ GND    PB0│ 5 ── G1
            └───────────┘
```

| Pin | Name | Job |
|---|---|---|
| 2 | PB3 (ADC3) | **SENSE**: measures the 12 V (§5.4) |
| 7 | PB2 (ADC1) | **MODE**: reads the jumper (§5.5) |
| 5 | PB0 | **G1**: opens the BLUE tap |
| 6 | PB1 | **G2**: opens the WHITE tap |
| 3 | PB4 | **G3**: opens the YELLOW tap |
| 1 | RESET | held high by R1 (10 k); the programmer pulls it low to load firmware |

**C6** (100 nF) sits right next to the chip: a tiny local bucket for the
quick sips of current a computer takes every clock tick. **J2** is the
6-pin programming (ISP) header (§10). The chip sits in a **socket**, so
you can take it out to reprogram it elsewhere.

### 5.4 Watching the 12 V: R2, R3, C7

```
 V12 ──[R2 100k]──┬──[R3 33k]── GND
                  │
               SENSE ──► PB3 (ADC)
                  │
                 C7 10nF ── GND
```

The chip can only measure voltages up to its own supply (≈ 4.4 V), so R2
and R3 divide the 12 V down — like a ruler with a scale:

```
SENSE = V12 × 33k / (100k + 33k) = V12 × 0.248   →   11.7 V reads as 2.9 V
```

The ADC turns that into a number: 2.9 V out of 4.4 V ≈ **670** (of 1023).

The chip remembers what "on" looks like (**on_level**, ≈ 670) and then
compares:

```
 12 V  ─────────────────────────  on_level        lamp on
 10.6 V ── ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  29/32 on_level  "it's back" (when it was off)
 10.2 V ── ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  7/8 on_level   "switched off!"
  6.6 V ── ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  9/16 on_level  "the supply is dead": LEDs out
```

The "back" line sits a little above the "off" line on purpose
(**hysteresis**), so a reading that wobbles right on one line can't
flicker between "on" and "off". **C7** smooths away electrical noise.

Because every line is a *fraction* of on_level, it works with any 12 V
supply, and any small error in the chip's own voltage cancels out.

### 5.5 The MODE jumper: J3, R4, R5, R6, C8

```
 VCC ──[R4 1M]──┬──[R5 1M]── GND
                │
             MODE ──► PB2 (ADC) ── C8 10nF ── GND
                │
             [R6 10k]
                │
       J3:  LO ── MID ── HI
           GND         VCC
```

- **No jumper:** R4 and R5 (equal) hold MODE at **half** of VCC → the ADC
  reads ≈ 512 → STEP.
- **Jumper LO–MID:** MODE pulled to GND through R6 → reads ≈ 10 → MEMORY.
- **Jumper MID–HI:** MODE pulled to VCC through R6 → reads ≈ 1014 → RESET.

The chip reads it once, when it starts. Why the extra parts? PB2 is also
the programmer's clock line (SCK), so **R6** stops a fitted jumper from
shorting that clock, and **C8** gives the ADC a steady voltage to sample;
at 10 nF it's small enough not to slow the programmer down.

### 5.6 The three colour taps: Q1-Q3, R7-R12

```
                            +12V (J4) ──► to the panel: all LED strings' tops
                                                     │
                                                 LED strings (blue)
                                                     │
                                     J4 BLUE ◄───────┘
                                        │ drain
 PB0 ── G1 ──[R7 100Ω]── GATE1 ──── gate│ Q1 IRLZ44N
                           │            │ source
                       [R10 100k]      GND
                           │
                          GND
```

Each colour's LED strings start at +12 V and **end** at that colour's
wire. Q1 sits between that wire and ground: **gate high → tap open →
current flows → blue lights**. (This is "common anode, switched
cathodes" — the same wiring as 12 V RGB LED strip.)

- **R7-R9** (100 Ω) soften the gate's switching a little.
- **R10-R12** (100 k) are pull-downs: whenever the chip isn't driving
  the gates (being reset, programmed, or unplugged), they hold the taps
  **closed**, so the LEDs can't flicker on by accident.
- The IRLZ44N is enormous for 0.1 A (it handles 47 A!). That's
  deliberate: it's fully open at the chip's 4.4 V, runs stone cold, and
  lets you use 12 V LED strip instead of the panel — up to 1 A in total
  (F1 and D1 set that limit).

### 5.7 The LED panel: strings and resistors

Each **string** is a resistor followed by 3 LEDs (4 for yellow), from
+12 V to that colour's wire:

```
 +12V ──[150Ω]──►|──►|──►|── BLUE_N          blue / white: 3 LEDs + 150 Ω
 +12V ──[220Ω]──►|──►|──►|──►|── YELLOW_N    yellow: 4 LEDs + 220 Ω
```

**Why the resistor?** An LED is greedy: above its forward voltage, its
current shoots up and it burns out. The resistor is the narrow pipe that
sets the current. Let's do the sum for a blue string:

```
 the supply gives            12.0 V
 D1 takes                   − 0.3 V
 3 blue LEDs take 3 × 3.1   − 9.3 V
 left for the resistor        2.4 V    →  I = 2.4 V / 150 Ω = 16 mA
```

16 mA is bright and kind to a 5 mm LED (rated 20 mA, 30 mA absolute
maximum). Yellow LEDs only take ≈ 2.05 V each, so a yellow string gets
4 of them: 12.0 − 0.3 − 4 × 2.05 = 3.5 V across 220 Ω = 16 mA again.

**Why several LEDs per string?** It uses the 12 V for light instead of
heat: in a blue string, 9.3 V of the 11.7 V lights LEDs, only 2.4 V
warms the resistor.

**Why one resistor per string, not one for everything?** No two LEDs are
exactly alike. If strings shared one resistor, the string with the
lowest forward voltage would hog the current and burn out first. With
its own resistor, each string sets its own current.

Six strings per colour = 18 blue, 18 white and 24 yellow LEDs, ≈ 95 mA
and ≈ 1.1 W per colour. The rows start with a different colour each
(B W Y / W Y B / Y B W …) so every colour is spread over the whole
panel. The 18 resistors stand upright and are 0.6 W types, so they stay
well within their rating (calc §1).

### 5.8 The two PCBs

- **Controller**, 80 × 56 mm, two copper layers. The bottom layer is
  mostly one big sheet of copper connected to GND (a **ground pour**): a
  short, wide return path for every current. The 12 V input path and the
  three colour wires are 0.8 mm wide traces (they can carry 2 A+).
- **LED panel**, 100 × 64 mm. Here the bottom pour is **+12 V**, feeding
  all 18 resistors, plus hand-drawn 0.6 mm rails between each row. The
  autorouter only had the short LED-to-LED links and the three colour
  returns left to place.
- Every footprint is hand-written from the part's datasheet (lib/parts.tsx)
  with holes big enough for the real legs (lead + 0.2 mm), and a
  courtyard so parts can't collide. The screw terminals' wire openings
  face the board edges.
- The 4-wire cable between **J4** (controller) and **J1** (panel) is pin
  for pin: **+12V, BLUE, WHITE, YELLOW**.

---

## 6. The firmware (the program in the chip)

`firmware/tricolor_lamp/` — about 300 lines of plain C. If you write
software, this is the friendly part: it's an event loop with a sleep.

- **`lamp.c` / `lamp.h`** — all the *decisions*, with no hardware in them:
  which colour comes next, is the 12 V on, the EEPROM notebook. Being
  plain C, they compile and are unit-tested on your computer.
- **`main.c`** — the *hardware*: reading the ADC, driving the pins,
  fading, sleeping.

### 6.1 The main loop

```
 power-up (a "cold boot": the chip was completely unpowered)
     │  read the MODE jumper, read the notebook,
     │  pick the colour for "after a long off"
     │  wait until the 12 V is up and steady
     ▼
 ┌──────────────────── ON ────────────────────┐
 │ fade the colour in over 0.3 s               │
 │   (give up if the 12 V sags meanwhile)      │
 │ fully lit and still powered 50 ms later?    │
 │   → it counts: write it in the notebook     │
 │ measure the 12 V every millisecond          │
 └──────────── 12 V fell 1/8 ──────────────────┘
     ▼
 ┌──────────────────── OFF ───────────────────┐
 │ sleep; every 32 ms wake up, measure,        │
 │   add 32 ms to the stopwatch                │
 │ keep the old colour lit while the supply    │
 │   drains; switch it off once it's dead      │
 └──────────── 12 V back ─────────────────────┘
     ▼
 how long was it off?   < 0.15 s → same colour
                        ≤ 3 s    → next colour
                        longer   → MODE decides
     └──► back to ON
```

The rules themselves are in `lamp_next_color()`:

```c
uint8_t lamp_next_color(lamp_mode_t mode, off_kind_t kind, bool have_saved, uint8_t saved) {
  if (!have_saved || saved >= NCOLORS) return COLOR_BLUE;   /* first power-up ever */
  uint8_t next = (uint8_t)((saved + 1) % NCOLORS);
  switch (kind) {
    case OFF_GLITCH: return saved;                           /* not a flip */
    case OFF_QUICK: return next;                             /* every mode steps on a quick flip */
    case OFF_LONG:
    default:
      if (mode == MODE_STEP) return next;
      if (mode == MODE_MEMORY) return saved;
      return COLOR_BLUE;                                     /* MODE_RESET */
  }
}
```

### 6.2 Why a colour only "counts" once it's fully lit

When a supply dies, it sometimes coughs: a last burst of energy lifts the
voltage back to 12 V for a few milliseconds. To the chip that looks just
like "the power came back". So a new colour is only written in the
notebook after it has **faded in completely** and the 12 V **held up
under that load** for 50 ms. If the power drops before that, the chip
treats the whole thing as one long off. A cough can't skip a colour.

### 6.3 The fade: software PWM

You can't make an LED "half on" with a tap that's either open or closed.
But you can blink it so fast the eye can't follow — about **1 300 times
a second** — and the eye sees the average:

```
 on 10 % of each blink ▌_________▌_________▌_________   → looks dim
 on 50 %               ▌▌▌▌▌_____▌▌▌▌▌_____▌▌▌▌▌_____   → looks half bright
 on 100 %              ▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌   → full
```

`pwm_period()` does one blink: pin on, wait, pin off, wait. The fade
raises the on-time in 30 steps, as a square (step²) because the eye is
more sensitive to changes at low brightness. After the fade the pin
simply stays on. (The ATtiny85 also has hardware PWM, but its Timer1 PWM
output on PB4 has a known silicon quirk; a 15-line software loop is
simpler and identical for all three colours.)

### 6.4 Sleeping and the stopwatch

While the lamp is off, the chip runs only on C5's charge, so it spends
almost all its time in **power-down sleep** (≈ 4 µA). Its **watchdog
timer** — a separate little clock inside the chip — wakes it every
32 ms. It measures the 12 V (≈ 0.1 ms with the ADC), adds 32 ms to
`off_ms`, and goes back to sleep. While asleep it also switches its
brown-out detector off (`sleep_bod_disable()`), which alone would cost
20 µA.

### 6.5 The EEPROM notebook (wear levelling)

Each EEPROM byte survives about **100 000** rewrites. If the colour went
in the same byte every time, a lamp flipped 20 times a day would wear it
out in 14 years — and then forget its colour.

So the firmware uses **128 bytes like a notebook with 128 lines**. Each
save writes the new colour on the **next** line, then erases the old
line. When it reaches line 128 it starts again at line 1. Every line
gets used equally: **6.4 million colour changes** before any line wears
out (the test measures this).

Each record is one byte:

```
 1 0 s s s s c c      10 = "this is a record"   ssss = a counter 0-15   cc = colour
```

Why the counter? If the power vanishes right between "write the new
line" and "erase the old one", the notebook holds two colours. The loader
picks the one whose counter is *ahead* (counting round in a circle: 0
comes after 15), so the newest always wins, and the next save tidies up.

### 6.6 The tests

```bash
npm run test:firmware      # or: sh firmware/test/run.sh
npm run test:mutants       # or: python3 firmware/test/mutation_test.py
```

1. **`test_lamp.c`** — 33 checks of the decisions: thresholds, every
   mode, the notebook, power cuts mid-save, wrap-around, garbage bytes,
   EEPROM wear.
2. **`sim_firmware.c`** — the interesting one. It compiles the
   **unchanged** `main.c` for your computer, swapping the real AVR headers
   for stand-ins (`sim_avr/`) that connect every register, delay, ADC
   reading and sleep to a **model of the lamp's electronics**: a supply
   with start-up delay, hold-up and sagging, the LED load, the 78L05, D2,
   C5 draining, brown-out resets, the jumper divider. Then it flips the
   wall switch in 15 scenarios — quick flips, long offs, a 3-minute off
   where C5 runs flat, a supply that holds on for 0.8 s, wire glitches,
   dying supplies that cough, a weaker supply swapped in, very slow and
   very fast supplies, skipping colours, flipping too fast — and checks
   the colour you'd see at each moment, that two colours never light
   together, that no light appears while the switch is off, and how many
   times the notebook is written.
3. **`mutation_test.py`** — tests that always pass prove nothing. This
   script plants 12 different bugs in the firmware, one at a time (late
   off-detection, saving too early, a wrong timer tick, ignoring the
   notebook counters…) and checks the tests fail for **every one**. They do.

---

## 7. Parts list

### Controller board

| Ref | Part | Value / part number | Notes |
|---|---|---|---|
| U2 | Microcontroller | Microchip **ATTINY85-20PU** | DIP-8, **in an 8-pin DIP socket** |
| U1 | 5 V regulator | TI **LM78L05ACZ** | TO-92 |
| Q1, Q2, Q3 | Logic-level N-MOSFET | Infineon **IRLZ44NPBF** | TO-220, no heatsink needed. Must be an **IRL**Z44N (logic level), not IRFZ44N |
| D1 | Schottky diode | **1N5819** | DO-41, band = cathode |
| D2 | Signal diode | **1N4148** | DO-35, band = cathode |
| F1 | Resettable fuse | Bourns **MF-R110** | radial, 1.1 A hold |
| C1 | Electrolytic capacitor | 470 µF 25 V, 10 mm, 5 mm pitch (e.g. Panasonic **EEU-FR1E471**) | **polarised** |
| C5 | Electrolytic capacitor | 220 µF 10 V+, 6.3 mm, 2.5 mm pitch (e.g. Panasonic **EEU-FR1A221**) | **polarised** |
| C2, C4, C6 | Ceramic capacitor | 100 nF | 2.54 mm leads |
| C3 | Ceramic capacitor | 330 nF | 2.54 mm leads |
| C7, C8 | Ceramic capacitor | 10 nF | 2.54 mm leads |
| R2, R10, R11, R12 | Resistor | 100 kΩ | ¼ W metal film |
| R3 | Resistor | 33 kΩ | ¼ W |
| R1, R6 | Resistor | 10 kΩ | ¼ W |
| R4, R5 | Resistor | 1 MΩ | ¼ W |
| R7, R8, R9 | Resistor | 100 Ω | ¼ W |
| J1 | Screw terminal, 2-way | 5.08 mm pitch | power in |
| J4 | Screw terminal, 4-way | 5.08 mm pitch (or two 2-ways side by side) | to the panel |
| J2 | Pin header 2 × 3 | 2.54 mm | programming |
| J3 | Pin header 1 × 3 + 1 jumper | 2.54 mm | MODE |
| — | M3 screws + spacers × 4 | | mounting |

### LED panel

| Ref | Part | Value | Qty |
|---|---|---|---|
| D… (blue strings) | 5 mm LED, **blue**, ≈ 3.0-3.3 V at 20 mA | | 18 |
| D… (white strings) | 5 mm LED, **white**, ≈ 3.0-3.3 V at 20 mA | | 18 |
| D… (yellow strings) | 5 mm LED, **yellow**, ≈ 2.0-2.2 V at 20 mA | | 24 |
| R (blue, white) | Resistor 150 Ω, **0.6 W** metal film, 0207 size (e.g. Vishay MBB0207) | | 12 |
| R (yellow) | Resistor 220 Ω, 0.6 W metal film, 0207 size | | 6 |
| J1 | Screw terminal, 4-way, 5.08 mm | | 1 |

Which LED goes where: the colour of every LED is printed in the panel's
schematic (§0) and `verify.mjs` checks it. Rows: 1 B W Y, 2 W Y B, 3 Y B
W, 4 B W Y, 5 W Y B, 6 Y B W (strings from left to right; a yellow string
is 4 LEDs long). Buy each colour **from one bag/batch** so the strings
match in brightness.

### Off the boards

| Item | What to buy |
|---|---|
| **12 V power supply** | A certified **constant-voltage** 12 V supply, ≥ 0.5 A. For a ceiling lamp: an LED driver such as Mean Well **LPV-20-12** (installed by an electrician). For a desk/test lamp: any certified 12 V plug-in adapter (e.g. Mean Well GST18E12). **Not** a "constant-current" LED driver — those make the wrong kind of power for this circuit. |
| Cable | 4-core cable between the boards (any 0.25-0.5 mm² wire), and 2-core from the supply |
| Tools | soldering iron (fine tip), solder, side cutters, multimeter; an AVR programmer (§10) |

---

## 8. Getting the boards made

Make the manufacturing files (a zip per board) and upload them to any PCB
maker (JLCPCB, PCBWay, Aisler, OSH Park…). Choose: 2 layers, 1.6 mm FR-4,
1 oz copper, any colour, HASL or ENIG finish.

```bash
tsci export -f gerbers controller/index.tsx -o tricolor-controller-gerbers.zip
tsci export -f gerbers led-panel/index.tsx -o tricolor-led-panel-gerbers.zip
```

The zips also hold `bom.csv` and `pick_and_place.csv`, but every part is
through-hole: you solder them yourself (it's the fun part).

---

## 9. Soldering it together

Solder **low parts first**, high parts last, so the board lies flat while
you work: resistors and diodes → ceramic capacitors → IC socket → pin
headers → 78L05 → electrolytics → fuse → MOSFETs → screw terminals.

**Polarity checklist** — check each before soldering, then once more:

| Part | How to orient it |
|---|---|
| D1, D2 | the **band** on the diode goes to the end marked with the line on the board (the square pad) |
| C1, C5 | the long leg (**+**) in the **square pad** marked "+"; the stripe on the can (−) away from it |
| U2 socket | the notch matches the notch on the board outline; then the chip's dot/notch the same way |
| U1 (78L05) | the **flat face** matches the flat side of the outline |
| Q1-Q3 | metal tab toward the side of the outline with the **double line**; then the gate (left leg, seen from the printed face) is in the square pad |
| LEDs | **long leg = anode = round pad**; the **flat edge** of the LED rim matches the flat in the drawn circle (cathode, square pad) |
| J1-J4 | wire openings face the edge of the board |

The LED panel: fit all 60 LEDs, flip the board onto a flat surface so
they sit level, solder one leg each, check they're straight, then solder
the rest. Stand the resistors upright (one leg bent over the top).

---

## 10. Programming the ATtiny85

**The tools** (once):

```bash
# macOS
brew tap osx-cross/avr && brew install avr-gcc avrdude
# Debian/Ubuntu
sudo apt install gcc-avr avr-libc avrdude
# or anywhere: pip install platformio   (then use platformio.ini)
```

**A programmer:** a USBasp, or an Arduino (Uno, Nano, or the μNode32U4
from this repo) running the **ArduinoISP** example sketch (File →
Examples → 11.ArduinoISP; after uploading it, put a 10 µF capacitor
between the Arduino's RESET and GND). Wire it to J2:

| J2 pin | Signal | Arduino as ISP |
|---|---|---|
| 1 (square) | MISO | D12 |
| 2 | VCC | 5 V |
| 3 | SCK | D13 |
| 4 | MOSI | D11 |
| 5 | RESET | D10 |
| 6 | GND | GND |

**Disconnect the 12 V supply while programming** — the programmer powers
the chip through J2, and PB0/PB1 double as programming lines, so the
LEDs would flicker. (The MODE jumper can stay: R6 protects the clock
line.)

```bash
cd firmware/tricolor_lamp
make                                   # build tricolor_lamp.hex
make fuses PORT=/dev/tty.usbmodem1101  # once per chip
make flash PORT=/dev/tty.usbmodem1101  # load the program
# USBasp instead:  make fuses flash PROGRAMMER=usbasp PORT=usb
```

**Fuses** are a few configuration bytes, set once per chip, that live
outside the program: low 0x62 (factory 1 MHz clock), high 0xD5
(**brown-out reset at 2.7 V**; **keep the EEPROM** when reprogramming),
extended 0xFF. Without the brown-out fuse, the chip could misbehave
while C5 runs dry.

---

## 11. First power-up, step by step

Each step proves something before you add the next risk. Use a
multimeter (DC volts, black probe on GND — e.g. the J1 "−" screw). A
bench supply set to 12 V with a **0.2 A current limit** is ideal; a
12 V adapter works too.

1. **Before any power**, chip out of its socket, panel unplugged:
   resistance between J1 "+" and "−" should not be near 0 Ω (it reads a
   few kΩ and climbs as C1 charges — that's fine).
2. **Power, no chip, no panel.** Current ≈ 4 mA. Measure:

   | Where | Expect |
   |---|---|
   | V12 (J4 "+12V" screw) | 11.5-11.9 V |
   | VREG (78L05 OUT, the left leg) | 4.8-5.2 V |
   | VCC (socket pin 8) | 4.3-4.7 V |
   | SENSE (socket pin 2) | ≈ 2.9 V |
   | MODE (socket pin 7), no jumper | ≈ half of VCC (≈ 2.2 V) — a 10 MΩ meter reads a bit low |
   | each MOSFET's gate (left leg) | 0 V |

3. **Connect the panel, test each colour by hand** (still no chip): touch
   a wire from **VCC (socket pin 8)** to **socket pin 5** → all blue
   strings light; pin 6 → white; pin 3 → yellow. The current goes up by
   ≈ 95 mA each time. Any string dark? It has a backwards LED.
4. **Unpower, insert the programmed chip** (notch the right way), power
   up. The lamp fades in **blue** (first power-up ever).
5. **Flip test** (disconnect/reconnect the 12 V for about one second):
   white, yellow, blue… Then try the MODE jumper.

---

## 12. Putting it on the wall switch

The wall switch must switch the **mains side** of the 12 V supply, so
that flipping it turns the supply off and on:

```
 mains ── wall switch ── [ certified 12 V supply ] ── 12 V ── controller ── panel
          (as before)       (electrician wires it)
```

- In a ceiling: the LED driver (e.g. LPV-20-12) sits in or next to the
  ceiling box; **an electrician connects its mains wires** where the old
  lamp's were. You connect its 12 V output wires to J1 ("+" and "−" as
  marked on the board).
- As a desk/floor lamp: a plug-in 12 V adapter in a switched socket, or a
  switch in the adapter's mains cord (again: a certified one).

**Don't** put a switch between the supply and the controller instead —
it works, but it's not how a ceiling lamp is wired, and the point is to
use the existing wall switch.

---

## 13. Using it

| You want | Do this |
|---|---|
| the next colour | flip **off**, wait until the light has **gone out** (often a fraction of a second), flip **on** — all within 3 s |
| to skip a colour | do it twice — but wait until the colour has **fully faded in** before flipping again |
| the lamp on as usual | just switch on; what you get after a long off depends on the MODE jumper (§1.6) |

**Tips**

- Some supplies keep the lamp lit for up to a second after you switch
  off. If a quick flip doesn't change the colour, you flipped back before
  the light went out — hold the switch off a moment longer.
- After the very first power-up (or with a blank chip) it starts blue.
- The off-timer is the chip's watchdog oscillator, accurate to roughly
  ±25 %: "3 s" really means somewhere between 2.3 and 3.8 s.

---

## 14. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Nothing at all, no LED, V12 ≈ 0 | supply backwards (D1 blocks it), F1 tripped, no power | check polarity at J1; let F1 cool; measure the supply |
| V12 fine, VREG 0 | U1 backwards or not soldered | flat face as on the outline |
| VCC 0, VREG fine | D2 backwards | band toward VCC (the square pad) |
| A colour never lights | MOSFET backwards, gate not driven, a string's LED backwards | step 3 of §11 isolates which |
| One string of a colour dark | one LED in it backwards or a bad joint | the dark string is in one row: check its LEDs' flats |
| Colour never changes | flipping too fast (the supply never actually turned off), or chip not programmed | hold off until the light goes out; reflash |
| Always the same colour after a long off | MODE = MEMORY (jumper on LO) | remove the jumper for STEP |
| Steps twice per flip | a worn wall switch breaking contact twice | watch V12 with a meter while you flip; replace the switch |
| Colour memory lost every time you reprogram | high fuse isn't 0xD5 (its EESAVE bit keeps the EEPROM) | `make fuses` once |
| Odd behaviour as the lamp switches off | brown-out fuse not set | `make fuses` once |
| LEDs flicker during programming | 12 V connected while programming | disconnect the 12 V |
| A different brightness between strings of one colour | LEDs from different batches | buy each colour from one batch |

---

## 15. How the design was checked

Everything here runs on your computer; nothing is "trust me".

| Check | Command | What it proves |
|---|---|---|
| Board audit | `npm run verify` | Both boards: zero design-rule errors; exactly the right parts and nets; every connection the circuit depends on (input protection order, D2 direction, sense divider, MODE network, gate pull-downs, the firmware's pin map PB0/PB1/PB4 → blue/white/yellow, ISP pins); all values; polarised electrolytics; all 18 LED strings (colour, count, order anode→cathode, resistor value); the 12 V rails' width; every hole ≥ its part's lead + 0.2 mm; courtyards; every pin wired; **the cable is pin-for-pin the same on both boards** |
| Design equations | `npm run math` | 47 worst-case calculations: LED currents at every corner (≤ 30 mA even with everything against us), resistor and regulator heat, the ADC readings, the MODE readings including pin leakage, the hold-up time (≥ 5 s worst case), gate drive, EEPROM life |
| Circuit simulation | `npm run sim` | Both routed boards turned into one netlist and simulated: string currents per colour at 11.4/12/12.6 V, other colours dark, MODE readings, reversed supply, a full switch-off with the firmware's rules running (off seen 30 ms after the supply stops; no false switch-on as it drains), worst-case hold-up |
| Firmware | `npm run test:firmware` | 33 logic checks + the real `main.c` in 15 switch scenarios against a model of the electronics |
| The tests themselves | `npm run test:mutants` | 12 planted bugs, 12 caught |
| Manufacturing files | `tsci export -f gerbers …` | Both boards export; drill files list exactly the planned hole sizes (e.g. 120 × 1.0 mm for the 60 LEDs) |

---

## 16. Design notes: things we learned

These are the places where the first idea was wrong, found by the checks
above. They're the most useful part of this document if you design your
own circuits.

1. **A power supply doesn't switch off cleanly.** The first design read
   SENSE as a plain logic pin (HIGH/LOW). But a lightly loaded supply
   holds its output for up to a second after the mains goes, then sags
   slowly; a logic pin only flips around 6-8 V, so the lamp would notice
   a quick flip late — or not at all. Measuring with the ADC against the
   remembered "on" level catches the very start of the sag.
2. **…and a dying supply can cough.** Once its load drops, a supply can
   restart briefly. Hence: keep the old colour lit while the supply
   drains (the LEDs are the load that stops it recovering), and only
   save a colour once it has faded in and held.
3. **A capacitor on a shared pin has two jobs.** C8 first was 100 nF: on
   the programming clock line that slows the edges too much, and with
   the 1 MΩ divider it took 0.25 s to settle — longer than the chip waits
   at start-up. 10 nF does both jobs.
4. **Datasheet quirks matter.** The ATtiny85's Timer1 PWM on the OC1B pin
   has a documented silicon erratum; software PWM sidesteps it.
5. **Worst cases, not typical values.** At the worst corner (high supply,
   lowest-voltage LEDs, low resistor tolerance) a yellow string's
   resistor dissipates 127 mW — over half of a ¼ W rating. 0.6 W
   resistors in the same size fix it for free. Yellow strings use 220 Ω
   (not 180 Ω) so even that corner stays under the LEDs' 30 mA maximum.
6. **Holes need room for the legs.** A 5 mm LED's square leg measures
   0.71 mm corner to corner: a 0.9 mm hole is tight, so 1.0 mm.
   Generic library footprints for small capacitors had 0.635 mm holes —
   too small for real capacitor legs — so every footprint here is written
   from the datasheet.
7. **Polarity must be visible.** Electrolytic capacitors got a square "+"
   pad and a "+" mark; a generic capacitor footprint has neither.
8. **Remove code the tests prove redundant.** A 20 ms "is the power really
   back?" check turned out to change nothing (the fade already starts at
   zero and re-checks every 10 ms) — the mutation test showed it — so it
   was removed. Less code, same behaviour.
9. **Journals need sequence numbers.** The first EEPROM journal picked
   "the first record whose next slot is empty"; a power cut between two
   saves left a stale record that won later. A 4-bit counter in each
   record fixed it — found by a unit test that cut the power twice.

---

## 17. Ideas for next steps

- **Warm-white instead of yellow:** warm-white LEDs take ≈ 3.1 V, like
  white. Fit 3 per yellow string, a wire link in the 4th LED's place, and
  150 Ω instead of 220 Ω.
- **12 V LED strip instead of the panel:** "common anode" strips (RGB or
  dual-white) connect straight to J4: +12V to the strip's "+", each
  colour wire to BLUE/WHITE/YELLOW. Up to 1 A in total (F1 and D1 set
  that limit).
- **More colours or a "both on" step:** it's a few lines in
  `lamp_next_color()` and `NCOLORS` — then run the tests.
- **Dimming:** hold the colour at a PWM level instead of fully on.
- **A remote:** the ATtiny85 has spare program space; an IR receiver on
  a free pin (there isn't one — you'd trade the MODE jumper) could change
  colours without the switch.
