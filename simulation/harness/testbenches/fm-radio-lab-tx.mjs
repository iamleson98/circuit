/**
 * fm-radio-lab-tx.mjs — harness testbench for the FM transmitter board.
 * The flagship measurement: FREQUENCY MODULATION itself. A slow audio swing
 * is a small DC step on the varactor's bias node — exactly how sim_fm.mjs
 * measures it — and each step's carrier frequency is read from the tank's
 * zero crossings. The curve of Δf vs ΔV IS the FM modulation
 * characteristic (kHz per mV of voice).
 */
const VAR_MODELS = `
.model D1N4148HI D(IS=2.52n N=1.752 RS=0.568 CJO=4p M=0.4 VJ=0.75 TT=20n)
.model D1N4148LO D(IS=2.52n N=1.752 RS=0.568 CJO=1.2p M=0.4 VJ=0.75 TT=20n)`

/** monopole antenna of length h: radiation resistance + capacitance (as in calc/sim_fm.mjs) */
const shortWire = (h, f = 98e6) => {
  const lam = 3e8 / f, b = (2 * Math.PI * h) / lam, Z0 = 60 * (Math.log((2 * h) / 0.3e-3) - 1)
  return { R: 395 * (h / lam) ** 2, C: 1 / (2 * Math.PI * f * (Z0 / Math.tan(b))) }
}

export default {
  id: "fm-radio-lab-tx",
  title: "FM Radio Lab — FM transmitter",
  blurb: "mic preamp → varactor → the ~98 MHz oscillator: the FM modulation characteristic",
  project: "fm-radio-lab",
  boardFile: "dist/transmitter/index.js",
  scenarios: [fmDeviation],
}

function fmDeviation(ctx) {
  const { json, boardToSpice, MODELS } = ctx
  const w = shortWire(0.2)
  const build = () =>
    MODELS + VAR_MODELS +
    boardToSpice(json, {
      title: "FM Radio Lab FM-TX — modulation characteristic",
      closedSwitches: ["SW1"],
      transistorModel: { Q1: "BC547B", Q2: "Q2N2222A" },
      diodeModel: { D1: "D1N4148HI" },
      coilQ: { L1: { Q: 100, f: 98e6 } },
      leadL: Object.fromEntries(["C2", "C7", "C8", "C9", "C11", "C12", "C13", "C14", "C15", "C17"].map((n) => [n, 5e-9])),
      parts: {
        BT1: ({ node }) => `VBT1 bt1_emf ${node("pin2")} 9\nRBT1_INT bt1_emf ${node("pin1")} 1.5`,
        MIC1: ({ node }) => `IMIC1 ${node("MIC_P")} ${node("MIC_N")} 0.3m  ; quiet studio (the DC bias only)`,
        AUX1: ({ node }) => `RAUX1_OPEN ${node("TIP")} ${node("SLE")} 1meg  ; nothing plugged in`,
        TRIM1: ({ node }) => `CTRIM1 ${node("A")} ${node("B")} 15p`,
        ANT1: ({ node }) => `CANT1_WIRE ${node("ANT")} ant1_w ${w.C}\nRANT1_RAD ant1_w 0 ${w.R}\nRANT1_LEAK ${node("ANT")} 0 1meg`,
      },
      extra: `CPAR_TANK tank 0 2p\nIKICK 0 tank PULSE(0 2m 0 0.2n 0.2n 1n 1)`,
    }).deck
  return {
    name: "fm-deviation",
    what: "The FM modulation characteristic: voice voltage → carrier frequency",
    cirTrailer: ".tran 0.05n 4u  ; (one run per audio level)",
    deck: build(),
    run() {
      const { Circuit, amp, freq, mean } = ctx
      // find the varactor's quiet bias point
      const c0 = new Circuit(this.deck)
      const v0 = c0.v(c0.op(), "var")
      // each audio level = a small DC step on the varactor node; measure the carrier
      const levels = [-50e-3, -25e-3, 0, 25e-3, 50e-3]
      const pts = []
      for (const dv of levels) {
        const c = new Circuit(this.deck + `\nVTEST var_test 0 ${v0 + dv}\nRTEST var_test var 1k`)
        const r = c.tran({ tstop: 4e-6, h: 0.05e-9, probes: ["tank", "var"], every: 1 })
        pts.push({ dv, f: freq(r.t, r.tank, 2e-6, 4e-6), a: amp(r.t, r.tank, 2e-6, 4e-6) })
      }
      const f0 = pts[2].f
      const kHzperV = (pts[4].f - pts[0].f) / (pts[4].dv - pts[0].dv) / 1e3
      const mono = (pts[4].f - pts[3].f) * (pts[1].f - pts[0].f) >= 0 && (pts[3].f - pts[2].f) * (pts[2].f - pts[1].f) >= 0
      const maxDev = Math.max(...pts.map((p) => Math.abs(p.f - f0)))
      return {
        series: [
          { label: "carrier frequency shift vs voice voltage at the varactor", unit: "kHz", kind: "dc_sweep", x_label: "voice at the varactor (mV)", x: pts.map((p) => p.dv * 1e3), y: pts.map((p) => (p.f - f0) / 1e3) },
        ],
        checks: [
          { label: "the carrier lands inside the FM broadcast band", ok: f0 > 88e6 && f0 < 108e6, detail: `${(f0 / 1e6).toFixed(2)} MHz` },
          { label: "the oscillator runs (healthy tank swing)", ok: pts.every((p) => p.a > 0.3), detail: `${(f0 / 1e6).toFixed(1)} MHz at ${pts[2].a.toFixed(2)} Vpk` },
          { label: "voice shifts the frequency MONOTONICALLY (real FM, no sign flips)", ok: mono && Math.abs(kHzperV) > 0, detail: `${(kHzperV / 1e3).toFixed(2)} kHz/mV` },
          { label: "…by ≥ 0.1 kHz/mV (±30 kHz of deviation needs ≤ 300 mV of voice)", ok: Math.abs(kHzperV) >= 100, detail: `${(Math.abs(kHzperV) / 1e3).toFixed(2)} kHz/mV → ±75 kHz swing over 100 mV` },
        ],
        summary: `${(f0 / 1e6).toFixed(2)} MHz carrier, ${(Math.abs(kHzperV) / 1e3).toFixed(2)} kHz/mV, ±${(maxDev / 1e3).toFixed(0)} kHz over ±50 mV`,
      }
    },
  }
}
