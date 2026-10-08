#!/usr/bin/env python3
"""chapters_b.py&nbsp;— Radio Lab tutorial, chapters 6-11."""

from tut_lib import (S, h1, h2, h3, body, bullets, code, callout, callout_row,
                     figure, make_table, Paragraph, Spacer)
D = "/home/z/my-project/scripts/radio_pdf/diagrams"
W = "/home/z/my-project/work/radio-lab"


def ch6(story):
    h1(story, "6 · The receiver, stage by stage")

    body(story, "A receiver's job is a chain of rescues. The antenna hears every station at once, "
        "each buried in static; the tank rescues one of them; the buffer keeps the rescue intact; "
        "the amplifier makes it big enough to bite a diode; the diode unwraps the voice; the LM386 "
        "makes it loud. This design is a TRF&nbsp;— tuned radio frequency&nbsp;— receiver, the direct "
        "ancestor of every radio you have owned, stripped to parts you can hold in your head all "
        "at once.")

    figure(story, f"{D}/rx-chain.png",
           "Figure 6-1 · The receiver as a chain of rescues. Each stage exists because of one "
           "specific problem; when you troubleshoot, you test the rescues in this order.",
           max_h=250)

    h2(story, "6.1 · Antenna, tank, and the art of not loading")
    body(story, "The antenna is 1-2 metres of any insulated wire soldered to the ANT pad. At these "
        "wavelengths it is essentially a 30&nbsp;pF capacitor hanging in the air, and the antenna "
        "coupling capacitor C3 (47&nbsp;pF) deliberately connects it to the tank <i>loosely</i>: "
        "the tank keeps its high Q, and only a fraction of the picked-up signal is traded away. "
        "The tank itself is L1 (220&nbsp;µH) in parallel with CV1&nbsp;— the TUNE knob&nbsp;— covering "
        "roughly 614&nbsp;kHz to 1.8&nbsp;MHz: the whole medium-wave band plus margin, completely "
        "covering the transmitter's range with room to spare. What the tank does not select, it "
        "conducts to ground; the selected station's voltage appears across the coil.")
    body(story, "C4 then hands that voltage to Q1 while blocking the coil's DC path (a coil is a "
        "short at DC&nbsp;— without C4 the bias network below would be shorted to ground). The bias "
        "pair R2/R3 is enormous by amplifier standards&nbsp;— 1&nbsp;MΩ and 470&nbsp;kΩ&nbsp;— so that the "
        "tank keeps ringing as if almost nobody were listening. This is the chapter-3 lesson in "
        "component form: selectivity is Q, and Q is <i>freedom from load</i>.")

    h2(story, "6.2 · Buffer and amplifier (Q1, Q2)")
    body(story, "Q1 is an emitter follower: voltage gain slightly below one, but input impedance in "
        "the hundreds of kilohms and output impedance around 400&nbsp;Ω. It copies the tank's "
        "voltage without draining it&nbsp;— the polite listener that lets the bell keep ringing. Q2 "
        "then does the heavy lifting: a common-emitter stage biased at about 1&nbsp;mA by R5/R6/R7, "
        "with C6 making its emitter an AC ground so its gain is R8/r<sub>e</sub> ≈ 2.2&nbsp;kΩ/26&nbsp;Ω "
        "≈ 90×. A station arriving as 1&nbsp;mV of RF leaves as 90&nbsp;mV&nbsp;— enough that the next "
        "stage, a plain diode, can finally act like a switch instead of a soft shoulder.")
    make_table(story,
        ["Part", "Value", "Why"],
        [
            ["C3", "47 pF", "loose antenna coupling&nbsp;— keeps tank Q high"],
            ["L1 ∥ CV1", "220 µH + 10-280 pF", "the TUNE knob: ≈ 614 kHz - 1.8 MHz"],
            ["C4", "100 nF", "passes the selected RF, blocks the coil's DC short"],
            ["R2/R3", "1 M / 470 k", "bias so light the tank barely notices"],
            ["R4", "2.2 kΩ", "Q1's emitter load → ~1 mA follower current"],
            ["R8", "2.2 kΩ", "Q2's collector load&nbsp;— the 90× comes from R8/r_e"],
        ],
        [0.18, 0.24, 0.58],
        "Table 6-1 · The radio-frequency front end. Values chosen so every bias lands mid-range, "
        "verified by the 29-check math suite.")

    h2(story, "6.3 · The detector (D1)&nbsp;— where radio becomes audio")
    body(story, "Here is the moment the whole project aims at. C7 couples Q2's amplified RF into "
        "D1, a 1N34A germanium diode, and D1 only passes the positive half of every carrier cycle. "
        "C8, across the volume control, then fills in the gaps between cycles. What remains across "
        "the volume pot is the carrier's <i>envelope</i>&nbsp;— and the envelope, chapter 2 told us, is "
        "the voice. The component values are a compromise you can hear: C8 and the 10&nbsp;kΩ pot "
        "set a 47&nbsp;µs time constant, fast enough to follow a 3&nbsp;kHz voice crest, slow "
        "enough to bridge the 1.3&nbsp;µs gaps between 750&nbsp;kHz carrier peaks. Make C8 much "
        "bigger and high voices blur; much smaller and the carrier's own ripple leaks through as a "
        "whine. Experiment 10 lets you try both wrong values on purpose.")
    body(story, "Germanium is used because its forward drop (~0.2-0.3&nbsp;V) is gentler than "
        "silicon's 0.6&nbsp;V&nbsp;— with millivolt-to-sub-volt signals, every tenth of a volt of "
        "threshold is sensitivity you keep. A Schottky diode (1N5711) makes an excellent modern "
        "substitute; a common 1N4148 works but is deaf to weak stations. C7's DC-blocking role "
        "matters too: it lets the detector output rest at zero volts with no signal, which is what "
        "lets the signal LED below behave as an honest strength meter instead of an always-on "
        "lamp.")

    h2(story, "6.4 · Volume, the signal LED, and the LM386")
    body(story, "The volume control is the detector's load itself&nbsp;— a 10&nbsp;kΩ potentiometer "
        "wired as a variable resistor to ground, its wiper picking off a slice of the recovered "
        "audio. That slice rides C9 into the LM386, the industry's friendliest audio amplifier "
        "chip: eight pins, gain 20 as wired, or 200 when SW2 straps a 10&nbsp;µF capacitor across "
        "its gain pins. A 220&nbsp;µF output capacitor couples it to the 8&nbsp;Ω speaker, and the "
        "10&nbsp;Ω + 47&nbsp;nF Zobel network keeps the chip stable into a real loudspeaker&nbsp;— the "
        "LM386's one known vice. At 9&nbsp;V the chip will happily produce half a watt; the "
        "GAIN&nbsp;20/200 switch exists because a strong local transmitter needs 20× while a "
        "faint real broadcast station wants all 200×.")
    body(story, "The signal LED is the receiver's party trick. Q3 watches the detector's DC level "
        "through R9; when a strong carrier is tuned in, the detector's output climbs past a volt, "
        "Q3 turns on, and LED2 glows. Now finding the transmitter is a game with a scoreboard: "
        "turn the TUNE knob slowly and watch the light snap on as you cross the station. It is "
        "also a genuine signal-strength meter of the kind ham radio operators call an S-meter&nbsp;— "
        "the same idea, one LED wide.")

    figure(story, f"{W}/render-rx-schematic.png",
           "Figure 6-2 · The AM-RX schematic (tscircuit render). Antenna at far left; the detector "
           "diode and LM386 occupy the right half.",
           max_h=430)

    h2(story, "6.5 · Why not something fancier?")
    body(story, "You may know that real radios use the superheterodyne architecture&nbsp;— oscillators "
        "and mixers converting everything to a fixed intermediate frequency&nbsp;— and wonder why this "
        "design does not. The honest answer: a TRF is the shortest path from antenna to "
        "understanding. Its selectivity lives in one tuned circuit you can point at; its detector "
        "is one diode you can put a voltmeter on; every signal transformation is visible. The "
        "superheterodyne solves problems (mainly: how to get many stations through one sharply "
        "tuned amplifier) that a learning radio does not have. Chapter 11 points you at the next "
        "steps when you are ready to trade clarity for performance.")


