/**
 * ═════════════════════════════════════════════════════════════════════════
 *  TRI-COLOR LAMP · CONTROLLER — designed in tscircuit
 * ═════════════════════════════════════════════════════════════════════════
 *  Run with:   npm install -g tscircuit   →   tsci dev controller/index.tsx
 *
 *  WHAT THIS IS
 *  The brain of a lamp that changes colour every time you flip the wall
 *  switch: blue → white → yellow → blue … exactly like the "3-colour"
 *  ceiling lamps sold everywhere, but low-voltage and built to be
 *  understood.
 *
 *    wall switch ─► certified 230/120 V → 12 V power supply ─► THIS BOARD ─► LED panel
 *                                                        (12 V)          (blue / white / yellow)
 *
 *  NOTHING ON THIS BOARD TOUCHES MAINS. A store-bought, safety-certified
 *  12 V supply (LED driver or wall adapter) does the dangerous part; this
 *  board only ever sees 12 V.
 *
 *  HOW IT KNOWS YOU FLIPPED THE SWITCH
 *  R2/R3 let the ATtiny85 measure the 12 V. A switched-off supply holds on
 *  for a moment and then sags, so the chip calls it "off" as soon as the
 *  12 V falls 1/8 below normal. It then keeps running from a 220 µF
 *  reservoir (C5) — ≥ 5 s worst case, ≈ 30 s typically — so it can time how
 *  long the power stays off:
 *    · power returns within 3 s  → a quick flip: next colour
 *    · off longer (or the reservoir ran flat) → a "long off": the MODE
 *      jumper decides — next colour (STEP), same colour (MEMORY) or blue
 *      (RESET)
 *  The current colour is kept in EEPROM (wear-levelled) so it survives any
 *  power-off.
 *
 *  ALL PARTS ARE THROUGH-HOLE (the chip sits in a socket).
 * ═════════════════════════════════════════════════════════════════════════
 */
import "@tscircuit/core"
import {
  Attiny85Dip,
  LogicMosfetTo220,
  Reg78L05,
  ResistorAxial,
  Schottky1N5819,
  Diode1N4148,
  CeramicCap,
  ElectrolyticCap,
  PtcFuse,
  ScrewTerminal,
  IspHeader,
  ModeJumper,
  MountingHole,
  FAB_RULES,
} from "../lib/parts"

