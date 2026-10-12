# Learn — how to read, write & understand the circuits in this repo

This folder is a **course**, written for someone who is new to electronics.
It teaches you to do three things with the five projects that live in this
repository:

1. **Read** their two drawings — the *schematic* and the *PCB layout*.
2. **Write** circuits of your own in [tscircuit](https://tscircuit.com) (the
   tool all five projects are written in), or change these circuits safely.
3. **Understand** each project deeply — what every part does, why it has the
   value it has, and how to follow a signal from one end of the board to the
   other with your own eyes.

You do not need any electronics background. Wherever the course uses an
idea for the first time — voltage, current, a capacitor, a "net" — it
explains it in plain words first. The projects' own READMEs and tutorial
PDFs explain *how to build and verify* each project; this course explains
*how to look at the drawings and the code and know what you are looking at*.

---

## The course map

| # | File | What you will be able to do afterwards |
|---|------|----------------------------------------|
| 1 | [`01-schematic-literacy.md`](./01-schematic-literacy.md) | Pick up any schematic — these or anyone else's — and decode it symbol by symbol, name by name, net by net. |
| 2 | [`02-pcb-literacy.md`](./02-pcb-literacy.md) | Look at a PCB layout (the "green board" drawing) and find any part, follow any copper trace, and understand layers, pads, vias and pours. |
| 3 | [`03-two-views-one-circuit.md`](./03-two-views-one-circuit.md) | Answer the question "why does the schematic show separate little parts instead of the whole circuit connected?" — and understand what a schematic and a PCB each *are*, and how one circuit can have both. |
| 4 | [`04-writing-circuits-in-tscircuit.md`](./04-writing-circuits-in-tscircuit.md) | Read and change the React/TSX code that generates these boards; write a first circuit of your own from scratch. |
| 5 | [`05-tour-am-radio-lab.md`](./05-tour-am-radio-lab.md) | Guided tour of **Radio Lab** (AM transmitter + receiver) — follow your voice from microphone to radio wave and back. |
| 6 | [`06-tour-fm-radio-lab.md`](./06-tour-fm-radio-lab.md) | Guided tour of **FM Radio Lab** — same journey, but frequency modulation, and a receiver that is secretly the transmitter. |
| 7 | [`07-tour-unode-32u4.md`](./07-tour-unode-32u4.md) | Guided tour of the **μNode32U4** dev board — USB, power, clock, reset: how a microcontroller board is fed and kept alive. |
| 8 | [`08-tour-tricolor-lamp.md`](./08-tour-tricolor-lamp.md) | Guided tour of the **Tri-Color Lamp** — a lamp that changes colour when you flip the wall switch, and the two boards that make it work. |
| 9 | [`09-tour-arc-lighter.md`](./09-tour-arc-lighter.md) | Guided tour of the **Arc Lighter** — how 3.7 V becomes a spark, with safety layers explained. |

**Recommended order:** 1 → 2 → 3 → 4, then any tour that matches a board you
are curious about. Tours 5–9 are self-contained; each one begins with a
"you need chapters 1–2 first" reminder and then holds your hand through
that project's actual drawings.

---

## The five projects at a glance

| Folder | Board(s) | One sentence |
|---|---|---|
| [`unode-32u4/`](../unode-32u4) | 1 | A do-it-yourself Arduino-Leonardo-class board built from one bare ATmega32U4 chip + ~35 parts. |
| [`radio-lab/`](../radio-lab) | 2 | An AM radio **station** (microphone → transmitter) and an AM **receiver** you can build on perfboard. |
| [`fm-radio-lab/`](../fm-radio-lab) | 2 | The same idea on the FM band: a 2-transistor FM transmitter and a 6-transistor "super-regenerative" receiver. |
| [`tricolor-lamp/`](../tricolor-lamp) | 2 + cable | A 12 V lamp that steps blue → white → yellow each time you flip its wall switch. |
| [`arc-lighter/`](../arc-lighter) | 1 | A USB-rechargeable lighter that makes a small electric arc instead of a flame. ⚠️ High voltage — read its safety section first. |

