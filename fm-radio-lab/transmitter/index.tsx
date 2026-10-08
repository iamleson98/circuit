/**
 * ═════════════════════════════════════════════════════════════════════════
 *  FM RADIO LAB · FM TRANSMITTER ("FM-TX") — designed in tscircuit
 * ═════════════════════════════════════════════════════════════════════════
 *  Run with:   npm install -g tscircuit   →   tsci dev transmitter/index.tsx
 *  (or paste the standalone copy in standalone/ into snippets.tscircuit.com)
 *
 *  WHAT THIS IS
 *  A two-transistor FM (frequency modulation) transmitter for the FM
 *  broadcast band (88-108 MHz). Speak into an electret microphone — or plug
 *  in a phone — and any nearby FM radio (or the companion FM-RX receiver)
 *  hears you on a frequency YOU choose with a screwdriver:
 *
 *    mic/aux → audio preamp (Q1) → ┌ FM oscillator (Q2, Colpitts) ┐→ wire
 *                                  └ TUNE trimmer slides 88-108MHz ┘
 *
 *  WHERE THE "FM" HAPPENS (the whole point of this project)
 *  Q2 is a common-base Colpitts oscillator — the same tank circuit L1 ∥
 *  (TRIM1+C10) ∥ (C9 series C8) rings at ~100 MHz. Your voice arrives at
 *  Q2's base and wiggles the transistor's emitter current, and the
 *  emitter-base junction capacitance WIGGLES WITH IT. That junction
 *  capacitance is physically part of the tank, so the carrier frequency
 *  wiggles too — voltage changes the capacitance, capacitance changes the
 *  frequency, and speech becomes FREQUENCY MODULATION. This is exactly how
 *  the classic "FM bug" transmitters work, and seeing it on a schematic you
 *  built yourself is the fastest way to understand FM.
 *
 *  WHY TWO STAGES (each is one real broadcast concept, shrunk)
 *  · Q1 amplifies the ~20mV microphone signal to ~100-200mV — enough to
 *    swing Q2's junction capacitance through a useful range (full FM
 *    broadcast deviation is ±75 kHz; this design lands in the tens of kHz,
 *    loud and clear on any radio).
 *  · Q2 is the oscillator: L1 (a 4-turn hand-wound air coil) resonates
 *    with ~25pF at ~100MHz. The trimmer TRIM1 (5-30pF, padded by C10)
 *    slides the frequency across the band. C9/C8 form the feedback
 *    divider that keeps the oscillation running.
 *
 *  PROVEN, NOT HOPED
 *  calc/sim_fm.mjs integrates this exact oscillator (RK4, Ebers-Moll
 *  transistor with a voltage-dependent junction capacitance — the FM
 *  mechanism itself): it starts from a 1mV seed, lands within a few % of
 *  the predicted frequency, tunes monotonically across the band, and the
 *  junction-capacitance sweep measures the real kHz-per-millivolt FM
 *  sensitivity. calc/circuit_math.mjs re-derives every bias point.
 *
 *  HOW TO READ THIS FILE
 *  One flat netlist organized like the schematic pages of a real radio:
 *  power → microphone/aux → preamp → oscillator → tank → antenna.
 *  Every wire is an explicit <trace /> — reading the traces IS reading the
 *  schematic. Nets touching 3+ places get names (net.V9, net.GND, net.TANK)
 *  exactly like net labels in KiCad.
 *
 *  ALL PARTS ARE THROUGH-HOLE on a 0.1" (2.54mm) grid — the PCB layout
 *  doubles as a perfboard placement guide if you don't order boards.
 *  (At 100 MHz keep the leads SHORT — the tutorial shows the VHF
 *  soldering tricks that make air-coil circuits work.)
 */
import "@tscircuit/core"
import {
  Battery9V,
  PowerSwitch,
  AirCoil,
  TrimmerCap,
  ElectretMic,
  AuxJack,
  AntennaPad,
  NpnTo92,
} from "../lib/parts"

