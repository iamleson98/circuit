// board_to_spice.mjs — turn a rendered tscircuit board (circuit JSON) into a
// SPICE deck. Shared engine of the simulation harness: every R/C/L/D/LED/Q/pot
// on a real board becomes a SPICE element with the board's own refdes, value
// and net connectivity, so the simulated circuit IS the routed board.
//
// Parts SPICE can't know about (battery, switch, mic, antenna, varicap, ICs,
// crystals, ferrite beads...) are described by small per-testbench handlers in
// harness/testbenches/*.mjs — this file deliberately THROWS on any part without
// a handler, so an unmodelled part can never slip through silently.
//
// v2 additions for the harness (vs. the copies in each project's calc/):
//   opts.refdesPrefix — prefix every component name and every auto-named net
//     (n_*) so two boards can be concatenated into one deck (the tricolor
//     lamp's controller + LED panel). Explicitly named nets (net.V12 …) are
//     NOT prefixed — they are the boards' shared connections.
//   opts.capModel     — per-part MLCC model: { esr, esl } adds the real
//     parasitics of a ceramic cap (matters from ~1 MHz up).
import { val } from "./spice.mjs"

export function boardToSpice(json, opts = {}) {
  const comps = json.filter((e) => e.type === "source_component")
  const ports = json.filter((e) => e.type === "source_port")
  const nets = json.filter((e) => e.type === "source_net")
  const compName = Object.fromEntries(comps.map((c) => [c.source_component_id, c.name]))
  const netName = Object.fromEntries(nets.map((n) => [n.source_net_id, n.name]))
  const key = (p) => `${compName[p.source_component_id]}.${p.name}`
  const portById = Object.fromEntries(ports.map((p) => [p.source_port_id, p]))

  // connectivity from the board's own traces
  const parent = {}
  const find = (a) => { parent[a] ??= a; while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a }
  const union = (a, b) => { parent[find(a)] = find(b) }
  for (const p of ports) find(key(p))
  for (const t of json.filter((e) => e.type === "source_trace")) {
    const ids = [...(t.connected_source_port_ids ?? []).map((id) => key(portById[id])), ...(t.connected_source_net_ids ?? []).map((id) => `net:${netName[id]}`)]
    ids.forEach(find)
    for (let i = 1; i < ids.length; i++) union(ids[0], ids[i])
  }
  // closed switches are shorts
  for (const name of opts.closedSwitches ?? []) union(`${name}.pin1`, `${name}.pin2`)

  const groupName = {}
  for (const k of Object.keys(parent)) {
    const r = find(k)
    if (k.startsWith("net:")) {
      const n = k.slice(4).toLowerCase()
      if (n === "gnd") groupName[r] = "0"
      else if (!groupName[r] || (groupName[r] !== "0" && groupName[r].startsWith("n_"))) groupName[r] = n
    }
  }
  // unnamed nets: named after the alphabetically-first pin on them (stable across runs)
  const members = {}
  for (const k of Object.keys(parent)) if (!k.startsWith("net:")) (members[find(k)] ??= []).push(k)
  for (const [r, ks] of Object.entries(members)) if (!groupName[r]) groupName[r] = `n_${ks.sort()[0].replace(/\./g, "_").toLowerCase()}`

  const pfx = opts.refdesPrefix ?? ""
  // SPICE element names must keep their type letter first: R1 → R<pfx>1
  const ref = (name) => name[0] + pfx + name.slice(1)
  const el = (letter, rest) => letter + pfx + rest
  const node = (portKey) => {
    const r = find(portKey)
    if (!groupName[r]) throw new Error(`unknown pin ${portKey}`)
    const n = groupName[r]
    return n.startsWith("n_") ? pfx + n : n
  }
  // a part with a hand-made footprint only answers to pin1/pin2…; tscircuit numbers
  // diodes and LEDs anode = pin1, cathode = pin2
  const FALLBACK = { anode: "pin1", cathode: "pin2" }
  const pinByHint = (c, hint) => {
    const has = (h) => ports.find((p) => p.source_component_id === c.source_component_id && (p.port_hints ?? []).includes(h))
    const p = has(hint) ?? (FALLBACK[hint] && has(FALLBACK[hint]))
    if (!p) throw new Error(`${c.name}: no port with hint ${hint}`)
    return node(key(p))
  }

  const lines = [`* ${opts.title ?? "board"} — generated from the routed board by harness/tools/board_to_spice.mjs`]
  const covered = new Set()
  for (const c of comps) {
    const n = c.name
    const custom = opts.parts?.[n] ?? opts.parts?.[n.replace(/\d+$/, "*")]
    const nodeOf = (pin) => pinByHint(c, pin)
    if (custom) { const out = custom({ c, node: nodeOf, name: n }); if (out) lines.push(out); covered.add(n); continue }
    switch (c.ftype) {
      case "simple_resistor": lines.push(`${ref(n)} ${nodeOf("pin1")} ${nodeOf("pin2")} ${c.resistance}`); break
      case "simple_capacitor": {
        const cm = opts.capModel?.[n]
        if (cm?.esr || cm?.esl) {
          // a real MLCC: ESR + ESL in series with the ideal cap
          const a = nodeOf("pin1"), b = nodeOf("pin2"), m = pfx + n.toLowerCase()
          const esr = cm.esr ?? 0, esl = cm.esl ?? 0
          lines.push(`${el("R", n + "_ESR")} ${a} ${m}_c ${esr}`)
          if (esl) { lines.push(`${el("L", n + "_ESL")} ${m}_c ${m}_l ${esl}`, `${el("C", n)} ${m}_l ${b} ${c.capacitance}`) }
          else lines.push(`${el("C", n)} ${m}_c ${b} ${c.capacitance}`)
        } else lines.push(`${ref(n)} ${nodeOf("pin1")} ${nodeOf("pin2")} ${c.capacitance}`)
        break
      }
      case "simple_inductor": {
        const L = val(c.inductance)
        const q = opts.coilQ?.[n]
        if (q) {
          const rs = (2 * Math.PI * q.f * L) / q.Q
          lines.push(`${ref(n)} ${nodeOf("pin1")} ${pfx + n.toLowerCase()}_s ${L}`, `${el("R", n + "_LOSS")} ${pfx + n.toLowerCase()}_s ${nodeOf("pin2")} ${rs.toPrecision(4)}`)
        } else lines.push(`${ref(n)} ${nodeOf("pin1")} ${nodeOf("pin2")} ${L}`)
        break
      }
      case "simple_diode": lines.push(`${ref(n)} ${nodeOf("anode")} ${nodeOf("cathode")} ${opts.diodeModel?.[n] ?? opts.diodeModel?.default ?? "D1N4148"}`); break
      case "simple_led": lines.push(`D${pfx}${n} ${nodeOf("anode")} ${nodeOf("cathode")} ${opts.ledModel?.[n] ?? opts.ledModel?.default ?? "LEDG"}`); break
      case "simple_transistor": lines.push(`${ref(n)} ${nodeOf("collector")} ${nodeOf("base")} ${nodeOf("emitter")} ${opts.transistorModel?.[n] ?? opts.transistorModel?.default ?? "BC547B"}`); break
      case "simple_potentiometer": {
        const R = c.max_resistance, w = opts.wiper?.[n] ?? 0.5
        lines.push(`${ref(n + "_A")} ${nodeOf("pin1")} ${nodeOf("pin2")} ${Math.max(1, R * (1 - w))}`, `${ref(n + "_B")} ${nodeOf("pin2")} ${nodeOf("pin3")} ${Math.max(1, R * w)}`)
        break
      }
      case "simple_switch": if ((opts.closedSwitches ?? []).includes(n)) { covered.add(n); continue } lines.push(`* ${n}: open switch`); break
      default: throw new Error(`no SPICE mapping for ${n} (${c.ftype}) — add a handler in its testbench`)
    }
    covered.add(n)
  }
  if (opts.extra) lines.push(opts.extra)
  return { deck: lines.join("\n"), node: (k) => node(k), covered }
}
