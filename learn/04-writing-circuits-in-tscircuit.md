# Chapter 4 — Writing circuits in tscircuit: the code behind both views

> **Goal of this chapter:** read and *modify* the code of any project in
> this repo, and understand enough of the tscircuit vocabulary to write a
> small circuit of your own. This is the "write" in "read, write and
> understand".
>
> **You need:** chapters 1–3 (symbols/nets, PCB basics, the idea that code
> → netlist → both drawings). Basic React/TypeScript syntax helps but is
> not required — the code reads like configuration with angle brackets.

---

## 4.1 The idea in one paragraph

tscircuit's bet: **a circuit is text, so it should be written as text** —
specifically as React components. You write a `<board>` containing
`<resistor>`, `<capacitor>`, `<chip>`… elements, and connect them with
`<trace>` elements. From that file, the tool generates the **netlist**
(`circuit.json`), and from the netlist it renders the **schematic**, the
**PCB layout**, and a 3D view. You never draw anything. When you change
the code, all views change together — they cannot disagree, because they
are all children of the same text.

Every board you've read about in chapters 1–3 is one `.tsx` file:

| Project | Boards and their files |
|---|---|
| unode-32u4 | `unode-32u4/index.tsx` |
| radio-lab | `radio-lab/transmitter/index.tsx`, `radio-lab/receiver/index.tsx` |
| fm-radio-lab | `fm-radio-lab/transmitter/index.tsx`, `fm-radio-lab/receiver/index.tsx` |
| tricolor-lamp | `tricolor-lamp/controller/index.tsx`, `tricolor-lamp/led-panel/index.tsx` |
| arc-lighter | `arc-lighter/board/index.tsx` |

Each also carries a `standalone/*.tsx` — the same circuit flattened into
one paste-able file for the web editor.

## 4.2 Tooling in 60 seconds

```bash
# once:
npm install -g tscircuit      # installs the `tsci` CLI

# develop any board (live schematic/PCB/3D in your browser):
cd radio-lab
tsci dev transmitter/index.tsx     # → http://localhost:3020

# zero-install alternative: open https://snippets.tscircuit.com
# and paste a standalone/*.tsx file into it
```

The projects add headless commands (each project README lists them):
`npm run check` (typecheck), `build` (compile to `dist/circuit.json`),
`verify` (audit the netlist + DRC), `math` / `sim` (design equations and
simulations), `render` (regenerate the SVG/PNG views).

## 4.3 Anatomy of a board file

Here is the smallest *complete, honest* tscircuit circuit — a battery, a
resistor and an LED, i.e. chapter 1's recipe #1 as code. Paste it into
<https://snippets.tscircuit.com> and it renders:

```tsx
import "@tscircuit/core"

export default () => (
  <board width="30mm" height="20mm" name="first-light">
    {/* parts: name, value, footprint, position */}
    <battery name="BT1" voltage="9V" footprint="bt_coin_12mm_th"
              pcbX={-8} pcbY={0} schX={-6} schY={0} />
    <resistor name="R1" resistance="470ohm" footprint="0603"
              pcbX={0} pcbY={0} schX={0} schY={0} />
    <led name="LED1" color="red" footprint="led0603"
              pcbX={8} pcbY={0} schX={6} schY={0} />

    {/* wires: what touches what */}
    <trace from=".BT1 > .pos" to=".R1 > .left" />
    <trace from=".R1 > .right" to=".LED1 > .pos" />
    <trace from=".LED1 > .neg" to="net.GND" />
    <trace from=".BT1 > .neg" to="net.GND" />

    {/* the board identifies itself */}
    <silkscreentext text="MY FIRST CIRCUIT" pcbX={0} pcbY={6} fontSize="1mm" />
  </board>
)
```

Three kinds of lines, and that's the whole grammar:

1. **Parts** — one element per component, each with a `name` (the reference
   designator!), a value, a `footprint`, and positions.
2. **Traces** — one element per wire, written as `from` a pin `to` a pin.
3. **Extras** — silkscreen text, holes, pours.

