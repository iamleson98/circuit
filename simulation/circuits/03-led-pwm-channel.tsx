import "@tscircuit/core"

/**
 * 03 — LED Channel + MOSFET PWM (one channel of the tricolor lamp)
 * =================================================================
 * Exactly the topology of tricolor-lamp/controller: a logic-level N-MOSFET
 * (IRLZ44N) switches the LED string's NEGATIVE side, so the ATtiny85's GPIO
 * (5V, PWM) can control a 12V load. This file reproduces one channel:
 *
 *   +12V ── LED ── LED ── LED ── R_SERIES ──┬── drain
 *                                           │
 *   GPIO/PWM ── R_GATE(100Ω) ── gate      MOSFET
 *   R_PULLDOWN(100k) gate→GND (reset-safe)  source ── GND
 *
 * The gate drive here is a 5V square wave with dutyCycle=0.35 — the same
 * "35% PWM" the lamp firmware uses for its FADE mode. Watch I_LED: the LED
 * current is either ~full or 0 — the eye averages it to 35% brightness,
 * which is why PWM costs almost no power compared to a series resistor.
 *
 * Run it:
 *   tsci simulate analog circuits/03-led-pwm-channel.tsx
 *   tsci dev circuits/03-led-pwm-channel.tsx
 */
export default () => (
  <board routingDisabled>
    {/* The 12V "LED driver" wall supply from the lamp's power chain */}
    <voltagesource name="V12" voltage="12V" schX={-5} />

    {/* PWM gate drive: 0/5V square wave, 35% duty, 1kHz (firmware PWM_F
         is ~1kHz on the real lamp — deliberately above flicker perception) */}
    <voltagesource
      name="PWM"
      voltage="5V"
      waveShape="square"
      dutyCycle={0.35}
      frequency="1kHz"
      schX={-2}
      schY={3}
    />

    {/* Three white LEDs in series + a ballast resistor — one string of
        the real panel. 82Ω gives ≈34mA per string; three strings ≈ 0.1A,
        matching the real lamp's "panel draws ≈ 0.1 A" spec. */}
    <led name="LED1" color="white" schX={0.5} schY={2} />
    <led name="LED2" color="white" schX={1.5} schY={2} />
    <led name="LED3" color="white" schX={2.5} schY={2} />
    <resistor name="R_SERIES" resistance="82ohm" schX={4} schY={2} />

    {/* Gate resistor (R7/R8/R9 on the controller: 100Ω) — damps the
        MOSFET's gate capacitance ring */}
    <resistor name="R_GATE" resistance="100ohm" schX={0} schY={-1} />
    {/* Pull-down (R10 on the controller: 100k) — LEDs OFF during chip
        reset, exactly like the real board */}
    <resistor name="R_PULLDOWN" resistance="100k" schX={2} schY={-1} />

    <mosfet
      name="M1"
      channelType="n"
      mosfetMode="enhancement"
      footprint="to220"
      schX={4}
      schY={-1}
    />

    {/* Power path: 12V → LEDs → ballast → MOSFET drain (ammeter in series) */}
    <trace from=".V12 > .pin1" to=".LED1 > .pos" />
    <trace from=".LED1 > .neg" to=".LED2 > .pos" />
    <trace from=".LED2 > .neg" to=".LED3 > .pos" />

    <trace from=".LED3 > .neg" to=".R_SERIES > .pin1" />
    <trace from=".R_SERIES > .pin2" to=".M1 > .drain" />
    <trace from=".M1 > .source" to=".V12 > .pin2" />

    {/* Gate drive path */}
    <trace from=".PWM > .pin1" to=".R_GATE > .pin1" />
    <trace from=".R_GATE > .pin2" to=".M1 > .gate" />
    <trace from=".R_PULLDOWN > .pin1" to=".M1 > .gate" />
    <trace from=".R_PULLDOWN > .pin2" to=".V12 > .pin2" />
    <trace from=".PWM > .pin2" to=".V12 > .pin2" />

    {/* Probes: gate voltage (logic side), drain voltage (power side), and
        both nodes of the ballast resistor — LED current follows from Ohm's
        law: I_LED = (VR_TOP − VDRAIN) / 82Ω. (The <ammeter /> element is
        still rough in current tscircuit versions — see README.) */}
    <voltageprobe name="VGATE" connectsTo=".M1 > .gate" />
    <voltageprobe name="VDRAIN" connectsTo=".M1 > .drain" />
    <voltageprobe name="VR_TOP" connectsTo=".R_SERIES > .pin1" />
    <analogsimulation
      duration="3ms"
      timePerStep="0.02ms"
      spiceEngine="ngspice"
    />
  </board>
)
