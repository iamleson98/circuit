#!/usr/bin/env python3
"""chapters_a.py — FM Radio Lab tutorial, chapters 1-5."""

from tut_lib import (S, h1, h2, h3, body, bullets, code, callout, callout_row,
                     figure, make_table, Paragraph, Spacer, ACCENT, ACCENT_2)
D = "/home/z/my-project/scripts/fm_pdf/diagrams"
W = "/home/z/my-project/work/repo-circuit/fm-radio-lab"


def ch1(story):
    h1(story, "1 · What you are building")

    body(story, "FM Radio Lab is a pair of small circuit boards: an <b>FM transmitter</b> that turns your "
        "voice into a frequency-modulated radio signal, and an <b>FM super-regenerative receiver</b> that "
        "plucks that signal back out of the air. The transmitter has a microphone, two transistors, a "
        "hand-wound coil, and a tuning knob. The receiver has a wire antenna, four transistors, a volume "
        "knob, and its own tuning knob. Both run for days on ordinary 9&nbsp;V batteries. Everything is "
        "through-hole, everything sits on a 0.1&nbsp;inch grid, and every part is the kind you can buy from "
        "any hobby electronics shop for pocket change.")

    body(story, "This is the FM sibling of the AM Radio Lab, and it works at one hundred times the "
        "frequency — around <b>100&nbsp;MHz</b>, the FM broadcast band, where a full wave is three metres long "
        "and the coil is three turns of wire. Working up here changes everything about the design: "
        "the transistor's own internal capacitances become part of the tuned circuit, the wiring "
        "itself becomes a component, and the receiver uses one of the strangest, most beautiful "
        "tricks in all of radio — <b>super-regeneration</b> — an oscillator that listens. The ritual is the "
        "same as the AM lab: speak into the transmitter, pick a quiet spot on the band, and sweep "
        "the receiver's knob until the hiss collapses into your own voice. That <i>collapse</i> — the "
        "silence — is the signal.")

    callout_row(story, [
        ("FM-TX", "transmitter · 33 parts · 99×64 mm"),
        ("FM-RX", "receiver · 42 parts · 99×89 mm"),
        ("88-108 MHz", "the FM broadcast band"),
    ])

    h2(story, "1.1 · Both boards, at a glance")
    body(story, "The renders below are generated straight from the design source. The transmitter reads "
        "left to right like its schematic: power at the left edge, the microphone and audio preamp next, "
        "and the oscillator with its tank coil and tuning trimmer anchoring the right side, with the "
        "antenna pad at the corner. The receiver keeps the same discipline: antenna and tank at the "
        "left, the detector transistor at centre, the quench oscillator along the bottom, and the audio "
        "chain filling the right half. Both boards carry a solid ground pour on the bottom layer — at "
        "100&nbsp;MHz, a good ground is not a detail, it is the design.")
    figure(story, f"{W}/render-tx-pcb.png", "The FM-TX board (render). 33 parts, 52 routed traces.")
    figure(story, f"{W}/render-rx-pcb.png", "The FM-RX board (render). 42 parts, 69 routed traces.")

    h2(story, "1.2 · What makes this project different")
    body(story, "Most &ldquo;FM bug&rdquo; schematics on the internet are folklore: copied, tweaked, and rarely "
        "simulated. This project is the opposite. Every claim in this tutorial was checked before the "
        "artwork was drawn:")
    bullets(story, [
        "<b>37 machine-checked design equations</b> (calc/circuit_math.mjs) — every bias point, every "
        "tank frequency, every RC time constant, and the current budget of both boards.",
        "<b>21 numerical-simulation proofs</b> (calc/sim_fm.mjs) — the exact nonlinear differential "
        "equations of the oscillator, integrated step by step at 2-picosecond resolution with an "
        "honest transistor model, including the frequency modulation mechanism itself.",
        "<b>Zero DRC errors</b> on both boards, verified headlessly (verify.mjs), with all 155 ports "
        "accounted for and 121 PCB traces routed.",
    ])
    body(story, "The simulations did not just confirm the design — they <i>corrected</i> it, twice, in ways "
        "that would have doomed a blind build. The story of those corrections is Chapter&nbsp;5, and it "
        "is the best engineering lesson in this whole document.")


