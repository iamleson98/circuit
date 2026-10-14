/**
 * radio-lab-tx.mjs — harness testbench for the AM transmitter board.
 * One flagship transient: speak into the mic (a 1 kHz tone), watch the
 * carrier come out of the antenna MODULATED — the whole point of AM.
 *
 * Board parts are the routed board's own; the off-board world (battery, mic,
 * tuning cap, antenna) is modelled at the pads, exactly as the project's own
 * calc/sim_am.mjs verified across its corner grid.
 */
export default {
  id: "radio-lab-tx",
  title: "Radio Lab — AM transmitter",
  blurb: "mic → modulator → 760 kHz Colpitts carrier → antenna, with real AM depth",
  project: "radio-lab",
  boardFile: "dist/transmitter/index.js",
  scenarios: [amModulation],
}

function amModulation(ctx) {
  const { json, boardToSpice, MODELS, Circuit } = ctx
  const build = () =>
    MODELS +
    boardToSpice(json, {
      title: "Radio Lab AM-TX — modulating",
      closedSwitches: ["SW1"],
      transistorModel: { default: "BC547B" },
      coilQ: { L1: { Q: 40, f: 800e3 }, L2: { Q: 40, f: 800e3 } },
      parts: {
        BT1: ({ node }) => `VBT1 bt1_emf ${node("pin2")} 9\nRBT1_INT bt1_emf ${node("pin1")} 1.5`,
        // the electret mic: 2.2 kΩ internal, a 0.3 mA bias current source that
        // swings with sound pressure — 20 mV of voice here
        MIC1: ({ node }) => `IMIC1 ${node("MIC_P")} ${node("MIC_N")} SIN(0.3m ${(20e-3) / 2200} 1k)`,
        CV1: ({ node }) => `CCV1 ${node("STATOR_A")} ${node("ROTOR")} 100p`,
        CV2: ({ node }) => `CCV2 ${node("STATOR_A")} ${node("ROTOR")} 60p`,
        ANT1: ({ node }) => `CANT1_WIRE ${node("ANT")} 0 15p\nRANT1_LEAK ${node("ANT")} 0 1meg`,
      },
      extra: `CPAR_TANK tank 0 5p\nCPAR_OUT rf_out 0 3p\nIKICK 0 tank PULSE(0 10u 0 10n 10n 200n 1)`,
    }).deck
  return {
    name: "am-modulation",
    what: "Voice in, AM out: a 1 kHz tone modulates the ~760 kHz carrier",
    cirTrailer: ".tran 10n 3.6m",
    deck: build(),
    run() {
      const c = new Circuit(this.deck)
      const r = c.tran({ tstop: 3.6e-3, h: 10e-9, probes: ["rf_out", "vmd", "tank"], every: 10 })
      const ms = (a) => a.map((t) => t * 1e3)
      // carrier frequency from crossings of the MEAN (rf_out rides on a DC offset)
      const t1 = 0.8e-3
      const rfMean = r.rf_out.filter((_, k) => r.t[k] > t1).reduce((s, v) => s + v, 0) / r.t.filter((t) => t > t1).length
      let up = []
      for (let k = 1; k < r.t.length; k++) {
        if (r.t[k] < t1) continue
        if (r.rf_out[k - 1] <= rfMean && r.rf_out[k] > rfMean) up.push(r.t[k])
      }
      const fCarrier = up.length > 3 ? (up.length - 1) / (up[up.length - 1] - up[0]) : 0
      // envelope: peak per carrier period (~1.3 µs), then AM depth + audio f
      const per = 1 / fCarrier
      const env = { x: [], y: [] }
      for (let t = t1 + per; t < 3.6e-3; t += per) {
        let mx = -Infinity
        for (let k = 0; k < r.t.length; k++) {
          if (r.t[k] < t - per) continue
          if (r.t[k] > t) break
          if (r.rf_out[k] > mx) mx = r.rf_out[k]
        }
        env.x.push(t * 1e3); env.y.push(mx)
      }
      const eMax = Math.max(...env.y), eMin = Math.min(...env.y)
      const depth = (eMax - eMin) / (eMax + eMin)
      // audio frequency from the SMOOTHED envelope (3-point average kills the
      // carrier-cycle ripple), by mean-crossing count over the ~2.8 voice cycles
      const sm = env.y.map((_, k) => (env.y[Math.max(0, k - 1)] + env.y[k] + env.y[Math.min(env.y.length - 1, k + 1)]) / 3)
      const fAudio = ctx.freq(env.x, sm) * 1e3
      return {
        series: [
          { label: "RF_OUT — the modulated carrier", unit: "V", kind: "transient", x: ms(r.t), y: r.rf_out },
          { label: "the envelope (peak per carrier cycle) — the audio", unit: "V", kind: "transient", x: env.x, y: env.y },
        ],
        checks: [
          { label: "the carrier sits in the mid-MW band", ok: fCarrier > 550e3 && fCarrier < 1e6, detail: `${(fCarrier / 1e3).toFixed(0)} kHz` },
          { label: "the voice actually modulates: AM depth 5-60%", ok: depth > 0.05 && depth < 0.6, detail: `m = ${(depth * 100).toFixed(1)} %` },
          { label: "the envelope swings at the 1 kHz voice tone", ok: Math.abs(fAudio - 1e3) < 250, detail: `${fAudio.toFixed(0)} Hz` },
        ],
        summary: `${(fCarrier / 1e3).toFixed(0)} kHz carrier, m=${(depth * 100).toFixed(0)}% at ${fAudio.toFixed(0)} Hz`,
      }
    },
  }
}
