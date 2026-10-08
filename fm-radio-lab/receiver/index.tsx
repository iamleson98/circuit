/**
 * ═════════════════════════════════════════════════════════════════════════
 *  FM RADIO LAB · FM RECEIVER ("FM-RX") — designed in tscircuit
 * ═════════════════════════════════════════════════════════════════════════
 *  Run with:   npm install -g tscircuit   →   tsci dev receiver/index.tsx
 *  (or paste the standalone copy in standalone/ into snippets.tscircuit.com)
 *
 *  WHAT THIS IS
 *  A four-transistor SUPER-REGENERATIVE receiver for the FM broadcast band
 *  (88-108 MHz) — the simplest receiver architecture with real sensitivity
 *  at these frequencies, and the classic first-VHF-radio design:
 *
 *    wire → ┌ detector Q1 ─┐→ 2-pole audio filter → volume → audio amp Q4
 *           │ THE TX CORE  │                              → earphone
 *           └ strangled by ┘
 *           └ quench astable Q2+Q3 (50 kHz)
 *
 *  THE RECEIVER IS THE TRANSMITTER
 *  Q1 is the SAME common-base Colpitts oscillator as the FM-TX — same
 *  coil, same trimmer, same 22p/47p feedback divider, same 15k/3.9k base
 *  divider. Open transmitter/index.tsx side by side and compare: the RF
 *  core is line-for-line identical. The difference is one thing — WHO
 *  feeds the base. On the TX the divider sets a steady bias and the
 *  oscillator runs forever. Here, R10 (4.7k from the quench oscillator)
 *  and R11 (1k to ground) join the divider, and the quench oscillator
 *  GATES that bias ~50,000 times a second:
 *
 *    astable LOW  (12.5µs) → V_B ≈ 0.42V → Q1 cut off hard. DEAD.
 *    astable RAMP (7.6µs)  → V_B sweeps up through ≈1.3V — the loop gain
 *                            crosses 1 and a burst IGNITES, seeded by
 *                            whatever rides the tank: thermal noise
 *                            (the HISS) or a carrier (QUIETING + audio).
 *                            The burst grows for ~1-2µs — a µV seed
 *                            becomes a 2-volt burst: gain in TIME, the
 *                            10⁴-10⁶ amplification of super-regeneration
 *                            from ONE transistor.
 *    …then the astable drops again. Repeat. Ultrasonic — you hear none
 *    of it, only the audio it carries.
 *
 *  WHY EXTERNAL QUENCH (the design lesson this board teaches)
 *  Armstrong's original super-regens self-quenched — the oscillator's own
 *  rectified grid current slowly strangled it. A BJT cannot copy that
 *  trick: its rectified base current pushes the base UP (anti-quenching —
 *  the grid-leak story inverts for transistors), and an emitter-side
 *  quench capacitor would short-circuit the Colpitts feedback divider
 *  (a nF cap is 0.2Ω at 98 MHz; the divider's 47pF leg is 345Ω). So the
 *  factory answer — used by every production super-regen since the 1940s
 *  — is a SEPARATE oscillator doing the strangling, deterministically,
 *  at a frequency you choose. Q2+Q3 are a textbook astable multivibrator:
 *  T = 0.693·(R9·C8 + R8·C7) ≈ 20µs, and Q2's collector waveform — snap
 *  down, long low, exponential rise — is exactly the "smooth ramp, sharp
 *  drop" shape the super-regen literature prescribes.
 *
 *  THE FM TRICK — SLOPE DETECTION
 *  A super-regen is natively an AM detector. To hear FM, tune the TUNE
 *  trimmer slightly OFF the station: on the tank's response slope, the
 *  station's ±75kHz frequency wobble becomes an amplitude wobble, every
 *  burst's seed wobbles with it, and the burst envelope carries the
 *  audio. Tune a hair high or a hair low (both work — opposite polarity).
 *  THE SILENCE IS THE SIGNAL: sweep TUNE across a live carrier and the
 *  loud hiss collapses into the station — the carrier seeds every
 *  regrowth and there's nothing left to hiss about. That quieting
 *  "thump" is the sound of radio-wave capture.
 *
 *  PROVEN, NOT HOPED
 *  calc/sim_fm.mjs integrates this exact detector (RK4, Ebers-Moll with
 *  voltage-dependent junction capacitances, the honest α=0.67 for a
 *  2N2222A at 98MHz): 21/21 machine-checked assertions. The detector
 *  bursts exactly once per quench cycle, a carrier measurably captures
 *  the burst pattern (quieting), and a broadcast-grade ±75kHz FM signal
 *  is slope-detected end-to-end at 21× the noise floor. calc/circuit_
 *  math.mjs re-derives every bias point and budget: 37/37.
 *
 *  HOW TO READ THIS FILE
 *  One flat netlist organized like the schematic pages of a real radio:
 *  power → antenna+tank → detector → quench astable → audio → earphone.
 *  Every wire is an explicit <trace />.
 *
 *  ALL PARTS ARE THROUGH-HOLE on a 0.1" (2.54mm) grid.
 */