def ch2(story):
    h1(story, "2 · FM in ten minutes")

    body(story, "In the AM lab, your voice rode on the <i>amplitude</i> of a 700&nbsp;kHz carrier — the wave's "
        "height carried the message. FM throws that away on purpose. The carrier's amplitude stays "
        "perfectly constant, and its <b>frequency</b> does the talking: when your voice waveform goes up, "
        "the transmitter's frequency shifts a little higher; when it goes down, the frequency shifts "
        "lower. The size of that swing is called the <b>deviation</b>, and broadcast FM uses ±75&nbsp;kHz — "
        "a number we will meet again and again.")

    figure(story, f"{D}/fm-concept.png",
           "The same message, carried two ways. AM wiggles the height; FM wiggles the frequency.")

    body(story, "Why go to the trouble? Noise — lightning, motors, the static hiss of the universe — is "
        "almost entirely <i>amplitude</i> noise. It attacks the height of a wave, not its timing. An FM "
        "signal has a constant height, so the receiver can clip every peak to the same level, slash "
        "the noise with it, and still recover the frequency wobble untouched. That is why FM stations "
        "come out of the static hiss so cleanly, and why Armstrong patented it in 1933 and the world's "
        "broadcasters eventually followed.")

    h2(story, "2.1 · The numbers that matter")
    body(story, "Three numbers define an FM signal. The <b>carrier frequency</b> — where it sits on the dial, "
        "88-108&nbsp;MHz for broadcast FM. The <b>deviation</b> — how far the frequency swings for a full-scale "
        "voice, ±75&nbsp;kHz for broadcast. And the <b>audio bandwidth</b> — the highest voice frequency, "
        "about 3.4&nbsp;kHz for intelligible speech. Combine them with Carson's rule and an FM station "
        "occupies about 2×(75+3.4)&nbsp;≈&nbsp;160&nbsp;kHz of bandwidth — which is exactly why the FM dial is "
        "spaced 200&nbsp;kHz per station. Your transmitter will be rather humbler than a broadcast tower "
        "(a few microwatts, a few metres of range), but its <i>shape</i> is identical, and that is what "
        "matters to the receiver.")

    h2(story, "2.2 · The trick that makes a one-transistor FM receiver possible")
    body(story, "A proper FM receiver — the kind in your phone or car — is a superheterodyne: a mixer, a "
        "10.7&nbsp;MHz intermediate-frequency amplifier chain, a dedicated demodulator, a dozen integrated "
        "circuits' worth of precision. We are not building that. We are building the 1940s short-cut "
        "that a whole generation of walkie-talkies, garage-door openers, and toy radios actually used: "
        "the <b>super-regenerative detector</b>, which gets 10<super>4</super>-10<super>6</super> of gain from a single transistor by "
        "cheating in the time dimension. Chapter&nbsp;4 is its story. And to hear FM with a detector that "
        "is really an AM detector at heart, we will use <b>slope detection</b>: tune the receiver a hair "
        "off the station's frequency, so the incoming frequency wobble becomes an amplitude wobble on "
        "the edge of the receiver's resonance curve. It is the same trick every cheap FM radio of the "
        "1950s-70s used, and it works beautifully — with the delicious twist that tuning to the <i>other</i> "
        "side of the station inverts the audio, a party trick you can demonstrate to your friends.")

    h2(story, "2.3 · The law (a short, honest note)")
    body(story, "An unlicensed transmitter is legal only if it is genuinely tiny. In the US, FCC Part "
        "15.239 permits field strengths up to 250&nbsp;µV/m at 3&nbsp;metres in the 88-108&nbsp;MHz band — which is a "
        "few microwatts of radiated power, roughly what this design produces through its 3.3&nbsp;pF "
        "coupling capacitor and short wire. That covers a room, maybe a small house. Other countries "
        "have similar micro-power exemptions. Keep the antenna short, keep the power low, and this is "
        "a textbook-legal science project. Bolt on a proper antenna and start reaching the "
        "neighbourhood, and you are a pirate — don't.")


