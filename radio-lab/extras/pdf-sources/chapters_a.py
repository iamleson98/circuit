#!/usr/bin/env python3
"""chapters_a.py&nbsp;— Radio Lab tutorial, chapters 1-5."""

from tut_lib import (S, h1, h2, h3, body, bullets, code, callout, callout_row,
                     figure, make_table, Paragraph, Spacer, ACCENT, ACCENT_2)
D = "/home/z/my-project/scripts/radio_pdf/diagrams"
W = "/home/z/my-project/work/radio-lab"


def ch1(story):
    h1(story, "1 · What you are building")

    body(story, "Radio Lab is a pair of small circuit boards: an <b>AM transmitter</b> that turns your "
        "voice into a radio signal, and an <b>AM receiver</b> that plucks that signal back out of the "
        "air. The transmitter has a microphone, four transistors, a coil, and a tuning knob. The "
        "receiver has a wire antenna, three transistors, a germanium diode, an audio amplifier chip, "
        "a volume knob, and its own tuning knob. Both run for days on ordinary 9&nbsp;V batteries. "
        "Everything is through-hole, everything sits on a 0.1&nbsp;inch grid, and every part is the "
        "kind you can buy from any hobby electronics shop for pocket change.")

    body(story, "The point of the pair is the ritual at the heart of real radio. You speak into the "
        "transmitter, turn its TUNE knob to pick a quiet spot on the medium-wave band, and then walk "
        "the receiver's knob slowly across the dial until&nbsp;— through a wall of static&nbsp;— your own voice "
        "suddenly appears in the speaker. That moment, when a signal you created with your own hands "
        "crosses the room as an electromagnetic wave, is what this project is really about. Everything "
        "in this document exists to make that moment inevitable rather than lucky.")

    callout_row(story, [
        ("AM-TX", "transmitter · 36 parts · 91×56 mm"),
        ("AM-RX", "receiver · 40 parts · 99×61 mm"),
        ("633-836 kHz", "the transmitter's tuning range"),
    ])

    h2(story, "1.1 · Both boards, at a glance")
    body(story, "The two renders below are generated straight from the design source. The "
        "transmitter reads left to right like its schematic: power and microphone at the left, audio "
        "preamp and modulator in the middle, the oscillator and its tank coil on the right, and the "
        "antenna wire pad at the far right edge. The receiver follows the same discipline: antenna "
        "and tank at the left, the two radio-frequency transistor stages in the middle, and the "
        "detector, volume control, and LM386 audio amplifier filling the right half. Every placement "
        "sits on the 2.54&nbsp;mm perfboard grid, so if you do not want to order circuit boards, you "
        "can copy these layouts hole-for-hole on perfboard.")
    figure(story, f"{W}/render-tx-pcb.png",
           "Figure 1-1&nbsp;— The AM-TX transmitter board (tscircuit PCB render). Bottom-layer ground pour not shown.",
           max_h=280)
    figure(story, f"{W}/render-rx-pcb.png",
           "Figure 1-2&nbsp;— The AM-RX receiver board. Note the big tuning capacitors (CV1) and the volume "
           "potentiometer pads, both meant to be wired to panel-mount parts.",
           max_h=280)

    h2(story, "1.2 · How to use this document")
    body(story, "Chapters 2 and 3 teach the three ideas the whole project hangs on: what an AM signal "
        "is, and why a coil-plus-capacitor <i>tank circuit</i> is the device that both creates and "
        "selects radio signals. Chapters 4 and 6 walk every stage of the transmitter and receiver "
        "with the real component values and the arithmetic that chose them. Chapter 5 is the part "
        "most tutorials skip: we prove the oscillator works by numerically integrating its "
        "differential equations, and we show you the two design flaws that the simulation caught "
        "before they could become a dead board on your desk. Chapters 7 through 11 are the practical "
        "half: the shopping list, the build, the bring-up ritual, twelve experiments, a fault-finding "
        "guide, and the legal picture.")
    body(story, "You do not need any radio background. You should be comfortable identifying resistor "
        "color codes, and ideally you have soldered a handful of kits before. Wherever a step has a "
        "common failure mode, it is called out in a box like the design notes you will meet along "
        "the way.")


