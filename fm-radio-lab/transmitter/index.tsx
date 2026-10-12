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
 *  Q2 is a common-base Colpitts oscillator — the tank L1 ∥ TRIM1 ∥
 *  (C9 series C8) rings at ~100 MHz. Across that tank sits D1, a diode
 *  used as a VARACTOR: reverse-biased, its junction capacitance shrinks as
 *  the reverse voltage grows. Your voice rides on D1's bias, D1's
 *  capacitance wiggles, the tank's resonance wiggles — speech becomes
 *  FREQUENCY MODULATION. (Classic "FM bugs" modulate the oscillator
 *  transistor's own junction instead; simulated with real transistor
 *  models that effect is erratic — 0.04 to 5 kHz/mV and even changing sign
 *  with transistor type and tuning — so this board uses a dedicated
 *  varactor whose behaviour you can predict.)
 *
 *  WHY TWO STAGES (each is one real broadcast concept, shrunk)
 *  · Q1 amplifies the few-mV microphone signal ~18× — enough to swing the
 *    varactor through a useful range. The DEV trimmer sets the deviation:
 *    broadcast FM uses up to ±75 kHz, and §15.239 requires the emission to
 *    stay inside a 200 kHz band, so turn DEV up only until speech is loud
 *    and clean on a normal FM radio.
 *  · Q2 is the oscillator: L1 (a 3-turn hand-wound air coil, ~56nH)
 *    resonates with ~45pF at ~100MHz. The trimmer TRIM1 (5-30pF, directly
 *    across the tank) slides the frequency across the band. C9/C8 form the
 *    feedback divider that keeps the oscillation running.
 *
 *  PROVEN, NOT HOPED
 *  calc/spice/ holds standard SPICE decks of this board (ngspice/LTspice)
 *  and calc/sim_fm.mjs re-runs the checks with a bundled circuit simulator
 *  and vendor transistor/diode models: start-up for 2N2222A and BC547B,
 *  coil Q 50-150 and 2-5 nH lead inductance; ≈81-104 MHz tuning (never into
 *  the aviation band); tank swing ≤ 0.8 V; varactor FM of one predictable
 *  sign; and a radiated-power estimate ≈14 dB under the licence-free limit.
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
  VolumePot,
  NpnTo92,
  FAB_RULES,
  Cap,
  ECap,
  Led5mm,
  Res,
  AxialDiode,
} from "../lib/parts"