def ch3(story):
    h1(story, "3 · The transmitter, stage by stage")

    figure(story, f"{D}/tx-chain.png",
           "FM-TX as a chain of jobs. The oscillator is simultaneously the tuner, the modulator, and the transmitter.")

    h2(story, "3.1 · Sound in: the microphone")
    body(story, "An electret capsule is a microphone with a built-in, permanently-charged electret film and "
        "a tiny field-effect transistor buffer. It needs one resistor to feed it (about 100&nbsp;kΩ from "
        "the 9&nbsp;V rail) and one coupling capacitor to pass the voice onward while blocking DC. The "
        "capsule puts out a modest ~20&nbsp;mV of audio. There is also an AUX pad: bridge a phone or music "
        "player in through a divider, and you have a clean, known test tone — the single most useful "
        "debugging tool in radio work, and the tutorial uses it repeatedly.")

    h2(story, "3.2 · The preamp: one transistor, one job")
    body(story, "Q1 is a garden-variety common-emitter amplifier: base biased at about 1.7&nbsp;V through a "
        "stiff divider, emitter at ~1&nbsp;V, collector resting mid-rail. Its job is purely to lift the "
        "microphone's 20&nbsp;mV to the tens of millivolts needed to steer the oscillator — a voltage gain "
        "of roughly 3-10×, set by a clever trick: a <b>switchable emitter bypass capacitor</b>. With the "
        "bypass out, the gain is tame; switch it in and the gain jumps. Loud and soft modes, one "
        "jumper. The math file checks every one of these numbers (§3-§4 of circuit_math.mjs).")

    h2(story, "3.3 · The star: an oscillator that modulates itself")
    body(story, "Q2 is a <b>common-base Colpitts oscillator</b> — the same topology as the AM lab's, but "
        "running at ~100&nbsp;MHz instead of ~700&nbsp;kHz. The tank is L1 (three turns of wire, ~60&nbsp;nH) in "
        "parallel with the trimmer TRIM1 (5-30&nbsp;pF) and the transistor's own capacitances. Feedback "
        "comes from a capacitive divider: 22&nbsp;pF from the tank down to the emitter, 47&nbsp;pF from "
        "emitter to ground. The base sits at a steady 1.85&nbsp;V, decoupled to ground — AC-grounded, "
        "hence &ldquo;common base.&rdquo;")
    body(story, "Now the FM magic. In the AM lab, modulation needed an entire extra transistor stage. "
        "Here it is free, and it hides inside the transistor itself. A bipolar junction's "
        "base-emitter capacitance <b>grows as the junction is forward-biased harder</b> — it is a "
        "voltage-dependent capacitor. The preamp's audio output sits on Q2's base; when the voice "
        "goes up, the base-emitter voltage rises, the junction capacitance rises, and the tank's "
        "total capacitance rises — so the frequency <i>falls</i>. Voice down, frequency up. The audio "
        "has become frequency modulation, with zero additional parts. The simulation measures this "
        "directly: <b>1.2&nbsp;kHz of frequency shift per millivolt of audio</b> on the base (test&nbsp;4 of "
        "sim_fm.mjs), which means the preamp's tens of millivolts produce tens of kilohertz of "
        "deviation — exactly broadcast-shaped.")
    figure(story, f"{D}/tx-startup.png",
           "Proof of life: from a 1&nbsp;mV seed to a 4.6&nbsp;V carrier in under 300&nbsp;ns (simulation, test 1).")
    figure(story, f"{D}/tx-fm.png",
           "Proof of modulation: the carrier's instantaneous frequency tracks the audio tone at ±75&nbsp;kHz "
           "deviation, with both halves of the run agreeing in phase (simulation, test 5).")

    h2(story, "3.4 · Into the air")
    body(story, "A 3.3&nbsp;pF capacitor couples the tank to a 30-75&nbsp;cm wire — deliberately loose coupling. "
        "At 100&nbsp;MHz, λ/4 is 75&nbsp;cm, so the wire is a genuine quarter-wave monopole; but the coupling "
        "is kept feather-light so the antenna's presence doesn't drag the oscillator's frequency "
        "around. Change the antenna length and you will need to retune — that's physics, not a flaw. "
        "Power comes from the 9&nbsp;V rail through the coil; the whole transmitter sips ~7&nbsp;mA, so a "
        "square battery lasts about three days of continuous broadcasting.")

    h2(story, "3.5 · The TUNE knob")
    body(story, "TRIM1, the 5-30&nbsp;pF trimmer across the tank, is the transmitter's tuning knob. The "
        "simulation sweeps it: 5&nbsp;pF parks the carrier at ~116&nbsp;MHz, 30&nbsp;pF pulls it down to ~89&nbsp;MHz — "
        "the entire FM band and then some, from one knob (test&nbsp;3). Fine channel-spacing is done the "
        "FM-bug way: nudge the coil's turn spacing (squeezing the turns raises inductance and lowers "
        "the frequency; spreading them raises it), then touch in with the trimmer.")