Everything in the five projects is these three kinds of lines plus project
structure and comments. No more magic than that.

## 4.4 Pin selectors — how traces point at legs

The `from`/`to` strings are **selectors**, and their grammar is worth
memorizing:

```
. <part name> > <pin name>
│                └── pin: either a real pin name ("base", "anode",
│                     "VCC", a pinLabels entry) or "pin1", "pin2"…
└── part: the `name` you gave the element ("Q1", "C14", "U2")
```

Examples from the repo, verbatim:

```tsx
<trace from=".Q3 > .collector" to="net.TANK" />          // AM-TX tank
<trace from=".LED1 > .cathode" to="net.GND" />           // power light
<trace from=".J1 > .VBUS"   to=".F1 > .left" />          // USB → fuse
<trace from=".U1 > .XTAL2"  to="net.XTAL2" />            // μNode clock
<trace from=".U2 > .PB3"    to="net.SENSE" />            // lamp's ADC pin
```

Stock elements come with standard pin names: resistors/caps use `pin1`/
`pin2` (or `left`/`right` on some footprints); diodes/LEDs use `anode`/
`cathode` (the arc-lighter's custom diodes use `pin1`=anode, `pin2`=
cathode — its code comments say so); transistors use `base`/`collector`/
`emitter` (MOSFETs: `gate`/`drain`/`source`). Chips and headers use
whatever **you** name their pins — next.

## 4.5 Naming a chip's pins: `pinLabels`

A bare `<chip>` knows its package (footprint) but not which pin means
what — you teach it, exactly like printing pin names on a schematic box:

```tsx
<chip
  name="U2" footprint="dip8"
  pinLabels={{
    "1": "VCC", "2": "GND", "3": "IN_POS", "6": "OUT", "7": "GAIN_A", "8": "GAIN_B",
  }}
/>
```

That is a compressed version of the radio labs' `Lm386`. After this,
`.U1 > .IN_POS` is a valid selector. The same prop works on `<pinheader>`:

```tsx
<pinheader name="J3" pinCount={6} doubleRow pinLabels={["RESET","GND","MOSI","VCC","MISO","SCK"]} />
```

(the μNode's ICSP header — chapter 7 shows why the *order* of that list is
a layout decision, not just a name list). The ATmega32U4's 44 named pins
live in `unode-32u4/lib/atmega32u4.tsx` — one custom component, reused
everywhere the board references `.U1 > .PD5` etc.

## 4.6 Positions: every element lives in TWO pictures at once

Notice every part in §4.3 had **two coordinate pairs**:

```tsx
pcbX={8}  pcbY={0}    ← where the FOOTPRINT sits on the physical board (mm)
schX={6}  schY={0}    ← where the SYMBOL sits on the schematic page
```

This is chapter 3 made mechanical: one part, two renderings, and you may
position each independently. `pcbRotation`/`schRotation` rotate the
footprint/symbol. Practical conventions from the repo:

* Schematic: signal flows left→right; power top, ground bottom; `schX`/
  `schY` grid units are roughly arbitrary "columns and rows" (the AM-TX
  walks `schX` from −16 at the mic to +16 at the antenna — literally the
  reading order of chapter 1 §1.9).
