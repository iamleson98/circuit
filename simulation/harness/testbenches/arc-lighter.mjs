/**
 * arc-lighter.mjs — harness testbench for the arc lighter's driver board.
 * One flagship transient: the firmware fires, the blocking oscillator runs,
 * the current limiter caps every cycle, the TVS holds the collector, the
 * spark gap strikes ~10,000 times a second.
 *
 * Everything on the board is the routed board's own part; the off-board
 * world (battery, LOCK switch, the coil, the arc gap) is modelled at the
 * board's pads — the same models the project's own calc/sim_driver.mjs
 * verified across the full coil/transistor corner grid.
 */
const EXTRA_MODELS = `
* vendor-style models (fitted to datasheets, as in arc-lighter/calc):
.model FZT851 NPN(IS=1e-12 BF=250 NF=1 VAF=100 IKF=6 ISE=1e-13 NE=1.5 BR=20 NR=1 RB=2 RE=0.01 RC=0.035 CJE=400p VJE=0.75 MJE=0.33 CJC=100p VJC=0.75 MJC=0.33 TF=1.2n TR=50n)
.model BC847B NPN(IS=7e-14 BF=300 NF=1 VAF=80 IKF=0.1 ISE=1e-14 NE=1.5 BR=8 RB=10 RC=1 CJE=11p CJC=4p TF=0.5n TR=10n)
.model SS14 D(IS=5e-6 N=1.05 RS=0.05 CJO=110p M=0.5 VJ=0.35 TT=5n)
.model LEDR D(IS=1e-19 N=1.9 RS=8 CJO=15p)
`

/** the nominal coil: primary 100 µH, feedback 0.5²·Lp, HV secondary referred 1:1 */
const COIL = (node) =>
  `* the coil at its pads: primary, feedback, HV secondary referred 1:1 to the\n` +
  `* primary side (keeps the matrix conditioned), and the spark gap:\n` +
  `LP vdrv lp_r 100u\nRLP lp_r col ${(0.002 * 100e-6) / 1e-6 + 0.03}\n` +
  `LF fb_w fba ${0.5 * 0.5 * 100e-6}\nRLF fb_w base 0.5\n` +
  `LS s1 s2r 100u\nRLS s2r s2 ${600 / 400 / 400}\nCS s1 s2 ${6e-12 * 400 * 400}\nRHV s2 0 ${1e9 / 400 / 400}\n` +
  `YGAP s1 s2 VBD=${7000 / 400} VARC=${400 / 400} RON=${1e3 / 400 / 400} IHOLD=${2e-3 * 400}\n` +
  `K1 LP LF LS 0.97`

export default {
  id: "arc-lighter",
  title: "Arc lighter — the driver board firing",
  blurb: "blocking oscillator, 2.6 A current limit, TVS clamp, ~10 k arc strikes/s",
  project: "arc-lighter",
  boardFile: "dist/board/index.js",
  scenarios: [firing],
}

function firing(ctx) {
  const { json, boardToSpice, MODELS } = ctx
  const deck =
    MODELS + EXTRA_MODELS +
    boardToSpice(json, {
      title: "Arc lighter — firing (nominal coil, 3.7 V cell)",
      transistorModel: { Q2: "FZT851", Q3: "BC847B" },
      diodeModel: { D1: "SS14" },
      ledModel: { default: "LEDR" },
      parts: {
        J1: () => "* J1: USB unplugged (firing is refused while plugged in)",
        U1: () => "* U1: charger idle",
        U2: () => "RU2_SUPPLY vmcu 0 3.7k  ; ATtiny85 awake, ~1 mA",
        J2: () => "* J2: ISP header, nothing connected",
        Q1: ({ node }) => `SQ1 ${node("source")} ${node("drain")} RON=0.06 ROFF=1e9  ; AO3401 P-FET, gate pulled low by PB4`,
        D2: ({ node }) =>
          `* D2: SMCJ33A TVS — reverse breakdown ≈ 38 V, forward a diode\n` +
          `DD2R ${node("pin2")} d2_bv SS14\nVD2BV d2_bv d2_r 38\nRD2 d2_r ${node("pin1")} 0.3\nDD2F ${node("pin1")} ${node("pin2")} SS14`,
        TP_BATP: ({ node }) => `VB bat_emf 0 3.7\nRBAT bat_emf ${node("BATP")} 0.15  ; cell + protection MOSFETs`,
        TP_BATN: () => "",
        TP_LOCKA: () => "RLOCK bat varm 0.02  ; the LOCK slide switch, closed (armed)",
        TP_LOCKB: () => "",
        TP_FIRE: () => "", TP_FIREG: () => "", TP_MODP: () => "", TP_MODN: () => "",
        TP_PP: ({ node }) => COIL(node),
        TP_PM: () => "", TP_FA: () => "", TP_FB: () => "",
      },
    }).deck
  return {
    name: "firing",
    what: "Firing: blocking oscillator runs, current limited, arc strikes ~10 k/s",
    cirTrailer: ".tran 20n 1.2m",
    deck,
    run() {
      const { Circuit, amp, mean } = ctx
      const c = new Circuit(this.deck)
      c.get("SQ1").closed = false
      c.op() // idle: Q1 open, VDRV discharged
      c.get("SQ1").closed = true // the firmware fires at t = 0
      const T = 1.2e-3
      const r = c.tran({ tstop: T, h: 20e-9, method: "be", probes: ["col", "emit", "vdrv", "i(RBAT)", "s2"], every: 5 })
      const ms = (a) => a.map((t) => t * 1e3)
      const t0 = T / 2
      const sel = (a) => a.filter((_, i) => r.t[i] > t0)
      const iSw = sel(r.emit).map((v) => v / 0.255) // RE1 ∥ RE2 = 0.255 Ω
      const strikes_kHz = c.get("YGAP").strikes / (T - t0) / 1e3
      const vceMax = Math.max(...sel(r.col))
      const iBat = mean(sel(r["i(RBAT)"]))
      return {
        series: [
          { label: "Q2 collector (the flyback)", unit: "V", kind: "transient", x: ms(r.t), y: r.col },
          { label: "Q2 switch current (emitter ÷ 0.255 Ω)", unit: "A", kind: "transient", x: ms(r.t), y: r.emit.map((v) => v / 0.255) },
          { label: "battery current", unit: "A", kind: "transient", x: ms(r.t), y: r["i(RBAT)"] },
        ],
        checks: [
          { label: "the arc strikes ≥ 4,000 times/s (firmware's monitor threshold is 2 kHz)", ok: strikes_kHz >= 4, detail: `${strikes_kHz.toFixed(1)} k/s` },
          { label: "Q3 + RE cap the switch current ≤ 3.6 A per cycle (FZT851: 6 A)", ok: Math.max(...iSw) <= 3.6, detail: `${Math.max(...iSw).toFixed(2)} A peak` },
          { label: "the TVS holds the collector ≤ 45 V (FZT851: 60 V)", ok: vceMax <= 45, detail: `${vceMax.toFixed(1)} V` },
          { label: "battery average ≤ 2.5 A (the pack's protection trips at ≈3 A)", ok: iBat <= 2.5, detail: `${iBat.toFixed(2)} A` },
        ],
        summary: `${strikes_kHz.toFixed(0)} k strikes/s, ${Math.max(...iSw).toFixed(1)} A pk, ${vceMax.toFixed(0)} V clamp`,
      }
    },
  }
}