def ch4(story):
    h1(story, "4 · The receiver: an oscillator that listens")

    figure(story, f"{D}/rx-chain.png",
           "FM-RX as a chain of jobs. The detector is the transmitter's own oscillator core; the astable strangles it.")

    h2(story, "4.1 · The big idea: gain in time")
    body(story, "Here is the strangest and most wonderful circuit in this project. The receiver's detector, "
        "Q1, is <b>literally the transmitter's oscillator</b> — the same common-base Colpitts, the same "
        "coil, the same trimmer, the same 22&nbsp;pF/47&nbsp;pF feedback divider, the same 15k/3.9k base "
        "divider. Open transmitter/index.tsx and receiver/index.tsx side by side and compare the RF "
        "core line by line. They are the same circuit.")
    body(story, "The difference is that the receiver's copy is never allowed to run continuously. A "
        "second circuit — the <b>quench oscillator</b> — strangles it about 50,000 times every second. "
        "Between strangulations, the oscillator is biased <i>just below</i> the point where it can "
        "sustain oscillation. Then the quench ramps the bias up through that threshold, and the "
        "oscillation has to grow from whatever seed happens to be sloshing in the tank: the faint "
        "ring-down of the previous burst, thermal noise, or — if a station is present — the incoming "
        "carrier itself. The oscillation grows exponentially, and in a microsecond a few microvolts "
        "become a couple of volts. <b>That is the gain: not amplified in a device, but multiplied in "
        "time.</b> A single transistor delivering what would otherwise take an amplifier chain.")
    figure(story, f"{D}/quench-concept.png",
           "One quench period. The astable's ramp sweeps the detector's bias through the oscillation "
           "threshold; the burst that ignites is seeded by noise or by a station.")

    h2(story, "4.2 · The quench cycle, step by step")
    body(story, "The quench oscillator is Q2+Q3, a textbook <b>astable multivibrator</b> — two transistors, "
        "each turning the other off in turn, running at 1/(0.693·(R9·C8+R8·C7)) ≈ 50&nbsp;kHz. Its "
        "output (Q2's collector) is a beautiful natural shape: a snap down to 0.2&nbsp;V, a long flat "
        "low, then an exponential rise with a 4.7&nbsp;µs time constant — precisely the &ldquo;smooth ramp, "
        "sharp drop&rdquo; waveform the super-regeneration literature prescribes. It feeds Q1's base "
        "through a 4.7&nbsp;kΩ/1&nbsp;kΩ divider, so the base toggles between 0.42&nbsp;V (dead — cut off hard) "
        "and ~1.6&nbsp;V (alive — oscillating).")
    bullets(story, [
        "<b>KILL (12.5&nbsp;µs):</b> the astable saturates low, the detector's base is pulled to 0.42&nbsp;V, "
        "the transistor is cut off. The burst dies; the tank rings down into thermal noise.",
        "<b>SETTLE:</b> quiet. Whatever is on the antenna keeps exciting the tank — a few µV of "
        "noise, or a distant station's carrier.",
        "<b>RAMP (7.6&nbsp;µs):</b> the astable's collector rises exponentially; the detector's base "
        "sweeps up through the oscillation threshold (~1.3&nbsp;V). The loop gain crosses 1 and a "
        "burst ignites, seeded by whatever the tank holds.",
        "<b>BURST (~1-2&nbsp;µs):</b> the oscillation grows to ~2&nbsp;V. Its envelope remembers the size "
        "of its seed — the exponential preserves relative differences.",
    ])
    figure(story, f"{D}/rx-quench.png",
           "Two full quench cycles from the simulation: tank bursts on top, astable gate and "
           "detector emitter underneath (test 7). One burst per cycle, every cycle — deterministic.")

    h2(story, "4.3 · The silence is the signal")
    body(story, "Power up the finished receiver with no transmitter running and you hear a loud, angry "
        "<b>HISS</b>. That is the sound of the detector amplifying its own thermal noise: every burst "
        "starts from a random seed, so every burst is different. Now key the transmitter. The moment "
        "a carrier lands inside the receiver's passband, the carrier — far stronger than the noise — "
        "seeds <i>every</i> burst, and the burst pattern snaps into a steadier, stronger, more regular "
        "train. The hiss collapses. That collapse is called <b>quieting</b>, and the thump you hear "
        "while tuning past a station is the most direct, audible proof of radio-wave capture there "
        "is. The simulation demonstrates it directly: with a carrier present, the burst envelope "
        "jumps 24&nbsp;mV and its cycle-to-cycle jitter drops by two thirds (test&nbsp;9).")
    figure(story, f"{D}/rx-quieting.png",
           "Quieting, simulated. Top: noise-seeded bursts (the hiss). Bottom: a carrier captured — "
           "steadier and stronger bursts (test 9).")

    h2(story, "4.4 · Hearing FM: slope detection")
    body(story, "The super-regen is, at heart, an AM detector — it measures the <i>size</i> of whatever "
        "excites its tank. To hear an FM station you exploit the tank's resonance curve: park the "
        "station on the <b>slope</b> of that curve — slightly off the receiver's own resonance — and the "
        "station's frequency wobble translates into an amplitude wobble, which the bursts then "
        " faithfully carry. Tune high or tune low; both sides work, and they deliver upside-down "
        "versions of the audio (a fun demonstration). The end-to-end proof: a broadcast-grade FM "
        "signal, ±75&nbsp;kHz deviation on a 3&nbsp;kHz tone, injected at the strength of a transmitter a "
        "few metres away — recovered cleanly at 21× the noise floor (test&nbsp;10, the money test).")
    figure(story, f"{D}/rx-fm.png",
           "The money test: an FM signal on the slope of the tank, before and after the receiver's "
           "audio filter. The tone is there, end to end (test 10).")

    h2(story, "4.5 · Why external quench? A design lesson in transistor honesty")
    body(story, "Armstrong's original super-regens (1922) were <b>self-quenched</b>: the tube's own "
        "rectified grid current slowly strangled the oscillation, which then recovered, in a natural "
        "relaxation cycle. You will see one-transistor self-quenched BJT super-regen schematics all "
        "over the internet. We simulated that idea exhaustively while designing this board, and the "
        "physics refuses to cooperate, for two reasons worth knowing. First, the sign is wrong: a "
        "transistor's rectified <i>base</i> current pushes the base voltage <b>up</b> — the opposite of "
        "the tube's grid-leak — which <i>helps</i> the oscillation instead of killing it. Second, an "
        "emitter-side quench capacitor (the other folklore option) would need to be nanofarads to "
        "work at quench rates, and any nanofarad cap is a dead short at 98&nbsp;MHz — right across the "
        "47&nbsp;pF feedback divider leg that the Colpitts needs to live. So the factory answer, used "
        "by every production super-regen since the 1940s: a <i>separate</i> oscillator does the "
        "strangling, deterministically, at a frequency you choose. Two transistors, guaranteed "
        "behaviour, and a quench rate you can tune with one capacitor. Engineering is knowing which "
        "traditions to keep.")