def ch7(story):
    h1(story, "7 · Building the pair")

    h2(story, "7.1 · The shopping list")
    body(story, "Every part is through-hole and generic; substitutes are called out where they "
        "matter. The two boards share most line items, and a single dual-gang polyvaricon can even "
        "be cannibalised to tune both (use one gang per board). Total cost for both boards is "
        "typically $10-20 depending on how stocked your parts drawer already is.")

    make_table(story,
        ["Semiconductors", "Qty", "Notes / substitutes"],
        [
            ["BC547B (TO-92)", "7", "primary transistor; 2N3904 works if inserted rotated (see 7.3)"],
            ["1N34A germanium diode", "1", "the detector; 1N5711 Schottky or OA91 fine; 1N4148 deaf-but-works"],
            ["LM386N (DIP-8)", "1", "audio power amp, any suffix"],
            ["LED 5 mm, green", "2", "power indicators"],
            ["LED 5 mm, yellow", "1", "the receiver's signal LED"],
        ],
        [0.40, 0.10, 0.50], "Table 7-1 · Semiconductors.", align_center_cols=[1])

    make_table(story,
        ["Passives & electromechanical", "Qty", "Notes"],
        [
            ["Resistors 1/4 W", "~25", "see value lists below&nbsp;— all 5% or better is fine"],
            ["Ceramic caps", "~20", "220p, 47p, 1n, 2.2n, 47n, 100n, 4.7n values used"],
            ["Electrolytic caps", "5", "10µF ×2, 100µF ×3 (16 V or 25 V)"],
            ["Film/MLCC 1 µF", "3", "2.54 mm pitch; electrolytic also OK if + faces the mic"],
            ["Radial chokes", "2", "100 µH (TX) and 220 µH (RX), 5 mm pitch"],
            ["Polyvaricon 10-280 pF", "2", "or one dual-gang; any AM tuning cap 10-300 pF works"],
            ["Potentiometer 10 kΩ lin", "1", "panel-mount with knob, for volume"],
            ["Slide/toggle switches", "3", "power ×2 + RX gain switch; any SPST/SPDT"],
            ["Electret mic capsule", "1", "2-terminal, any size 6-10 mm"],
            ["Speaker 8 Ω 0.25-0.5 W", "1", "or headphones (loud!)"],
            ["9 V battery + clip", "2", "and a battery snap or holder each"],
            ["Perfboard 0.1 in pitch", "2 pcs", "~90×60 and ~100×65 mm, or order the PCBs"],
        ],
        [0.34, 0.10, 0.56], "Table 7-2 · The rest of the BOM.", align_center_cols=[1])

    make_table(story,
        ["Resistor", "TX", "RX"],
        [
            ["2.2 kΩ", "2", "2"], ["10 kΩ", "3", "1"], ["15 kΩ", "1", "0"],
            ["68 kΩ", "1", "0"], ["4.7 kΩ", "1", "0"], ["560 Ω", "2", "0"],
            ["1 kΩ", "1", "0"], ["27 kΩ", "2", "0"], ["1 MΩ", "0", "1"],
            ["470 kΩ", "0", "1"], ["220 kΩ", "0", "1"], ["47 kΩ", "0", "2"],
            ["820 Ω", "0", "1"], ["10 Ω", "0", "1"],
        ],
        [0.34, 0.30, 0.36],
        "Table 7-3 · Resistor count per board. The shared values are deliberate&nbsp;— one parts drawer "
        "serves both.", align_center_cols=[1, 2])

    h2(story, "7.2 · Perfboard or PCB, both work")
    body(story, "The PCBs were placed on a strict 2.54&nbsp;mm grid precisely so the layouts can be "
        "copied hole-for-hole onto perfboard: every component position in the renders is a "
        "perfboard hole location. If you order the boards instead (the repository exports "
        "manufacturer-ready Gerbers for both), you get silkscreen labels, a proper bottom-layer "
        "ground pour, and no wiring at all. On perfboard, the ground pour becomes your job&nbsp;— run "
        "a bare wire bus along the bottom row of holes and solder every ground to it; at these "
        "frequencies a tidy ground bus is not optional polish, it is why the oscillator behaves.")
    body(story, "Build order matters on either platform: resistors first (lowest, easiest to "
        "turn the board over), then the small capacitors, then diodes and transistors (watch the "
        "orientations below), then the big electrolytics, and the mechanical parts&nbsp;— switches, "
        "terminal pads, tuning caps&nbsp;— last. Solder the battery snap's wires so the board sits with "
        "the schematic's left edge at your left; every debugging step in chapter 8 assumes that "
        "orientation.")

    h2(story, "7.3 · Transistor orientation&nbsp;— the one gotcha")
    body(story, "The boards use an in-line TO-92 footprint: three holes in a row, "
        "0.1&nbsp;in apart. To use it, spread each transistor's legs into a row&nbsp;— the first "
        "mechanical skill every kit builder learns. BC547 goes in with its <b>flat face toward "
        "the board edge</b> (the silkscreen says so); its pins then read Collector-Base-Emitter "
        "left to right, matching the board. A 2N3904 has the opposite order (Emitter-Base-"
        "Collector), so it goes in <b>rotated 180°</b>, flat face inward. The silkscreen prints "
        "both instructions on both boards because this single mistake is the classic first-build "
        "failure: the circuit looks complete, the LED lights, and nothing transmits&nbsp;— because "
        "every transistor's collector and emitter are swapped.")
    bullets(story, [
        "<b>BC547:</b> flat face toward the board edge, pins C-B-E left to right.",
        "<b>2N3904:</b> flat face the other way (rotated 180°), pins then land C-B-E.",
        "<b>1N34A:</b> the end with the stripe or the visible crystal junction is the cathode&nbsp;— "
        "the banded end faces the volume pot, per the board's diode symbol.",
        "<b>Electrolytics:</b> the stripe (minus) side faces ground unless the silkscreen says "
        "otherwise; C1 and C13 both have their + toward the +9 V rail.",
        "<b>MIC1:</b> the pin electrically tied to the metal case is MIC_N and faces the ground pad.",
    ])

    h2(story, "7.4 · Wiring the mechanical parts")
    body(story, "The battery clips, switches, speaker, and (optionally) the volume pot and tuning "
        "capacitors connect through their labelled pads with short stranded wires&nbsp;— keep them "
        "under 10&nbsp;cm. The polyvaricon solders neatly to the board pads directly if you prefer; "
        "its two end lugs are the stators, the wide middle lug is the common rotor (ground). On the "
        "transmitter, only one stator (A) is used; the spare (B) is a documented upgrade hook&nbsp;— "
        "paralleling it adds range at the bottom of the band. The antenna is a 1-2&nbsp;m wire "
        "soldered to the ANT pad; let it trail off the table or tape it up a wall. Nothing about "
        "the antenna is critical except its existence: a transmitter with no antenna wire transmits "
        "a signal with almost no range at all.")


