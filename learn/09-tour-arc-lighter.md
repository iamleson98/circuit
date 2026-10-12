# Chapter 9 — Guided tour: the Arc Lighter (high voltage, safely)

> ⚠️ **Read this first:** this project makes an electric arc — roughly
> **10,000 volts** across a 3–5 mm gap. It bites. The project README's
> "§1 Safety" is mandatory reading before building or testing it; this
> tour explains the circuit, and repeats the safety-relevant design
> decisions, but the README is the authority.
>
> **What you need:** chapters 1–2, and chapters 7–8 help a lot (same ATtiny
> brain, pull-up/pull-down discipline, first P-channel MOSFET appears
> again).
>
> **What you'll learn:** how 3.7 V becomes kilovolts (the *flyback*
> trick), how a circuit can oscillate *using the load itself* (a blocking
> oscillator), and how responsible design stacks **independent safety
> layers** — hardware and software — so no single mistake can hurt you.

**The project in one paragraph.** A rechargeable "electric lighter" of the
kind sold next to candles: press a button, a small continuous arc jumps a
gap, hot enough to light paper — no fuel, no flame. The board is the
whole lighter's brain and muscle except the parts that live in the case:
the LiPo cell, the LOCK slide switch, the FIRE button, and the
high-voltage coil (a bought part — its two thin HV leads go straight to
the electrodes and **never touch this board**; only the coil's
low-voltage windings connect to the pads on the right edge).

```
micro-USB ─► MCP73831 charger ─► protected LiPo ─► LOCK switch ─► ATtiny85 supervisor ─┐
                                                (armed)   │  (hold-to-fire, 8 s limit, │
                                                                    USB/low-batt/fault)  │
                                     P-MOSFET power switch ◄───────────────────────────┘
                                          └► self-oscillating driver (Q2, current-limited)
                                                  └► coil primary ── flyback ──► ~10 kV arc
```

**Open the views while you read:**

```bash
cd arc-lighter && tsci dev board/index.tsx
```

…or zoom the renders below. The full tutorial (safety, parts, making the
board, staged bring-up, firmware) is
[`arc-lighter/README.md`](../arc-lighter/README.md).

---

## 9.1 The safety architecture — read this even before the circuit

The schematic is best read as *five independent walls* (the code header
says "each one independent of the others" — meaning any one wall failing
still leaves the others standing):

| Wall | Parts | What it guarantees |
|---|---|---|
| 1. The cell itself | bought **protected** LiPo pack (its own PCM board) | over-charge / over-discharge / over-current / short cut-outs, independent of this board |
| 2. Hardware cutoff | `LOCK` slide switch | locked ⇒ everything after it (net `VARM`) is dead — **no firmware bug can arc a locked lighter** |
| 3. Firmware supervision | `U2` ATtiny85 | fires only while FIRE is held; stops after 8 s; refuses while USB is plugged in or the cell is low; shuts down within 50 ms if the coil isn't oscillating |
| 4. Hardware current limit | `Q3` + `RE1`/`RE2` | peak current ≈2.6 A per cycle *whatever the coil or transistor does* — a mis-wired coil can't cook the driver |
| 5. Voltage clamp | `D2` (TVS) | the collector never exceeds ≈40 V, well inside the transistor's 60 V rating, even if the arc can't strike |

When you read the schematic below, keep asking "which wall is this part?"
Almost every component belongs to one.

## 9.2 Reading the schematic

![Arc lighter schematic](../arc-lighter/render-schematic.png)

### §1 — USB charging: `J1`, `U1`, `R1`, `C1`, `C2`, `LED1`, `LED2`

`U1` (MCP73831) is a complete Li-ion **charger in a SOT-23-5** — a tiny
5-pin chip box; read its pin names: `VDD` from the USB's 5 V, `VBAT` to
the cell, `PROG` (programming = *setting the current*, here), `STAT`
(status output), `VSS` ground. Its recipe (constant current, then
constant 4.20 V, then stop) is built in; the board adds:

* `R1` 4.7 kΩ on `PROG` — sets the charge current:
  `I = 1000/R ≈ 213 mA`, a gentle ~0.5–0.7 C for a lighter-sized cell
  (datasheet arithmetic, on a resistor again).
* `C1`/`C2` 4.7 µF — decoupling in and out (the datasheet's ask).
* Two status LEDs driven by the open-drain `STAT` pin — a neat schematic
  reading exercise: while charging `STAT` is LOW, so current flows
  VBUS→`R2`→**red** `LED1`→STAT⇒GND (red lights); when done `STAT` goes
  HIGH, so the red path dies and the pin now sources `R3`→**green**
  `LED2`→GND (green lights). One pin, two LEDs, opposite logic — you can
  *see* it on the schematic if you follow the arrows.

Note the order of things: the charger feeds the cell **upstream of LOCK**
— the lighter charges while locked (safety wall 2 doesn't fight wall 1's
job).

### §2 — Battery, LOCK, and the current loop

Four wire pads (`BATP`, `BATN`, `LOCKA`, `LOCKB`) take the off-board
parts. Closing LOCK connects the battery's + to net `VARM` — everything
downstream's supply. The **high-current loop** to keep in mind (it gets
its own hand-routed copper, §9.3):