def ch2(story):
    h1(story, "2 · How radio actually works")

    body(story, "A radio wave is what happens when a changing electric current launches a ripple of "
        "electric and magnetic fields that then travels on its own, at the speed of light, without "
        "needing any wire to carry it. Accelerate electrons in a wire&nbsp;— that is, drive an alternating "
        "current into it&nbsp;— and a small fraction of the energy you pour in never comes back down the "
        "wire: it leaves as radiation. A receiving antenna is just the same process in reverse. The "
        "passing wave pushes electrons in it back and forth, and that tiny induced current is the "
        "raw material every receiver ever built has to work with.")

    h2(story, "2.1 · Wavelength, frequency, and why we chose the AM band")
    body(story, "Frequency and wavelength are two views of the same thing: multiply them and you get "
        "the speed of light. At the frequencies this project uses&nbsp;— around 700&nbsp;kilohertz&nbsp;— one "
        "wave cycle stretches about 400&nbsp;meters from crest to crest. That single fact shapes "
        "everything practical about the design. A transmitting antenna works best when it is a "
        "quarter of the wavelength long; at 400&nbsp;m that would be a 100&nbsp;m tower. Our "
        "1-2&nbsp;metre wire is, by radio standards, almost nothing&nbsp;— an <i>electrically short</i> "
        "antenna that behaves mostly like a small capacitor. It radiates only a whisper of the "
        "transmitter's power, which is exactly what we want: enough to cross a room, little enough "
        "to stay legal and polite.")
    body(story, "The medium-wave AM band (roughly 530 to 1700&nbsp;kHz worldwide) is the perfect "
        "classroom. The wavelengths are long enough that circuits are forgiving&nbsp;— a hand-wound coil "
        "or a cheap choke works fine, and component tolerances barely matter&nbsp;— yet the band is alive "
        "with real broadcast stations you can hunt with the receiver. In Vietnam the national and "
        "provincial AM services sit between roughly 540 and 750&nbsp;kHz (VOV1 on 630 and 675&nbsp;kHz "
        "in most provinces, VOV2 nearby), which is why the transmitter's tuning range, "
        "633-836&nbsp;kHz, deliberately brackets them: you will be able to hear the real thing and "
        "your own signal on the same dial.")

    h2(story, "2.2 · Amplitude modulation&nbsp;— the oldest trick that still works")
    body(story, "A pure carrier wave carries no information; it is just a monotone hum. To send a "
        "voice, we let the voice control the carrier's <i>amplitude</i>&nbsp;— the size of its swings&nbsp;— "
        "while leaving its frequency alone. That is amplitude modulation, AM, the method of the "
        "first broadcast era and still the easiest to understand, transmit, and receive. The "
        "transmitter multiplies a fast wave by a slow one; the receiver, incredibly, only needs a "
        "diode and a capacitor to undo it, as chapter 6 will show.")
    figure(story, f"{D}/am-concept.png",
           "Figure 2-1 · Amplitude modulation. The message (top) rides on the carrier's envelope "
           "(bottom). The dashed curves trace that envelope&nbsp;— the receiver's whole job is to recover them.",
           max_h=300)
    body(story, "The depth of modulation, <i>m</i>, says how hard the voice pushes: m&nbsp;=&nbsp;0 "
        "is a dead-level carrier, m&nbsp;=&nbsp;1 means the envelope briefly touches zero on voice "
        "peaks, and pushing past 1 is <i>overmodulation</i>&nbsp;— the carrier momentarily vanishes, and "
        "the recovered audio crackles nastily. Our transmitter reaches m&nbsp;≈&nbsp;0.2-0.35 in "
        "simulation with normal speech, and can be pushed into deliberate overmodulation by shouting "
        "— which is one of the experiments in chapter 9, not a defect.")
    callout(story, "m ≈ 0.23",
            "modulation depth measured on the simulated final stage&nbsp;— comfortable listening range, "
            "shouting pushes it toward 1 for the overmodulation demo")

    h2(story, "2.3 · Near field vs far field, or why a room and not a city")
    body(story, "Within about a tenth of a wavelength&nbsp;— here, the first 30-40&nbsp;metres&nbsp;— the "
        "energy around a short antenna has not fully detached into a travelling wave yet. In this "
        "<i>near field</i>, coupling between two short wires falls off roughly with the square of "
        "distance, which is brutally fast. That is the physics behind the project's honest "
        "expectation: across a room, the receiver hears you loudly; a few rooms away, faintly; "
        "across town, never. Real broadcast stations solve this with kilowatts and hundred-metre "
        "towers. You get a house-sized bubble of radio, which is precisely the right size for "
        "learning in&nbsp;— and, not coincidentally, the size that unlicensed low-power rules around the "
        "world are written for (chapter 11).")