def ch8(story):
    h1(story, "8 · Bring-up: making them talk")

    body(story, "Bring-up is a sequence of small verifications, each with a pass condition you can "
        "see or hear. Do not skip ahead: each step confirms the pieces the next step depends on. "
        "The only instrument you might want is a pocket AM radio or a phone with an AM app&nbsp;— and "
        "even that is optional, because the receiver you just built is the test equipment for the "
        "transmitter, and vice versa.")

    make_table(story,
        ["#", "Action", "What success looks like"],
        [
            ["1", "TX board: battery in, switch on", "green PWR LED lights, ~6.5 mA draw"],
            ["2", "RX board: battery in, switch on", "green PWR LED lights, faint hiss with volume up"],
            ["3", "RX: GAIN switch open (20×), volume mid", "hiss level changes with volume&nbsp;— audio chain alive"],
            ["4", "RX: TUNE slowly across the whole band", "you should catch real broadcast stations (evening is best)"],
            ["5", "TX: set TUNE mid-range", "(all quiet so far — keep going)"],
            ["6", "RX: sweep TUNE slowly around the TX range", "static → voice → static; yellow SIG LED glows at the peak"],
            ["7", "Speak into the mic from ~10 cm", "your voice, recognisably, from the speaker"],
            ["8", "Move the boards apart in steps", "range fades over a few rooms&nbsp;— that's the physics of chapter 2"],
        ],
        [0.06, 0.44, 0.50],
        "Table 8-1 · The bring-up sequence. Steps 1-5 validate each board alone; 6-8 validate the link.",
        align_center_cols=[0])

    h2(story, "8.1 · Step 4 deserves a paragraph of its own")
    body(story, "Tuning across the band and hearing a real broadcast station&nbsp;— VOV1 on 630 or "
        "675&nbsp;kHz in most of Vietnam, or whatever your region offers after dark&nbsp;— is the best "
        "single test that the receiver's front end works, and it needs no transmitter at all. "
        "Medium-wave reception improves dramatically after sunset, when the ionosphere's D-layer "
        "stops absorbing the skywave; if your first attempt is at noon and hears only locals, try "
        "again in the evening with the same settings. Lengthening the antenna wire to 5-10&nbsp;m "
        "(out the window, along a fence) transforms weak-station reception and is the single "
        "cheapest upgrade the receiver will ever get.")

    h2(story, "8.2 · The tuning game")
    body(story, "Once the link works, play the game the boards were designed around: park the "
        "receiver on a quiet spot between stations, then tune the <i>transmitter</i> until its "
        "carrier appears&nbsp;— the SIG LED becomes your scoreboard. Now walk the transmitter across "
        "the band and follow it with the receiver. You are watching a station and a listener chase "
        "each other across the dial, which is the relationship every radio in your house has been "
        "having silently all along. When the two frequencies coincide, you will also hear a slow "
        "beat note as they <i>almost</i> coincide&nbsp;— the same beat phenomenon that makes two "
        "slightly-out-of-tune guitar strings warble, now happening at radio scale.")
    callout(story, "carrier → beat → lock",
            "what you hear as the two TUNE knobs converge&nbsp;— the beat note is the audible proof "
            "that two oscillators are involved")


