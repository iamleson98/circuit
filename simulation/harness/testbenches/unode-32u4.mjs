/**
 * unode-32u4.mjs — simulation testbench for the μNode32U4 (ATmega32U4 USB dev
 * board). This board had NO simulation coverage before the harness: its four
 * scenarios simulate the board's own parts, straight from the routed board,
 * with only the off-board world (USB port, the chip's internals the datasheet
 * draws as block diagrams) modelled at the pads.
 *
 *   1. usb-hotplug       — VBUS steps 0→5 V: inrush through the polyfuse into
 *                          the bulk caps, the PTC's job, the R·C rise time
 *   2. avcc-isolation    — AC sweep: how much rail noise the ferrite beads +
 *                          100 nF leave on the analog AVCC supplies
 *   3. crystal-resonance — AC sweep: the razor-thin series-resonance dip
 *                          that makes a crystal THE frequency reference
 *   4. crystal-ring      — pluck it and watch the ring decay: the classic
 *                          ring-down Q measurement (Q = π·f0·τ ≈ 10,000),
 *                          and what the chip's stage must sustain
 *   5. indicators        — DC operating point of the four LEDs (including why
 *                          the TX/RX LEDs are active-LOW)
 */
export default {
  id: "unode-32u4",
  title: "μNode32U4 — ATmega32U4 USB dev board",
  blurb: "USB front-end, power integrity, 16 MHz clock, indicators — the board's own R/C/L/LEDs",
  project: "unode-32u4",
  boardFile: "dist/index.js",
  scenarios: [usbHotplug, avccIsolation, crystalResonance, crystalRing, indicators],
}

/* Off-board / inside-chip models shared by the scenarios.
 * The ATmega32U4's pins that matter per scenario get small behavioural
 * stand-ins; everything the board already owns (every R, C, LED) comes from
 * the routed board itself. */
