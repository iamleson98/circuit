/**
 * tricolor-lamp.mjs — harness testbench for the tricolor lamp: the
 * CONTROLLER board and the LED PANEL board simulated TOGETHER as one deck
 * (they are one circuit once the four-wire cable joins them). Every part on
 * both boards is the routed boards' own; the wall supply, the fuse, the
 * 78L05 and the ATtiny85 are behavioural stand-ins as in calc/sim_lamp.mjs.
 *
 * The flagship transient: the firmware's 35 % PWM on one colour channel —
 * gate drive, MOSFET switching, the LED string's current, the eye's
 * averaged brightness.
 */
const fit = (vf, i, n, rs) => i / Math.exp((vf - i * rs) / (n * 0.025852))
const EXTRA_MODELS = `
* LED models fitted to 5 mm parts (V = N·Vt·ln(I/IS) + I·RS):
.model LEDB D(IS=${fit(3.1, 0.015, 2.6, 15).toExponential(3)} N=2.6 RS=15 CJO=30p)
.model LEDW D(IS=${fit(3.1, 0.015, 2.6, 15).toExponential(3)} N=2.6 RS=15 CJO=30p)
.model LEDY D(IS=${fit(2.05, 0.015, 2.0, 10).toExponential(3)} N=2.0 RS=10 CJO=30p)
.model D1N5819 D(IS=31.7u N=1.373 RS=0.051 CJO=110p M=0.35)`

const PWM_F = 1e3, DUTY = 0.35

export default {
  id: "tricolor-lamp",
  title: "Tricolor lamp — controller + LED panel",
  blurb: "two boards, one deck: PWM a colour channel end to end, wall supply to LEDs",
  project: "tricolor-lamp",
  boardFile: "dist/controller/index.js",
  extraBoards: [{ as: "panel", project: "tricolor-lamp", file: "dist/led-panel/index.js" }],
  scenarios: [pwmChannel],
}