def ch5(story):
    h1(story, "5 · Proven, not hoped: how this design was verified")

    body(story, "A design that has not been tested is a rumour. This one went through three gates before "
        "a single PCB trace was drawn, and each gate caught something real. The full suite is in the "
        "repository: run <b>npm run math</b>, <b>npm run sim</b>, and <b>npm run verify</b> yourself — "
        "every claim below re-runs on your machine in a few minutes.")

    h2(story, "5.1 · Gate one: the arithmetic")
    body(story, "calc/circuit_math.mjs recomputes every design equation from Ohm's law onward and asserts "
        "the result lands in the sane region — 37 checks, all passing. The bias points of all six "
        "transistors, both tanks' tuning ranges, the quench rate and duty, the audio filter's "
        "corners, the battery budgets (three days for the transmitter, two for the receiver), and "
        "the tuning overlap between the two boards — which is how we know the transmitter can never "
        "hide from the receiver: their tuning windows share 23&nbsp;MHz of common ground.")

    h2(story, "5.2 · Gate two: the physics — and the two bugs the simulation caught")
    body(story, "calc/sim_fm.mjs integrates the actual nonlinear differential equations of the oscillator: "
        "an Ebers-Moll transistor with <i>voltage-dependent</i> junction capacitances (because that "
        "voltage dependence IS the FM mechanism), the full 3-node capacitance matrix, the real bias "
        "networks, and the quench waveform — at two-picosecond steps. It runs 21 assertions. Two of "
        "its findings shaped the design materially:")
    bullets(story, [
        "<b>The honest transistor.</b> Early runs assumed the transistor could pass 92% of its emitter "
        "current to the collector at 98&nbsp;MHz. For a 2N2222A with f<sub>T</sub>≈200&nbsp;MHz at these currents, "
        "the honest number is 67% (β at 98&nbsp;MHz is only about 2!). With the honest α the loop gain "
        "drops 27% — the feedback divider had to be re-margined so the oscillator still starts "
        "reliably. A folklore design would simply not have oscillated on some builds.",
        "<b>The phase-wrap trap.</b> A modulation test compares the first and second half of a run "
        "for agreement. It initially failed, showing a &ldquo;348°&rdquo; phase disagreement — which turned out "
        "to be −176° and +172°, i.e. the <i>same</i> phase, wrapped across the ±180° seam. The circuit "
        "was perfect; the test was wrong. Verifying the verifier is a real engineering activity.",
    ])
    body(story, "The suite's headline results: the transmitter starts from noise and reaches a 4.6&nbsp;V "
        "carrier (test&nbsp;1); its frequency tracks the audio with ±75&nbsp;kHz deviation and matching phase "
        "in both halves of a 2&nbsp;ms run (test&nbsp;5); the receiver bursts exactly once per quench cycle, "
        "every cycle (test&nbsp;7); a carrier measurably captures the burst pattern (test&nbsp;9); and a "
        "broadcast-grade FM signal is recovered end-to-end at 21× the noise floor (test&nbsp;10).")

    h2(story, "5.3 · Gate three: the boards")
    body(story, "verify.mjs compiles both boards headlessly, renders them through the real tscircuit "
        "engine, and audits the result: every expected component present, every expected net present, "
        "all 155 ports wired (zero dangling), all 121 PCB traces routed, zero DRC errors — and a "
        "programmatic courtyard-overlap checker (layout_check.py) ran the placement clean before the "
        "expensive checks. The renders you saw in Chapter&nbsp;1 come from the same pipeline.")

    callout_row(story, [
        ("37 / 37", "design equations checked"),
        ("21 / 21", "simulation proofs passed"),
        ("0", "DRC errors on both boards"),
    ])