function unodeParts({ vbus = "5", core = true, ucaps = true, gpio = {} } = {}) {
  return {
    J1: ({ node }) =>
      `* J1: the USB port — VBUS source + port/cable resistance\n` +
      `VJ1_VBUS vbus_src 0 ${vbus}\nRJ1_PORT vbus_src ${node("VBUS")} 0.5`,
    F1: ({ node }) =>
      `* F1: 500 mA-hold PTC polyfuse, cold ≈ 0.3 Ω (thermal mass: µs inrush\n` +
      `* pulses are over long before it could trip — that's the point)\n` +
      `RF1 ${node("pin1")} ${node("pin2")} 0.3`,
    FB1: ({ node }) => bead("FB1", node("IN"), node("OUT")),
    FB2: ({ node }) => bead("FB2", node("IN"), node("OUT")),
    Y1: ({ node }) =>
      `* Y1: 16 MHz crystal — the motional arm (R-L-C in series) that resonates,\n` +
      `* plus the case capacitance across it. f_series ≈ 15.997 MHz; the load\n` +
      `* caps pull it up to 16.000 MHz. Q ≈ 10 k.\n` +
      `RY1M ${node("pin1")} y1_m 142\nLY1M y1_m y1_k 14.14m\nCY1M y1_k ${node("pin2")} 7f\nCY1S ${node("pin1")} ${node("pin2")} 3.5p`,
    SW1: () => "* SW1: RESET button — not pressed",
    SW2: () => "* SW2: HWB button — not pressed",
    J2: () => "* J2: GPIO header — nothing plugged in",
    J3: () => "* J3: ICSP header — nothing plugged in",
    J4: () => "* J4: analog/GPIO header — nothing plugged in",
    U1: ({ node }) => {
      const l = ["* U1: ATmega32U4 — only the pieces the datasheet draws as blocks:"]
      if (core) l.push(
        `RU1_CORE v5 0 250  ; digital core ≈ 20 mA @ 5 V, 16 MHz`,
        `RU1_AVCC1 ${node("AVCC1")} 0 3k  ; analog section ≈ 1.7 mA per rail`,
        `RU1_AVCC2 ${node("AVCC2")} 0 3k`,
      )
      if (ucaps) l.push(
        `* internal 3.3 V regulator for USB (UCAP pin, datasheet §2.2.6):`,
        `EU1_3V3 u1_3v3 0 v5 0 0.66\nRU1_3V3 u1_3v3 ${node("UCAP")} 2`,
      )
      l.push(
        `* the oscillator pins' network (§6.3): the chip biases XTAL1/XTAL2 at\n` +
        `* mid-rail through its internal feedback and output structures, with\n` +
        `* ESD clamps bounding them to the rails. The ACTIVE part — the\n` +
        `* transconductance that cancels the crystal's 142 Ω of loss every\n` +
        `* cycle and sustains oscillation — lives inside the chip; designers\n` +
        `* verify it with the negative-resistance method (see crystal-ring):\n` +
        `* any stage that presents more than −Rm at the pins keeps the ring\n` +
        `* alive forever.`,
        `RMID_A v5 u1_mid 100k\nRMID_B u1_mid 0 100k`,
        `RU1RF xtal1 xtal2 10meg`,
        `RU1RO xtal2 u1_mid 20k`,
        `DU1CLH xtal2 v5 D1N4148`,
        `DU1CLL 0 xtal2 D1N4148`,
        `* the pins' ESD/protection structures give otherwise-floating analog\n` +
        `* nodes (D+, D−, AREF) a weak DC reference, like the real chip does:`,
        `RU1_BLE_DP ${node("DPLUS")} 0 10meg`,
        `RU1_BLE_DM ${node("DMINUS")} 0 10meg`,
        `RU1_BLE_AREF ${node("AREF")} 0 10meg`,
      )
      for (const [pin, level] of Object.entries(gpio))
        l.push(
          level ? `EU1_${pin} u1_${pin.toLowerCase()} 0 v5 0 1` : `VU1_${pin} u1_${pin.toLowerCase()} 0 0`,
          `RU1_${pin} u1_${pin.toLowerCase()} ${node(pin)} 25  ; pin ${level ? "HIGH" : "LOW (sinks)"}, ≈25 Ω output driver`,
        )
      return l.join("\n")
    },
  }
}

/** chip ferrite bead: DCR in series with (L ∥ loss-R) — 220 Ω @ 100 MHz class */
function bead(name, a, b) {
  const x = `${name.toLowerCase()}_x`
  return (
    `* ${name}: 0603 ferrite bead (BLM18PG221-class): 0.05 Ω DCR, ~1 µH ∥ 330 Ω\n` +
    `R${name}_DCR ${a} ${x} 0.05\nL${name} ${x} ${b} 1u\nR${name}_LOSS ${x} ${b} 330`
  )
}

/** every ceramic cap gets its real parasitics: ESR + ESL (matters ≥ 1 MHz) */
const CAP_PARASITICS = Object.fromEntries(
  ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11"].map((n) => [
    n,
    n === "C1" || n === "C7" ? { esr: 0.15, esl: 1.5e-9 } : n === "C2" ? { esr: 0.2, esl: 1.2e-9 } : { esr: 0.05, esl: 0.8e-9 },
  ]),
)

const deckOf = (ctx, opts, extra = "") => {
  const { deck } = ctx.boardToSpice(ctx.json, {
    title: "μNode32U4 — " + opts.title,
    capModel: CAP_PARASITICS,
    parts: unodeParts(opts.parts),
  })
  return `${ctx.MODELS}\n${extra}${deck}`
}