import "@tscircuit/core"
import {
  Battery9V,
  PowerSwitch,
  AirCoil,
  TrimmerCap,
  VolumePot,
  AntennaPad,
  EarTerm,
  NpnTo92,
} from "../lib/parts"

export default () => (
  <board width="99.06mm" height="88.9mm" name="fm-rx">
    {/* ═══════════════════════ §1 POWER ENTRY ═════════════════════════════
        9V battery → slide switch → the V9 rail. C1 (47µF) bulk, C2 (100nF)
        fast decoupling, LED1 + R1 power light (~3mA). The astable and the
        detector both draw pulses from this rail — the local decouplers in
        §3/§4 keep those pulses local. */}

    <Battery9V name="BT1" pcbX={-40.64} pcbY={-38.1} schX={-16} schY={-8} />
    <PowerSwitch name="SW1" pcbX={-27.94} pcbY={-38.1} schX={-12} schY={-8} />
    <capacitor name="C1" capacitance="47uF" footprint="radial_p5mm" pcbX={-40.64} pcbY={-27.94} schX={-15} schY={-4} />
    <capacitor name="C2" capacitance="100nF" footprint="radial_p2.54mm" pcbX={-36.83} pcbY={-19.05} schX={-12} schY={-4} />
    <led name="LED1" color="green" footprint="radial_p2.54mm" pcbX={-44.45} pcbY={-19.05} schX={-8} schY={-8} />
    <resistor name="R1" resistance="2.2kohm" footprint="axial_p10.16mm" pcbX={-40.64} pcbY={-12.7} schX={-6} schY={-8} />

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

    {/* ═══════════════════════ §2 ANTENNA + TANK ══════════════════════════
        30-75cm of wire couples into the tank through C3 (3.3pF) — loose
        coupling on purpose: the signal gets IN without dragging the tank
        around (if you change antenna length, retune).
        The tank is THE MIRROR IMAGE of the transmitter's: the same 3-turn
        5mm-form air coil (≈60nH) resonates with the trimmer, strays, and
        the transistor's junction caps. TRIM1 (5-30pF directly across the
        tank) is YOUR TUNE KNOB — turn it and the receiver's window slides
        across the FM band hunting for the transmitter. C15/C16 give the
        coil's supply end a proper RF ground. */}

    <AntennaPad name="ANT1" pcbX={-44.45} pcbY={21.59} schX={-18} schY={10} />
    <capacitor name="C3" capacitance="3.3pF" footprint="radial_p2.54mm" pcbX={-44.45} pcbY={12.7} schX={-16} schY={10} />
    <AirCoil name="L1" pcbX={-34.29} pcbY={12.7} schX={-14} schY={12} />
    <TrimmerCap name="TRIM1" pcbX={-34.29} pcbY={30.48} schX={-14} schY={15} />
    <capacitor name="C15" capacitance="100nF" footprint="radial_p2.54mm" pcbX={-25.4} pcbY={19.05} schX={-16} schY={13} />
    <capacitor name="C16" capacitance="1nF" footprint="radial_p2.54mm" pcbX={-19.05} pcbY={30.48} schX={-16} schY={11} />

    <trace from=".ANT1 > .ANT" to=".C3 > .pin1" />
    <trace from=".C3 > .pin2" to="net.TANK" />
    <trace from=".L1 > .pin1" to="net.TANK" />
    <trace from=".L1 > .pin2" to="net.V9" />
    <trace from=".TRIM1 > .A" to="net.TANK" />
    <trace from=".TRIM1 > .B" to="net.GND" />
    <trace from=".C15 > .pin1" to="net.V9" />
    <trace from=".C15 > .pin2" to="net.GND" />
    <trace from=".C16 > .pin1" to="net.V9" />
    <trace from=".C16 > .pin2" to="net.GND" />

    {/* ═══════════════════════ §3 SUPER-REGENERATIVE DETECTOR (Q1) ════════
        The star of the show — the transmitter's oscillator core:
        · R2 (15k) / R3 (3.9k): the SAME bias divider as the TX.
        · C4 (220pF): the base's RF ground — small enough (14.5kΩ at the
          50kHz quench rate) that it does NOT shunt the quench feed.
        · R4 (470Ω) sets the emitter current ~2mA; C5 (47pF) grounds the
          emitter at RF; C6 (22pF) feeds a slice of the tank swing back —
          the same 22p/47p feedback divider as the TX. Compare §5 of
          transmitter/index.tsx!
        · With R10/R11 (§4) joining the base, V_B toggles between ≈0.42V
          (dead) and ≈1.6V (oscillating) as the astable swings.
        · The detected audio rides Q1's emitter (the rectified burst
          envelope) — §5 listens there. */}

    <NpnTo92 name="Q1" pcbX={-12.7} pcbY={12.7} schX={-9} schY={10} />
    <resistor name="R2" resistance="15kohm" footprint="axial_p10.16mm" pcbX={-19.05} pcbY={38.1} schX={-9} schY={13} />
    <resistor name="R3" resistance="3.9kohm" footprint="axial_p10.16mm" pcbX={-22.86} pcbY={5.08} schX={-10.5} schY={7} />
    <capacitor name="C4" capacitance="220pF" footprint="radial_p2.54mm" pcbX={-12.7} pcbY={2.54} schX={-13} schY={7} />
    <resistor name="R4" resistance="470ohm" footprint="axial_p10.16mm" pcbX={-22.86} pcbY={-5.08} schX={-7} schY={7} />
    <capacitor name="C5" capacitance="47pF" footprint="radial_p2.54mm" pcbX={-12.7} pcbY={-5.08} schX={-5} schY={7} />
    <capacitor name="C6" capacitance="22pF" footprint="radial_p2.54mm" pcbX={-5.08} pcbY={-5.08} schX={-11} schY={12} />

    <trace from=".R2 > .pin1" to="net.V9" />
    <trace from=".R2 > .pin2" to="net.OSCB" />
    <trace from=".Q1 > .base" to="net.OSCB" />
    <trace from=".R3 > .pin1" to="net.OSCB" />
    <trace from=".R3 > .pin2" to="net.GND" />
    <trace from=".C4 > .pin1" to="net.OSCB" />
    <trace from=".C4 > .pin2" to="net.GND" />
    <trace from=".Q1 > .collector" to="net.TANK" />
    <trace from=".Q1 > .emitter" to="net.RFE" />
    <trace from=".R4 > .pin1" to="net.RFE" />
    <trace from=".R4 > .pin2" to="net.GND" />
    <trace from=".C5 > .pin1" to="net.RFE" />
    <trace from=".C5 > .pin2" to="net.GND" />
    <trace from=".C6 > .pin1" to="net.TANK" />
    <trace from=".C6 > .pin2" to="net.RFE" />

    {/* ═══════════════════════ §4 THE QUENCH ASTABLE (Q2, Q3) ═════════════
        The strangler — a textbook two-transistor astable multivibrator:
          · Q2's ON time (the KILL phase, collector LOW):  0.693·R9·C8 ≈ 12.5µs
          · Q3's ON time (the RISE phase, Q2's collector ramps): 0.693·R8·C7 ≈ 7.6µs
          · period ≈ 20.1µs → f_quench ≈ 49.7kHz — ultrasonic
          · Q2's collector rises with τ = R5·C7 ≈ 4.7µs — the smooth ramp
        Its output (Q2's collector) feeds Q1's base through R10 (4.7k);
        R11 (1k, base to ground) completes the divider so V_B toggles
        0.42V ↔ 1.6V. C17/C18 decouple the astable's current pulses.
        The tutorial's Super-Regen chapter walks the whole cycle on a
        simulation plot — burst, collapse, quiet, ramp, ignition. */}

    <NpnTo92 name="Q2" pcbX={-15.24} pcbY={-20.32} schX={3} schY={1} />
    <NpnTo92 name="Q3" pcbX={-1.27} pcbY={-20.32} schX={9} schY={1} />
    <resistor name="R5" resistance="4.7kohm" footprint="axial_p10.16mm" pcbX={-15.24} pcbY={-33.02} schX={2} schY={4} />
    <resistor name="R6" resistance="4.7kohm" footprint="axial_p10.16mm" pcbX={-1.27} pcbY={-33.02} schX={10} schY={4} />
    <capacitor name="C7" capacitance="1nF" footprint="radial_p2.54mm" pcbX={-6.35} pcbY={-26.67} schX={6.5} schY={4} />
    <capacitor name="C8" capacitance="1nF" footprint="radial_p2.54mm" pcbX={-8.89} pcbY={-12.7} schX={5.5} schY={-1} />
    <resistor name="R9" resistance="18kohm" footprint="axial_p10.16mm" pcbX={-19.05} pcbY={-13.97} schX={3} schY={-2} />
    <resistor name="R8" resistance="11kohm" footprint="axial_p10.16mm" pcbX={1.27} pcbY={-11.43} schX={9} schY={-2} />
    <resistor name="R10" resistance="4.7kohm" footprint="axial_p10.16mm" pcbX={-24.13} pcbY={-27.94} schX={0} schY={4} />
    <resistor name="R11" resistance="1kohm" footprint="axial_p10.16mm" pcbX={-26.67} pcbY={-21.59} schX={-3} schY={4} />

    <trace from=".R5 > .pin1" to="net.V9" />
    <trace from=".R5 > .pin2" to="net.Q2C" />
    <trace from=".Q2 > .collector" to="net.Q2C" />
    <trace from=".R6 > .pin1" to="net.V9" />
    <trace from=".R6 > .pin2" to="net.Q3C" />
    <trace from=".Q3 > .collector" to="net.Q3C" />
    <trace from=".C7 > .pin1" to="net.Q2C" />
    <trace from=".C7 > .pin2" to="net.Q3B" />
    <trace from=".Q3 > .base" to="net.Q3B" />
    <trace from=".R8 > .pin1" to="net.V9" />
    <trace from=".R8 > .pin2" to="net.Q3B" />
    <trace from=".C8 > .pin1" to="net.Q3C" />
    <trace from=".C8 > .pin2" to="net.Q2B" />
    <trace from=".Q2 > .base" to="net.Q2B" />
    <trace from=".R9 > .pin1" to="net.V9" />
    <trace from=".R9 > .pin2" to="net.Q2B" />
    <trace from=".Q2 > .emitter" to="net.GND" />
    <trace from=".Q3 > .emitter" to="net.GND" />
    <trace from=".R10 > .pin1" to="net.Q2C" />
    <trace from=".R10 > .pin2" to="net.OSCB" />
    <trace from=".R11 > .pin1" to="net.OSCB" />
    <trace from=".R11 > .pin2" to="net.GND" />

    {/* ═══════════════════════ §5 AUDIO: FILTER → VOLUME → AMP ════════════
        Q1's emitter carries the recovered audio (the rectified burst
        envelope) — buried under 50kHz quench residue. R12+C9 and R13+C10
        (two poles at 3.4kHz) knock the quench down −47dB while speech-band
        audio passes cleanly, into the volume pot. The wiper feeds Q4, a
        clean class-A common-emitter amp (gain ≈ 5.7×, unbypassed emitter
        for linearity), which drives the earphone through C12. For 32Ω
        earbuds this is comfortable; a crystal earphone is louder. For a
        SPEAKER, add the LM386 stage from the AM radio-lab receiver —
        the tutorial's Upgrades page shows the wiring. */}

    <resistor name="R12" resistance="4.7kohm" footprint="axial_p10.16mm" pcbX={5.08} pcbY={12.7} schX={14} schY={8} />
    <capacitor name="C9" capacitance="10nF" footprint="radial_p2.54mm" pcbX={15.24} pcbY={6.35} schX={14} schY={5} />
    <resistor name="R13" resistance="4.7kohm" footprint="axial_p10.16mm" pcbX={20.32} pcbY={12.7} schX={16} schY={8} />
    <capacitor name="C10" capacitance="10nF" footprint="radial_p2.54mm" pcbX={22.86} pcbY={6.35} schX={16} schY={5} />
    <VolumePot name="RV1" pcbX={31.75} pcbY={12.7} schX={18} schY={8} />
    <capacitor name="C11" capacitance="100nF" footprint="radial_p2.54mm" pcbX={24.13} pcbY={24.13} schX={19} schY={11} />
    <NpnTo92 name="Q4" pcbX={33.02} pcbY={25.4} schX={21} schY={8} />
    <resistor name="R14" resistance="220kohm" footprint="axial_p10.16mm" pcbX={22.86} pcbY={40.64} schX={22} schY={11} />
    <resistor name="R15" resistance="47kohm" footprint="axial_p10.16mm" pcbX={36.83} pcbY={40.64} schX={23} schY={5} />
    <resistor name="R16" resistance="560ohm" footprint="axial_p10.16mm" pcbX={42.545} pcbY={12.7} schX={23} schY={8} />
    <resistor name="R17" resistance="3.3kohm" footprint="axial_p10.16mm" pcbX={35.56} pcbY={34.29} schX={19} schY={11} />
    <capacitor name="C12" capacitance="47uF" footprint="radial_p5mm" pcbX={43.18} pcbY={20.32} schX={25} schY={8} />

    <trace from=".R12 > .pin1" to="net.RFE" />
    <trace from=".R12 > .pin2" to="net.AF1" />
    <trace from=".C9 > .pin1" to="net.AF1" />
    <trace from=".C9 > .pin2" to="net.GND" />
    <trace from=".R13 > .pin1" to="net.AF1" />
    <trace from=".R13 > .pin2" to="net.AF2" />
    <trace from=".C10 > .pin1" to="net.AF2" />
    <trace from=".C10 > .pin2" to="net.GND" />
    <trace from=".RV1 > .pin1" to="net.AF2" />
    <trace from=".RV1 > .pin3" to="net.GND" />
    <trace from=".RV1 > .pin2" to=".C11 > .pin1" />
    <trace from=".C11 > .pin2" to="net.Q4B" />
    <trace from=".Q4 > .base" to="net.Q4B" />
    <trace from=".R14 > .pin1" to="net.V9" />
    <trace from=".R14 > .pin2" to="net.Q4B" />
    <trace from=".R15 > .pin1" to="net.Q4B" />
    <trace from=".R15 > .pin2" to="net.GND" />
    <trace from=".Q4 > .emitter" to=".R16 > .pin1" />
    <trace from=".R16 > .pin2" to="net.GND" />
    <trace from=".R17 > .pin1" to="net.V9" />
    <trace from=".R17 > .pin2" to="net.Q4C" />
    <trace from=".Q4 > .collector" to="net.Q4C" />
    <trace from=".C12 > .pin1" to="net.Q4C" />
    <trace from=".C12 > .pin2" to="net.EAR" />

    {/* ═══════════════════════ §6 EARPHONE ════════════════════════════════
        Crystal or high-impedance magnetic earphones work best; 32Ω
        earbuds work too (quieter). The recovered audio at the wiper is
        mV-scale — real radio, not hi-fi. Squelch the volume while
        tuning: the super-regen hiss between stations is LOUD. */}

    <EarTerm name="EAR1" pcbX={43.18} pcbY={3.81} schX={26} schY={8} />

    <trace from=".EAR1 > .TIP" to="net.EAR" />
    <trace from=".EAR1 > .SLE" to="net.GND" />

    {/* ═══════════════════════ §7 SILKSCREEN MANUAL ═══════════════════════ */}

    <silkscreentext text="FM-RX  SUPER-REGEN" pcbX={2} pcbY={42.5} fontSize="1.6mm" />
    <silkscreentext text="TUNE" pcbX={-34.29} pcbY={36.5} fontSize="1.2mm" />
    <silkscreentext text="L1: 3T ON 5MM FORM" pcbX={-34.29} pcbY={16.5} fontSize="1.0mm" />
    <silkscreentext text="ANT 30-75CM WIRE" pcbX={-43} pcbY={26.5} fontSize="1.1mm" />
    <silkscreentext text="VOL" pcbX={30.48} pcbY={17.5} fontSize="1.2mm" />
    <silkscreentext text="EAR" pcbX={43.18} pcbY={0.6} fontSize="1.2mm" />
    <silkscreentext text="9V" pcbX={-40.64} pcbY={-33.5} fontSize="1.2mm" />
    <silkscreentext text="ON" pcbX={-27.94} pcbY={-33.5} fontSize="1.2mm" />
    <silkscreentext text="Q1 RF: BC548/BC547 FLAT DOWN" pcbX={-12.7} pcbY={17} fontSize="1.1mm" />
    <silkscreentext text="2N2222A: ROTATE 180" pcbX={-12.7} pcbY={15} fontSize="1.1mm" />
    <silkscreentext text="QUENCH ASTABLE ~50KHZ" pcbX={-11} pcbY={-36.5} fontSize="1.1mm" />

    {/* ═══════════════════════ §8 GROUND POUR ═════════════════════════════
        Solid GND, bottom layer, thermal reliefs — same VHF practice as
        the transmitter. */}

    <copperpour
      connectsTo="net.GND"
      layer="bottom"
      padMargin="0.45mm"
      useThermalReliefs
    />
  </board>
)