def ch9(story):
    h1(story, "9 · Twelve experiments")
    body(story, "Each of these changes exactly one thing and predicts what you will observe. That "
        "is the experimental method, worn casually. Do them in any order; several want a helper "
        "to talk continuously into the mic while you listen.")

    make_table(story,
        ["#", "Experiment", "One-line prediction"],
        [
            ["1", "Distance ladder: 1 m, 3 m, 10 m, next room", "loudness falls fast&nbsp;— near-field's 1/d² in action"],
            ["2", "Shout vs whisper into the mic", "shout distorts&nbsp;— you crossed m = 1 into overmodulation"],
            ["3", "Remove the antenna wire", "range collapses to centimetres"],
            ["4", "Double the antenna (4 m)", "range grows, but not double&nbsp;— diminishing returns"],
            ["5", "Tune TX onto a real broadcast station's frequency", "your voice and theirs mix&nbsp;— interference, live"],
            ["6", "Touch the RX antenna with your hand", "station shifts&nbsp;— your body adds capacitance to the tank"],
            ["7", "Swap the 1N34A for a 1N4148", "weak stations fade&nbsp;— silicon's higher threshold"],
            ["8", "Close the RX GAIN switch (200×)", "weak stations appear; the TX now saturates&nbsp;— gain is a choice"],
            ["9", "Solder 4.7 kΩ across the RX tank", "stations smear together&nbsp;— Q collapsed, selectivity gone"],
            ["10", "Change C8 to 100 nF (detector cap)", "voices blur&nbsp;— the envelope filter got too slow"],
            ["11", "Parallel the TX varcap's spare gang (A+B)", "range extends downward&nbsp;— more C, lower f₀"],
            ["12", "Listen at night, antenna out the window", "distant stations bloom&nbsp;— the ionosphere woke up"],
        ],
        [0.06, 0.46, 0.48],
        "Table 9-1 · The experiment menu. Each row is a hypothesis you can test in minutes.",
        align_center_cols=[0])

    h2(story, "9.1 · The three that teach the most")
    body(story, "If you only do three, do 2, 9 and 10. Experiment 2 makes the invisible visible: "
        "overmodulation distortion is the sound of the carrier momentarily vanishing, and once you "
        "have heard it you will recognise the same artifact in every badly-run pirate station and "
        "cheap intercom. Experiment 9 is selectivity made visceral&nbsp;— with the tank loaded, the "
        "knob stops choosing stations and the band becomes soup, which is exactly what the "
        "buffer's 1&nbsp;MΩ bias pair exists to prevent. Experiment 10 lets you feel the "
        "detector's compromise between carrier ripple and audio fidelity&nbsp;— the 47&nbsp;µs time "
        "constant chosen in chapter 6 stops being a number and becomes a sound.")
    body(story, "Write down what you observe, especially where it differs from the prediction. A "
        "prediction that fails is not a broken project; it is a live circuit telling you which "
        "simplification in your mental model was too bold. The engineers who built radio spent "
        "fifty years collecting exactly such surprises&nbsp;— you get to collect a few of the best "
        "ones in an afternoon.")