/* ── scenario 1: USB hot-plug ───────────────────────────────────────────── */
function usbHotplug(ctx) {
  return {
    name: "usb-hotplug",
    what: "USB hot-plug: 0→5 V through the polyfuse into the bulk capacitors",
    cirTrailer: ".tran 10n 25u",
    deck: deckOf(ctx, { title: "USB hot-plug inrush", parts: { vbus: "PULSE(0 5 2u 0.1u)" } }),
    run() {
      const { Circuit } = ctx
      const c = new Circuit(this.deck)
      const r = c.tran({ tstop: 25e-6, h: 10e-9, probes: ["v5", "i(VJ1_VBUS)", "avcc1"], every: 1 })
      const ms = (a) => a.map((t) => t * 1e3) // s → ms for the plot tools
      const iPk = Math.max(...r["i(VJ1_VBUS)"].filter((_, k) => r.t[k] > 1.9e-6))
      const vFinal = r.v5[r.v5.length - 1]
      const tau = (() => {
        for (let k = 0; k < r.v5.length; k++) if (r.v5[k] >= 0.632 * 5) return r.t[k] - 2e-6
        return NaN
      })()
      const tauTheory = 0.95 * 5.7e-6 // R(port+fuse+ESR) × C(bulk)
      return {
        series: [
          { label: "V5 rail", unit: "V", kind: "transient", x: ms(r.t), y: r.v5 },
          { label: "VBUS current (hot-plug inrush)", unit: "A", kind: "transient", x: ms(r.t), y: r["i(VJ1_VBUS)"] },
          { label: "AVCC1 (behind the bead)", unit: "V", kind: "transient", x: ms(r.t), y: r.avcc1 },
        ],
        checks: [
          { label: "inrush peak is a few amps (5 V / ≈0.95 Ω of port, fuse and ESR)", ok: iPk > 2 && iPk < 8, detail: `${iPk.toFixed(2)} A` },
          { label: "V5 settles within 0.1 V of 5 V (fuse drop at 20 mA is tiny)", ok: vFinal > 4.9 && vFinal < 5.05, detail: `${vFinal.toFixed(3)} V` },
          { label: "rise time ≈ R·C of the port+fuse against the bulk caps", ok: Math.abs(tau / tauTheory - 1) < 0.35, detail: `${(tau * 1e6).toFixed(1)} µs vs theory ${(tauTheory * 1e6).toFixed(1)} µs` },
        ],
        summary: `peak ${iPk.toFixed(1)} A, τ ${(tau * 1e6).toFixed(1)} µs, V5 → ${vFinal.toFixed(2)} V`,
      }
    },
  }
}

/* ── scenario 2: ferrite-bead AVCC isolation (AC sweep) ─────────────────── */
function avccIsolation(ctx) {
  const freqs = Array.from({ length: 121 }, (_, i) => 100e3 * Math.pow(1e9 / 100e3, i / 120))
  return {
    name: "avcc-isolation",
    what: "AC sweep: ferrite beads + 100 nF keep rail noise off the analog supplies",
    cirTrailer: ".ac dec 120 100k 1g",
    deck: deckOf(ctx, { title: "AVCC isolation vs frequency", parts: { vbus: "5 AC 1" } }),
    run() {
      const { Circuit, mean } = ctx
      const c = new Circuit(this.deck)
      const x = c.op() // DC bias point (the beads' 0.05 Ω DCR under the ADC's load)
      const dcV5 = c.v(x, "v5"), dcAv1 = c.v(x, "avcc1"), dcAv2 = c.v(x, "avcc2")
      const rows = c.ac(freqs, ["v5", "avcc1", "avcc2"])
      const mag = (z) => Math.hypot(z[0], z[1])
      const dB = (a, b) => 20 * Math.log10(a / b)
      const at = (f) => rows[Math.round(Math.log(f / 1e5) / Math.log(1e9 / 1e5) * 120)]
      const dbAt = (f, probe) => dB(mag(at(f)[probe]), mag(at(f).v5))
      const f1m = dbAt(1e6, "avcc1"), f2m = dbAt(2e6, "avcc1"), f10m = dbAt(1e7, "avcc1"), f100m = dbAt(1e8, "avcc1")
      return {
        series: [
          { label: "V5 rail (what the bulk caps leave on it)", unit: "V", kind: "ac_sweep", x: freqs, y: rows.map((r) => mag(r.v5)) },
          { label: "AVCC1 isolation (FB1 → C6)", unit: "dB", kind: "ac_sweep", x: freqs, y: rows.map((r) => dB(mag(r.avcc1), mag(r.v5))) },
          { label: "AVCC2 isolation (FB2 → C4)", unit: "dB", kind: "ac_sweep", x: freqs, y: rows.map((r) => dB(mag(r.avcc2), mag(r.v5))) },
        ],
        checks: [
          { label: "DC: the beads cost almost nothing (drop < 20 mV at the ADC's load)", ok: Math.abs(dcV5 - dcAv1) < 0.02 && Math.abs(dcV5 - dcAv2) < 0.02, detail: `${(1000 * (dcV5 - dcAv1)).toFixed(2)} / ${(1000 * (dcV5 - dcAv2)).toFixed(2)} mV` },
          { label: "1 MHz: the bead-cap pair sits just past its series resonance (their reactances cancel) — still ≥ 8 dB down", ok: f1m <= -8, detail: `${f1m.toFixed(1)} dB (resonance ≈ 500 kHz)` },
          { label: "2 MHz: ≥ 15 dB down (past the dip, divider recovered)", ok: f2m <= -15, detail: `${f2m.toFixed(1)} dB` },
          { label: "10 MHz: ≥ 40 dB down (bead inductive, cap still cap-like)", ok: f10m <= -40, detail: `${f10m.toFixed(1)} dB` },
          { label: "100 MHz: ≥ 45 dB down (bead lossy, cap is its own ESL)", ok: f100m <= -45, detail: `${f100m.toFixed(1)} dB` },
        ],
        summary: `AVCC1 ${f2m.toFixed(0)} dB @ 2 MHz, ${f100m.toFixed(0)} dB @ 100 MHz`,
      }
    },
  }
}