def ch3(story):
    h1(story, "3 · The LC tank&nbsp;— the heart of tuning")

    body(story, "Take a coil of wire (an inductor, L) and a capacitor (C), connect them in parallel, "
        "and you have built the most important circuit in radio. Charge the capacitor and it dumps "
        "its energy into the coil, building a magnetic field; the field then collapses and pushes the "
        "energy back into the capacitor. Left alone, this seesaw rings at one precise frequency, "
        "f&nbsp;=&nbsp;1/(2π√(LC)), the way a bell rings at one note. Feed the tank a mixture of many "
        "frequencies and it answers with a large voltage only at its own note&nbsp;— every other "
        "frequency is conducted harmlessly to ground. One circuit, two careers: in the transmitter "
        "it <i>creates</i> the carrier; in the receiver it <i>selects</i> the station.")

    figure(story, f"{D}/lc-tank.png",
           "Figure 3-1 · Left: the tank's impedance peaks at its resonant frequency&nbsp;— turning the TUNE "
           "capacitor slides that peak across the band. Right: what that means in practice&nbsp;— of all the "
           "stations the antenna hears, only the one under the peak survives.",
           max_h=230)

    h2(story, "3.1 · The tuning knob is the lesson")
    body(story, "The tuning capacitor CV1 in both boards is a <i>polyvaricon</i>&nbsp;— the little "
        "plastic-dielectric variable capacitor found in every pocket AM radio, two metal combs "
        "meshing as you turn the shaft, 10 to 280&nbsp;pF. Because f depends on the square root of "
        "C, that 28:1 capacitance swing becomes roughly a 1.5:1 frequency swing on the transmitter "
        "(633 to 836&nbsp;kHz) and wider on the receiver. Turn the knob and you literally watch the "
        "station you have selected rise and fall in the noise&nbsp;— resonance as a physical, audible "
        "experience. When someone asks you what the tuning knob on a radio does, after this project "
        "you will be able to say: it slides a bell's note across the whole band until the note "
        "matches the station.")

    h2(story, "3.2 · Q and bandwidth&nbsp;— how sharp the bell is")
    body(story, "The quality factor Q measures how many times the energy circulates before being "
        "lost, and it sets the width of the peak: bandwidth&nbsp;=&nbsp;f/Q. Our receiver's tank "
        "idles near Q&nbsp;≈&nbsp;50, giving about 15&nbsp;kHz of bandwidth around a 750&nbsp;kHz "
        "carrier&nbsp;— comfortably wide enough to carry the 5&nbsp;kHz of audio an AM station uses, and "
        "narrow enough to reject the neighbouring channel 9&nbsp;kHz away. Everything the design "
        "does around the tank&nbsp;— the light 47&nbsp;pF antenna coupling, the 1&nbsp;MΩ/470&nbsp;kΩ bias "
        "pair, the buffer transistor that follows&nbsp;— is in service of not loading it, because every "
        "bit of load widens the bell and lets neighbours bleed in. You can hear this directly: "
        "experiment 9 in chapter 9 has you load the tank on purpose and listen to the selectivity "
        "collapse.")

    make_table(story,
        ["Quantity", "Transmitter tank", "Receiver tank"],
        [
            ["Coil L1", "100 µH radial choke", "220 µH radial choke"],
            ["Capacitance", "340 pF fixed + CV1 (10-280 pF)", "CV1 (10-280 pF) + strays"],
            ["Frequency range", "633 - 836 kHz (ideal)", "≈ 614 kHz - 1.8 MHz"],
            ["Role", "creates the carrier", "selects the station"],
            ["Loaded by", "feedback pair + final stage", "antenna tap + buffer (kept light)"],
        ],
        [0.30, 0.35, 0.35],
        "Table 3-1 · The same idea, used twice. The transmitter's 340 pF fixed component is the "
        "series pair of the two 680 pF feedback capacitors&nbsp;— see chapter 4.",
        align_center_cols=[1, 2])

    callout(story, "f = 1/(2π√(LC))",
            "the one formula this whole project turns on&nbsp;— the bell's note")