Every board comes with **two committed renderings** (pictures generated
straight from the code) which this course points at constantly:

* `render-*-schematic.png` — the schematic view
* `render-*-pcb.png` — the PCB (copper) view

You can also open every board **live** — zoom, pan, click parts — with the
`tscircuit` CLI:

```bash
npm install -g tscircuit        # once; provides the `tsci` command
cd radio-lab && tsci dev transmitter/index.tsx   # opens http://localhost:3020
```

…or with zero installation by pasting a project's
`standalone/*.tsx` file into <https://snippets.tscircuit.com>.
Each project README lists its exact commands.

---

## Words you will meet (mini-glossary)

These come up constantly. Chapters 1–2 define each one properly; this table
is the cheat-sheet to keep open in a second tab.

| Word | Plain meaning |
|------|---------------|
| **schematic** | The drawing that shows *what connects to what* electrically. Symbols + lines. Not a picture of the physical board. |
| **PCB / board** | Printed Circuit Board — the physical "green board". The **PCB layout** is the drawing of exactly where copper, holes and silkscreen go on it. |
| **component / part** | A single electronic thing: resistor, capacitor, chip… |
| **reference designator** | A part's name on the drawings: `R1`, `C4`, `Q2`, `U1`, `L1`, `D1`, `J3`, `SW1`, `Y1`. |
| **pin** | A metal leg of a component (real or drawn). |
| **net** | One electrical "island": every pin that is wired together. A net can be drawn as a line **or named** — same net name = same island, even with no line drawn. |
| **net label** | The name of a net printed on the drawing, e.g. `GND`, `V9`, `TANK`. |
| **ground / GND** | The common return point of the circuit — 0 V, the reference everything else is measured against. |
| **trace** | A strip of copper on the PCB that realises one net between two pads. |
| **pad** | The copper ring a component leg is soldered to. |
| **via** | A tiny plated hole that carries a net from one copper layer to another. |
| **footprint** | The pattern of pads (and outline) a *specific physical part* needs on the PCB. |
| **silkscreen** | The white/cream printing on the board: names, values, polarity marks, instructions. |
| **through-hole (THT)** | Parts with legs that go through holes in the board (easy to solder by hand — the radio labs use these). |
| **surface-mount (SMD)** | Parts glued onto the surface of the board (small — μNode32U4 and arc-lighter use many of these). |
| **DRC** | Design Rule Check — software that verifies the PCB can actually be manufactured and soldered. |
| **BOM** | Bill of materials — the shopping list. |
| **THT pitch / 0.1" grid** | The 2.54 mm spacing of classic through-hole parts; also the perfboard grid you can solder these designs onto. |

---

## How to use each chapter

* **Have the drawings open while you read.** Every tour links the committed
  `.png` renders inline, but zooming the real SVG in a browser (or the live
  `tsci dev` view) is even better.
* **Read slowly, check often.** Each tour has "check yourself" questions
  with answers at the end. Trying to answer before reading the solution is
  the single fastest way to learn this.
* **Nothing here is precious.** The code is the source of truth. If a
  sentence in this course ever disagrees with the code in the project
  folder, the code wins — and please open an issue.

## Where the deeper docs live

| Project | Design & verification story | Step-by-step tutorial |
|---|---|---|
| unode-32u4 | [`unode-32u4/README.md`](../unode-32u4/README.md) | `unode-32u4/unode32u4-tutorial.pdf` |
| radio-lab | [`radio-lab/README.md`](../radio-lab/README.md) | `radio-lab/docs/radio-lab-tutorial.pdf` |
| fm-radio-lab | [`fm-radio-lab/README.md`](../fm-radio-lab/README.md) | `fm-radio-lab/docs/fm-radio-lab-tutorial.pdf` |
| tricolor-lamp | — | [`tricolor-lamp/README.md`](../tricolor-lamp/README.md) (full tutorial inside) |
| arc-lighter | — | [`arc-lighter/README.md`](../arc-lighter/README.md) (full tutorial inside) |

Start with chapter 1: **[How to read a schematic](./01-schematic-literacy.md)**.