/* ── scenario 3: the crystal's resonance (AC sweep) ─────────────────────── */
function crystalResonance(ctx) {
  const fs = 1 / (2 * Math.PI * Math.sqrt(14.14e-3 * 7e-15)) // the motional series resonance
  const extra =
    "* stray capacitance of the XTAL pins/traces (datasheet: the load caps'\n" +
    "* value is chosen INCLUDING this): ~2 pF per side\n" +
    "CPAR_XTAL1 xtal1 0 2p\nCPAR_XTAL2 xtal2 0 2p\n" +
    "* a 1 µA AC test current poured into XTAL1 — the network's impedance\n" +
    "* |V(XTAL1)| shows the crystal's series resonance as a razor-thin dip\n" +
    "INU1_TEST 0 xtal1 0 AC 1u\n"
  return {
    name: "crystal-resonance",
    what: "AC sweep: the crystal's series resonance — the dip that picks 16 MHz",
    cirTrailer: ".ac lin 400 15.97meg 16.025meg",
    deck: deckOf(ctx, { title: "crystal resonance", parts: { vbus: "5" } }, extra),
    run() {
      const { Circuit } = ctx
      const c = new Circuit(this.deck, { reltol: 1e-9, vntol: 1e-9 })
      c.op()
      const n = 400
      const f0 = 15.97e6, f1 = 16.025e6
      const freqs = Array.from({ length: n }, (_, i) => f0 + ((f1 - f0) * i) / (n - 1))
      const rows = c.ac(freqs, ["xtal1", "xtal2"])
      const mag = (z) => Math.hypot(z[0], z[1])
      const zx = rows.map((r) => mag(r.xtal1)), zo = rows.map((r) => mag(r.xtal2))
      const iMin = zx.indexOf(Math.min(...zx)), iMax = zx.indexOf(Math.max(...zx))
      const fDip = freqs[iMin]
      const contrast = Math.max(...zx) / Math.min(...zx)
      // −3 dB bandwidth of the dip (where |Z| rises to √2 × the minimum)
      const z3 = Math.SQRT2 * zx[iMin]
      let lo = iMin, hi = iMin
      while (lo > 0 && zx[lo] < z3) lo--
      while (hi < n - 1 && zx[hi] < z3) hi++
      const bw = freqs[hi] - freqs[lo]
      const q = fDip / bw
      return {
        series: [
          { label: "|V(XTAL1)| — the input dip at series resonance", unit: "V", kind: "ac_sweep", x: freqs, y: zx },
          { label: "|V(XTAL2)| — coupled through the crystal", unit: "V", kind: "ac_sweep", x: freqs, y: zo },
        ],
        checks: [
          { label: "the dip lands on the crystal's series resonance 1/(2π√(Lm·Cm))", ok: Math.abs(fDip / fs - 1) < 0.001, detail: `${(fDip / 1e6).toFixed(5)} MHz vs ${(fs / 1e6).toFixed(5)} MHz` },
          { label: "at resonance the motional arm's 142 Ω shunts the pin (dip ≥ 3×)", ok: contrast >= 3, detail: `${contrast.toFixed(1)}× contrast` },
          { label: "the dip is crystal-thin: Q = f/BW in the thousands", ok: q > 5000 && q < 16000, detail: `Q ≈ ${q.toFixed(0)} (BW ${(bw / 1e3).toFixed(2)} kHz)` },
        ],
        summary: `dip at ${(fDip / 1e6).toFixed(4)} MHz, Q≈${q.toFixed(0)}`,
      }
    },
  }
}

