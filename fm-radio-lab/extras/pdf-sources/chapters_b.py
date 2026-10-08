#!/usr/bin/env python3
"""chapters_b.py — FM Radio Lab tutorial, chapters 6-10."""

from tut_lib import (S, h1, h2, h3, body, bullets, code, callout, callout_row,
                     figure, make_table, Paragraph, Spacer, ACCENT, ACCENT_2)
D = "/home/z/my-project/scripts/fm_pdf/diagrams"
W = "/home/z/my-project/work/repo-circuit/fm-radio-lab"


def ch6(story):
    h1(story, "6 · Build it")

    h2(story, "6.1 · Bill of materials")
    body(story, "Both boards together use about 75 through-hole parts, and none of them is exotic. The "
        "only part that needs winding is the coil — and it is the easiest coil in radio: three turns "
        "of wire on a drill shank. Quantities are per board where noted; order spares of the "
        "transistors and trimmers, they cost pennies.")

    make_table(story, ["Part", "Value / type", "TX", "RX", "Notes"],
        [
            ["NPN transistor", "2N2222A or BC548/547", "2", "4", "Q1 detector must be 2N2222A-class (fT ≥ 250 MHz). TO-92."],
            ["Electret capsule", "any 2-wire", "1", "—", "The flat round kind."],
            ["Air-core coil L1", "3 turns, ~60 nH", "1", "1", "0.5-0.6 mm enamelled wire, 5 mm form. Wind it yourself — §6.3."],
            ["Trimmer TRIM1", "5-30 pF", "1", "1", "Green/blue plastic trimmer, screw slot."],
            ["Resistors", "various", "15", "22", "1/4 W axials. Values in the netlists."],
            ["Capacitors", "ceramic + 2 electrolytic", "13", "15", "The pF ceramics matter: C3 3.3p, C5 47p, C6 22p."],
            ["Potentiometer RV1", "10 kΩ linear", "—", "1", "Panel-mount with knob."],
            ["Slide switch SW1", "SPST", "1", "1", "Any small switch."],
            ["Battery clip + 9V", "PP3", "1", "1", "Alkaline, not carbon-zinc."],
            ["Earphone", "crystal / high-Z", "—", "1", "32 Ω earbuds work, quieter."],
            ["Wire", "0.5-0.6 mm + hookup", "—", "—", "Coil winding + antenna + connections."],
        ], ratios=[0.22, 0.26, 0.07, 0.07, 0.38])

    h2(story, "6.2 · Perfboard or PCB?")
    body(story, "Both boards are designed as PCBs (the gerbers export cleanly), but at 100&nbsp;MHz a "
        "perfboard build is genuinely harder than it was in the AM lab: every centimetre of "
        "perfboard trace adds roughly 10&nbsp;nH of stray inductance and a few pF of stray capacitance "
        "to ground — comparable to the components themselves. A perfboard build <i>will</i> work if "
        "you follow VHF discipline: keep the tank area tight (coil right next to the transistor, "
        "trimmer right across the coil), keep every ground lead short and star them to one point, "
        "and expect to retune. A PCB from the gerbers is the recommended path — the ground pour "
        "alone is worth it.")

    h2(story, "6.3 · Wind the coil (five minutes)")
    body(story, "Take 15&nbsp;cm of 0.5-0.6&nbsp;mm enamelled or bare copper wire and a 5&nbsp;mm form — an M5 "
        "bolt or a 5&nbsp;mm drill shank. Wind three snug turns. Slide the coil off. Scrape or burn off "
        "the insulation at the ends and tin them. Stretch the coil gently to about 2.4&nbsp;mm overall "
        "length — roughly a fingernail's gap between turns. Wheeler's formula puts this at ~60&nbsp;nH, "
        "and the two boards use <b>identical coils</b>: the transmitter and the receiver share even "
        "this. (Spacing is a tuning tool: squeezing the turns together raises L and lowers the "
        "frequency; spreading them does the opposite.)")

    h2(story, "6.4 · Transistor orientation — read this twice")
    body(story, "TO-92 pinouts differ by family, and this project mixes them. The boards are laid out "
        "for <b>BC547/BC548 pinout (C-B-E, flat face as marked on the silkscreen)</b>. If you use "
        "2N2222A in TO-92 (E-B-C), insert it <b>rotated 180°</b> — the silkscreen on both boards says "
        "exactly this next to each transistor position. A reversed transistor will not be damaged "
        "at these currents, but the stage will be dead. Check each one before power-on.")

    h2(story, "6.5 · Bring-up, in order")
    bullets(story, [
        "<b>Transmitter first.</b> Connect a 30-75 cm antenna wire. Power on. Hold a normal FM radio "
        "nearby and slowly sweep the transmitter's TUNE trimmer with a plastic screwdriver (a metal "
        "one detunes the tank while you touch it). Somewhere across the dial the radio will go "
        "quiet — the captured-carrier thump — or, with the mic live, you will hear yourself. That is "
        "the transmitter proven.",
        "<b>Receiver second.</b> Power on with the volume LOW. You must hear the hiss — a healthy "
        "super-regen is noisy with no signal. No hiss: see the troubleshooting tree (§8).",
        "<b>The hunt.</b> With the transmitter keyed, sweep the receiver's TUNE slowly. Hiss → "
        "THUMP → your voice. If you find only the thump with distorted audio, you are dead-centre "
        "on the station: detune slightly to either side until the voice clears (that is slope "
        "detection — §4.4). One side sounds normal, the other side is your voice upside-down.",
        "<b>Fine range.</b> Walk away. A few metres across a room is normal for a stock build. More "
        "range needs a better antenna on the <i>receiver</i>, not more transmitter power — and the law "
        "caps the transmitter anyway (§2.3).",
    ])


