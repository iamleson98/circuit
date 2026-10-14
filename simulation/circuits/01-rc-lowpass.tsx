import "@tscircuit/core"

/**
 * 01 — RC Low-Pass Filter (the "hello world" of SPICE)
 * =====================================================
 * Simulates the passive RC low-pass filter that appears all over this repo:
 *  - radio-lab receiver: the 10nF + 10k audio detector stage (C11/R11)
 *  - unode-32u4: every decoupling cap + supply impedance forms one
 *  - tricolor-lamp: the firmware's ADC input RC filter
 *
 * What to watch for in the simulation:
 *  - VIN is a 0..5V 1 kHz square wave; the RC pair (R=1k, C=1uF) has a time
 *    constant tau = R*C = 1ms, so each half-period (0.5ms) only partially
 *    charges the cap — the output looks like "rounded triangles".
 *  - The cutoff frequency is f_c = 1/(2*pi*R*C) = 159 Hz — far below the
 *    1 kHz input, so most of the square wave's energy is filtered out.
 *
 * Run it:
 *   tsci simulate analog circuits/01-rc-lowpass.tsx   (table in terminal)
 *   tsci dev circuits/01-rc-lowpass.tsx               (graph in browser)
 *
 * NOTE: sim-only view (routingDisabled, no footprints needed) — the real
 * boards live in the project folders.
 */
export default () => (
  <board routingDisabled>
    {/* V1: 0..5V square wave at 1kHz (voltage = peak) */}
    <voltagesource
      name="V1"
      voltage="5V"
      waveShape="square"
      frequency="1kHz"
      schX={-3}
    />

    <resistor name="R1" resistance="1k" schX={0} />
    <capacitor name="C1" capacitance="1uF" schX={2} />

    <trace from=".V1 > .pin1" to=".R1 > .pin1" />
    <trace from=".R1 > .pin2" to=".C1 > .pin1" />
    <trace from=".C1 > .pin2" to=".V1 > .pin2" />

    {/* Probes are virtual multimeter leads — they add nothing to the PCB */}
    <voltageprobe name="VIN" connectsTo=".R1 > .pin1" />
    <voltageprobe name="VOUT" connectsTo=".C1 > .pin1" />

    {/* 10ms of simulation, a data point every 50us (201 points) */}
    <analogsimulation
      duration="10ms"
      timePerStep="0.05ms"
      spiceEngine="ngspice"
    />
  </board>
)