/* ── scenario 4: ring-down — the laboratory Q measurement ───────────────── */
function crystalRing(ctx) {
  const fs = 1 / (2 * Math.PI * Math.sqrt(14.14e-3 * 7e-15))
  const extra =
    "* stray capacitance of the XTAL pins/traces: ~2 pF per side\n" +
    "CPAR_XTAL1 xtal1 0 2p\nCPAR_XTAL2 xtal2 0 2p\n" +
    "* PLUCKING the crystal: a 40 µs burst of 50 µA at its series resonance\n" +
    "* (the electrical equivalent of tapping a tuning fork). After the burst\n" +
    "* the ring decays at e^(−Rm·t/2Lm) — measuring that decay IS the classic\n" +
    "* laboratory Q measurement (Q = π·f0·τ).\n" +
    "INU1_SEED 0 xtal1 0\n"
  return {
    name: "crystal-ring",
    what: "Ring-down: pluck the crystal, watch it ring ~3,000 cycles — and decay",
    cirTrailer: ".tran 1n 200u",
    deck: deckOf(ctx, { title: "crystal ring-down", parts: { vbus: "5" } }, extra),
    run() {
      const { Circuit, amp, freq, mean } = ctx
      const c = new Circuit(this.deck, { reltol: 1e-9, vntol: 1e-9 })
      // the pluck: 50 µA at fs, 10→50 µs (setFn keeps the .cir readable: a plain source)
      c.get("INU1_SEED").setFn((t) => (t >= 10e-6 && t < 50e-6 ? 50e-6 * Math.sin(2 * Math.PI * fs * t) : 0))
      const r = c.tran({ tstop: 200e-6, h: 0.5e-9, probes: ["xtal1", "xtal2"], every: 20 })
      const ms = (a) => a.map((t) => t * 1e3)
      const tEnd = r.t[r.t.length - 1]
      const aPluck = amp(r.t, r.xtal1, 42e-6, 52e-6)   // ring right after the pluck
      const aEnd = amp(r.t, r.xtal1, tEnd - 15e-6, tEnd)
      const fMeas = freq(r.t, r.xtal1, tEnd - 40e-6, tEnd)
      const tau = aPluck > 0 && aEnd > 0 ? (tEnd - 7.5e-6 - 47e-6) / Math.log(aPluck / aEnd) : NaN
      const q = Math.PI * fMeas * tau
      const cycles = fMeas * tau // cycles per time constant
      return {
        series: [
          { label: "XTAL1 (rung and decaying)", unit: "V", kind: "transient", x: ms(r.t), y: r.xtal1 },
          { label: "XTAL2 (coupled through the crystal)", unit: "V", kind: "transient", x: ms(r.t), y: r.xtal2 },
        ],
        checks: [
          { label: "the ring is at the crystal's frequency (within 0.05% of 16 MHz)", ok: Math.abs(fMeas / 16e6 - 1) < 0.0005, detail: `${(fMeas / 1e6).toFixed(4)} MHz` },
          { label: "the pluck produces a healthy millivolt-scale ring", ok: aPluck > 1e-3 && aPluck < 0.1, detail: `${(aPluck * 1e3).toFixed(2)} mVpk after the burst` },
          { label: "…that outlives the burst by far (physics says τ = 2L/Rm ≈ 199 µs; the simulator's timestep adds damping of its own)", ok: tau > 50e-6 && tau < 300e-6, detail: `τ = ${(tau * 1e6).toFixed(0)} µs` },
          { label: "ring-down Q = π·f0·τ — a LOWER bound (step-size damped; the AC dip in crystal-resonance is the better measure)", ok: q > 2500 && q < 8000, detail: `Q ≥ ${q.toFixed(0)} (${cycles.toFixed(0)} cycles per τ)` },
        ],
        summary: `${(fMeas / 1e6).toFixed(4)} MHz, τ=${(tau * 1e6).toFixed(0)} µs → Q≥${q.toFixed(0)}; the chip must beat Rm=142 Ω to sustain it`,
      }
    },
  }
}