* PCB: parts placed to make routing short and sane — decouplers *at the pin
  they serve* (μNode's `C3`…`C9`), the crystal under the chip, the coil
  away from the battery, the USB connector at the edge. When you read
  comments like "C4 tucks under the chip's bottom-right corner", you're
  reading a `pcbX/pcbY` decision and its *reason*.

## 4.7 Footprints — choosing the landing site

The `footprint` prop says which physical package the part comes in, i.e.
what copper pattern it needs (chapter 2 §2.3). Three ways the repo does it:

**1. Footprinter strings** (built-in patterns):

```tsx
<resistor name="R1" resistance="22ohm" footprint="0603" ... />   // SMD chip size
<capacitor name="C1" capacitance="4.7uF" footprint="0805" ... />
<inductor name="L1" inductance="100uH" footprint="radial_p5mm" ... />
<crystal name="Y1" frequency="16MHz" loadCapacitance="15pF" footprint="hc49" ... />
```

Numbers like `0603`/`0805`/`1206` are SMD size codes (width × length in
hundredths of an inch); `hc49` is the classic silver crystal can.

**2. Package names for chips:** `tqfp44_0p8mm` (the ATmega32U4 — 44 legs at
0.8 mm pitch), `dip8` (LM386, ATtiny85 socket), `to220` (the lamp's
MOSFETs), `sot23`, `sot89`… These also decide pin *numbering* on the PCB.

**3. Custom footprints from primitives** — for mechanical parts (battery
clips, switches, pots, trimmers, wire pads) whose pads vary by vendor.
That's what each project's `lib/parts.tsx` is: a small library of
components composed from `<platedhole>` (a pad), `<silkscreenpath>` (an
outline) and `<courtyardrect>` (a keep-out), wrapped with a schematic
symbol. The pattern, from `radio-lab/lib/parts.tsx`:

```tsx
export const PowerSwitch = (props: PartProps) => (
  <switch {...props} type="spst"
    footprint={
      <footprint>
        <platedhole portHints={["pin1"]} pcbX={-2.54} pcbY={0} holeDiameter={1.2} outerDiameter={2.1} shape="circle" />
        <platedhole portHints={["pin2"]} pcbX={2.54} pcbY={0} holeDiameter={1.2} outerDiameter={2.1} shape="circle" />
        <silkscreenpath route={[/* rectangle outline */]} />
        <courtyardrect pcbX={0} pcbY={0} width={8.6} height={4.0} />
      </footprint>
    }
  />
)
```

`portHints` is the custom-footprint version of `pinLabels` — it binds a pad
to a name so selectors keep working. **When you write your own circuits,
steal these libraries** (`lib/parts.tsx` files are self-contained).

## 4.8 Traces, nets and hand-routing

**Two ways to say "connected"** — the code version of chapter 3 §3.7:

```tsx
// direct: a wire from pin A to pin B (the tool draws the copper)
<trace from=".SW1 > .pin2" to=".C1 > .pin1" />

// named: declare membership in a net — best for 3+ connections,
// exactly like a net label on a schematic
<trace from=".SW1 > .pin2" to="net.V9" />
<trace from=".C1 > .pin1" to="net.V9" />
<trace from=".R1 > .pin1" to="net.V9" />
```

Reading tip: a `net.NAME` appearing on several lines = one electrical
island. The radio boards name nets after their stories (`VMD`, `TANK`,
`AUD`, `VAR`); μNode uses functional names (`SDA`, `MISO`, `HWB`).

**Props that matter:**

* `width="0.5mm"` — trace width; current-carrying choice (chapter 2 §2.5).
  No width given → the board's default.
* `pcbPath={[...]}` — *hand-routing*: explicit waypoints so copper goes
  where you want. Used sparingly and always commented with the reason
  (μNode: "under the top pad row"; arc-lighter: the whole 2–3 A loop;
  lamp panel: the +12 V rail). The syntax accepts absolute points
  `{x, y}` and selector endpoints (see the boards' code for both).
* `maxLength="15mm"` — a guard: fail if the router makes this wire too
  long (μNode uses it on crystal-adjacent nets).

**Autorouter honesty:** tscircuit will connect any legal net any legal way
— but "legal" is not "good". The comments in these files are a masterclass
in *why* a hand path beats an auto path (heat, crosstalk, pad grazing).
When you start modifying boards, read the comment near a `pcbPath` before
moving anything.

## 4.9 The rest of the vocabulary you'll meet

```tsx
<hole name="H1" diameter="3.2mm" pcbX={-32} pcbY={22} />       // mounting hole

<silkscreentext text="TUNE" pcbX={33.02} pcbY={17.78} fontSize="1.2mm" />

<copperpour connectsTo="net.GND" layer="bottom"
            padMargin="0.45mm" useThermalReliefs />             // ground pour

<pushbutton name="SW1" footprint="pushbutton" ... />            // tactile button
<pinheader name="J2" pinCount={16} pitch="2.54mm" ... />        // breakout header
```

plus per-`board` manufacturing rules (from each project's `FAB_RULES`):

```tsx
<board width="72mm" height="50mm" name="uNode32U4"
  minTraceWidth="0.15mm"
  minTraceToPadEdgeClearance="0.115mm"
  minViaHoleDiameter="0.3mm" ...>
```

These numbers are the DRC's rulebook — the "can this be manufactured"
constraints of chapter 2 §2.10, written down where the tool can enforce
them.

## 4.10 The discipline the big files teach

Open any project `index.tsx` and you'll find the same three habits. Adopt
them and your circuits stay readable as they grow:

1. **Banner-commented sections that mirror signal flow** — `§1 POWER`,
   `§2 MICROPHONE`, `§3 PREAMP`… The file reads like the schematic's pages
   *because it was written in reading order*.
2. **Every connection explicit.** No "implicit" wiring: each wire is a
   `<trace>` you can grep. Reading the traces top-to-bottom IS reading the
   netlist.
3. **Values justified inline.** `R5 4.7k` is never just a number — the
   comment derives it ("gain ≈ R5/r_e ≈ 140×"). When *you* write circuits,
   write the one-line "why" next to each value; your future self will
   thank you the way these files thank their authors.

## 4.11 Exercise — modify something real (15 minutes)

The safest first edit, in the web editor:

1. Open <https://snippets.tscircuit.com>, paste
   `radio-lab/standalone/am-tx-playground.tsx`.
2. Find `<Res name="R1" resistance="2.2kohm" .../>` (the power-LED
   resistor). Change it to `"1kohm"`. Watch the schematic value text and
   the PCB nothing — the part didn't move, the *current* changed
   (`(9−2)/1k = 7 mA`, a brighter LED).
3. Find `C16` (the 47 pF antenna coupler) and change its `pcbX` by +5 mm.
   Now the PCB view shows the part in its new place while the schematic is
   unchanged — chapter 3, experienced first-hand: value edits belong to
   both views, position edits belong to one.
4. Break something on purpose: delete the trace
   `from=".R1 > .pin2" to=".LED1 > .anode"`. Both views now show the LED
   floating off net `V9` — the netlist is the truth, and you just edited
   it. Undo.
5. Add something: a second LED string. Duplicate the `Led5mm` line, name
   it `LED2`, place it 5 mm away, and trace `.R1 > .pin2` to `.LED2 >
   .anode`, `.LED2 > .cathode` to `net.GND`. If both views render and
   nothing overlaps, you have written tscircuit.

When you outgrow the playground: clone this repo, edit a real
`transmitter/index.tsx`, and run the project's `check`/`build`/`verify`
(its README documents them) — the verify scripts will audit your edit
against the design's invariants, which is how the five projects keep
themselves honest.

---

## Check yourself

1. What is the difference between `pcbX/pcbY` and `schX/schY`?
2. Write (from memory, then check §4.4) the selector for *the base pin of
   transistor Q1*.
3. What does `to="net.V9"` mean, versus `to=".C1 > .pin1"`?
4. Name the three primitives a custom footprint in `lib/parts.tsx` is
   built from.
5. Why do the project files prefer banner-commented sections in signal
   order?

<details>
<summary>Answers</summary>

1. `pcbX/pcbY` positions the footprint on the physical board (mm, real);
   `schX/schY` positions the symbol on the schematic page.
2. `.Q1 > .base`
3. `net.V9` declares the pin a member of the named net (connected to
   everywhere else that net appears); `.C1 > .pin1` draws a wire from this
   pin to that specific other pin.
4. `<platedhole>` (pad), `<silkscreenpath>` (outline), `<courtyardrect>`
   (keep-out).
5. Because the file then reads like the schematic's pages / the signal
   path — the code stays navigable as it grows, and reviewers can follow
   signal order.
</details>

---

**Next:** the tours. Start with
[Chapter 5 — the AM Radio Lab](./05-tour-am-radio-lab.md),
jump to the [chapter list](./README.md) for the others.