export default () => (
  <board width="80mm" height="56mm" name="tricolor-controller" {...FAB_RULES}>
    {/* ═══════════════════════ §1 12 V INPUT ══════════════════════════════
        J1 takes 12 V from the power supply. F1, a resettable fuse
        (1.1 A hold / 2.2 A trip), opens on a short and recovers when it
        cools. D1 (1N5819 Schottky) blocks reverse polarity: wire the
        supply backwards and nothing happens (0.4 V drop, 0.4 W at 1 A).
        C1 (470 µF) smooths the supply and absorbs the LEDs' switching. */}
    <ScrewTerminal name="J1" labels={["VIN", "GNDIN"]} wiresFrom="top" pcbX={-28.5} pcbY={19} schX={-16} schY={9} />
    <PtcFuse name="F1" mpn="MF-R110" pcbX={-15} pcbY={22} schX={-12.5} schY={9.6} />
    <Schottky1N5819 name="D1" pcbX={-15} pcbY={17} schX={-9.5} schY={9.6} />
    <ElectrolyticCap name="C1" capacitance="470uF" diameter={10} pitch={5} mpn="EEU-FR1E471" pcbX={-1.5} pcbY={19} schX={-7} schY={7.6} />
    <CeramicCap name="C2" capacitance="100nF" pcbX={-15} pcbY={11.5} schX={-5.5} schY={7.6} />

    <trace from=".J1 > .VIN" to=".F1 > .A" width="0.8mm" />
    <trace from=".F1 > .B" to=".D1 > .anode" width="0.8mm" />
    <trace from=".D1 > .cathode" to="net.V12" width="0.8mm" />
    <trace from=".J1 > .GNDIN" to="net.GND" />
    <trace from=".C1 > .pin1" to="net.V12" />
    <trace from=".C1 > .pin2" to="net.GND" />
    <trace from=".C2 > .pin1" to="net.V12" />
    <trace from=".C2 > .pin2" to="net.GND" />

    {/* ═══════════════════════ §2 5 V FOR THE CHIP, AND ITS MEMORY CAP ════
        U1 (78L05) makes 5 V for the microcontroller (it draws ~1 mA, so the
        regulator only drops ~7 mW). D2 (1N4148) then feeds VCC (≈ 4.4 V) —
        and, crucially, stops C5 from discharging back into the regulator
        when the 12 V goes away. With the chip asleep (≈ 15 µA typical,
        ≤ 45 µA worst case), C5 (220 µF) keeps it running down to its 2.7 V
        brown-out level for ≈ 30 s (≥ 5 s worst case): long enough to time
        a switch flip. */}
    <Reg78L05 name="U1" pcbX={11} pcbY={21.5} schX={-1} schY={9.6} />
    <CeramicCap name="C3" capacitance="330nF" pcbX={8.5} pcbY={15} schX={-4} schY={7.6} />
    <CeramicCap name="C4" capacitance="100nF" pcbX={14.5} pcbY={15} schX={1.5} schY={7.6} />
    <Diode1N4148 name="D2" pcbX={24} pcbY={21.5} schX={4} schY={9.6} />
    <ElectrolyticCap name="C5" capacitance="220uF" diameter={6.3} pitch={2.5} mpn="EEU-FR1A221" pcbX={33} pcbY={15} schX={6.5} schY={7.6} />

    <trace from=".U1 > .IN" to="net.V12" />
    <trace from=".U1 > .GND" to="net.GND" />
    <trace from=".U1 > .OUT" to="net.VREG" />
    <trace from=".C3 > .pin1" to="net.V12" />
    <trace from=".C3 > .pin2" to="net.GND" />
    <trace from=".C4 > .pin1" to="net.VREG" />
    <trace from=".C4 > .pin2" to="net.GND" />
    <trace from=".D2 > .anode" to="net.VREG" />
    <trace from=".D2 > .cathode" to="net.VCC" />
    <trace from=".C5 > .pin1" to="net.VCC" />
    <trace from=".C5 > .pin2" to="net.GND" />

    {/* ═══════════════════════ §3 THE BRAIN: ATtiny85 ═════════════════════
        PB3 ← SENSE: R2/R3 scale the 12 V down to ≈ 2.9 V for the chip's
              ADC (ADC3), which measures it against VCC: 12 V reads ≈ 670
              of 1023. C7 filters switching noise.
        PB2 ← MODE (J3 + R4/R5/R6, below)
        PB0, PB1, PB4 → the three LED channels (§5)
        RESET has R1 to VCC; J2 is the standard 6-pin AVR ISP header.
        C6 decouples VCC right at the chip. */}
    <Attiny85Dip name="U2" pcbX={12} pcbY={0} schX={3.5} schY={1} />
    <CeramicCap name="C6" capacitance="100nF" pcbX={21} pcbY={6} schX={7.5} schY={3.8} />
    <ResistorAxial name="R1" resistance="10k" pitch={7.62} pcbX={1} pcbY={4.5} schX={0.5} schY={3.8} />
    <ResistorAxial name="R2" resistance="100k" pitch={7.62} pcbX={1} pcbY={0} schX={-2.5} schY={2} schRotation={90} />
    <ResistorAxial name="R3" resistance="33k" pitch={7.62} pcbX={1} pcbY={-4.5} schX={-2.5} schY={-0.6} schRotation={90} />
    <CeramicCap name="C7" capacitance="10nF" pcbX={-8} pcbY={0} schX={-1} schY={-0.6} schRotation={90} />
    <IspHeader name="J2" pcbX={31} pcbY={5} schX={11.5} schY={3.2} />

    <trace from=".U2 > .VCC" to="net.VCC" />
    <trace from=".U2 > .GND" to="net.GND" />
    <trace from=".C6 > .pin1" to="net.VCC" />
    <trace from=".C6 > .pin2" to="net.GND" />
    <trace from=".U2 > .RESET" to="net.RST" />
    <trace from=".R1 > .pin1" to="net.VCC" />
    <trace from=".R1 > .pin2" to="net.RST" />
    <trace from=".R2 > .pin1" to="net.V12" />
    <trace from=".R2 > .pin2" to="net.SENSE" />
    <trace from=".R3 > .pin1" to="net.SENSE" />
    <trace from=".R3 > .pin2" to="net.GND" />
    <trace from=".C7 > .pin1" to="net.SENSE" />
    <trace from=".C7 > .pin2" to="net.GND" />
    <trace from=".U2 > .PB3" to="net.SENSE" />
    <trace from=".J2 > .MISO" to="net.G2" />
    <trace from=".J2 > .VCC" to="net.VCC" />
    <trace from=".J2 > .SCK" to="net.MODE" />
    <trace from=".J2 > .MOSI" to="net.G1" />
    <trace from=".J2 > .RESET" to="net.RST" />
    <trace from=".J2 > .GND" to="net.GND" />

    {/* ═══════════════════════ §4 MODE JUMPER ═════════════════════════════
        What a LONG power-off does (a quick flip always steps the colour):
          no jumper        → STEP:   every power-on steps (the classic lamp)
          jumper LO (GND)  → MEMORY: comes back in the last colour
          jumper HI (VCC)  → RESET:  comes back blue
        R4/R5 (1 M each) hold PB2 at VCC/2 when no jumper is fitted; the
        ADC reads which third of the range it's in. R6 (10 k) keeps a fitted
        jumper from shorting the programmer's SCK line; C8 gives the ADC a
        low-impedance source (10 nF: settles in ≈ 25 ms, yet barely slows
        the programmer's SCK edges). Read once at power-up. */}
    <ModeJumper name="J3" pcbX={31} pcbY={-1} schX={12.5} schY={-1.2} />
    <ResistorAxial name="R6" resistance="10k" pitch={2.54} pcbX={21} pcbY={-1} schX={10} schY={-1.2} />
    <ResistorAxial name="R4" resistance="1M" pitch={2.54} pcbX={21} pcbY={-5} schX={8.5} schY={-3.2} />
    <ResistorAxial name="R5" resistance="1M" pitch={2.54} pcbX={27.5} pcbY={-5} schX={10} schY={-3.2} />
    <CeramicCap name="C8" capacitance="10nF" pcbX={33.5} pcbY={-6} schX={11.5} schY={-3.2} />

    <trace from=".U2 > .PB2" to="net.MODE" />
    <trace from=".R4 > .pin1" to="net.VCC" />
    <trace from=".R4 > .pin2" to="net.MODE" />
    <trace from=".R5 > .pin1" to="net.MODE" />
    <trace from=".R5 > .pin2" to="net.GND" />
    <trace from=".C8 > .pin1" to="net.MODE" />
    <trace from=".C8 > .pin2" to="net.GND" />
    <trace from=".R6 > .pin1" to="net.MODE" />
    <trace from=".R6 > .pin2" to=".J3 > .MID" />
    <trace from=".J3 > .LO" to="net.GND" />
    <trace from=".J3 > .HI" to="net.VCC" />

    {/* ═══════════════════════ §5 THE THREE LED CHANNELS ══════════════════
        Each colour is switched on its NEGATIVE side by a logic-level MOSFET
        (IRLZ44N: 25 mΩ when its gate sees ≥ 4 V). The LEDs' + side sits on
        12 V permanently (J4 pin "+12V"), so a channel is ON when the chip
        drives that gate HIGH.
          · R7-R9 (100 Ω) soften the gate edges; R10-R12 (100 k) hold the
            gates LOW — LEDs off — whenever the chip is in reset, being
            programmed or unpowered.
          · The firmware fades each colour in over 0.3 s (blinking it
            ~1300 times a second, on for longer and longer), then holds the
            MOSFET fully on (no switching losses).
          · Rated 1 A in total (the fuse and D1 set that): the LED panel
            draws ≈ 0.1 A; 12 V LED strip up to ≈ 12 W works too. */}
    <LogicMosfetTo220 name="Q1" pcbX={-22} pcbY={-20} schX={-10} schY={-7} />
    <LogicMosfetTo220 name="Q2" pcbX={-8} pcbY={-20} schX={-5} schY={-7} />
    <LogicMosfetTo220 name="Q3" pcbX={6} pcbY={-20} schX={0} schY={-7} />
    <ResistorAxial name="R7" resistance="100ohm" pitch={7.62} pcbX={-22} pcbY={-12} schX={-12.5} schY={-5.6} />
    <ResistorAxial name="R8" resistance="100ohm" pitch={7.62} pcbX={-8} pcbY={-12} schX={-7.5} schY={-5.6} />
    <ResistorAxial name="R9" resistance="100ohm" pitch={7.62} pcbX={6} pcbY={-12} schX={-2.5} schY={-5.6} />
    <ResistorAxial name="R10" resistance="100k" pitch={7.62} pcbX={-22} pcbY={-8} schX={-11.5} schY={-9.6} />
    <ResistorAxial name="R11" resistance="100k" pitch={7.62} pcbX={-8} pcbY={-8} schX={-6.5} schY={-9.6} />
    <ResistorAxial name="R12" resistance="100k" pitch={7.62} pcbX={6} pcbY={-8} schX={-1.5} schY={-9.6} />
    <ScrewTerminal name="J4" labels={["V12OUT", "BLUE", "WHITE", "YELLOW"]} pcbX={23.5} pcbY={-19} schX={4.5} schY={-8} />

    <trace from=".U2 > .PB0" to="net.G1" />
    <trace from=".U2 > .PB1" to="net.G2" />
    <trace from=".U2 > .PB4" to="net.G3" />
    <trace from=".R7 > .pin1" to="net.G1" />
    <trace from=".R8 > .pin1" to="net.G2" />
    <trace from=".R9 > .pin1" to="net.G3" />
    <trace from=".R7 > .pin2" to="net.GATE1" />
    <trace from=".R8 > .pin2" to="net.GATE2" />
    <trace from=".R9 > .pin2" to="net.GATE3" />
    <trace from=".Q1 > .gate" to="net.GATE1" />
    <trace from=".Q2 > .gate" to="net.GATE2" />
    <trace from=".Q3 > .gate" to="net.GATE3" />
    <trace from=".R10 > .pin1" to="net.GATE1" />
    <trace from=".R11 > .pin1" to="net.GATE2" />
    <trace from=".R12 > .pin1" to="net.GATE3" />
    <trace from=".R10 > .pin2" to="net.GND" />
    <trace from=".R11 > .pin2" to="net.GND" />
    <trace from=".R12 > .pin2" to="net.GND" />
    <trace from=".Q1 > .source" to="net.GND" />
    <trace from=".Q2 > .source" to="net.GND" />
    <trace from=".Q3 > .source" to="net.GND" />
    <trace from=".Q1 > .drain" to="net.BLUE_N" width="0.8mm" />
    <trace from=".Q2 > .drain" to="net.WHITE_N" width="0.8mm" />
    <trace from=".Q3 > .drain" to="net.YELLOW_N" width="0.8mm" />
    <trace from=".J4 > .BLUE" to="net.BLUE_N" width="0.8mm" />
    <trace from=".J4 > .WHITE" to="net.WHITE_N" width="0.8mm" />
    <trace from=".J4 > .YELLOW" to="net.YELLOW_N" width="0.8mm" />
    <trace from=".J4 > .V12OUT" to="net.V12" width="0.8mm" />

    {/* ═══════════════════════ §6 LABELS, HOLES, GROUND ═══════════════════ */}
    <MountingHole name="H1" pcbX={-36} pcbY={24} />
    <MountingHole name="H2" pcbX={36} pcbY={24} />
    <MountingHole name="H3" pcbX={-36} pcbY={-24} />
    <MountingHole name="H4" pcbX={36} pcbY={-24} />
    <silkscreentext text="12V IN" pcbX={-28.5} pcbY={25} fontSize="1.2mm" />
    <silkscreentext text="+" pcbX={-31.04} pcbY={13.6} fontSize="1.4mm" />
    <silkscreentext text="-" pcbX={-25.96} pcbY={13.6} fontSize="1.4mm" />
    <silkscreentext text="+12V  BLUE  WHITE  YELLOW" pcbX={23.5} pcbY={-25.2} fontSize="1mm" />
    <silkscreentext text="MEM  open=STEP  RESET" pcbX={31} pcbY={1.85} fontSize="0.7mm" />
    <silkscreentext text="MODE" pcbX={31} pcbY={-3.1} fontSize="0.8mm" />
    <silkscreentext text="ISP" pcbX={31} pcbY={8.7} fontSize="1mm" />
    <silkscreentext text="TRI-COLOR LAMP CONTROLLER" pcbX={-12} pcbY={26} fontSize="1.2mm" />
    <silkscreentext text="BLUE" pcbX={-22} pcbY={-25.4} fontSize="1mm" />
    <silkscreentext text="WHITE" pcbX={-8} pcbY={-25.4} fontSize="1mm" />
    <silkscreentext text="YELLOW" pcbX={6} pcbY={-25.4} fontSize="1mm" />
    <copperpour connectsTo="net.GND" layer="bottom" padMargin="0.4mm" boardEdgeMargin="0.5mm" useThermalReliefs />
  </board>
)