function pwmChannel(ctx) {
  const { json, extraJson, boardToSpice, MODELS } = ctx
  const panelJson = extraJson.panel

  const controller =
    MODELS + EXTRA_MODELS +
    boardToSpice(json, {
      title: "Tricolor lamp controller",
      diodeModel: { D1: "D1N5819", D2: "D1N4148" },
      parts: {
        J1: ({ node }) => [
          `* J1: the 12 V wall supply (its output stage and caps live here too):`,
          `VPSU psu_emf 0 12`, `SWALL psu_emf psu_out RON=0.05 ROFF=1e9  ; switched on at t = 0`,
          `CPSU psu_out 0 1000u`, `RJ1 psu_out ${node("VIN")} 0.005`, `RJ1G ${node("GNDIN")} 0 0.001`,
        ].join("\n"),
        F1: ({ node }) => `RF1 ${node("A")} ${node("B")} 0.15  ; MF-R110 polyfuse, cold`,
        U1: ({ node }) => [
          `* U1: 78L05 — pass transistor, base clamped at 5.6 V and ≥ 1.2 V below IN`,
          `DU1A ${node("IN")} u1_d D1N4148`, `DU1B u1_d u1_e D1N4148`, `RU1B u1_e u1_b 2k`,
          `DU1Z u1_b u1_ref D1N4148`, `VU1REF u1_ref 0 5.0`,
          `QU1 ${node("IN")} u1_b ${node("OUT")} Q2N2222A`, `RU1Q ${node("IN")} ${node("GND")} 3.9k  ; ≈ 3 mA quiescent`,
        ].join("\n"),
        U2: ({ node }) => [
          `* U2: ATtiny85 — supply current and three output pins; PB4 carries the PWM`,
          `RU2SLEEP ${node("VCC")} ${node("GND")} 360e3  ; asleep`,
          `SU2AWAKE ${node("VCC")} u2_a RON=1 ROFF=1e12`, `RU2A u2_a ${node("GND")} 5.5k  ; + 0.8 mA awake`,
          ...["PB0", "PB1", "PB4"].map((p) => `E${p} u2_${p.toLowerCase()} 0 ${node("VCC")} 0 0\nR${p} u2_${p.toLowerCase()} ${node(p)} 50`),
        ].join("\n"),
        J2: () => "* J2: ISP header, nothing plugged in",
        J3: () => "* J3: no jumper (the MODE pot's wiper sets it)",
        J4: () => "* J4: the four-wire cable to the LED panel (nets shared below)",
        ...Object.fromEntries(["Q1", "Q2", "Q3"].map((q) => [
          q,
          ({ node }) => `S${q} ${node("pin1")} ${node("pin2")} RON=0.025 ROFF=1e8  ; IRLZ44N\nC${q}G ${node("pin3")} ${node("pin2")} 1.8n`,
        ])),
      },
    }).deck

  // the panel deck: names prefixed so the two boards can share one namespace
  const panelColor = Object.fromEntries(
    panelJson.filter((e) => e.type === "source_component" && e.ftype === "simple_led").map((c) => [c.name, c.color]),
  )
  const panel =
    boardToSpice(panelJson, {
      title: "Tricolor lamp LED panel",
      refdesPrefix: "P_",
      ledModel: Object.fromEntries(
        Object.entries(panelColor).map(([n, c]) => [n, c === "blue" ? "LEDB" : c === "white" ? "LEDW" : "LEDY"]),
      ),
      parts: { J1: () => "* J1: the cable (V12/GND/×_N shared with the controller)" },
    }).deck

  // which panel resistor belongs to a YELLOW string? (for the current probe)
  const yellowR = panelJson.find((e) => e.type === "source_component" && e.ftype === "simple_led" && e.name === "D1a" && e.color === "yellow") ? "R1" : null
  const yellowString = (() => {
    for (let n = 1; n <= 18; n++) {
      const led = panelJson.find((e) => e.type === "source_component" && e.name === `D${n}a`)
      if (led?.color === "yellow") return `RP_${n}`
    }
    return "RP_1"
  })()

  return {
    name: "pwm-channel",
    what: `35 % PWM on the yellow channel: gate → MOSFET → six LED strings`,
    cirTrailer: ".tran 50n 3m",
    deck: controller + "\n" + panel,
    run() {
      const { Circuit, mean } = ctx
      const c = new Circuit(this.deck)
      c.get("SWALL").closed = true // wall supply on
      c.get("EPB4").g = 0 // pin low: gates discharged, LEDs off
      c.op() // settle at the operating point: 12 V on, VCC = 4.4 V, PWM idle
      // (the supply's own soft-start is the lamp's brown-out story — calc/sim_lamp.mjs)
      const r = c.tran({
        tstop: 3e-3, h: 50e-9, probes: ["gate3", "v12", "vcc", `i(${yellowString})`, "i(SWALL)"], every: 4,
        onStep: (t, x) => {
          // the firmware's PWM on PB4 (35 % of every 1 ms), then the gates follow:
          c.get("EPB4").g = (t % (1 / PWM_F)) < DUTY / PWM_F ? 1 : 0
          for (const q of ["Q1", "Q2", "Q3"]) c.get(`S${q}`).closed = c.v(x, `gate${q[1]}`) > 2.5
        },
      })
      const ms = (a) => a.map((t) => t * 1e3)
      const iStr = r[`i(${yellowString})`]
      const t1 = 1.0e-3 // measure over WHOLE PWM periods (2 of them: 1-3 ms)
      const on = iStr.filter((_, k) => r.t[k] > t1 && r.gate3[k] > 2.5)
      const off = iStr.filter((_, k) => r.t[k] > t1 && r.gate3[k] < 0.5)
      const pk = on.length ? Math.max(...on) : 0
      const avg = mean(iStr.filter((_, k) => r.t[k] > t1))
      const v12min = Math.min(...r.v12.filter((_, k) => r.t[k] > t1))
      return {
        series: [
          { label: "GATE3 — the PWM'd gate (35 % of every 1 ms)", unit: "V", kind: "transient", x: ms(r.t), y: r.gate3 },
          { label: `one yellow LED string's current (${yellowString})`, unit: "A", kind: "transient", x: ms(r.t), y: iStr },
          { label: "the 12 V rail", unit: "V", kind: "transient", x: ms(r.t), y: r.v12 },
        ],
        checks: [
          { label: "gate high → the string lights at its design current (4 yellow LEDs + 220 Ω ≈ 16 mA)", ok: pk > 0.01 && pk < 0.025, detail: `${(pk * 1e3).toFixed(1)} mA peak` },
          { label: "gate low → the string is off (< 100 µA)", ok: off.length === 0 || Math.max(...off.map(Math.abs)) < 1e-4, detail: off.length ? `${(Math.max(...off.map(Math.abs)) * 1e6).toFixed(0)} µA` : "never off?!" },
          { label: `the eye's view: average = 35 % duty × peak (±20 %)`, ok: Math.abs(avg / (DUTY * pk) - 1) < 0.2, detail: `avg ${(avg * 1e3).toFixed(1)} mA vs ${DUTY * 100}% × ${(pk * 1e3).toFixed(1)} mA` },
          { label: "the 12 V rail holds up under the PWM load", ok: v12min > 11.0, detail: `${v12min.toFixed(2)} V minimum` },
        ],
        summary: `${(pk * 1e3).toFixed(0)} mA pk, ${(avg * 1e3).toFixed(1)} mA avg (${DUTY * 100}% duty), rail ${v12min.toFixed(1)} V`,
      }
    },
  }
}