def ch10(story):
    h1(story, "10 · Troubleshooting")

    body(story, "Fault-finding a radio you built yourself is the fastest electronics education "
        "there is, provided you bisect instead of guess: test the chain in order, and let each "
        "test cut the possible faults in half. The tables below map symptoms to first suspects, "
        "board by board. A multimeter helps but is not required&nbsp;— the signal LED, the speaker, "
        "and a pocket radio make a complete test bench for this project.")

    make_table(story,
        ["Symptom (TX)", "First suspects, in order"],
        [
            ["PWR LED dark", "battery, switch wiring, LED polarity"],
            ["No carrier heard on any radio", "transistor orientation (7.3!); L1's pad 2 must go to VMD, not ground"],
            ["Carrier but no voice", "mic polarity (case pin to ground); C3/C5 cold joint; speak at 10 cm"],
            ["Voice badly distorted", "overmodulation (back off / whisper); electret shorted against its case"],
            ["Carrier drifts or warbles", "C6 accidentally 100 nF (audio into the bias); battery below 7 V"],
            ["Carrier only at one end of TUNE", "varcap lugs miswired (rotor = middle/wide lug to ground)"],
        ],
        [0.36, 0.64], "Table 10-1 · Transmitter symptoms.")

    make_table(story,
        ["Symptom (RX)", "First suspects, in order"],
        [
            ["PWR LED dark", "battery, switch wiring"],
            ["No hiss at any volume", "LM386 wiring; C13 polarity; speaker pads bridged"],
            ["Hiss but no stations, ever", "tank wiring (L1/CV1), antenna wire missing, D1 backwards"],
            ["Hears locals but not the TX", "TX on a frequency outside 614-836 kHz&nbsp;— retune TX mid-band"],
            ["SIG LED always on", "Q3 collector/emitter swapped; detector output shorted to V9"],
            ["Stations all smeared together", "experiment 9's resistor left in; heavy antenna (C3 too big)"],
            ["Buzz at 50/60 Hz everywhere", "battery gone flat; ground bus skipped on perfboard"],
        ],
        [0.36, 0.64], "Table 10-2 · Receiver symptoms.")

    h2(story, "10.1 · The two-minute sanity loop")
    body(story, "When lost, return to the chain diagrams: figure 4-1 for the transmitter, figure "
        "6-1 for the receiver. Test each stage's <i>output promise</i> in order&nbsp;— power rail "
        "present? oscillator running (a nearby AM radio hisses/squeals at the carrier even with "
        "no voice)? detector DC jumping when a station arrives? audio hiss present?&nbsp;— and the "
        "first broken promise is your fault region. This is the same discipline the verification "
        "suite applies to the design (chapter 5), now applied with your ears to the physical "
        "board. Design, simulation, and debugging are one habit applied at three altitudes.")