export default () => (
  <board width="91.44mm" height="55.88mm" name="fm-tx">
    {/* ═══════════════════════ §1 POWER ENTRY ═════════════════════════════
        9V battery → slide switch → the V9 rail. C1 (47µF) is the bulk
        reservoir; C2 (100nF) is the fast local decoupler. LED1 + R1 give a
        ~3mA power light: (9V − 2V) / 2.2k ≈ 3mA. A steady supply matters
        twice as much here as on the AM board: supply wobble shifts the
        oscillator frequency ("supply pushing") — good decoupling is
        literally a frequency-stability part. */}

    <Battery9V name="BT1" pcbX={-38.1} pcbY={-22.86} schX={-14} schY={-7} />
    <PowerSwitch name="SW1" pcbX={-30.48} pcbY={-22.86} schX={-10} schY={-7} />
    <capacitor name="C1" capacitance="47uF" footprint="radial_p5mm" pcbX={-38.1} pcbY={-13.97} schX={-12} schY={-3} />
    <capacitor name="C2" capacitance="100nF" footprint="radial_p2.54mm" pcbX={-29.21} pcbY={-15.24} schX={-9} schY={-3} />
    <led name="LED1" color="green" footprint="radial_p2.54mm" pcbX={-21.59} pcbY={-22.86} schX={-6} schY={-6} />
    <resistor name="R1" resistance="2.2kohm" footprint="axial_p10.16mm" pcbX={-11.43} pcbY={-22.86} schX={-4} schY={-6} />

    <trace from=".BT1 > .pin1" to=".SW1 > .pin1" />
    <trace from=".SW1 > .pin2" to="net.V9" />
    <trace from=".BT1 > .pin2" to="net.GND" />
    <trace from=".C1 > .pin1" to="net.V9" />
    <trace from=".C1 > .pin2" to="net.GND" />
    <trace from=".C2 > .pin1" to="net.V9" />
    <trace from=".C2 > .pin2" to="net.GND" />
    <trace from=".R1 > .pin1" to="net.V9" />
    <trace from=".R1 > .pin2" to=".LED1 > .anode" />
    <trace from=".LED1 > .cathode" to="net.GND" />

    {/* ═══════════════════════ §2 MICROPHONE + AUX INPUT ══════════════════
        Two ways to put audio in:
        · MIC1 — an electret capsule: a mic + built-in FET. R2 (10k) powers
          that FET from V9; the pin carries your voice as ±10-30mV of AC.
          C3 blocks the DC and passes the voice into Q1's base.
        · AUX1 — two pads for a 3.5mm jack. Feed a phone or tone generator
          in through C4 + R3 (47k tames line-level down to mic-level). A
          KNOWN tone from AUX makes bring-up much easier — the tutorial
          uses it as the standard debugging signal. */}

    <ElectretMic name="MIC1" pcbX={-40.64} pcbY={10.16} schX={-16} schY={9} />
    <resistor name="R2" resistance="10kohm" footprint="axial_p10.16mm" pcbX={-34.29} pcbY={21.59} schX={-14} schY={11} />
    <capacitor name="C3" capacitance="100nF" footprint="radial_p2.54mm" pcbX={-27.94} pcbY={2.54} schX={-12} schY={9} />
    <AuxJack name="AUX1" pcbX={-40.64} pcbY={-5.08} schX={-16} schY={4} />
    <capacitor name="C4" capacitance="100nF" footprint="radial_p2.54mm" pcbX={-40.64} pcbY={0} schX={-14} schY={4} />
    <resistor name="R3" resistance="47kohm" footprint="axial_p10.16mm" pcbX={-26.67} pcbY={-6.35} schX={-12} schY={6} />

    <trace from=".MIC1 > .MIC_P" to=".R2 > .pin2" name="MIC" />
    <trace from=".MIC1 > .MIC_P" to=".C3 > .pin1" />
    <trace from=".MIC1 > .MIC_N" to="net.GND" />
    <trace from=".R2 > .pin1" to="net.V9" />
    <trace from=".C3 > .pin2" to=".Q1 > .base" name="AUD" />
    <trace from=".AUX1 > .TIP" to=".C4 > .pin1" />
    <trace from=".C4 > .pin2" to=".R3 > .pin1" />
    <trace from=".R3 > .pin2" to=".Q1 > .base" />
    <trace from=".AUX1 > .SLE" to="net.GND" />

    {/* ═══════════════════════ §3 AUDIO PREAMP (Q1) ═══════════════════════
        A common-emitter stage: R4/R5 bias the base at ~1.6V, R6 is the
        collector load, R7+R8 set the emitter (and collector) current to
        ~1.8mA. C5 shorts R8 at audio → the stage's gain becomes ≈
        R_load/(R7 + r_e) ≈ 6× — deliberately MODEST, because the FM
        oscillator only needs ~100mV of voice for a healthy swing (the sim
        in calc/sim_fm.mjs measures the exact sensitivity). Shout and
        you'll over-deviate: distorted but educational. */}

    <NpnTo92 name="Q1" pcbX={-13.97} pcbY={8.89} schX={-9} schY={9} />
    <resistor name="R4" resistance="56kohm" footprint="axial_p10.16mm" pcbX={-8.89} pcbY={21.59} schX={-9} schY={12} />
    <resistor name="R5" resistance="12kohm" footprint="axial_p10.16mm" pcbX={-19.05} pcbY={15.24} schX={-9} schY={6} />
    <resistor name="R6" resistance="2.7kohm" footprint="axial_p10.16mm" pcbX={-31.75} pcbY={15.24} schX={-11.5} schY={9} />
    <resistor name="R7" resistance="220ohm" footprint="axial_p10.16mm" pcbX={-6.35} pcbY={-5.08} schX={-7} schY={6} />
    <resistor name="R8" resistance="330ohm" footprint="axial_p10.16mm" pcbX={-19.05} pcbY={-3.81} schX={-6} schY={4} />
    <capacitor name="C5" capacitance="10uF" footprint="radial_p2.54mm" pcbX={-13.97} pcbY={-11.43} schX={-4.5} schY={2} />

    <trace from=".R4 > .pin1" to="net.V9" />
    <trace from=".R4 > .pin2" to=".Q1 > .base" />
    <trace from=".R5 > .pin1" to=".Q1 > .base" />
    <trace from=".R5 > .pin2" to="net.GND" />
    <trace from=".R6 > .pin1" to="net.V9" />
    <trace from=".R6 > .pin2" to=".Q1 > .collector" name="AF_OUT" />
    <trace from=".C6 > .pin1" to=".Q1 > .collector" />
    <trace from=".Q1 > .emitter" to=".R7 > .pin1" name="Q1E" />
    <trace from=".R7 > .pin2" to=".R8 > .pin1" name="Q1E2" />
    <trace from=".R8 > .pin2" to="net.GND" />
    <trace from=".R7 > .pin2" to=".C5 > .pin1" />
    <trace from=".C5 > .pin2" to="net.GND" />

    {/* ═══════════════════════ §4 FM OSCILLATOR (Q2) + TANK ═══════════════
        A common-base Colpitts — the workhorse VHF oscillator, and the
        heart of BOTH boards in this project (the receiver uses the exact
        same core — that symmetry is the big lesson).
        · R9/R10 bias the base at ~1.9V (stiff divider: the carrier must
          not wander). C7 (470pF) grounds the base at RF — Xc ≈ 3Ω at
          100MHz — while leaving the audio from C6 free to reach the
          junction. That audio-vs-RF split IS the FM modulation port.
        · L1 hangs from the collector to V9 (the coil IS the DC feed —
          ~0Ω at DC, ~60Ω of reactance at 100MHz) and the tank capacitance
          to ground is C9 in series with C8, plus TRIM1 padded by C10,
          plus the transistor's own C_ob ≈ 8pF (2N2222A datasheet).
        · C9 (22pF) / C8 (47pF) are also the feedback divider: the emitter
          sits at their midpoint, feeding a slice of the collector swing
          back in phase. The pair presents a NEGATIVE RESISTANCE
          −gm/(ω²·C9·C8) ≈ −600Ω against the tank's ~+2kΩ — starts
          reliably, self-limits to a steady carrier.
        · R11 sets the emitter current (~3mA → gm ≈ 120mS). */}

    <NpnTo92 name="Q2" pcbX={10.16} pcbY={8.89} schX={1} schY={9} />
    <capacitor name="C6" capacitance="100nF" footprint="radial_p2.54mm" pcbX={1.27} pcbY={2.54} schX={-4} schY={11} />
    <resistor name="R9" resistance="15kohm" footprint="axial_p10.16mm" pcbX={3.81} pcbY={21.59} schX={1} schY={12} />
    <resistor name="R10" resistance="3.9kohm" footprint="axial_p10.16mm" pcbX={-2.54} pcbY={15.24} schX={1} schY={6} />
    <capacitor name="C7" capacitance="470pF" footprint="radial_p2.54mm" pcbX={7.62} pcbY={2.54} schX={3} schY={3.5} />
    <resistor name="R11" resistance="390ohm" footprint="axial_p10.16mm" pcbX={16.51} pcbY={-4.45} schX={3} schY={6} />
    <capacitor name="C8" capacitance="47pF" footprint="radial_p2.54mm" pcbX={16.51} pcbY={2.54} schX={4.5} schY={6} />
    <capacitor name="C9" capacitance="22pF" footprint="radial_p2.54mm" pcbX={22.86} pcbY={2.54} schX={3.5} schY={10} />

    <trace from=".C6 > .pin2" to=".Q2 > .base" name="OSCB" />
    <trace from=".R9 > .pin1" to="net.V9" />
    <trace from=".R9 > .pin2" to=".Q2 > .base" />
    <trace from=".R10 > .pin1" to=".Q2 > .base" />
    <trace from=".R10 > .pin2" to="net.GND" />
    <trace from=".C7 > .pin1" to=".Q2 > .base" />
    <trace from=".C7 > .pin2" to="net.GND" />
    <trace from=".R11 > .pin1" to=".Q2 > .emitter" name="RFE" />
    <trace from=".R11 > .pin2" to="net.GND" />
    <trace from=".C8 > .pin1" to=".Q2 > .emitter" />
    <trace from=".C8 > .pin2" to="net.GND" />
    <trace from=".Q2 > .collector" to="net.TANK" />
    <trace from=".C9 > .pin1" to="net.TANK" />
    <trace from=".C9 > .pin2" to=".Q2 > .emitter" />

    {/* ═══════════════════════ §5 THE TANK — YOUR TUNING KNOB ═════════════
        L1 is the 3-turn air coil you wind yourself (≈0.06µH). It resonates
        with: C9 series C8 (8.2pF) + transistor strays (≈8-13pF) + TRIM1
        (5-30pF, directly across the tank — the classic FM-bug arrangement:
        a ~35MHz-wide window that always swallows the whole FM band, with
        the coil-stretch trick as the band-edge rescue).
        C11 (100nF) + C12 (1nF) ground the V9 rail right at the coil so
        the tank sees a solid RF ground — they are part of the resonator. */}

    <AirCoil name="L1" pcbX={36.83} pcbY={2.54} schX={5} schY={11} />
    <TrimmerCap name="TRIM1" pcbX={30.48} pcbY={15.24} schX={5} schY={7} />
    <capacitor name="C11" capacitance="100nF" footprint="radial_p2.54mm" pcbX={33.02} pcbY={21.59} schX={7.5} schY={12} />
    <capacitor name="C12" capacitance="1nF" footprint="radial_p2.54mm" pcbX={38.1} pcbY={15.24} schX={7.5} schY={10.5} />

    <trace from=".L1 > .pin1" to="net.TANK" />
    <trace from=".L1 > .pin2" to="net.V9" />
    <trace from=".TRIM1 > .A" to="net.TANK" />
    <trace from=".TRIM1 > .B" to="net.GND" />
    <trace from=".C11 > .pin1" to="net.V9" />
    <trace from=".C11 > .pin2" to="net.GND" />
    <trace from=".C12 > .pin1" to="net.V9" />
    <trace from=".C12 > .pin2" to="net.GND" />

    {/* ═══════════════════════ §6 ANTENNA ═════════════════════════════════
        At ~100 MHz the wavelength is ~3m, so 75cm of wire is a proper
        quarter-wave monopole. C13 (3.3pF) feeds it a small, controlled
        sip of the carrier — enough to cross a house, small enough to stay
        in license-exempt territory (see tutorial · Regulations: field
        strength limits like FCC §15.239's 250µV/m at 3m). Start with
        30cm of wire; lengthen only if you need more range. */}

    <capacitor name="C13" capacitance="3.3pF" footprint="radial_p2.54mm" pcbX={36.83} pcbY={-5.08} schX={8} schY={9} />
    <AntennaPad name="ANT1" pcbX={41.91} pcbY={-5.08} schX={10} schY={9} />

    <trace from=".C13 > .pin1" to="net.TANK" />
    <trace from=".C13 > .pin2" to=".ANT1 > .ANT" name="ANT" />

    {/* ═══════════════════════ §7 SILKSCREEN MANUAL ═══════════════════════
        The board labels itself: what each knob/pad does, the transistor
        orientation trick, and the coil winding spec where it matters. */}

    <silkscreentext text="FM-TX" pcbX={0} pcbY={26.67} fontSize="1.6mm" />
    <silkscreentext text="MIC" pcbX={-36} pcbY={13} fontSize="1.2mm" />
    <silkscreentext text="AUX" pcbX={-36} pcbY={-8} fontSize="1.2mm" />
    <silkscreentext text="TUNE" pcbX={30.48} pcbY={19.5} fontSize="1.2mm" />
    <silkscreentext text="L1: 3T ON 5MM FORM" pcbX={36} pcbY={7.5} fontSize="1.0mm" />
    <silkscreentext text="ANT 30-75CM WIRE" pcbX={38} pcbY={-9} fontSize="1.1mm" />
    <silkscreentext text="9V" pcbX={-38.1} pcbY={-19} fontSize="1.2mm" />
    <silkscreentext text="ON" pcbX={-30.48} pcbY={-19} fontSize="1.2mm" />
    <silkscreentext text="BC547/BC548: FLAT FACE DOWN" pcbX={-1} pcbY={-8} fontSize="1.1mm" />
    <silkscreentext text="2N2222A: ROTATE 180" pcbX={-1} pcbY={-10} fontSize="1.1mm" />

    {/* ═══════════════════════ §8 GROUND POUR ═════════════════════════════
        Solid GND on the bottom layer: short returns for the RF stage,
        less hand-capacitance weirdness, a steadier carrier. Thermal
        reliefs keep through-hole pads solderable. This is the standard
        2-layer stackup for anything VHF. */}

    <copperpour
      connectsTo="net.GND"
      layer="bottom"
      padMargin="0.45mm"
      useThermalReliefs
    />
  </board>
)