def ch4(story):
    h1(story, "4 · The transmitter, stage by stage")

    body(story, "The transmitter is four transistors arranged like a miniature broadcast station. "
        "Q1 makes the microphone's whisper loud. Q2 turns that audio into a power supply that "
        "wobbles with your voice. Q3 rings a tank circuit to make a clean, steady carrier&nbsp;— the "
        "station's frequency, set by the TUNE knob. Q4 is the final amplifier, driven hard enough "
        "that its output can only slam between ground and the wobbly supply, which stamps the voice "
        "onto the carrier as amplitude modulation. This chapter walks each stage with its real "
        "values and the arithmetic behind them.")

    figure(story, f"{D}/tx-chain.png",
           "Figure 4-1 · The transmitter as a chain of jobs. Blue is the signal path; the dashed red "
           "rail is the modulated supply&nbsp;— the trick that does the amplitude modulating.",
           max_h=250)

    h2(story, "4.1 · The microphone and its preamp (MIC1, Q1)")
    body(story, "An electret capsule is a tiny metal can with a permanently charged film and a "
        "built-in field-effect transistor that needs power. R2 (2.2&nbsp;kΩ) supplies that power "
        "from the 9&nbsp;V rail; the capsule's output pin then wiggles a few volts below the rail "
        "carrying your voice as perhaps 20&nbsp;mV of AC. C3 passes the AC to Q1's base and blocks "
        "the DC. Q1 is a textbook common-emitter amplifier: R3 and R4 hold its base at "
        "1.15&nbsp;V, R6 sets its current to about 0.8&nbsp;mA, and R5 is its load. Because C4 "
        "short-circuits R6 at audio frequencies, the stage's gain becomes R5/r<sub>e</sub> ≈ "
        "4.7&nbsp;kΩ/33&nbsp;Ω ≈ 140×. The 20&nbsp;mV voice becomes volts&nbsp;— enough to swing a power "
        "rail, which is exactly what the next stage needs.")
    make_table(story,
        ["Part", "Value", "Why"],
        [
            ["R2", "2.2 kΩ", "powers the electret's internal FET (~0.3 mA)"],
            ["C3", "1 µF film", "passes voice, blocks DC; film = no polarity"],
            ["R3/R4", "68 k / 10 k", "base at 1.15 V&nbsp;— mid-current bias point"],
            ["R5", "4.7 kΩ", "collector load; sets gain together with r_e"],
            ["R6 + C4", "560 Ω + 100 µF", "R6 sets 0.8 mA; C4 makes it invisible at audio → gain 140×"],
        ],
        [0.16, 0.20, 0.64],
        "Table 4-1 · The audio front end. V_C idles at 5.2 V&nbsp;— nearly mid-rail, with clean headroom "
        "in both directions for voice peaks.")

    h2(story, "4.2 · The modulator (Q2)&nbsp;— a power rail that sings")
    body(story, "Q2 is an emitter follower with one unusual habit: nobody uses its output as a "
        "<i>signal</i>. Its base is biased at 5.4&nbsp;V by R7/R8 and receives the audio from Q1 "
        "through C5; its emitter therefore sits a diode-drop below and <i>follows</i> the audio. "
        "Everything downstream drinks from that emitter&nbsp;— net.VMD, a supply rail that idles at "
        "4.7&nbsp;V and swings several volts with your voice. Emitter followers can supply current "
        "easily (the oscillator and final together draw about 1.6&nbsp;mA), so the rail stays stiff "
        "at radio frequencies while it sways at audio ones. Hold this picture: <b>the modulator is "
        "the power supply, and the power supply is the modulator.</b>")
    callout(story, "V_MD = 4.7 V ± audio",
            "idle level of the modulated rail&nbsp;— swings 3.2 to 6.2 V on speech peaks (deeper if you shout)")

    h2(story, "4.3 · The oscillator (Q3)&nbsp;— where the carrier is born")
    body(story, "Q3 is a common-base Colpitts oscillator, the circuit that has started more radio "
        "signals than any other. Its collector tank&nbsp;— L1 (100&nbsp;µH) in parallel with CV1 and the "
        "series pair C14/C15&nbsp;— rings at the frequency from chapter 3. The feedback path is the "
        "capacitive divider C14/C15 between collector and emitter: the emitter sits at their "
        "midpoint, so a measured slice of the collector's swing feeds back in phase. The amplifier "
        "then returns more energy each cycle than the tank loses, and the oscillation grows until "
        "the transistor's own base-emitter junction begins rectifying on peaks&nbsp;— a gentle, "
        "self-adjusting brake that pins the carrier at a steady ~1.3&nbsp;V amplitude. Designers "
        "call this self-limiting; it is why the carrier is stable without any regulation.")
    body(story, "Two details deserve their own paragraphs, because both are places where plausible "
        "designs quietly die. First, the coil: L1 hangs between the collector and the VMD rail, not "
        "ground. A coil is a short circuit at DC, so it doubles as the collector's power feed while "
        "behaving as a high impedance (about 470&nbsp;Ω at 750&nbsp;kHz) to the radio signal&nbsp;— feed "
        "and resonator in one part. Our first draft had the coil to ground with a resistor feeding "
        "the collector, which pins the collector at 0&nbsp;V and kills the stage instantly; the "
        "simulation caught it (chapter 5). Second, the base bypass C6 is deliberately small "
        "(2.2&nbsp;nF). It must be a short circuit at radio frequencies so the base sits still&nbsp;— "
        "but if it were the habitual 100&nbsp;nF, it would also short-circuit the audio-rate "
        "component of the bias, and the stage's operating point would wander with the voice. "
        "2.2&nbsp;nF is 45&nbsp;Ω at 750&nbsp;kHz and 36&nbsp;kΩ at 2&nbsp;kHz: stiff where it must "
        "be, transparent where it must be.")
    make_table(story,
        ["Part", "Value", "Why"],
        [
            ["L1", "100 µH", "tank coil AND collector feed in one part"],
            ["CV1", "10-280 pF", "the TUNE knob: 633-836 kHz"],
            ["C14/C15", "680 pF ×2", "feedback divider; series pair adds 340 pF to the tank"],
            ["R10/R11", "27 k / 10 k", "base bias at 1.27 V, hung from the wobbly rail&nbsp;— on purpose"],
            ["C6", "2.2 nF", "RF ground for the base, audio-transparent (see text)"],
            ["R12", "1 kΩ", "emitter current ≈ 0.6 mA → gm ≈ 22 mS"],
        ],
        [0.18, 0.20, 0.62],
        "Table 4-2 · The oscillator. Why 680 pF and not the textbook 220 pF pair? Chapter 5&nbsp;— the "
        "weak-feedback failure is the project's best story.")

    h2(story, "4.4 · The modulated final (Q4)&nbsp;— where AM happens")
    body(story, "Broadcast engineers call it high-level modulation: the final amplifier's output "
        "can never exceed its supply rail, so if you make the <i>rail</i> dance to the music, the "
        "<i>output</i> dances with it. Q4 is driven from the tank through C17, biased by R14/R15, "
        "and degenerated by R16&nbsp;— giving it a small-signal gain of 3.8×, deliberately more than "
        "enough that the 1.3&nbsp;V carrier drives it into full swing. Its collector therefore "
        "slams between about 0.3&nbsp;V and the VMD rail on every carrier cycle: a squared-up "
        "carrier whose height is the rail voltage. Voice up, rail up, carrier taller; voice down, "
        "rail down, carrier shorter. That is amplitude modulation, stamped on at the last possible "
        "instant, exactly as a 50&nbsp;kW transmitter does it&nbsp;— with a 2N3904 and a 9&nbsp;V "
        "battery instead.")
    body(story, "C16 then leaks a measured sliver of this signal into the antenna wire: at "
        "750&nbsp;kHz its 100&nbsp;pF is about 2&nbsp;kΩ of impedance, light enough that the "
        "antenna (itself barely 30&nbsp;pF of capacitance to the world) never loads the final "
        "enough to matter. The radiated power is microwatts. If you want more range, the honest "
        "route is a better antenna, not more power&nbsp;— and the honest antenna for 400&nbsp;m "
        "wavelengths is a longer wire, which is also the direction the law frowns on (chapter 11). "
        "Enjoy the room-sized bubble; it is the size learning comes in.")

    h2(story, "4.5 · Reading the schematic")
    body(story, "The full schematic below is rendered directly from the board source, and the "
        "source file is written to be read top to bottom the same way: every wire in the design "
        "exists as an explicit trace in <font face='DejaVuSans' size='9'>transmitter/index.tsx</font>, "
        "grouped under banner comments that mirror these sections. If you ever wonder what "
        "something connects to, the answer is one grep away&nbsp;— the netlist and the documentation "
        "cannot drift apart, because they are the same text.")
    figure(story, f"{W}/render-tx-schematic.png",
           "Figure 4-2 · The AM-TX schematic (tscircuit render). Signal flows left to right; "
           "net labels V9, VMD, TANK and GND mark the shared rails.",
           max_h=430)