def ch11(story):
    h1(story, "11 · The rules, the safety, and the road ahead")

    h2(story, "11.1 · Transmitting legally")
    body(story, "Low-power unlicensed transmitters are regulated, but generously, because their "
        "range is intrinsically small. In the United States, FCC Part 15.219 permits an "
        "unlicensed AM transmitter with up to 100&nbsp;mW of DC input power to its final stage "
        "and an antenna plus ground lead no longer than 3&nbsp;metres. This transmitter draws "
        "about 5&nbsp;mW into its final&nbsp;— twenty times under the ceiling&nbsp;— and a 2&nbsp;metre "
        "wire antenna keeps you inside the antenna rule. Many other countries have comparable "
        "provisions for field strengths this small; a few require notification, and a handful "
        "are stricter. Two habits keep you polite everywhere: keep the antenna short, and choose "
        "a quiet frequency between broadcast stations rather than on top of one. Receiving, of "
        "course, is legal everywhere and always was.")

    h2(story, "11.2 · Safety, briefly")
    body(story, "A 9&nbsp;V battery cannot hurt you, and nothing in these boards stores "
        "meaningful energy&nbsp;— the highest voltage anywhere is the battery itself. The real risks "
        "are the timeless bench ones: soldering iron burns, rosin fumes (ventilate), and leads "
        "clipped short flying into eyes (glasses). If you later upgrade the transmitter with "
        "amplifier modules or higher rails, re-read this paragraph&nbsp;— the friendly numbers here "
        "belong to a 9&nbsp;V battery, not to whatever you build next.")

    h2(story, "11.3 · Where this road goes next")
    body(story, "You now own, in your head, the skeleton of every receiver ever made: antenna, "
        "tuning, amplification, detection, audio. Three doors lead onward. The <b>regenerative "
        "receiver</b> adds one transistor of positive feedback to the TRF and achieves startling "
        "sensitivity&nbsp;— Armstrong's 1912 idea, still a favourite build. The <b>superheterodyne</b> "
        "is the architecture of virtually every real radio: a local oscillator and mixer convert "
        "every station to one fixed frequency where sharp filters live; build one and you will "
        "finally understand the numbers printed on every radio dial. And <b>software-defined "
        "radio</b> replaces the tuned circuits with mathematics&nbsp;— a $30 USB stick lets you watch "
        "the entire spectrum you have been playing in, as a waterfall, in real time. Whichever "
        "door you take, you will keep using the ideas this pair of boards made physical: "
        "resonance selects, nonlinearity creates, and every signal you will ever chase is "
        "someone's deliberate ride on a carrier.")
    callout_row(story, [
        ("You built both ends", "the station and the listener"),
        ("You proved it first", "29 math checks · 7 simulation proofs"),
        ("You tuned the ether", "the knob really does slide the bell"),
    ])