def ch7(story):
    h1(story, "7 · Experiments that teach")

    h2(story, "7.1 · Measure the quench on your own build")
    body(story, "If you have any oscilloscope (even a cheap single-board one), put its probe on the "
        "astable's output — Q2's collector — and look at the 50&nbsp;kHz waveform: snap down, flat low, "
        "exponential rise. Now move the probe to the detector's tank and you will see the burst "
        "train riding on it, one burst per quench cycle, exactly as the simulation drew in "
        "Chapter&nbsp;4. Swap the timing capacitors C7/C8 (1&nbsp;nF each) for 2.2&nbsp;nF and the quench rate "
        "drops to ~22&nbsp;kHz; 470&nbsp;pF takes it to ~105&nbsp;kHz (the simulation's test&nbsp;8 predicts the "
        "0.693·R·C law — verify it on your bench). Below ~18&nbsp;kHz the quench starts to become "
        "audible as a whine; that is the super-regen telling you where the audio band starts.")

    h2(story, "7.2 · The slope, both sides")
    body(story, "Tune onto your station dead-centre: maximum quieting, distorted or silent audio. "
        "Detune slowly to one side: the audio appears, clearer and clearer until it fades into "
        "noise. Detune to the other side: the audio appears again, <i>inverted</i>. You have just "
        "walked your receiver's resonance curve across a constant-deviation FM signal — the same "
        "experiment that taught a generation of engineers what a discriminator does, performed with "
        "one knob. Draw the loudness-vs-detuning curve on paper and you have drawn the tank's "
        "selectivity skirt.")

    h2(story, "7.3 · Quiet the hiss with a real station")
    body(story, "In most cities you are already inside several real FM broadcast stations' coverage. "
        "Sweep the receiver's TUNE across the band slowly and listen for the quieting thumps. You "
        "will not hear clean music — a 2-transistor super-regen with slope detection is a 1950s "
        "technology, and broadcast FM is deliberately robust against it — but the quieting behaviour, "
        "the band geography (strong local stations thump harder), and the noise floor between them "
        "are all directly audible. This is what 1948 felt like.")

    h2(story, "7.4 · Antenna physics in one afternoon")
    body(story, "The transmitter's antenna is a quarter-wave monopole at 75&nbsp;cm. Try 20&nbsp;cm, 40&nbsp;cm, "
        "75&nbsp;cm, and 150&nbsp;cm at a fixed distance and record received volume at the receiver; then "
        "re-retune the transmitter each time and observe how the antenna loads the tank. You will "
        "find 75&nbsp;cm dramatically best, and you will have measured resonance with a two-transistor "
        "radio and a piece of wire.")


def ch8(story):
    h1(story, "8 · Troubleshooting")

    body(story, "Radio faults hide in layers: power, then bias, then the quench, then the RF. Work the "
        "tree top to bottom — and remember the golden rule of VHF debugging: <b>every probe touch "
        "detunes the circuit</b>. Touch, observe, release, think.")

    make_table(story, ["Symptom", "Likely cause", "Fix"],
        [
            ["TX: no capture anywhere on the dial",
             "Oscillator dead — transistor orientation, coil shorted turns, or stray-heavy build",
             "Check Q2's base ~1.85 V and emitter ~1.2 V; re-stretch the coil (more spacing = higher f); verify TO-92 orientation"],
            ["TX: capture only at the very edge of the band",
             "Coil inductance off (too tight/too loose)",
             "Squeeze or stretch the coil to centre the range, then touch up TRIM1"],
            ["TX: buzz/distortion on nearby radio",
             "Over-deviation — preamp gain too high",
             "Open the emitter-bypass jumper (soft mode); reduce input level"],
            ["RX: no hiss at all",
             "Detector not oscillating: orientation, bias, or a dead quench",
             "Check Q1 base ~1.6 V peak during ramp; check the astable is running (scope or a multimeter's Hz mode on Q2C)"],
            ["RX: hiss but nothing captures",
             "Tuning windows not overlapping, or TX not transmitting",
             "Verify TX first (§6.5); re-stretch the RX coil to shift its window up; sweep slowly"],
            ["RX: thump but no audio",
             "You are dead-centre on the station (maximum quieting, no slope)",
             "Detune to either side until audio appears (§4.4)"],
            ["RX: audio but weak",
             "Slope too shallow or earbuds too low-Z",
             "Try a crystal earphone; add the LM386 stage from the AM lab (§9.1)"],
            ["Both: works then drifts",
             "Hand capacitance / temperature — normal at 100 MHz",
             "Retune after closing the case; warm-up drift settles in minutes"],
        ], ratios=[0.28, 0.32, 0.40])


