/**
 * fm-radio-lab-rx.mjs — harness testbench for the FM receiver board.
 * The flagship view: the super-regenerative detector doing its thing. The
 * quench astable free-runs at an ultrasonic rate; once per quench cycle the
 * RF detector ignites into a burst of ~100 MHz oscillation and is killed
 * again — the envelope of those bursts IS the received audio. Two runs:
 * the quench (fast time step) and one full RF burst (fine time step).
 */
const VAR_MODELS = `
.model D1N4148HI D(IS=2.52n N=1.752 RS=0.568 CJO=4p M=0.4 VJ=0.75 TT=20n)
.model D1N4148LO D(IS=2.52n N=1.752 RS=0.568 CJO=1.2p M=0.4 VJ=0.75 TT=20n)`

const shortWire = (h, f = 98e6) => {
  const lam = 3e8 / f, b = (2 * Math.PI * h) / lam, Z0 = 60 * (Math.log((2 * h) / 0.3e-3) - 1)
  return { R: 395 * (h / lam) ** 2, C: 1 / (2 * Math.PI * f * (Z0 / Math.tan(b))) }
}

/** deterministic band-limited noise — the antenna's thermal noise (as in calc/sim_fm.mjs) */
function noise(rms = 1e-7, hold = 0.2e-9, seed = 12345) {
  let s = seed >>> 0, last = -1, v = 0
  const rnd = () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296 }
  return (t) => { const k = Math.floor(t / hold); if (k !== last) { last = k; v = rms * Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-12))) * Math.cos(2 * Math.PI * rnd()) } return v }
}

export default {
  id: "fm-radio-lab-rx",
  title: "FM Radio Lab — FM receiver",
  blurb: "the super-regen: quench astable + RF bursts at ~98 MHz, once per quench cycle",
  project: "fm-radio-lab",
  boardFile: "dist/receiver/index.js",
  scenarios: [superRegen],
}

function superRegen(ctx) {
  const { json, boardToSpice, MODELS } = ctx
  const w = shortWire(0.3)
  const build = () =>
    MODELS +
    boardToSpice(json, {
      title: "FM Radio Lab FM-RX — super-regenerative detector",
      closedSwitches: ["SW1"],
      transistorModel: { default: "BC547B", Q1: "Q2N2222A" },
      coilQ: { L1: { Q: 100, f: 98e6 } },
      wiper: { RV1: 0.5 },
      leadL: Object.fromEntries(["C2", "C3", "C4", "C5", "C6", "C15", "C16", "C17", "C21", "C22"].map((n) => [n, 5e-9])),
      parts: {
        BT1: ({ node }) => `VBT1 bt1_emf ${node("pin2")} 9\nRBT1_INT bt1_emf ${node("pin1")} 1.5`,
        TRIM1: ({ node }) => `CTRIM1 ${node("A")} ${node("B")} 15p`,
        ANT1: ({ node }) => `VANT1 ant1_emf 0 0\nRANT1_RAD ant1_emf ant1_w ${w.R}\nCANT1_WIRE ant1_w ${node("ANT")} ${w.C}\nRANT1_LEAK ${node("ANT")} 0 1meg`,
        EAR1: ({ node }) => `REAR1 ${node("TIP")} ${node("SLE")} 32  ; 32 Ω earbud`,
      },
      // the astable's DC solution has both transistors on; a 2 µs tug starts it
      extra: `CPAR_TANK tank 0 2p\nINOISE 0 tank 0\nIUNLATCH q2b 0 PULSE(0 3m 0 10n 10n 2u 1)`,
    }).deck
  return {
    name: "super-regen",
    what: "The super-regen detector: ultrasonic quench, one RF burst per cycle",
    cirTrailer: ".tran 0.05n 75u",
    deck: build(),
    run() {
      const { Circuit, amp, freq, mean } = ctx
      const T = 75e-6
      // the super-regen at RF time steps, seeded by realistic antenna noise
      const cb = new Circuit(this.deck)
      cb.get("INOISE").setFn(noise())
      const r = cb.tran({ tstop: T, h: 0.05e-9, probes: ["tank", "q2c", "aout"], every: 2 })
      const us = (a) => a.map((t) => t * 1e3)
      // envelope of the RF bursts in 0.1 µs windows (after the unlatch transient)
      const W = 0.1e-6, env = []
      for (let t = 20e-6; t < T - W; t += W) env.push([t, amp(r.t, r.tank, t, t + W)])
      let pk = -Infinity
      for (const e of env) if (e[1] > pk) pk = e[1]
      // the quench: rising edges of Q2's collector
      let edges = []
      for (let i = 1; i < r.t.length; i++) if (r.t[i] > 20e-6 && r.q2c[i - 1] < 2.5 && r.q2c[i] >= 2.5) edges.push(r.t[i])
      const fQuench = edges.length > 1 ? (edges.length - 1) / (edges[edges.length - 1] - edges[0]) : 0
      // ignition: an envelope peak after each quench edge = one RF burst per cycle
      let ign = []
      for (const e of edges) {
        const hit = env.find((x) => x[0] >= e && x[1] >= 0.2 * pk)
        if (hit && hit[0] - e < 12e-6) ign.push(hit[0] - e)
      }
      // RF frequency inside the strongest burst
      let best = 0, bestT = 0
      for (const [t, a] of env) if (a > best) { best = a; bestT = t }
      const fRF = freq(r.t, r.tank, bestT, bestT + 0.2e-6)
      const aAudio = amp(r.t, r.aout, 20e-6, T)
      return {
        series: [
          { label: "TANK — the RF bursts (one per quench cycle)", unit: "V", kind: "transient", x: us(r.t), y: r.tank },
          { label: "AOUT — the burst envelope, i.e. the received audio", unit: "V", kind: "transient", x: us(r.t), y: r.aout },
        ],
        checks: [
          { label: "the quench free-runs in the ultrasonic range", ok: fQuench > 25e3 && fQuench < 100e3, detail: `${(fQuench / 1e3).toFixed(1)} kHz` },
          { label: "the RF detector ignites once per quench cycle", ok: ign.length >= edges.length - 1 && pk > 0.3, detail: `${ign.length}/${edges.length} cycles, ignition ${ign.length ? (mean(ign) * 1e6).toFixed(2) : "?"} µs after the edge` },
          { label: "the burst sits in the FM broadcast band", ok: fRF > 86e6 && fRF < 109e6, detail: `${(fRF / 1e6).toFixed(1)} MHz` },
          { label: "R22 pins the burst ≤ 2.5 Vpk (the detector's own limiter)", ok: pk <= 2.5, detail: `${pk.toFixed(2)} Vpk` },
        ],
        summary: `quench ${(fQuench / 1e3).toFixed(0)} kHz, bursts ${(fRF / 1e6).toFixed(1)} MHz at ${pk.toFixed(2)} Vpk`,
      }
    },
  }
}
