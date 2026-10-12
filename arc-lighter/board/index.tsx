/**
 * ═════════════════════════════════════════════════════════════════════════
 *  ARC LIGHTER — a rechargeable electric arc lighter, designed in tscircuit
 * ═════════════════════════════════════════════════════════════════════════
 *  Run with:   npm install -g tscircuit   →   tsci dev board/index.tsx
 *
 *  WHAT THIS IS
 *  A one-cell LiPo drives a small step-up coil hard enough to tear a
 *  continuous arc across a 3-5 mm air gap — hot enough to light paper or a
 *  candle wick, no fuel, no flame. It charges from micro-USB. The board is
 *  the whole lighter except the parts that live in the case: the cell, the
 *  slide LOCK switch, the FIRE button and the high-voltage coil.
 *
 *    micro-USB → MCP73831 charger → protected LiPo → LOCK switch →
 *       ATtiny85 (button, timeout, safety checks) → AO3401 power switch →
 *       FZT851 self-oscillating driver (current-limited) → coil → ~7-15 kV arc
 *
 *  THE HIGH VOLTAGE NEVER TOUCHES THIS BOARD
 *  The coil's two thin high-voltage leads go straight to the electrodes.
 *  Only the coil's low-voltage windings (primary + feedback, ≤ 40 V) are
 *  wired to the pads on the right-hand edge.
 *
 *  SAFETY, IN LAYERS (each one independent of the others)
 *   1. The cell must be a PROTECTED pack: its own PCM board disconnects it
 *      on over-charge (4.3 V), over-discharge (≈2.4 V), over-current
 *      (≈3 A) and short circuit.
 *   2. LOCK (a slide switch) cuts the battery from everything except the
 *      charger. Locked = nothing can arc, even with a firmware bug.
 *   3. The ATtiny85 only fires while FIRE is held, stops after 8 s, refuses
 *      while USB is plugged in or the cell is low, and shuts down within
 *      50 ms if the coil isn't oscillating (a mis-wired coil would
 *      otherwise sit at 2.6 A and cook the transistor).
 *   4. The driver limits its own peak current to ≈2.6 A per cycle (Q3 + RE),
 *      whatever the coil or transistor gain, and the TVS (D2) clamps the
 *      collector below the transistor's 60 V rating if the arc can't strike.
 *
 *  PROVEN, NOT HOPED
 *  calc/sim_driver.mjs simulates the driver straight from this routed board
 *  (vendor-style transistor models, a coupled-inductor coil model and a
 *  spark-gap model) across coil inductance 50-200 µH, turns ratio 250-600,
 *  coupling 0.95-0.98, both transistor gains and 3.2-4.2 V. calc/
 *  circuit_math.mjs checks every bias point, and firmware/test exercises the
 *  safety logic on your computer.
 * ═════════════════════════════════════════════════════════════════════════
 */
import "@tscircuit/core"
import { UsbMicroB, USB_MICRO_B_EDGE_OFFSET_MM } from "../lib/usb-micro-b"
import {
  Attiny85,
  Mcp73831,
  Ao3401,
  Bc847,
  Fzt851,
  SchottkySma,
  TvsSmc,
  Led0805,
  WirePad,
  IspHeader,
  FAB_RULES,
} from "../lib/parts"

// Diodes and LEDs with hand-made footprints answer to pin1 (= anode) and
// pin2 (= cathode) only; tscircuit keeps the anode/cathode aliases just for
// its stock footprints. Transistors/MOSFETs keep collector/base/emitter and
// drain/source/gate.
const BOARD_W = 60
const BOARD_H = 30