def ch5(story):
    h1(story, "5 · Proving it before you build it")

    body(story, "Most electronics tutorials ask you to trust them. This chapter asks you to trust "
        "arithmetic. The repository ships two programs that check the design the way an engineer "
        "would: <font face='DejaVuSans' size='9'>calc/circuit_math.mjs</font> re-derives every bias "
        "point, gain, frequency and time constant from the component values and asserts 29 facts "
        "about them; <font face='DejaVuSans' size='9'>calc/sim_colpitts.mjs</font> goes further and "
        "numerically integrates the oscillator's differential equations&nbsp;— a real transistor model, "
        "the real bias network, Runge-Kutta at 2-nanosecond steps&nbsp;— and watches it wake up, tune, "
        "and modulate. Both exit non-zero if any assertion fails. Run them yourself: "
        "<font face='DejaVuSans' size='9'>npm run math</font> and <font face='DejaVuSans' "
        "size='9'>npm run sim</font>.")

    h2(story, "5.1 · The simulation story, in four pictures")
    body(story, "The first test seeds the tank with 1&nbsp;millivolt&nbsp;— thermal noise scale&nbsp;— and "
        "lets time run. In a healthy oscillator, loop gain above unity amplifies that seed "
        "exponentially until the self-limiting brake engages; that is precisely what figure 5-1 "
        "shows: from nothing to a full ~1.3&nbsp;V carrier in about two hundred microseconds. The "
        "second test measures the frequency by counting zero crossings and compares it with the "
        "textbook formula: within 2% across the whole band (figure 5-2). Turning CV1 through its "
        "range slides the carrier monotonically from 847 to 666&nbsp;kHz&nbsp;— the knob works, "
        "provably.")
    figure(story, f"{D}/sim-startup.png",
           "Figure 5-1 · Simulated start-up. A 1 mV seed grows into a full carrier&nbsp;— the definition "
           "of an oscillator that starts.", max_h=210)
    figure(story, f"{D}/sim-tuning.png",
           "Figure 5-2 · The TUNE sweep, measured in simulation vs the ideal formula. The small "
           "offset is the emitter's loading pulling the tank slightly&nbsp;— real physics, honestly "
           "reported.", max_h=210)

    body(story, "The remaining two pictures are the AM proof. Figure 5-3 shows the oscillator "
        "itself while its supply rail sings a 2&nbsp;kHz sine: the carrier never drops out and its "
        "envelope wobbles only mildly&nbsp;— a clean, steady carrier, which is what you want from an "
        "oscillator. Figure 5-4 shows the final amplifier's output under the same conditions: the "
        "envelope now visibly breathes with the rail, tracking it closely. The measured modulation "
        "depth, m&nbsp;≈&nbsp;0.23, matches the design arithmetic. The voice is on the air.")
    figure(story, f"{D}/sim-am-osc.png",
           "Figure 5-3 · The oscillator under a singing rail: alive, steady, mildly perturbed. "
           "Exactly the temperament a carrier should have.", max_h=210)
    figure(story, f"{D}/sim-am-final.png",
           "Figure 5-4 · The final stage's output: the envelope (red) chases V_MD (dashed)&nbsp;— "
           "amplitude modulation, demonstrated rather than promised.", max_h=215)

    h2(story, "5.2 · Two flaws the math caught before you did")
    body(story, "Both caught flaws are instructive enough to keep on display. The first was the "
        "coil-to-ground topology described in chapter 4&nbsp;— a wiring subtlety that renders the "
        "oscillator permanently saturated. No amount of bench debugging would have made it work; "
        "it was wrong on paper, and the simulation said so in milliseconds. Finding it cost one "
        "evening; finding it with a soldering iron would have cost the whole project.")
    body(story, "The second was the feedback divider. The textbook Colpitts drawing shows a "
        "symmetric capacitor pair, and 220&nbsp;pF/220&nbsp;pF looks perfectly reasonable at "
        "1&nbsp;MHz. But the start-up condition is not \"some feedback\"&nbsp;— it is that the "
        "transistor-and-divider network must present a negative resistance smaller in magnitude "
        "than the tank's losses. At 0.6&nbsp;mA the 220&nbsp;pF pair presents about −20&nbsp;kΩ "
        "against a ~20&nbsp;kΩ tank: ratio 1.0, and in practice, nothing. The 680&nbsp;pF pair "
        "presents about −2.3&nbsp;kΩ against 5.2&nbsp;kΩ of loaded tank loss&nbsp;— a 2.2× margin at "
        "mid-band, 1.6× even at the hardest corner. That is the difference between an oscillator "
        "and a decoration, and it is a difference you can now <i>compute</i>, not guess.")
    callout_row(story, [
        ("29 / 29", "design-math assertions passing"),
        ("7 / 7", "simulation tests passing"),
        ("0", "DRC errors on either board"),
    ])

    h2(story, "5.3 · The checks you can rerun anywhere")
    body(story, "Everything above is reproducible from the repository with three commands and no "
        "test equipment. This matters beyond diligence: it makes the tutorial falsifiable. If you "
        "change a component value&nbsp;— and chapter 9 will make you want to&nbsp;— rerun the math and the "
        "simulation and watch which assertions move from pass to fail. That feedback loop, "
        "values → equations → verdicts, is the actual skill this project teaches; the radio is "
        "just the excuse.")
    code(story,
"""$ cd circuit/radio-lab
$ npm run math        # 29 design-equation checks
  RESULT: 29 passed, 0 failed
$ npm run sim         # RK4 integration: start-up, tuning, AM
  RESULT: 7 passed, 0 failed
$ npm run verify      # board audit: parts, nets, traces, DRC
  RESULT: ALL CHECKS PASSED (both boards, zero errors)""",
         "the full proof suite, from a fresh clone")
