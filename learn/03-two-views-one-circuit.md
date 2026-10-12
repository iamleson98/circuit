# Chapter 3 — Two views, one circuit: why the schematic shows "separate parts"

> **The question this chapter answers:** *When I look at the schematic, I
> see scattered little symbols with names, some stubs and labels — it
> doesn't look like the whole circuit **connected**. Where is the machine?
> Why doesn't it look like one connected thing?*

If you've felt this, your eyes are working fine. A schematic is not
*supposed* to look like the connected machine — it is a different kind of
drawing, one that trades *looking connected* for *being readable*. This
chapter explains what it trades, what you get back, and how the same
circuit can simultaneously be the scattered-looking schematic, the
coppery-looking PCB, and the physical board on your desk — without ever
being three different things.

---

## 3.1 What a circuit actually *is*

Start with an unfamiliar claim:

> A circuit is not a shape. A circuit is a **set of parts and a set of
> connections** — which pin of which part touches which other pin.

That list of connections has a name: the **netlist**. The AM transmitter's
netlist contains lines that literally say things like
"`R1 pin2 — LED1 anode`" and "`Q3 collector, C14 pin2, L1 pin1, CV1
stator_A — all one net called TANK`".

Everything else — the drawing, the copper, the physical wires — is a
*rendering* of that list. Which means:

* The **schematic** is one rendering of the netlist, optimized for **humans
  understanding what the circuit does**.
* The **PCB layout** is another rendering of the same netlist, optimized
  for **manufacturing** (where exactly the copper goes).
* The **physical board** is the netlist realized in fiberglass and copper.

Same list, three bodies. Confusion only begins when you expect rendering #1
to look like rendering #3. It won't — and once you know why, you'll stop
wanting it to.

## 3.2 The subway-map explanation

The classic analogy, because it is exactly right:

* An **aerial photo** of a city shows the truth of *position*: streets,
  distances, shapes. Try planning a metro trip with it — miserable.
* A **subway map** throws away true distance and shape, and keeps only
  *which stations connect to which*. It looks nothing like the city —
  and that's precisely why you can use it at a glance.

The schematic is the subway map. The PCB layout is the aerial photo. When
the schematic scatters parts across a page, it's doing what the subway map
does when it bends a straight line into a tidy curve: **sacrificing
geometric truth to make connectivity legible.**

So when the schematic shows "discrete parts" — a transistor over here, its
resistors over there, joined only by short stubs and names — the
*connections are all still there*, stated as a list, just not drawn as one
continuous object. The drawing optimizes for your brain, not your eyes.

## 3.3 Why not draw the whole circuit as one connected picture?

Because the picture becomes unreadable *exactly* as the circuit becomes
interesting. Three forces at work:

**1. The hairball problem.** Take the AM receiver: 41 parts, and its
ground net alone touches ~30 pins. Draw an honest wire from every ground
pin to every other ground pin: a full-page cobweb where no signal can be
followed. Engineers tried that in the 1900s; "rat's nest" was the technical
term. The fix was to **name** heavily-shared nets (`GND`, `V9`) instead of
drawing them — the net label, chapter 1's key idea. Net labels are why the
parts get to look discrete *and stay connected*.

**2. Parts are drawn by their electrical role, not their body.** A
resistor's job is "current becomes voltage"; that's the whole symbol. The
physical part is a little ceramic/plastic stick with paint stripes —
showing the body would tell you nothing and cost space. A chip like the
LM386 contains dozens of transistors; its symbol is one box with eight
labelled pins, because at the level where you *use* it, the internals are
off-stage. Every symbol is a **compression**: physics kept, packaging
dropped. A "discrete-looking part" on a schematic is really a *readable
summary* of a part.

**3. The schematic must serve redesign, not just reading.** Want to change
the mic gain? Move `R5`'s value. On the schematic that's a one-symbol
edit; on a "realistic" drawing you'd be re-drawing geometry. Keeping the
drawing abstract keeps it *cheap to think in*. (This repo takes that idea
to its conclusion: the circuit is *code* — chapter 4 — and the schematic
and PCB are both generated from it, so they can never disagree with each
other or with the netlist.)

## 3.4 The same fact, in four representations

Watch one tiny piece of the AM transmitter — its power light — appear in
all four worlds. The fact: **9 V goes through a 2.2 kΩ resistor into a
green LED, whose other end returns to ground.**

**In the code** (`radio-lab/transmitter/index.tsx`, compressed):

```tsx
<Res name="R1" resistance="2.2kohm" ... />
<Led5mm name="LED1" color="green" ... />
<trace from=".R1 > .pin1" to="net.V9" />
<trace from=".R1 > .pin2" to=".LED1 > .anode" />
<trace from=".LED1 > .cathode" to="net.GND" />
```

**In the netlist** (`circuit.json`, what the code compiles to): three
entries — parts `R1`, `LED1`; nets `V9 ∋ R1.1`, `NET(anonymous) ∋ R1.2,
LED1.anode`, `GND ∋ LED1.cathode`.

**In the schematic render:** a rectangle labelled `R1 2.2kΩ`, a diode+arrows
symbol labelled `LED1 green`, a wire between them, a `V9` stub at one end,
`GND` at the other. *Scattered-looking? No — this little cluster reads as
one sentence.*

**On the PCB:** two pads with `R1` silkscreen, two pads with `LED1` + a
polarity mark, a short copper trace between R1's pad 2 and LED1's anode
pad; R1's other pad joins the fat power trace, LED1's cathode drops
through the pour.

One fact, four bodies — and *the connections never changed*. That
invariance is the entire point. When people say "check it against the
schematic," they mean: verify that the copper rendering and the symbol
rendering still describe the same netlist.

## 3.5 "But even the physical board doesn't show the whole circuit connected!"

This is the surprise that makes the whole question click. Go look at a real
printed circuit board — or the μNode32U4's PCB render:

![μNode32U4 PCB](../unode-32u4/render-pcb.png)

* The ATmega32U4's 44 legs connect to 44 copper pads — and then the copper
  dives into a green-black sandwich where you **cannot see it**. Two-thirds
  of the connections are invisible.
* The ground "wires" aren't wires at all: they're a solid copper sheet
  *inside* the board. Where is "the wire" in a sheet?
* Inside the chip itself, thousands of connections live in a silicon die
  smaller than a fingernail. Nobody can see those either.

Conclusion: **no view — physical, photographic, or drawn — ever shows the
whole circuit connected.** Connection is always partly *invisible*, living
in a netlist somewhere (in the fab's files, in the CAD tool, in the
engineer's head). The schematic is simply the view that makes the
connections *explicit and nameable*, at the cost of looking like scattered
parts. You are not missing a picture; you're gaining the map.

## 3.6 So how do I see the "whole circuit" in my head?

You build it by reading — and the schematic is arranged to make that
reading possible. The trick is that a schematic is never read part-by-part
across the page; it's read **as blocks in signal order**:

```
power → input → [amplify] → [process] → [output]
```

Every project in this repo was drawn this way (and every tour in chapters
5–9 walks you through exactly this):

* **AM-TX:** battery → mic → preamp → modulator → oscillator → final amp →
  antenna. Six boxes; the "machine" is the arrows between them.
* **FM-RX:** antenna → buffer → detector (strangled by a quench oscillator)
  → filter → volume → earphone.
* **Arc lighter:** USB → charger → battery → LOCK → supervisor → power
  switch → driver → coil → spark.

When engineers "see a circuit" they see *that* diagram of blocks with
signals flowing — the schematic is just the blocks exploded so each can be
inspected. The sense of "one connected machine" comes from following the
signal through the blocks — chapter 1 §1.8's procedure — not from the
drawing looking like a machine.

## 3.7 The net label, revisited — the connectedness you can't see drawn

One more pass over the mechanism, because it is literally the answer to
"where are the wires?":

* A **wire drawn** between two symbols = one net, visible.
* A **net label** (`V9`, `TANK`, `GND`) = one net, *declared by name*,
  drawn as short stubs. Connected — but only visible to someone who knows
  the rule "same name = same net."
* On the **PCB**, that same net = a fat trace, a pour, a chain of short
  hops — whatever geometry the router chose. Same net again.

So the connectedness never left. It's stated in the most economical way
each view can state it. Reading a schematic means learning to *hear* the
net labels say "wire."

## 3.8 Worked mini-tour: following one net through all views

The AM transmitter's cleverest net is `VMD` — "the 9 V rail with your
voice stamped on it." Follow it through the views once, and the
multi-view idea will be yours forever:

1. **Schematic** (`radio-lab/render-tx-schematic.png`): find `Q2` (emitter
   follower). Its emitter has a stub labelled `VMD`. Elsewhere, `L2`'s
   bottom pin and `C19`'s top pin wear the same `VMD` label. Three stubs,
   no drawn wire between them — *one net*: the modulator's output feeding
   the final amplifier's supply.
2. **Code** (`transmitter/index.tsx`): three lines say it —
   `<trace from=".Q2 > .emitter" to="net.VMD" />`,
   `<trace from=".L2 > .pin2" to="net.VMD" />`,
   `<trace from=".C19 > .pin1" to="net.VMD" />`. The netlist, in prose.
3. **PCB** (`render-tx-pcb.png`): find `Q2`'s emitter pad (right-middle of
   the board) — a real copper trace walks from it across to `L2`'s pad.
   That trace *is* net `VMD`, in copper.

One net, three renderings, zero disagreement. Now do it with any net you
like — the skill transfers to every circuit you'll ever meet.

---

## Check yourself

1. In one sentence: what is a netlist?
2. Why does the schematic use net labels instead of drawing all the ground
   wires?
3. True or false: the physical PCB shows more of "the whole circuit
   connected" than the schematic does.
4. Where does the sense of "one connected machine" actually come from when
   an engineer reads a schematic?

<details>
<summary>Answers</summary>

1. The list of which pins of which parts are connected (grouped into
   named nets).
2. Because shared nets touch dozens of pins; drawn point-to-point they
   become an unreadable cobweb. A label states the same connection in
   constant space.
3. Trick question — false: the PCB hides copper inside the sandwich, uses
   a pour as "ground wire," and hides all connections inside chips. No
   view shows all connections; the schematic is the view that *states*
   them.
4. From following the signal path through functional blocks
   (input → process → output), not from any single picture.
</details>

---

**Next:** [Chapter 4 — writing circuits in tscircuit: the code behind both views →](./04-writing-circuits-in-tscircuit.md)