export default () => (
  <board width={`${BOARD_W}mm`} height={`${BOARD_H}mm`} name="arc-lighter" {...FAB_RULES}>
    {/* ═══════════════════════ §1 USB CHARGING ════════════════════════════
        Micro-USB delivers 5 V (VBUS). The MCP73831 is a complete Li-ion
        charger in a SOT-23-5: constant current, then constant voltage at
        4.20 V ±0.75 %, then it stops. R1 sets the current:
        I = 1000 V / R1 = 1000 / 4.7k ≈ 213 mA — about 0.5-0.7 C for a
        300-400 mAh lighter cell, a gentle full charge in ~2 h.
        STAT pulls low while charging (LED1 red lights from VBUS) and goes
        high when done (LED2 green lights to GND). The charger feeds the
        cell directly — upstream of LOCK — so the lighter charges while
        locked. D+/D−/ID are unused: this port only takes power. */}
    <UsbMicroB name="J1" pcbX={-BOARD_W / 2 + USB_MICRO_B_EDGE_OFFSET_MM} pcbY={5} schX={-17} schY={9} />
    <Mcp73831 name="U1" pcbX={-19.5} pcbY={8.5} schX={-11} schY={9} />
    <capacitor name="C1" capacitance="4.7uF" footprint="0805" pcbX={-23.5} pcbY={12.8} schX={-14} schY={6} />
    <capacitor name="C2" capacitance="4.7uF" footprint="0805" pcbX={-15.5} pcbY={12.8} schX={-8} schY={6} />
    <resistor name="R1" resistance="4.7k" footprint="0805" pcbX={-19.5} pcbY={12.8} schX={-11} schY={6} />
    <resistor name="R2" resistance="1k" footprint="0805" pcbX={-25.5} pcbY={-5.6} schX={-8} schY={12} />
    <Led0805 name="LED1" color="red" pcbX={-25.5} pcbY={-9.0} schX={-6} schY={12} />
    <resistor name="R3" resistance="1k" footprint="0805" pcbX={-21.5} pcbY={-5.6} schX={-4} schY={10.5} />
    <Led0805 name="LED2" color="green" pcbX={-21.5} pcbY={-9.0} schX={-2} schY={10.5} />

    <trace from=".J1 > .VBUS" to="net.VBUS" />
    <trace from=".J1 > .GND" to="net.GND" />
    <trace from=".J1 > .SHIELD1" to="net.GND" />
    <trace from=".J1 > .SHIELD2" to="net.GND" />
    <trace from=".J1 > .SHIELD3" to="net.GND" />
    <trace from=".J1 > .SHIELD4" to="net.GND" />
    <trace from=".J1 > .SHIELD5" to="net.GND" />
    <trace from=".J1 > .SHIELD6" to="net.GND" />
    <trace from=".U1 > .VDD" to="net.VBUS" />
    <trace from=".U1 > .VSS" to="net.GND" />
    <trace from=".U1 > .VBAT" to="net.BAT" />
    <trace from=".U1 > .PROG" to=".R1 > .pin1" />
    <trace from=".R1 > .pin2" to="net.GND" />
    <trace from=".C1 > .pin1" to="net.VBUS" />
    <trace from=".C1 > .pin2" to="net.GND" />
    <trace from=".C2 > .pin1" to="net.BAT" />
    <trace from=".C2 > .pin2" to="net.GND" />
    <trace from=".U1 > .STAT" to="net.STAT" />
    <trace from=".R2 > .pin1" to="net.VBUS" />
    <trace from=".R2 > .pin2" to=".LED1 > .pin1" />
    <trace from=".LED1 > .pin2" to="net.STAT" />
    <trace from=".R3 > .pin1" to="net.STAT" />
    <trace from=".R3 > .pin2" to=".LED2 > .pin1" />
    <trace from=".LED2 > .pin2" to="net.GND" />

    {/* ═══════════════════════ §2 BATTERY AND LOCK ════════════════════════
        BAT+/BAT− take a PROTECTED 1-cell LiPo (300-600 mAh, rated ≥ 3 A
        continuous). LOCK is a slide switch wired between the two LOCK
        pads: closed = armed. Everything after it (the VARM net) is dead
        while locked, so a locked lighter cannot arc and draws nothing.
        The high-current loop — BAT+ → LOCK → Q1 → coil → Q2 → RE → BAT− —
        uses 0.8 mm traces and the bottom-layer ground pour. */}
    <WirePad name="TP_BATP" label="BATP" pcbX={6} pcbY={-13.0} schX={-17} schY={2} />
    <WirePad name="TP_BATN" label="BATN" pcbX={2} pcbY={-13.0} schX={-17} schY={0} />
    <WirePad name="TP_LOCKA" label="LOCKA" pcbX={10} pcbY={-13.0} schX={-14} schY={2} />
    <WirePad name="TP_LOCKB" label="LOCKB" pcbX={14} pcbY={-13.0} schX={-11} schY={2} />

    <trace from=".TP_BATP > .BATP" to="net.BAT" />
    <trace from=".TP_BATN > .BATN" to="net.GND" />
    <trace from=".TP_LOCKA > .LOCKA" to="net.BAT" />
    <trace from=".TP_LOCKB > .LOCKB" to="net.VARM" />

    {/* ═══════════════════════ §2b THE CURRENT LOOP, HAND-ROUTED ══════════
        2-3 A pulses flow BAT+ → LOCK → Q1 → C6-C8 → coil P+ … coil P− →
        Q2 → RE1/RE2 → BAT−. An autorouter connects a net however it
        likes (it happily sent the battery current down a 0.15 mm trace),
        so this loop is drawn by hand: 0.8 mm copper, short straight runs,
        the three bulk capacitors' VDRV pads on one vertical bus, the
        collector running straight through the TVS cathode to P−, and the
        emitter resistors stacked under Q2's emitter. The return also has
        the whole bottom-layer ground pour. (pcbPath waypoints are given in
        the starting component's own frame: relative to its centre and
        rotated with it — RE2 is turned 180°.) */}
    <trace from=".TP_BATP > .BATP" to=".TP_LOCKA > .LOCKA" width="0.8mm" pcbPath={[".TP_LOCKA > .LOCKA"]} />
    <trace from=".TP_LOCKB > .LOCKB" to=".Q1 > .source" width="0.8mm" pcbPath={[{ x: 3.3, y: 0 }, ".Q1 > .source"]} />
    <trace from=".Q1 > .drain" to=".C6 > .pin1" width="0.8mm" pcbPath={[".C6 > .pin1"]} />
    <trace from=".C6 > .pin1" to=".C7 > .pin1" width="0.8mm" pcbPath={[".C7 > .pin1"]} />
    <trace from=".C7 > .pin1" to=".C8 > .pin1" width="0.8mm" pcbPath={[".C8 > .pin1"]} />
    <trace from=".C8 > .pin1" to=".TP_PP > .PP" width="0.8mm" pcbPath={[{ x: -1.462, y: 2.4 }, ".TP_PP > .PP"]} />
    <trace from=".TP_PP > .PP" to=".TP_MODP > .MODP" width="0.8mm" pcbPath={[".TP_MODP > .MODP"]} />
    <trace from=".Q2 > .collector" to=".TP_PM > .PM" width="0.8mm" pcbPath={[".TP_PM > .PM"]} />
    <trace from=".Q2 > .emitter" to=".RE1 > .pin1" width="0.8mm" pcbPath={[".RE1 > .pin1"]} />
    <trace from=".RE1 > .pin1" to=".RE2 > .pin1" width="0.8mm" pcbPath={[".RE2 > .pin1"]} />
    <trace from=".RE1 > .pin2" to=".RE2 > .pin2" width="0.8mm" pcbPath={[".RE2 > .pin2"]} />
    <trace from=".RE2 > .pin2" to=".TP_BATN > .BATN" width="0.8mm" pcbPath={[{ x: 2.962, y: 1.9 }, ".TP_BATN > .BATN"]} />

    {/* ═══════════════════════ §3 THE BRAIN (ATtiny85) ════════════════════
        Powered from VARM through R4 (10 Ω) + C4 (10 µF): the coil pulls
        2 A pulses from the cell, and this RC keeps those dips off the
        microcontroller. Pin jobs:
          PB3 ← FIRE button (to GND; internal pull-up)
          PB4 → Q1's gate (LOW = arc power on). R6 holds the gate HIGH
                (off) whenever the chip is in reset, being programmed or
                unpowered — the safe default is always "off".
          PB2 ← oscillation sense (Q2's collector through R12/R13). This
                is the ATtiny's hardware counter input T0: the firmware
                counts coil pulses with no CPU load.
          PB0 ← VBUS sense (R7/R8): USB present → firing is refused.
          PB1 → status LED3 (blink codes: low battery, coil fault, timeout).
        The battery voltage is measured with no pin at all: the ADC reads
        its internal 1.1 V reference against VCC.
        J2 is the standard 6-pin AVR ISP header for programming. */}
    <Attiny85 name="U2" pcbX={-7} pcbY={4} schX={0} schY={1} />
    <resistor name="R4" resistance="10ohm" footprint="0805" pcbX={-7} pcbY={12.8} schX={-8} schY={2} />
    <capacitor name="C4" capacitance="10uF" footprint="0805" pcbX={-3} pcbY={12.8} schX={-6} schY={0} />
    <capacitor name="C3" capacitance="100nF" footprint="0805" pcbX={-7} pcbY={9.2} schX={-4.5} schY={0} />
    <resistor name="R5" resistance="10k" footprint="0805" pcbX={-12} pcbY={4.8} pcbRotation={90} schX={-3} schY={4} />
    <resistor name="R7" resistance="1M" footprint="0805" pcbX={-12} pcbY={0} pcbRotation={90} schX={4} schY={6} />
    <resistor name="R8" resistance="2.2M" footprint="0805" pcbX={-12} pcbY={-3.6} pcbRotation={90} schX={5.5} schY={6} />
    <capacitor name="C5" capacitance="100nF" footprint="0805" pcbX={-14.5} pcbY={-1.8} pcbRotation={90} schX={7} schY={6} />
    <resistor name="R9" resistance="1k" footprint="0805" pcbX={-17.5} pcbY={-5.6} schX={4.5} schY={3} />
    <Led0805 name="LED3" color="red" pcbX={-17.5} pcbY={-9.0} schX={6} schY={3} />
    <IspHeader name="J2" pcbX={-5} pcbY={-5} schX={0} schY={-6} />
    <WirePad name="TP_FIRE" label="FIRE" pcbX={-26} pcbY={-13.2} schX={-4} schY={-3} />
    <WirePad name="TP_FIREG" label="FIREG" pcbX={-22} pcbY={-13.2} schX={-4} schY={-5} />

    <trace from=".R4 > .pin1" to="net.VARM" />
    <trace from=".R4 > .pin2" to="net.VMCU" />
    <trace from=".C4 > .pin1" to="net.VMCU" />
    <trace from=".C4 > .pin2" to="net.GND" />
    <trace from=".C3 > .pin1" to="net.VMCU" />
    <trace from=".C3 > .pin2" to="net.GND" />
    <trace from=".U2 > .VCC" to="net.VMCU" />
    <trace from=".U2 > .GND" to="net.GND" />
    <trace from=".U2 > .RESET" to="net.RST" />
    <trace from=".R5 > .pin1" to="net.VMCU" />
    <trace from=".R5 > .pin2" to="net.RST" />
    <trace from=".U2 > .PB3" to="net.FIRE" />
    <trace from=".TP_FIRE > .FIRE" to="net.FIRE" />
    <trace from=".TP_FIREG > .FIREG" to="net.GND" />
    <trace from=".U2 > .PB4" to="net.GATE" />
    <trace from=".U2 > .PB2" to="net.OSC" />
    <trace from=".U2 > .PB0" to="net.VBS" />
    <trace from=".R7 > .pin1" to="net.VBUS" />
    <trace from=".R7 > .pin2" to="net.VBS" />
    <trace from=".R8 > .pin1" to="net.VBS" />
    <trace from=".R8 > .pin2" to="net.GND" />
    <trace from=".C5 > .pin1" to="net.VBS" />
    <trace from=".C5 > .pin2" to="net.GND" />
    <trace from=".U2 > .PB1" to="net.LEDS" />
    <trace from=".R9 > .pin1" to="net.LEDS" />
    <trace from=".R9 > .pin2" to=".LED3 > .pin1" />
    <trace from=".LED3 > .pin2" to="net.GND" />
    <trace from=".J2 > .MISO" to="net.LEDS" />
    <trace from=".J2 > .VCC" to="net.VMCU" />
    <trace from=".J2 > .SCK" to="net.OSC" />
    <trace from=".J2 > .MOSI" to="net.VBS" />
    <trace from=".J2 > .RESET" to="net.RST" />
    <trace from=".J2 > .GND" to="net.GND" />

    {/* ═══════════════════════ §4 ARC POWER SWITCH (Q1) ═══════════════════
        A P-channel MOSFET between VARM and the driver's supply VDRV. Gate
        LOW (pulled down by PB4) = on: 0.06 Ω at a full cell. R6 (100 k)
        pulls the gate up to VARM = off by default. A high-side switch
        keeps the driver's ground solid and leaves nothing live on the
        coil when the lighter is idle. */}
    <Ao3401 name="Q1" pcbX={19.5} pcbY={-11.0} schX={11} schY={5} />
    <resistor name="R6" resistance="100k" footprint="0805" pcbX={17.0} pcbY={-7.6} schX={9} schY={5} />

    <trace from=".Q1 > .source" to="net.VARM" />
    <trace from=".Q1 > .drain" to="net.VDRV" />
    <trace from=".Q1 > .gate" to="net.GATE" />
    <trace from=".R6 > .pin1" to="net.VARM" />
    <trace from=".R6 > .pin2" to="net.GATE" />

    {/* ═══════════════════════ §5 THE ARC DRIVER (Q2) ═════════════════════
        A self-oscillating ("blocking oscillator") stage — the circuit
        arc-lighter coils are wound for — plus a peak-current limit.
          · Q2 switches the coil's PRIMARY (P+ to VDRV, P− to the
            collector). R10 (47 Ω) feeds base current through the coil's
            FEEDBACK winding (FA, FB): wired the right way round, the
            feedback adds to the base drive while the primary current
            ramps up, so Q2 slams fully on.
          · RE1 ∥ RE2 (0.255 Ω) sense the emitter current. At ≈2.6 A they
            drop 0.65 V, Q3 turns on and steals Q2's base current; Q2 comes
            out of saturation, the feedback reverses, and Q2 snaps off.
            (Without Q3 the current runs on to gain × base current — 6 A+
            for a high-gain part; simulation showed exactly that runaway.)
          · Q2 off: the primary's stored energy flies back into the
            secondary, whose voltage climbs until the gap breaks down —
            the arc. Then the cycle repeats, 5-16 thousand times a second (simulated).
          · D1 keeps the base from being driven below −0.4 V by the
            reversed feedback (Q2's base-emitter junction breaks down at
            6 V). D2 (SMCJ33A) clamps the collector at ≈40 V: it eats the
            coil's leakage spike every cycle (up to ≈2.7 W while arcing, so
            it's the big SMC package, anode on the ground pour) and, if the
            arc can't strike, holds Q2 well inside its 60 V rating.
          · C6-C8 (3 × 22 µF) supply the 2-3 A current pulses locally.
          · R12/R13 (100 k / 33 k) scale the collector's flyback down for the
            oscillation monitor (PB2/T0): any flyback above ≈10 V reads as a
            logic HIGH, so even a high-ratio coil (≈15 V flyback) is counted.
            At the 40 V clamp the pin's protection diode takes ≤ 0.35 mA. */}
    <capacitor name="C6" capacitance="22uF" footprint="1206" pcbX={24.0} pcbY={-11.0} schX={10} schY={1} />
    <capacitor name="C7" capacitance="22uF" footprint="1206" pcbX={24.0} pcbY={-8.2} schX={11.5} schY={1} />
    <capacitor name="C8" capacitance="22uF" footprint="1206" pcbX={24.0} pcbY={-5.4} schX={13} schY={1} />
    <Fzt851 name="Q2" pcbX={14.5} pcbY={2.0} schX={18} schY={2} />
    <resistor name="R10" resistance="47ohm" footprint="1206" pcbX={17.0} pcbY={10.4} schX={15} schY={6} />
    <resistor name="RE1" resistance="0.51ohm" footprint="2512" pcbX={8.5} pcbY={-4.9} pcbRotation={180} schX={19} schY={-2} />
    <resistor name="RE2" resistance="0.51ohm" footprint="2512" pcbX={8.5} pcbY={-9.3} pcbRotation={180} schX={20.5} schY={-2} />
    <Bc847 name="Q3" pcbX={6.0} pcbY={4.6} schX={16} schY={-1} />
    <resistor name="R11" resistance="100ohm" footprint="0805" pcbX={6.0} pcbY={1.4} schX={17.5} schY={-3} />
    <SchottkySma name="D1" pcbX={9.5} pcbY={8.6} schX={16} schY={3} />
    <TvsSmc name="D2" pcbX={23.6} pcbY={5.4} pcbRotation={90} schX={21} schY={4} />
    <resistor name="R12" resistance="100k" footprint="0805" pcbX={0.5} pcbY={8.6} pcbRotation={90} schX={5} schY={-2} />
    <resistor name="R13" resistance="33k" footprint="0805" pcbX={0.5} pcbY={4.6} pcbRotation={90} schX={6.5} schY={-2} />

    <trace from=".C6 > .pin1" to="net.VDRV" />
    <trace from=".C6 > .pin2" to="net.GND" />
    <trace from=".C7 > .pin1" to="net.VDRV" />
    <trace from=".C7 > .pin2" to="net.GND" />
    <trace from=".C8 > .pin1" to="net.VDRV" />
    <trace from=".C8 > .pin2" to="net.GND" />
    <trace from=".Q2 > .collector" to="net.COL" />
    <trace from=".Q2 > .emitter" to="net.EMIT" />
    <trace from=".Q2 > .base" to="net.BASE" />
    <trace from=".R10 > .pin1" to="net.VDRV" />
    <trace from=".R10 > .pin2" to="net.FBA" />
    <trace from=".RE1 > .pin1" to="net.EMIT" />
    <trace from=".RE1 > .pin2" to="net.GND" />
    <trace from=".RE2 > .pin1" to="net.EMIT" />
    <trace from=".RE2 > .pin2" to="net.GND" />
    <trace from=".Q3 > .collector" to="net.BASE" />
    <trace from=".Q3 > .emitter" to="net.GND" />
    <trace from=".Q3 > .base" to=".R11 > .pin2" />
    <trace from=".R11 > .pin1" to="net.EMIT" />
    <trace from=".D1 > .pin2" to="net.BASE" />
    <trace from=".D1 > .pin1" to="net.GND" />
    <trace from=".D2 > .pin2" to="net.COL" />
    <trace from=".D2 > .pin1" to="net.GND" />
    <trace from=".R12 > .pin1" to="net.COL" />
    <trace from=".R12 > .pin2" to="net.OSC" />
    <trace from=".R13 > .pin1" to="net.OSC" />
    <trace from=".R13 > .pin2" to="net.GND" />

    {/* ═══════════════════════ §6 COIL PADS ═══════════════════════════════
        P+ / P− : the coil's PRIMARY (the thick winding, ≈0.05-0.3 Ω)
        FA / FB : its FEEDBACK winding (thinner, ≈0.2-2 Ω). If the status
                  LED blinks the "coil fault" code, swap FA and FB — the
                  feedback is simply the wrong way round.
        HV      : the two thin high-voltage leads go to the electrodes,
                  NEVER to this board.
        MOD+ / MOD− : alternative — a complete potted "3.7 V arc module"
                  (coil + its own driver) wired here instead of the bare
                  coil; leave Q2/Q3/D1/R10 unfitted and build the firmware
                  with MODULE=1 (no oscillation monitor). */}
    <WirePad name="TP_PP" label="PP" pcbX={28.3} pcbY={-3.0} schX={24} schY={6} />
    <WirePad name="TP_PM" label="PM" pcbX={28.3} pcbY={2.0} schX={24} schY={4} />
    <WirePad name="TP_FA" label="FA" pcbX={28.3} pcbY={6.6} schX={24} schY={2} />
    <WirePad name="TP_FB" label="FB" pcbX={28.3} pcbY={11.2} schX={24} schY={0} />
    <WirePad name="TP_MODP" label="MODP" pcbX={28.3} pcbY={-7.6} schX={24} schY={-3} />
    <WirePad name="TP_MODN" label="MODN" pcbX={28.3} pcbY={-12.2} schX={24} schY={-5} />

    <trace from=".TP_PP > .PP" to="net.VDRV" />
    <trace from=".TP_PM > .PM" to="net.COL" />
    <trace from=".TP_FA > .FA" to="net.FBA" />
    <trace from=".TP_FB > .FB" to="net.BASE" />
    <trace from=".TP_MODP > .MODP" to="net.VDRV" />
    <trace from=".TP_MODN > .MODN" to="net.GND" />

    {/* ═══════════════════════ §7 LABELS + GROUND POUR ═══════════════════ */}
    <silkscreentext text="ARC LIGHTER" pcbX={-12} pcbY={-13.4} fontSize="1.2mm" />
    <silkscreentext text="BAT-" pcbX={2} pcbY={-10.7} fontSize="0.8mm" />
    <silkscreentext text="BAT+" pcbX={6} pcbY={-10.7} fontSize="0.8mm" />
    <silkscreentext text="LOCK" pcbX={12} pcbY={-10.7} fontSize="0.8mm" />
    <silkscreentext text="FIRE" pcbX={-18.6} pcbY={-13.2} fontSize="0.8mm" />
    <silkscreentext text="MOD+" pcbX={25.9} pcbY={-7.6} fontSize="0.7mm" />
    <silkscreentext text="MOD-" pcbX={25.9} pcbY={-12.9} fontSize="0.7mm" />
    <silkscreentext text="P+" pcbX={26.4} pcbY={-1.6} fontSize="0.7mm" />
    <silkscreentext text="P-" pcbX={28.3} pcbY={3.8} fontSize="0.7mm" />
    <silkscreentext text="FA" pcbX={26.6} pcbY={8.2} fontSize="0.7mm" />
    <silkscreentext text="FB" pcbX={26.6} pcbY={12.6} fontSize="0.7mm" />
    <silkscreentext text="CHG" pcbX={-25.5} pcbY={-10.7} fontSize="0.7mm" />
    <silkscreentext text="DONE" pcbX={-21.5} pcbY={-10.7} fontSize="0.7mm" />
    <silkscreentext text="STAT" pcbX={-17.5} pcbY={-10.7} fontSize="0.7mm" />
    <silkscreentext text="ISP" pcbX={-5} pcbY={-1.6} fontSize="0.8mm" />
    <silkscreentext text="HV LEADS GO TO THE ELECTRODES ONLY" pcbX={16} pcbY={13.6} fontSize="0.7mm" />

    <copperpour connectsTo="net.GND" layer="bottom" padMargin="0.4mm" boardEdgeMargin="0.5mm" useThermalReliefs />
  </board>
)