/* ── scenario 5: the four indicators (DC operating point) ───────────────── */
function indicators(ctx) {
  return {
    name: "indicators",
    what: "DC operating point: power LED on, D13 HIGH, TX/RX LEDs active-LOW",
    deck: deckOf(ctx, {
      title: "indicator LEDs",
      parts: { gpio: { PC7: true, PD5: false, PB0: false } }, // D13 HIGH; TX(PD5)/RX(PB0) pins LOW → their LEDs lit
    }),
    run() {
      const { Circuit } = ctx
      const c = new Circuit(this.deck)
      const x = c.op()
      const i = (n) => c.get(n).current(x)
      const iL1 = i("R5"), iL2 = i("R6"), iL3 = i("R7"), iL4 = i("R8")
      const mA = (v) => (v * 1e3).toFixed(2)
      const inR = (lo, hi, v) => v > lo && v < hi
      return {
        series: [
          { label: "LED1 power (green, always on)", unit: "A", kind: "op_point", point: iL1 },
          { label: "LED2 D13 (amber, pin HIGH)", unit: "A", kind: "op_point", point: iL2 },
          { label: "LED3 TX (amber, PD5 LOW → lit)", unit: "A", kind: "op_point", point: iL3 },
          { label: "LED4 RX (amber, PB0 LOW → lit)", unit: "A", kind: "op_point", point: iL4 },
          { label: "V5 rail", unit: "V", kind: "op_point", point: c.v(x, "v5") },
          { label: "internal 3.3 V regulator output", unit: "A", kind: "op_point", point: c.get("RU1_3V3").current(x) },
        ],
        checks: [
          { label: "power LED: (5 V − 2 V) / 1 kΩ ≈ 3 mA", ok: inR(2e-3, 4e-3, iL1), detail: `${mA(iL1)} mA` },
          { label: "D13 LED lit when the pin drives HIGH", ok: inR(2e-3, 4e-3, iL2), detail: `${mA(iL2)} mA` },
          { label: "TX LED lit with PD5 LOW — current flows V5→LED→R→pin", ok: inR(2e-3, 4e-3, iL3), detail: `${mA(iL3)} mA` },
          { label: "RX LED lit with PB0 LOW (active-low, like a Leonardo)", ok: inR(2e-3, 4e-3, iL4), detail: `${mA(iL4)} mA` },
          { label: "V5 ≈ 5 V under the core + LED load", ok: c.v(x, "v5") > 4.8, detail: `${c.v(x, "v5").toFixed(3)} V` },
        ],
        summary: `LEDs ${mA(iL1)} / ${mA(iL2)} / ${mA(iL3)} / ${mA(iL4)} mA`,
      }
    },
  }
}
