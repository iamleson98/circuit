/**
 * recipes.mjs — "math channel" derivations, like an oscilloscope's MATH trace.
 *
 * tscircuit's current probing is still maturing (see README §limitations), so
 * some circuits measure current the classic way: probe both ends of a known
 * shunt/ballast resistor and let Ohm's law do the rest. Each recipe takes
 * existing probed series and derives a new one.
 *
 * op "div":      y = y[fromA] / divisor                  → grounded shunt
 * op "diff_div":  y = (y[fromA] - y[fromB]) / divisor   → floating shunt
 */
export default {
  "06-diode-iv-dc-sweep": [
    {
      label: "I_DIODE (math)",
      fromA: "VSI_A", // shunt top node; bottom is at ground
      divisor: 47, // RS1, ohms
      op: "div",
      unit: "A",
    },
  ],
  "03-led-pwm-channel": [
    {
      label: "I_LED (math)",
      fromA: "VR_TOP",
      fromB: "VDRAIN",
      divisor: 82, // R_SERIES, ohms
      op: "diff_div",
      unit: "A",
    },
  ],
}