def ch9(story):
    h1(story, "9 · Where next")

    h2(story, "9.1 · Add a speaker")
    body(story, "The receiver's earphone output is mV-scale. For room-filling sound, add the LM386 "
        "stage from the AM Radio Lab receiver (its schematic is in that project's tutorial): about "
        "five extra parts, and the two labs officially merge. Feed it from the FM receiver's "
        "volume-control wiper exactly as the AM receiver does.")

    h2(story, "9.2 · Varactor tuning — the electronic TUNE knob")
    body(story, "The trimmer is a mechanical tuning knob. A <b>varactor diode</b> (a reverse-biased diode "
        "used as a voltage-dependent capacitor — the same physics as the transistor's junction cap, "
        "harnessed on purpose) in parallel with the tank, driven by a potentiometer, gives you "
        "push-button or even microcontroller tuning. It is the natural next build, and this "
        "project's simulation already contains the physics you need: the FM mechanism and varactor "
        "tuning are the same phenomenon, one accidental, one deliberate.")

    h2(story, "9.3 · The integrated way")
    body(story, "When you are ready to see how industry solved this, look up the TDA7088 (or its many "
        "clones) — a complete FM receiver in one chip: superheterodyne, PLL demodulation, station "
        "seek, all in a coin-sized package. Compare its block diagram with Chapter&nbsp;4 and you will "
        "recognize every problem it solves: the ones your super-regen dodged with 1940s cunning. "
        "Then look at SDR — and realise that everything you built here is now one of the first "
        "exercises in understanding what the software is actually doing.")


def ch10(story):
    h1(story, "10 · The numbers, in one place")

    body(story, "Every number below is derived and asserted by calc/circuit_math.mjs (37 checks) and "
        "measured again by calc/sim_fm.mjs (21 checks). If a build disagrees with this table, the "
        "build has a fault — not the table.")

    make_table(story, ["Quantity", "Value", "Where it comes from"],
        [
            ["Tank inductance L1", "≈ 60 nH", "Wheeler: 3 turns, 5 mm form, stretched to 2.4 mm"],
            ["Transmitter carrier (trim 15 pF)", "102 MHz", "Simulated (naive LC formula says 115 — junction caps count)"],
            ["Transmitter tuning window", "89-116 MHz", "Simulated sweep, trim 5→30 pF"],
            ["FM sensitivity", "1.2 kHz/mV", "Simulated: junction-cap FM on the base"],
            ["Deviation (mic path)", "±75 kHz", "Simulated test 5, broadcast-grade"],
            ["Receiver oscillation threshold", "V_B ≈ 1.3 V", "Sim-calibrated ignition point (test 6.5)"],
            ["Quench rate / duty", "49.7 kHz / 62% low", "Astable: T = 0.693(R9·C8 + R8·C7)"],
            ["Quench ramp time constant", "4.7 µs", "τ = R5·C7 — the smooth-ramp shape"],
            ["Burst envelope", "≈ 1.8-1.9 Vp", "Simulated test 7: grown from µV seeds"],
            ["Quieting (carrier in)", "Δenv 24 mV, jitter ÷3", "Simulated test 9"],
            ["FM detection SNR", "21×", "Simulated test 10: ±75 kHz dev on the slope"],
            ["Audio filter corners", "2 × 3.4 kHz", "R12·C9 = R13·C10; quench residue −47 dB"],
            ["TX current / battery life", "7 mA / ≈ 75 h", "Budget incl. LED; 550 mAh alkaline"],
            ["RX current / battery life", "8.2 mA / ≈ 67 h", "Budget incl. astable + amp + LED"],
            ["TX-RX tuning overlap", "23 MHz", "Both windows: 88-118 vs 86-112 MHz"],
        ], ratios=[0.34, 0.22, 0.44])

    h2(story, "10.1 · Source files, for the curious")
    bullets(story, [
        "<b>transmitter/index.tsx, receiver/index.tsx</b> — the boards, as React components. The RF "
        "cores are deliberately line-for-line identical; diff them.",
        "<b>calc/circuit_math.mjs</b> — all 37 design assertions, in plain arithmetic.",
        "<b>calc/sim_fm.mjs</b> — the 21-proof numerical laboratory, including the full quench "
        "simulation and the FM money test.",
        "<b>verify.mjs</b> — the headless board audit; <b>layout_check.py</b> — the placement checker.",
        "<b>standalone/</b> — each board as a single file for the tscircuit web editor, zero install.",
    ])
    body(story, "Clone the repository, run <b>npm install && npm run math && npm run sim && npm run "
        "verify</b>, and every claim in this document will re-prove itself on your machine. Then "
        "wind the coil, heat the iron, and go listen to the silence that is the signal.")