export default () => (
  <board width="91.44mm" height="55.88mm" name="fm-tx" {...FAB_RULES}>
    {/* ═══════════════════════ §1 POWER ENTRY ═════════════════════════════
        9V battery → slide switch → the V9 rail. C1 (47µF) is the bulk
        reservoir; C2 (100nF) is the fast local decoupler. LED1 + R1 give a
        ~3mA power light: (9V − 2V) / 2.2k ≈ 3mA. A steady supply matters
        twice as much here as on the AM board: supply wobble shifts the
        oscillator frequency ("supply pushing") — good decoupling is
        literally a frequency-stability part. */}

    <Battery9V name="BT1" pcbX={-40.64} pcbY={-22.86} schX={-14} schY={-7} />
    <PowerSwitch name="SW1" pcbX={-30.48} pcbY={-22.86} schX={-10} schY={-7} />
    <ECap name="C1" capacitance="47uF" pitch={5} pcbX={-38.1} pcbY={-13.97} schX={-12} schY={-3} />
    <Cap name="C2" capacitance="100nF" pcbX={-29.21} pcbY={-15.24} schX={-9} schY={-3} />
    <Led5mm name="LED1" color="green" pcbX={-21.59} pcbY={-22.86} schX={-6} schY={-6} />
    <Res name="R1" resistance="2.2kohm" pitch={10.16} pcbX={-11.43} pcbY={-22.86} schX={-4} schY={-6} />

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
    <Res name="R2" resistance="10kohm" pitch={10.16} pcbX={-34.29} pcbY={21.59} schX={-14} schY={11} />
    <Cap name="C3" capacitance="100nF" pcbX={-27.94} pcbY={2.54} schX={-12} schY={9} />
    <AuxJack name="AUX1" pcbX={-40.64} pcbY={-5.08} schX={-16} schY={4} />
    <Cap name="C4" capacitance="100nF" pcbX={-40.64} pcbY={0} schX={-14} schY={4} />
    <Res name="R3" resistance="47kohm" pitch={10.16} pcbX={-26.67} pcbY={-6.35} schX={-12} schY={6} />

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
        ~2mA. C5 shorts R8 at audio → the stage's gain becomes ≈
        R_load/(R7 + r_e) ≈ 18×: a few mV of voice becomes ~100mV for the
        varactor (§4b). The DEV trimmer then sets how much of it is used. */}

    <NpnTo92 name="Q1" pcbX={-13.97} pcbY={8.89} schX={-9} schY={9} />
    <Res name="R4" resistance="56kohm" pitch={10.16} pcbX={-8.89} pcbY={21.59} schX={-9} schY={12} />
    <Res name="R5" resistance="12kohm" pitch={10.16} pcbX={-19.05} pcbY={15.24} schX={-9} schY={6} />
    <Res name="R6" resistance="2.7kohm" pitch={10.16} pcbX={-31.75} pcbY={15.24} schX={-11.5} schY={9} />
    <Res name="R7" resistance="100ohm" pitch={10.16} pcbX={-6.35} pcbY={-5.08} schX={-7} schY={6} />
    <Res name="R8" resistance="330ohm" pitch={10.16} pcbX={-19.05} pcbY={-3.81} schX={-6} schY={4} />
    <ECap name="C5" capacitance="10uF" pitch={2.54} pcbX={-13.97} pcbY={-11.43} schX={-4.5} schY={2} />

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
          100MHz. No audio goes to the base: FM is done by the varactor.
        · L1 hangs from the collector to V9 (the coil IS the DC feed —
          ~0Ω at DC, ~60Ω of reactance at 100MHz) and the tank capacitance
          to ground is C9 in series with C8, plus TRIM1, the C17 padder
          and the varactor D1 (§5), plus the transistor's own C_ob
          (≈ 8pF max for a 2N2222A).
        · C9 (22pF) / C8 (47pF) are also the feedback divider: the emitter
          sits at their midpoint, feeding a slice of the collector swing
          back in phase.
        · R11 sets the emitter current (~1.7mA → gm ≈ 65mS): ample loop
          gain to start with a loaded tank (§5) for 2N2222A or BC547/548. */}

    <NpnTo92 name="Q2" pcbX={10.16} pcbY={8.89} schX={1} schY={9} />
    <Res name="R9" resistance="15kohm" pitch={10.16} pcbX={3.81} pcbY={21.59} schX={1} schY={12} />
    <Res name="R10" resistance="3.9kohm" pitch={10.16} pcbX={-2.54} pcbY={15.24} schX={1} schY={6} />
    <Cap name="C7" capacitance="470pF" pcbX={7.62} pcbY={2.54} schX={3} schY={3.5} />
    <Res name="R11" resistance="680ohm" pitch={10.16} pcbX={16.51} pcbY={-4.45} schX={3} schY={6} />
    <Cap name="C8" capacitance="47pF" pcbX={16.51} pcbY={2.54} schX={4.5} schY={6} />
    <Cap name="C9" capacitance="22pF" pcbX={22.86} pcbY={2.54} schX={3.5} schY={10} />

    <trace from=".Q2 > .base" to="net.OSCB" />
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

    {/* ═══════════════════════ §4b THE VARACTOR — WHERE FM IS BORN ════════
        D1 (a 1N4148 used as a varactor) sits across the tank: cathode on
        TANK (≈9V DC through L1), anode on net.VAR, which R12/R13 hold at
        ≈7.85V → ~1.15V of reverse bias, comfortably more than the ≤0.8V
        RF peak, so D1 never conducts. C14 (470pF) is D1's RF ground
        (≈3Ω at 100 MHz); the resistance it sees for audio (R14 + the DEV
        pot, ∥ the bias divider) is ≤ 3.5k, so its corner sits above 90 kHz
        and speech passes untouched. Voice from Q1 → C6 → DEV
        trimmer → R14 → C16 rides on that bias (C16 blocks DC: without it
        the lower half of the DEV pot would drag VAR down to ~1.9V and
        reverse-bias D1 by 7V, where it is far less sensitive): more
        reverse voltage = less capacitance = higher frequency. Simulated
        sensitivity 0.13-0.59 kHz/mV in band (it spreads with the 1N4148's
        capacitance and with TUNE); set DEV by ear — loud and clean on a
        normal FM radio, no splatter onto neighbouring channels. A real
        varactor (e.g. BB910-class) can replace D1 for more deviation per
        mV. */}

    <Cap name="C6" capacitance="100nF" pcbX={1.27} pcbY={2.54} schX={-4} schY={11} />
    <VolumePot name="RV1" pcbX={5.08} pcbY={-20.32} schX={-2} schY={14} />
    <Res name="R14" resistance="1kohm" pitch={10.16} pcbX={17.78} pcbY={-25.4} schX={1} schY={14} />
    <Cap name="C16" capacitance="100nF" pcbX={27.94} pcbY={-22.86} schX={2} schY={15.5} />
    <Res name="R12" resistance="22kohm" pitch={10.16} pcbX={17.78} pcbY={-15.24} schX={3} schY={15} />
    <Res name="R13" resistance="150kohm" pitch={10.16} pcbX={17.78} pcbY={-20.32} schX={4.5} schY={15} />
    <Cap name="C14" capacitance="470pF" pcbX={25.4} pcbY={-10.16} schX={5.5} schY={14} />
    <AxialDiode name="D1" pitch={7.62} pcbX={27.94} pcbY={-5.08} schX={6.5} schY={13} />

    <trace from=".C6 > .pin2" to=".RV1 > .pin1" name="AF_DEV" />
    <trace from=".RV1 > .pin3" to="net.GND" />
    <trace from=".RV1 > .pin2" to=".R14 > .pin1" />
    <trace from=".R14 > .pin2" to=".C16 > .pin1" />
    <trace from=".C16 > .pin2" to="net.VAR" />
    <trace from=".R12 > .pin1" to="net.V9" />
    <trace from=".R12 > .pin2" to="net.VAR" />
    <trace from=".R13 > .pin1" to="net.VAR" />
    <trace from=".R13 > .pin2" to="net.GND" />
    <trace from=".C14 > .pin1" to="net.VAR" />
    <trace from=".C14 > .pin2" to="net.GND" />
    <trace from=".D1 > .anode" to="net.VAR" />
    <trace from=".D1 > .cathode" to="net.TANK" />

    {/* ═══════════════════════ §5 THE TANK — YOUR TUNING KNOB ═════════════
        L1 is the 3-turn air coil you wind yourself (≈0.056µH). It resonates
        with: C9 series C8 (15pF) + transistor strays + D1 (~1-3pF) +
        C17 (12pF padder) + TRIM1 (5-30pF, directly across the tank):
        simulated ≈81-101 MHz (2N2222A) / 82-104 MHz (BC547B), across
        the 1N4148's capacitance spread and 2-5nH of lead inductance. C17
        is there to keep the TOP of the range below 108 MHz: without it
        the trimmer reaches 115-120 MHz, in the aviation band (108-137
        MHz), where transmitting is dangerous as well as illegal (6.8pF
        still let a BC547B with a low-capacitance 1N4148 reach 110 MHz;
        10pF left under 1% of margin with short leads). Stretch the coil
        (fewer nH) to move the window up if you need the top of the FM
        band — and always check on a normal FM radio that you are below
        108 MHz.
        R15 (330Ω) deliberately LOADS the tank. An undamped oscillator
        grows until the transistor saturates — ~9V peak on this tank,
        whatever the coil's Q — and a 3-turn coil carrying that much RF
        current is itself a small loop antenna radiating far above the
        licence-free limit. With R15 the swing is pinned at ~0.55-0.85V
        for any coil Q (50-150) or transistor, and the coil's own radiation
        drops ~20 dB.
        C11 (100nF) + C12 (1nF) ground the V9 rail right at the coil so
        the tank sees a solid RF ground — they are part of the resonator. */}

    <AirCoil name="L1" pcbX={36.83} pcbY={2.54} schX={5} schY={11} />
    <TrimmerCap name="TRIM1" pcbX={30.48} pcbY={15.24} schX={5} schY={7} />
    <Cap name="C11" capacitance="100nF" pcbX={33.02} pcbY={21.59} schX={7.5} schY={12} />
    <Cap name="C12" capacitance="1nF" pcbX={38.1} pcbY={15.24} schX={7.5} schY={10.5} />
    <Res name="R15" resistance="330ohm" pitch={7.62} pcbX={35.56} pcbY={-2.54} schX={6} schY={11.5} />
    <Cap name="C17" capacitance="12pF" pcbX={22.86} pcbY={20.32} schX={6.5} schY={7} />

    <trace from=".L1 > .pin1" to="net.TANK" />
    <trace from=".L1 > .pin2" to="net.V9" />
    <trace from=".R15 > .pin1" to="net.TANK" />
    <trace from=".R15 > .pin2" to="net.V9" />
    <trace from=".C17 > .pin1" to="net.TANK" />
    <trace from=".C17 > .pin2" to="net.GND" />
    <trace from=".TRIM1 > .A" to="net.TANK" />
    <trace from=".TRIM1 > .B" to="net.GND" />
    <trace from=".C11 > .pin1" to="net.V9" />
    <trace from=".C11 > .pin2" to="net.GND" />
    <trace from=".C12 > .pin1" to="net.V9" />
    <trace from=".C12 > .pin2" to="net.GND" />

    {/* ═══════════════════════ §6 ANTENNA ═════════════════════════════════
        FCC §15.239 allows only 250µV/m at 3m in 88-108 MHz — an EIRP of
        about 19 nW (−47 dBm). The earlier version (3.3pF straight from a
        9V tank into 30-75cm of wire) simulated at −8 to +8 dBm: 40-55 dB
        too strong. Now C13 (1pF) and C15 (100pF) form a 1:100 capacitive
        divider, so the ANT pad sees ~1% of the (already damped) tank
        voltage, and the wire is kept short: ≤ 20cm. Simulated total
        radiation (coil + wire) is ≥ 14 dB under the limit — a few metres
        of range to the FM-RX or any FM radio. Only a field-strength
        measurement can confirm compliance; don't lengthen the wire. */}

    <Cap name="C13" capacitance="1pF" pcbX={36.83} pcbY={-7.62} schX={8} schY={9} />
    <Cap name="C15" capacitance="100pF" pcbX={39.37} pcbY={-12.7} schX={9} schY={7.5} />
    <AntennaPad name="ANT1" pcbX={41.91} pcbY={-5.08} schX={10} schY={9} />

    <trace from=".C13 > .pin1" to="net.TANK" />
    <trace from=".C13 > .pin2" to="net.ANTX" />
    <trace from=".C15 > .pin1" to="net.ANTX" />
    <trace from=".C15 > .pin2" to="net.GND" />
    <trace from=".ANT1 > .ANT" to="net.ANTX" />

    {/* ═══════════════════════ §7 SILKSCREEN MANUAL ═══════════════════════
        The board labels itself: what each knob/pad does, the transistor
        orientation trick, and the coil winding spec where it matters. */}

    <silkscreentext text="FM-TX" pcbX={0} pcbY={26.67} fontSize="1.6mm" />
    <silkscreentext text="MIC" pcbX={-36} pcbY={13} fontSize="1.2mm" />
    <silkscreentext text="AUX" pcbX={-36} pcbY={-8} fontSize="1.2mm" />
    <silkscreentext text="TUNE" pcbX={30.48} pcbY={19.5} fontSize="1.2mm" />
    <silkscreentext text="L1: 3T ON 5MM FORM" pcbX={36} pcbY={7.5} fontSize="1.0mm" />
    <silkscreentext text="ANT: MAX 20CM WIRE" pcbX={33} pcbY={-17.5} fontSize="1.1mm" />
    <silkscreentext text="DEV" pcbX={5.08} pcbY={-16.8} fontSize="1.2mm" />
    <silkscreentext text="+" pcbX={-43.18} pcbY={-19} fontSize="1.2mm" />
    <silkscreentext text="9V" pcbX={-40.64} pcbY={-19} fontSize="1.2mm" />
    <silkscreentext text="-" pcbX={-38.1} pcbY={-19} fontSize="1.2mm" />
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