```
BAT+ → LOCK → Q1 → C6-C8 → coil P+ … coil P− → Q2 → RE1/RE2 → BAT−
```

### §3 — The supervisor: `U2` (ATtiny85) and its senses

Same brain chip as the lamp, five senses and one voice:

* **Supply, filtered:** VARM → `R4` 10 Ω → `C4` 10 µF (+`C3` 100 nF) →
  net `VMCU`. An RC low-pass: the coil's 2 A pulses shake `VARM`, and this
  little filter keeps them off the microcontroller's dinner.
* `PB3` ← **FIRE** button to ground (internal pull-up — a button with no
  external resistor; chapter 7's pull-up idea, but inside the chip).
* `PB4` → **Q1's gate** (LOW = arc power ON), with `R6` 100 kΩ pulling
  the gate UP to VARM: **off by default** — during reset, during
  programming, while unpowered. You met this discipline on the lamp's
  gates; here it's the difference between a lighter and a surprise.
* `PB2` ← **oscillation sense**: `Q2`'s collector scaled by `R12`/`R13`
  (100 k/33 k — a divider again). This pin is the ATtiny's hardware
  counter input: the firmware literally *counts coil pulses* with zero
  CPU load, and if the count dies within 50 ms it shuts the arc down
  (coil fault — e.g. the feedback winding wired backwards).
* `PB0` ← **VBUS sense** (`R7` 1 MΩ / `R8` 2.2 MΩ divider + `C5`): USB
  present ⇒ firing refused. (Mains-free board; still, charging and arcing
  don't mix.)
* `PB1` → **status LED3** via `R9` — blink codes for low battery, coil
  fault, timeout.
* Battery voltage with **no pin at all**: the ADC reads its internal 1.1 V
  reference *against VCC* — since VCC is the battery, the reading falls
  as the battery does. A free voltmeter.
* `J2` — the ISP header for programming (and sharing nets with the
  senses, which is why `R6`/`R10`-style isolation matters — compare the
  lamp's `R6` protecting its programmer's SCK).

### §4 — The arc power switch: `Q1` (P-channel MOSFET)

Your second MOSFET family member. A **P-channel** MOSFET is the mirror
image of chapter 8's N-channel: it switches the *high* side — source to
`VARM`, drain to the driver's supply `VDRV` — and it's ON when its gate
is pulled **LOW** (toward ground), OFF when the gate sits at source. Why
high-side here? So the driver's ground stays solid *and nothing at all is
live on the coil when the lighter is idle* — Q1 off means the entire
muscle section is unpowered, not merely "not driven". `R6` (100 kΩ,
gate→VARM) guarantees that off state.

### §5 — The driver: `Q2`, the coil, and the flyback trick

The muscle: a **self-oscillating ("blocking oscillator")** stage — the
circuit arc-lighter coils are wound for.

* **Oscillating:** `Q2` (FZT851, a power transistor) switches the coil's
  **primary** (`P+` from VDRV, `P−` to the collector). `R10` (47 Ω) feeds
  base current *through the coil's feedback winding* (`FA`→`FB`): wired
  the right way round, the feedback *adds* to the drive while primary
  current ramps up, so `Q2` slams fully on. The coil itself is the
  oscillator's timing component — "who opens and closes the tap so fast?
  The coil itself," as the README puts it.
* **Current limit (wall 4):** `RE1`∥`RE2` (two 0.51 Ω in parallel =
  0.255 Ω — two resistors *because one would burn*, sharing the
  dissipation) sit under `Q2`'s emitter. At ≈2.6 A they drop 0.65 V —
  enough to turn on `Q3` (a small BJT), which **steals `Q2`'s base
  current**; `Q2` comes out of saturation, the feedback reverses, and
  `Q2` snaps off. Without `Q3`, the current runs away with transistor
  gain (6 A+ in simulation — the README's "runaway" story).
* **The flyback (where kilovolts come from):** while `Q2` is on, current
  builds *energy* in the primary's magnetic field. The instant `Q2` snaps
  off, that energy has nowhere to go — so the primary's voltage flies
  *upward*, and the **secondary** (hundreds of turns, ratio ~250–600:1)
  multiplies it until the 3–5 mm air gap *breaks down* — the arc. Then
  the cycle repeats, 5–16 thousand times a second. An inductor resisting
  a change in current (chapter 1's coil) is the whole engine: `V = L·di/dt`
  with `di/dt` enormous.
* **The clamps:** `D1` keeps the reversed feedback from yanking `Q2`'s
  base below −0.4 V (its base-emitter junction would otherwise break down
  at 6 V); `D2`, the big **TVS** (transient-voltage suppressor — a diode
  designed to *avalanche* on purpose) clamps the collector at ≈40 V, and
  it *eats* the coil's leakage spike every cycle (up to ≈2.7 W while
  arcing — hence the big SMC package, thermally stitched to the ground
  pour). Wall 5.
* `C6`–`C8` (3× 22 µF) supply the 2–3 A pulses *locally*, so the loop
  doesn't drag the whole supply down at 10 kHz.

### §6 — The coil pads

Right edge, top to bottom: `P+`/`P−` (primary), `FA`/`FB` (feedback —
**swap them if the status LED blinks "coil fault"**: reversed feedback is
simply backwards), `MOD+`/`MOD−` (an alternative: drop in a complete
potted "3.7 V arc module" instead of the bare coil + this driver —
firmware flag `MODULE=1`, some parts left unpopulated). The **HV leads go
to the electrodes only** — printed on the board, in words, where you need
it (silkscreen as safety notice, chapter 2 §2.8).

## 9.3 Reading the PCB

![Arc lighter PCB](../arc-lighter/render-pcb.png)

A dense 60×30 mm SMD board — the muscle keeps a compact neighbourhood by
physics:

* **Left edge:** USB connector at the board edge (μNode's edge-overhang
  trick again), charger `U1` and its two status LEDs above it.
* **Bottom edge:** the wire pads — `FIRE` bottom-left, then `BAT− BAT+
  LOCK`, then `MOD+ MOD−` at the right.
* **Centre-left:** the ATtiny85 (`U2`, a small QFN-style square), its
  filter, its dividers, the ISP header below it.
* **Right half — the muscle:** P-MOSFET `Q1`, then the three bulk caps in
  a vertical bus, `Q2` the power transistor (SOT-223 class, biggest
  three-pad part), the two current-sense resistors `RE1`/`RE2` (the
  widest pads on the board — 2512 size, because current = heat = area),
  TVS `D2` (big SMA/SMC diode package), and the coil pads up the right
  edge (`P+ P− FA FB`).
* **The fat traces:** follow `BATP` → `LOCK` → `Q1` → the cap bus →
  `P+`… and `P−` → `Q2` → `RE`s → `BATN`: the whole 2–3 A loop is
  **hand-routed at 0.8 mm** — the code comment even admits the
  autorouter "happily sent the battery current down a 0.15 mm trace"
  before the loop was drawn by hand. That comment is chapter 2 §2.5's
  lesson, straight from a design log.
* Bottom layer: ground pour with thermal reliefs; the TVS and the sense
  resistors lean on it for cooling.

## 9.4 How the walls cooperate (one press of FIRE)

Armed (LOCK closed) and holding FIRE: firmware checks USB-sense (must be
absent), battery (must be healthy), then drives `PB4` LOW → `Q1` ON →
`VDRV` live → the blocking oscillator starts (the oscillation-sense pin
starts counting pulses — a stuck-low count means coil fault: shutdown in
50 ms). The coil's secondary climbs to ~10 kV per cycle until the gap
breaks down; current limit and TVS keep the transistor inside its ratings
the whole time. Release FIRE (or hit 8 s): `PB4` releases, `R6` pulls the
gate up, `Q1` disconnects the entire muscle. Every sentence in that
paragraph is a component you can point at on the schematic.

**Verification culture:** 28 math checks (every bias point), simulations
across 12 coil corners and 2 fault modes (`npm run sim`), 28 firmware
tests, a board audit — the README's "Proven, not hoped" sections list
them all.

---

## Check yourself

1. Where do the kilovolts come from in a 3.7 V circuit? Name the physical
   principle and the part that embodies it.
2. Why is `Q1` a P-channel MOSFET on the *high* side, when the lamp used
   N-channel on the low side?
3. The lighter is LOCKed and idle. Trace why *nothing* on the coil can be
   live — which parts guarantee it?
4. What happens if the feedback winding is connected backwards, and how
   does the board tell you?
5. Why two 0.51 Ω sense resistors in parallel instead of one 0.255 Ω?

<details>
<summary>Answers</summary>

1. Flyback: energy stored in the primary's magnetic field while `Q2` is
   on is released into a collapsing field when `Q2` snaps off; `V = L·di/dt`
   with a huge `di/dt` makes the primary voltage fly up, and the
   ~250–600:1 secondary multiplies it until the air gap breaks down. The
   coil (primary + secondary) embodies it.
2. High-side P-MOSFET switching *unpowers* the whole driver when off —
   the coil sees nothing at all. The lamp's low-side N-MOSFETs were
   adequate because "LEDs off" was the safety requirement there, and
   ground-referenced gates are simpler to drive.
3. `R6` (gate→VARM) holds `Q1` off through resets/programming/unpowered;
   `Q1` off removes `VDRV`; no `VDRV` ⇒ the driver and primary are
   dead. LOCK open additionally removes even `VARM`.
4. The feedback *subtracts* instead of adding — the oscillator never
   starts, the oscillation-sense count stays at zero, and the firmware
   shuts down within 50 ms and blinks the coil-fault code (fix: swap
   `FA`/`FB`).
5. Power = I²·R: at 2.6 A one 0.255 Ω part would dissipate ~1.7 W and
   cook; two in parallel share it, and the pair also doubles the copper
   area into the ground pour.
</details>

---

*You've reached the end of the course.* Return to the
[course home](./README.md), pick a project to build, and when you're
ready to go deeper: every project README + tutorial PDF is waiting, and
chapter 4 gave you the keys to change anything you've read.
