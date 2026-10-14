/**
 * radio-lab-rx.mjs — harness testbench for the AM receiver board.
 * One flagship transient: a station arrives at the antenna (30 mV of 30 %
 * AM at the frequency the TANK is actually tuned to — found first with a
 * quick AC sweep, exactly how you'd align a real set), and the audio comes
 * out of the detector and the LM386.
 *
 * Board parts are the routed board's own; off-board models as in the
 * project's calc/sim_am.mjs.
 */
export default {
  id: "radio-lab-rx",
  title: "Radio Lab — AM receiver",
  blurb: "tank tuned → detector → volume pot → LM386 → speaker: a station, received",
  project: "radio-lab",
  boardFile: "dist/receiver/index.js",
  scenarios: [receiving],
}

function receiving(ctx) {
  const { json, boardToSpice, MODELS } = ctx
  const names = {} // net names the handlers resolve (the LM386 output's net is auto-named)
  const build = () => {
    const { deck } = boardToSpice(json, {
      title: "Radio Lab AM-RX — receiving a station",
      closedSwitches: ["SW1"],
      transistorModel: { default: "BC547B" },
      diodeModel: { D1: "D1N34A", D2: "D1N34A" },
      coilQ: { L1: { Q: 50, f: 1e6 } },
      wiper: { RV1: 0.5 },
      parts: {
        BT1: ({ node }) => `VBT1 bt1_emf ${node("pin2")} 9\nRBT1_INT bt1_emf ${node("pin1")} 1.5`,
        SW2: ({ node }) => `RSW2_OPEN ${node("pin1")} ${node("pin2")} 100meg  ; GAIN 20/200 switch, open`,
        CV1: ({ node }) => `CCV1 ${node("STATOR_A")} ${node("ROTOR")} 150p`,
        ANT1: ({ node }) => `VANT1 ant1_emf 0 0\nCANT1_WIRE ant1_emf ${node("ANT")} 15p\nRANT1_LEAK ${node("ANT")} 0 100meg`,
        // LM386 behavioural model (datasheet equivalent circuit)
        U1: ({ node }) => {
          names.out = node("OUT")
          return [
            `RU1_INP ${node("IN_POS")} 0 50k`, ...(node("IN_NEG") === "0" ? [] : [`RU1_INN ${node("IN_NEG")} 0 50k`]),
            `RU1_GAIN ${node("GAIN_A")} ${node("GAIN_B")} 1.35k`, `RU1_GB ${node("GAIN_A")} 0 15k`,
            `RU1_BYP ${node("BYPASS")} 0 15k`, `RU1_Q ${node("VS")} ${node("GND")} 2.25k`,
            `EU1 u1_o u1_mid ${node("IN_POS")} ${node("IN_NEG")} 20`, `VU1_MID u1_mid 0 4.5`, `RU1_OUT u1_o ${node("OUT")} 0.5`,
          ].join("\n")
        },
        SPK1: ({ node }) => `RSPK1 ${node("SPK_P")} ${node("SPK_N")} 8`,
      },
      extra: "CPAR_TANK tank 0 8p",
    })
    return MODELS + deck
  }
  return {
    name: "receiving",
    what: "A 30 mV station arrives: tank rings, detector recovers the audio, LM386 amplifies it",
    cirTrailer: ".tran 20n 3m",
    deck: build(),
    run() {
      const { Circuit, amp, freq } = ctx
      const deck = build()
      const outNode = names.out, detNode = "det"
      // 1) align: find where the tank actually peaks (AC sweep at the antenna)
      const c = new Circuit(deck.replace("VANT1 ant1_emf 0 0", "VANT1 ant1_emf 0 DC 0 AC 1"))
      c.op()
      const sweep = c.ac(Array.from({ length: 80 }, (_, i) => 500e3 + (600e3 * i) / 79), ["tank"])
      let fPeak = 760e3, best = 0
      for (const row of sweep) {
        const m = Math.hypot(row.tank[0], row.tank[1])
        if (m > best) { best = m; fPeak = row.f }
      }
      // 2) receive: a 30 mV, 30 % AM station AT that frequency
      const c2 = new Circuit(deck)
      c2.get("VANT1").setFn((t) => 30e-3 * (1 + 0.3 * Math.sin(2 * Math.PI * 1e3 * t)) * Math.sin(2 * Math.PI * fPeak * t))
      const r = c2.tran({ tstop: 3e-3, h: 20e-9, probes: ["tank", detNode, outNode], every: 10 })
      const ms = (a) => a.map((t) => t * 1e3)
      const t1 = 1.5e-3
      const aDet = amp(r.t, r[detNode], t1, 3e-3)     // audio at the volume pot
      const aOut = amp(r.t, r[outNode], t1, 3e-3)     // audio at the speaker
      // the audio's dominant tone: single-bin DFT at 1 kHz vs its 3rd harmonic slot
      const t1k = ctx.tone(r.t, r[detNode], 1e3, t1, 3e-3)
      const t3k = ctx.tone(r.t, r[detNode], 3e3, t1, 3e-3)
      return {
        series: [
          { label: "TANK — the station, selected", unit: "V", kind: "transient", x: ms(r.t), y: r.tank },
          { label: "DETECTOR — the recovered audio", unit: "V", kind: "transient", x: ms(r.t), y: r[detNode] },
          { label: "LM386 OUTPUT — driving the speaker", unit: "V", kind: "transient", x: ms(r.t), y: r[outNode] },
        ],
        checks: [
          { label: "the tank is tuned inside the MW broadcast band", ok: fPeak > 510e3 && fPeak < 1705e3, detail: `peaks at ${(fPeak / 1e3).toFixed(0)} kHz` },
          { label: "a 30 mV station gives ≥ 20 mVpk of audio at the detector", ok: aDet >= 20e-3, detail: `${(aDet * 1e3).toFixed(0)} mVpk` },
          { label: "the LM386 amplifies it to drive the 8 Ω speaker", ok: aOut >= 5 * aDet && aOut > 0.1, detail: `${(aOut * 1e3).toFixed(0)} mVpk (${(aOut / aDet).toFixed(0)}×)` },
          { label: "the recovered audio is the 1 kHz tone (dominant over its harmonics)", ok: t1k > 2 * t3k && t1k > 15e-3, detail: `${(t1k * 1e3).toFixed(0)} mV at 1 kHz vs ${(t3k * 1e3).toFixed(1)} mV at 3 kHz` },
        ],
        summary: `tuned ${(fPeak / 1e3).toFixed(0)} kHz → ${(aDet * 1e3).toFixed(0)} mV detector, ${(aOut * 1e3).toFixed(0)} mV out`,
      }
    },
  }
}
