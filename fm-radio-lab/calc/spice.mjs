// spice.mjs — compact MNA circuit simulator for independent verification.
// DC operating point, AC small-signal, transient (trapezoidal / backward Euler).
// Devices: R C L V I E G D Q(NPN, SPICE Gummel-Poon subset with junction + diffusion charge).
// Netlist syntax is a SPICE subset so the same decks run in ngspice / LTspice.

const KT_Q = 0.025852 // kT/q at 300 K
const GMIN = 1e-12

export function val(s) {
  if (typeof s === "number") return s
  const m = String(s).trim().toLowerCase().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(meg|mil|[tgkmunpf])?/)
  if (!m) throw new Error(`bad number: ${s}`)
  const mult = { t: 1e12, g: 1e9, meg: 1e6, k: 1e3, m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15, mil: 25.4e-6 }
  return parseFloat(m[1]) * (m[2] ? mult[m[2]] : 1)
}

/* ───────────────────────── junction helpers ───────────────────────── */
function depl(v, cj0, vj, m, fc) {
  // SPICE depletion charge/capacitance with forward-bias linearisation
  if (cj0 === 0) return [0, 0]
  if (v < fc * vj) {
    const a = 1 - v / vj
    return [(cj0 * vj * (1 - Math.pow(a, 1 - m))) / (1 - m), cj0 * Math.pow(a, -m)]
  }
  const f1 = (vj * (1 - Math.pow(1 - fc, 1 - m))) / (1 - m)
  const f2 = Math.pow(1 - fc, 1 + m)
  const f3 = 1 - fc * (1 + m)
  const q = cj0 * (f1 + (1 / f2) * (f3 * (v - fc * vj) + (m / (2 * vj)) * (v * v - fc * fc * vj * vj)))
  const c = (cj0 / f2) * (f3 + (m * v) / vj)
  return [q, c]
}
function pnjlim(vnew, vold, vt, vcrit) {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt
      return arg > 0 ? vold + vt * Math.log(arg) : vcrit
    }
    return vt * Math.log(vnew / vt)
  }
  return vnew
}
const safeExp = (x) => (x > 80 ? Math.exp(80) * (1 + x - 80) : Math.exp(x))

/* ───────────────────────── circuit ───────────────────────── */
export class Circuit {
  constructor(text = "") {
    this.nodeIdx = new Map([["0", 0], ["gnd", 0]])
    this.nodeNames = ["0"]
    this.devices = []
    this.byName = new Map()
    this.models = {}
    this.nBranch = 0
    this.temp = 27
    if (text) this.parse(text)
  }
  node(name) {
    name = String(name).toLowerCase()
    if (!this.nodeIdx.has(name)) {
      this.nodeIdx.set(name, this.nodeNames.length)
      this.nodeNames.push(name)
    }
    return this.nodeIdx.get(name)
  }
  internal(base) { return this.node(`${base}#${this.nodeNames.length}`) }
  branch() { return this.nBranch++ }
  add(dev) { this.devices.push(dev); this.byName.set(dev.name.toLowerCase(), dev); return dev }
  get(name) { return this.byName.get(name.toLowerCase()) }

  parse(text) {
    const lines = []
    for (const raw of text.split("\n")) {
      const l = raw.replace(/;.*$/, "").trim()
      if (!l || l.startsWith("*")) continue
      if (l.startsWith("+") && lines.length) lines[lines.length - 1] += " " + l.slice(1)
      else lines.push(l)
    }
    // models first
    for (const l of lines) {
      if (/^\.model/i.test(l)) {
        const m = l.match(/^\.model\s+(\S+)\s+(\w+)\s*\(?(.*?)\)?\s*$/i)
        const p = {}
        for (const kv of m[3].replace(/[(),]/g, " ").split(/\s+/).filter(Boolean)) {
          const [k, v] = kv.split("=")
          if (v !== undefined) p[k.toUpperCase()] = val(v)
        }
        this.models[m[1].toLowerCase()] = { type: m[2].toUpperCase(), ...p }
      }
    }
    for (const l of lines) {
      if (l.startsWith(".")) continue
      const tok = l.match(/\S+\([^)]*\)|\S+/g)
      const name = tok[0]
      const t = name[0].toUpperCase()
      if (t === "R") this.add(new Resistor(this, name, tok[1], tok[2], val(tok[3])))
      else if (t === "C") this.add(new Capacitor(this, name, tok[1], tok[2], val(tok[3])))
      else if (t === "L") this.add(new Inductor(this, name, tok[1], tok[2], val(tok[3])))
      else if (t === "V" || t === "I") this.add(new Source(this, name, tok[1], tok[2], tok.slice(3).join(" "), t === "V"))
      else if (t === "E") this.add(new VCVS(this, name, tok[1], tok[2], tok[3], tok[4], val(tok[5])))
      else if (t === "G") this.add(new VCCS(this, name, tok[1], tok[2], tok[3], tok[4], val(tok[5])))
      else if (t === "D") this.add(new Diode(this, name, tok[1], tok[2], this.model(tok[3]), tok[4] ? val(tok[4]) : 1))
      else if (t === "Q") this.add(new BJT(this, name, tok[1], tok[2], tok[3], this.model(tok[4]), tok[5] ? val(tok[5]) : 1))
      else throw new Error(`unsupported element: ${l}`)
    }
  }
  model(name) {
    const m = this.models[name.toLowerCase()]
    if (!m) throw new Error(`unknown model ${name}`)
    return m
  }
  get n() { return this.nodeNames.length - 1 + this.nBranch }
  finalize() {
    if (this._final) return
    for (const d of this.devices) d.setup?.(this)
    this._final = true
  }
  nodeOf(name) {
    const i = this.nodeIdx.get(String(name).toLowerCase())
    if (i === undefined) throw new Error(`no node ${name}`)
    return i
  }
  v(x, name) { const i = this.nodeOf(name); return i === 0 ? 0 : x[i - 1] }

  /* ── one linearised solve ── */
  _assemble(ctx) {
    const n = this.n
    ctx.A.fill(0)
    ctx.b.fill(0)
    ctx.limited = false
    for (const d of this.devices) d.load(ctx)
    if (ctx.gshunt) for (let i = 0; i < this.nodeNames.length - 1; i++) ctx.A[i * n + i] += ctx.gshunt
  }
  _newton(ctx, maxIt = 80) {
    const n = this.n
    for (let it = 0; it < maxIt; it++) {
      this._assemble(ctx)
      const xn = solve(ctx.A, ctx.b, n)
      if (!xn) return false
      let conv = !ctx.limited
      for (let i = 0; i < n; i++) {
        const tol = 1e-6 * Math.max(Math.abs(xn[i]), Math.abs(ctx.x[i])) + (i < this.nodeNames.length - 1 ? 1e-7 : 1e-11)
        if (Math.abs(xn[i] - ctx.x[i]) > tol) conv = false
        if (!Number.isFinite(xn[i])) return false
      }
      ctx.x.set(xn)
      if (conv && it > 0) return true
    }
    return false
  }
  _ctx(mode) {
    const n = this.n
    return { mode, n, A: new Float64Array(n * n), b: new Float64Array(n), x: new Float64Array(n), circ: this, srcScale: 1, t: 0, h: 0, method: "be" }
  }

  op({ x0 } = {}) {
    this.finalize()
    const ctx = this._ctx("dc")
    if (x0) ctx.x.set(x0)
    for (const d of this.devices) d.initDC?.()
    if (this._newton(ctx, 150)) return this._acceptOp(ctx)
    // gmin stepping
    ctx.x.fill(0)
    for (const d of this.devices) d.initDC?.()
    let ok = true
    for (let g = 1e-2; g >= 1e-13; g /= 10) {
      ctx.gshunt = g > 1e-12 ? g : 0
      if (!this._newton(ctx, 150)) { ok = false; break }
    }
    if (ok) return this._acceptOp(ctx)
    // source stepping
    ctx.x.fill(0); ctx.gshunt = 0
    for (const d of this.devices) d.initDC?.()
    for (let s = 0.05; s <= 1.0001; s += 0.05) {
      ctx.srcScale = Math.min(1, s)
      if (!this._newton(ctx, 200)) throw new Error(`DC operating point failed at source scale ${s}`)
    }
    return this._acceptOp(ctx)
  }
  _acceptOp(ctx) {
    ctx.gshunt = 0
    this._x = Float64Array.from(ctx.x)
    for (const d of this.devices) d.acceptDC?.(ctx)
    return this._x
  }

  /** AC small-signal at the stored operating point. sources: AC mag on V/I lines, or setAC(name, mag). */
  ac(freqs, probes) {
    if (!this._x) this.op()
    const n = this.n
    const G = new Float64Array(n * n), Cm = new Float64Array(n * n), B = new Float64Array(n)
    const ctx = { mode: "ac", n, G, C: Cm, b: B, x: this._x, circ: this }
    for (const d of this.devices) d.loadAC?.(ctx)
    const out = []
    for (const f of freqs) {
      const w = 2 * Math.PI * f
      const N = 2 * n
      const A = new Float64Array(N * N), b = new Float64Array(N)
      for (let i = 0; i < n; i++) {
        b[i] = B[i]
        for (let j = 0; j < n; j++) {
          A[i * N + j] = G[i * n + j]
          A[(i + n) * N + (j + n)] = G[i * n + j]
          A[i * N + (j + n)] = -w * Cm[i * n + j]
          A[(i + n) * N + j] = w * Cm[i * n + j]
        }
      }
      const z = solve(A, b, N)
      const row = { f }
      for (const p of probes) {
        const i = this.nodeOf(p)
        row[p] = i === 0 ? [0, 0] : [z[i - 1], z[i - 1 + n]]
      }
      out.push(row)
    }
    return out
  }

  /** transient: h = nominal step; probes = node names or I(name); every = record decimation */
  tran({ tstop, h, tstart = 0, probes = [], every = 1, method = "trap", onStep, maxCuts = 12 }) {
    this.finalize()
    if (!this._x) this.op()
    const ctx = this._ctx("tran")
    ctx.x.set(this._x)
    for (const d of this.devices) d.initTran?.(ctx)
    const rec = { t: [], ...Object.fromEntries(probes.map((p) => [p, []])) }
    const probeFns = probes.map((p) => {
      const m = p.match(/^i\((.+)\)$/i)
      if (m) { const d = this.get(m[1]); return (x) => d.current(x) }
      const i = this.nodeOf(p)
      return (x) => (i === 0 ? 0 : x[i - 1])
    })
    let t = 0, k = 0, hcur = h, firstStep = true
    const xsave = new Float64Array(this.n)
    // stop within a relative hair of tstop: a remaining step smaller than t's own
    // floating-point resolution would never advance t (and loop forever)
    while (tstop - t > Math.max(1e-18, tstop * 1e-12)) {
      let hstep = Math.min(hcur, tstop - t)
      let cuts = 0
      for (;;) {
        xsave.set(ctx.x)
        ctx.t = t + hstep
        ctx.h = hstep
        ctx.method = firstStep ? "be" : method
        if (this._newton(ctx, 60)) break
        ctx.x.set(xsave)
        hstep /= 4
        if (++cuts > maxCuts) throw new Error(`transient failed at t=${t}`)
      }
      t += hstep
      for (const d of this.devices) d.acceptTran?.(ctx)
      firstStep = false
      hcur = Math.min(h, hstep * 2)
      if (onStep) onStep(t, ctx.x, this)
      if (t >= tstart && k++ % every === 0) {
        rec.t.push(t)
        probeFns.forEach((fn, i) => rec[probes[i]].push(fn(ctx.x)))
      }
    }
    this._xEnd = Float64Array.from(ctx.x)
    return rec
  }
}

/* ───────────────────────── linear solver ───────────────────────── */
function solve(Ain, bin, n) {
  const A = Float64Array.from(Ain), b = Float64Array.from(bin)
  for (let k = 0; k < n; k++) {
    let p = k, mx = Math.abs(A[k * n + k])
    for (let i = k + 1; i < n; i++) { const v = Math.abs(A[i * n + k]); if (v > mx) { mx = v; p = i } }
    if (mx < 1e-300) return null
    if (p !== k) {
      for (let j = k; j < n; j++) { const tmp = A[k * n + j]; A[k * n + j] = A[p * n + j]; A[p * n + j] = tmp }
      const tb = b[k]; b[k] = b[p]; b[p] = tb
    }
    const piv = A[k * n + k]
    for (let i = k + 1; i < n; i++) {
      const f = A[i * n + k] / piv
      if (f === 0) continue
      for (let j = k + 1; j < n; j++) A[i * n + j] -= f * A[k * n + j]
      b[i] -= f * b[k]
    }
  }
  const x = new Float64Array(n)
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]
    for (let j = i + 1; j < n; j++) s -= A[i * n + j] * x[j]
    x[i] = s / A[i * n + i]
  }
  return x
}

/* ───────────────────────── stamping helpers ───────────────────────── */
const R = (i) => i - 1 // node index → matrix row (ground = -1)
function addA(ctx, i, j, v) { if (i >= 0 && j >= 0) ctx.A[i * ctx.n + j] += v }
function addB(ctx, i, v) { if (i >= 0) ctx.b[i] += v }
function stampG(ctx, a, b, g) { const i = R(a), j = R(b); addA(ctx, i, i, g); addA(ctx, j, j, g); addA(ctx, i, j, -g); addA(ctx, j, i, -g) }
function stampI(ctx, a, b, I) { addB(ctx, R(a), -I); addB(ctx, R(b), I) } // current I flowing a→b through element
function acG(ctx, a, b, g, M = ctx.G) { const i = R(a), j = R(b), n = ctx.n; if (i >= 0) M[i * n + i] += g; if (j >= 0) M[j * n + j] += g; if (i >= 0 && j >= 0) { M[i * n + j] -= g; M[j * n + i] -= g } }
const vOf = (x, i) => (i === 0 ? 0 : x[i - 1])

/** state for a (possibly nonlinear) charge between two nodes */
class Charge {
  constructor() { this.qPrev = 0; this.iPrev = 0 }
  stamp(ctx, a, b, q, c, v) {
    if (ctx.mode !== "tran") return
    const h = ctx.h
    let geq, i0
    if (ctx.method === "trap") { geq = (2 * c) / h; i0 = (2 / h) * (q - c * v - this.qPrev) - this.iPrev }
    else { geq = c / h; i0 = (q - c * v - this.qPrev) / h }
    stampG(ctx, a, b, geq)
    stampI(ctx, a, b, i0)
  }
  accept(ctx, q) {
    const h = ctx.h
    this.iPrev = ctx.method === "trap" ? (2 / h) * (q - this.qPrev) - this.iPrev : (q - this.qPrev) / h
    this.qPrev = q
  }
  init(q) { this.qPrev = q; this.iPrev = 0 }
}

/* ───────────────────────── devices ───────────────────────── */
class Resistor {
  constructor(c, name, a, b, r) { this.name = name; this.a = c.node(a); this.b = c.node(b); this.r = r }
  load(ctx) { stampG(ctx, this.a, this.b, 1 / this.r) }
  loadAC(ctx) { acG(ctx, this.a, this.b, 1 / this.r) }
  current(x) { return (vOf(x, this.a) - vOf(x, this.b)) / this.r }
}
class Capacitor {
  constructor(c, name, a, b, C) { this.name = name; this.a = c.node(a); this.b = c.node(b); this.c = C; this.q = new Charge() }
  load(ctx) { const v = vOf(ctx.x, this.a) - vOf(ctx.x, this.b); this.q.stamp(ctx, this.a, this.b, this.c * v, this.c, v) }
  initTran(ctx) { this.q.init(this.c * (vOf(ctx.x, this.a) - vOf(ctx.x, this.b))) }
  acceptTran(ctx) { this.q.accept(ctx, this.c * (vOf(ctx.x, this.a) - vOf(ctx.x, this.b))) }
  loadAC(ctx) { acG(ctx, this.a, this.b, this.c, ctx.C) }
  current() { return this.q.iPrev }
}
class Inductor {
  constructor(c, name, a, b, L) { this.name = name; this.a = c.node(a); this.b = c.node(b); this.L = L }
  setup(c) { this.br = c.nodeNames.length - 1 + c.branch() }
  load(ctx) {
    const k = this.br, i = R(this.a), j = R(this.b)
    addA(ctx, i, k, 1); addA(ctx, j, k, -1)
    addA(ctx, k, i, 1); addA(ctx, k, j, -1)
    if (ctx.mode === "tran") {
      const h = ctx.h
      if (ctx.method === "trap") { addA(ctx, k, k, (-2 * this.L) / h); addB(ctx, k, (-2 * this.L * this.iPrev) / h - this.vPrev) }
      else { addA(ctx, k, k, -this.L / h); addB(ctx, k, (-this.L * this.iPrev) / h) }
    }
  }
  initTran(ctx) { this.iPrev = ctx.x[this.br]; this.vPrev = vOf(ctx.x, this.a) - vOf(ctx.x, this.b) }
  acceptTran(ctx) { this.iPrev = ctx.x[this.br]; this.vPrev = vOf(ctx.x, this.a) - vOf(ctx.x, this.b) }
  loadAC(ctx) {
    const k = this.br, i = R(this.a), j = R(this.b), n = ctx.n
    if (i >= 0) { ctx.G[i * n + k] += 1; ctx.G[k * n + i] += 1 }
    if (j >= 0) { ctx.G[j * n + k] -= 1; ctx.G[k * n + j] -= 1 }
    ctx.C[k * n + k] -= this.L
  }
  current(x) { return x[this.br] }
}
function parseWave(spec) {
  const s = spec.trim()
  let dc = 0, ac = 0, fn = null
  const acm = s.match(/\bac\s+(\S+)/i)
  if (acm) ac = val(acm[1])
  const dcm = s.match(/^(?:dc\s+)?([+-]?[\d.]+\S*)/i)
  if (dcm && !/^(sin|pulse)/i.test(s)) dc = val(dcm[1])
  const sin = s.match(/sin\s*\(([^)]*)\)/i)
  if (sin) {
    const [vo, va, f, td = 0, th = 0, ph = 0] = sin[1].trim().split(/[\s,]+/).map(val)
    dc = vo
    fn = (t) => (t < td ? vo + va * Math.sin((ph * Math.PI) / 180) : vo + va * Math.exp(-th * (t - td)) * Math.sin(2 * Math.PI * f * (t - td) + (ph * Math.PI) / 180))
  }
  const pul = s.match(/pulse\s*\(([^)]*)\)/i)
  if (pul) {
    const [v1, v2, td = 0, tr = 1e-9, tf = 1e-9, pw = 1, per = Infinity] = pul[1].trim().split(/[\s,]+/).map(val)
    dc = v1
    fn = (t) => {
      if (t < td) return v1
      const tt = (t - td) % per
      if (tt < tr) return v1 + ((v2 - v1) * tt) / tr
      if (tt < tr + pw) return v2
      if (tt < tr + pw + tf) return v2 + ((v1 - v2) * (tt - tr - pw)) / tf
      return v1
    }
  }
  return { dc, ac, fn }
}
class Source {
  constructor(c, name, a, b, spec, isV) { this.name = name; this.a = c.node(a); this.b = c.node(b); this.isV = isV; Object.assign(this, parseWave(spec)) }
  setup(c) { if (this.isV) this.br = c.nodeNames.length - 1 + c.branch() }
  value(ctx) { const v = ctx.mode === "tran" && this.fn ? this.fn(ctx.t) : this.fn ? this.fn(0) : this.dc; return v * (ctx.srcScale ?? 1) }
  setFn(fn) { this.fn = fn }
  load(ctx) {
    const v = this.value(ctx)
    if (this.isV) {
      const k = this.br, i = R(this.a), j = R(this.b)
      addA(ctx, i, k, 1); addA(ctx, j, k, -1); addA(ctx, k, i, 1); addA(ctx, k, j, -1)
      addB(ctx, k, v)
    } else stampI(ctx, this.a, this.b, v)
  }
  loadAC(ctx) {
    const n = ctx.n
    if (this.isV) {
      const k = this.br, i = R(this.a), j = R(this.b)
      if (i >= 0) { ctx.G[i * n + k] += 1; ctx.G[k * n + i] += 1 }
      if (j >= 0) { ctx.G[j * n + k] -= 1; ctx.G[k * n + j] -= 1 }
      ctx.b[k] += this.ac
    } else { if (R(this.a) >= 0) ctx.b[R(this.a)] -= this.ac; if (R(this.b) >= 0) ctx.b[R(this.b)] += this.ac }
  }
  current(x) { return this.isV ? -x[this.br] : this.dc } // current delivered out of + terminal
}
class VCVS {
  constructor(c, name, a, b, ca, cb, g) { this.name = name; this.a = c.node(a); this.b = c.node(b); this.ca = c.node(ca); this.cb = c.node(cb); this.g = g }
  setup(c) { this.br = c.nodeNames.length - 1 + c.branch() }
  load(ctx) {
    const k = this.br
    addA(ctx, R(this.a), k, 1); addA(ctx, R(this.b), k, -1)
    addA(ctx, k, R(this.a), 1); addA(ctx, k, R(this.b), -1)
    addA(ctx, k, R(this.ca), -this.g); addA(ctx, k, R(this.cb), this.g)
  }
  loadAC(ctx) {
    const n = ctx.n, k = this.br, G = ctx.G
    const put = (i, j, v) => { if (i >= 0 && j >= 0) G[i * n + j] += v }
    put(R(this.a), k, 1); put(R(this.b), k, -1); put(k, R(this.a), 1); put(k, R(this.b), -1); put(k, R(this.ca), -this.g); put(k, R(this.cb), this.g)
  }
}
class VCCS {
  constructor(c, name, a, b, ca, cb, g) { this.name = name; this.a = c.node(a); this.b = c.node(b); this.ca = c.node(ca); this.cb = c.node(cb); this.g = g }
  load(ctx) { addA(ctx, R(this.a), R(this.ca), this.g); addA(ctx, R(this.a), R(this.cb), -this.g); addA(ctx, R(this.b), R(this.ca), -this.g); addA(ctx, R(this.b), R(this.cb), this.g) }
  loadAC(ctx) { const n = ctx.n, G = ctx.G, put = (i, j, v) => { if (i >= 0 && j >= 0) G[i * n + j] += v }; put(R(this.a), R(this.ca), this.g); put(R(this.a), R(this.cb), -this.g); put(R(this.b), R(this.ca), -this.g); put(R(this.b), R(this.cb), this.g) }
}

class Diode {
  constructor(c, name, a, k, m, area) {
    this.name = name
    this.p = { IS: 1e-14, N: 1, RS: 0, CJO: 0, VJ: 1, M: 0.5, FC: 0.5, TT: 0, ...m }
    this.p.IS *= area; this.p.CJO *= area
    this.aExt = c.node(a); this.k = c.node(k)
    this.a = this.p.RS > 0 ? c.internal(name) : this.aExt
    this.vt = this.p.N * KT_Q
    this.vcrit = this.vt * Math.log(this.vt / (Math.SQRT2 * this.p.IS))
    this.vd = 0
    this.q = new Charge()
  }
  initDC() { this.vd = 0 }
  eval(v) {
    const { IS, CJO, VJ, M, FC, TT } = this.p
    const e = safeExp(v / this.vt)
    const id = IS * (e - 1) + GMIN * v
    const gd = (IS * e) / this.vt + GMIN
    const [qd, cd] = depl(v, CJO, VJ, M, FC)
    return { id, gd, q: qd + TT * id, c: cd + TT * gd }
  }
  load(ctx) {
    if (this.p.RS > 0) stampG(ctx, this.aExt, this.a, 1 / this.p.RS)
    let v = vOf(ctx.x, this.a) - vOf(ctx.x, this.k)
    const vl = pnjlim(v, this.vd, this.vt, this.vcrit)
    if (Math.abs(vl - v) > 1e-12) ctx.limited = true
    this.vd = vl
    const e = this.eval(vl)
    stampG(ctx, this.a, this.k, e.gd)
    stampI(ctx, this.a, this.k, e.id - e.gd * vl)
    this.q.stamp(ctx, this.a, this.k, e.q, e.c, vl)
  }
  initTran(ctx) { this.q.init(this.eval(vOf(ctx.x, this.a) - vOf(ctx.x, this.k)).q) }
  acceptTran(ctx) { this.q.accept(ctx, this.eval(vOf(ctx.x, this.a) - vOf(ctx.x, this.k)).q) }
  loadAC(ctx) {
    if (this.p.RS > 0) acG(ctx, this.aExt, this.a, 1 / this.p.RS)
    const e = this.eval(vOf(ctx.x, this.a) - vOf(ctx.x, this.k))
    acG(ctx, this.a, this.k, e.gd); acG(ctx, this.a, this.k, e.c, ctx.C)
  }
  current(x) { return this.eval(vOf(x, this.a) - vOf(x, this.k)).id + this.q.iPrev }
}

class BJT {
  constructor(c, name, cc, bb, ee, m, area) {
    const d = { IS: 1e-16, BF: 100, NF: 1, VAF: Infinity, IKF: Infinity, ISE: 0, NE: 1.5, BR: 1, NR: 1, VAR: Infinity, IKR: Infinity, ISC: 0, NC: 2, RB: 0, RE: 0, RC: 0, CJE: 0, VJE: 0.75, MJE: 0.33, CJC: 0, VJC: 0.75, MJC: 0.33, FC: 0.5, TF: 0, TR: 0 }
    this.p = { ...d, ...m }
    for (const k of ["VAF", "VAR", "IKF", "IKR"]) if (!this.p[k]) this.p[k] = Infinity
    this.name = name
    this.cx = c.node(cc); this.bx = c.node(bb); this.ex = c.node(ee)
    this.c = this.p.RC > 0 ? c.internal(name + "c") : this.cx
    this.b = this.p.RB > 0 ? c.internal(name + "b") : this.bx
    this.e = this.p.RE > 0 ? c.internal(name + "e") : this.ex
    this.vtf = this.p.NF * KT_Q
    this.vtr = this.p.NR * KT_Q
    this.vcritF = this.vtf * Math.log(this.vtf / (Math.SQRT2 * this.p.IS))
    this.vcritR = this.vtr * Math.log(this.vtr / (Math.SQRT2 * this.p.IS))
    this.vbe = 0.6; this.vbc = -1
    this.qbe = new Charge(); this.qbc = new Charge()
  }
  initDC() { this.vbe = 0.6; this.vbc = -1 }
  I(vbe, vbc) {
    const p = this.p
    const If = p.IS * (safeExp(vbe / this.vtf) - 1)
    const Ir = p.IS * (safeExp(vbc / this.vtr) - 1)
    const q1 = 1 / (1 - vbc / p.VAF - vbe / p.VAR)
    const q2 = If / p.IKF + Ir / p.IKR
    const qb = (q1 * (1 + Math.sqrt(Math.max(1 + 4 * q2, 1e-6)))) / 2
    const Icc = (If - Ir) / qb
    const Ibe = If / p.BF + (p.ISE ? p.ISE * (safeExp(vbe / (p.NE * KT_Q)) - 1) : 0) + GMIN * vbe
    const Ibc = Ir / p.BR + (p.ISC ? p.ISC * (safeExp(vbc / (p.NC * KT_Q)) - 1) : 0) + GMIN * vbc
    return { ic: Icc - Ibc, ib: Ibe + Ibc, If, Ir }
  }
  charges(vbe, vbc, If, Ir) {
    const p = this.p
    const [qe, ce] = depl(vbe, p.CJE, p.VJE, p.MJE, p.FC)
    const [qc, cc] = depl(vbc, p.CJC, p.VJC, p.MJC, p.FC)
    const gf = ((If + p.IS) / this.vtf), gr = ((Ir + p.IS) / this.vtr)
    return { qbe: qe + p.TF * If, cbe: ce + p.TF * gf, qbc: qc + p.TR * Ir, cbc: cc + p.TR * gr }
  }
  load(ctx) {
    const p = this.p
    if (p.RC > 0) stampG(ctx, this.cx, this.c, 1 / p.RC)
    if (p.RB > 0) stampG(ctx, this.bx, this.b, 1 / p.RB)
    if (p.RE > 0) stampG(ctx, this.ex, this.e, 1 / p.RE)
    const vb = vOf(ctx.x, this.b), vc = vOf(ctx.x, this.c), ve = vOf(ctx.x, this.e)
    let vbe = vb - ve, vbc = vb - vc
    const vbel = pnjlim(vbe, this.vbe, this.vtf, this.vcritF)
    const vbcl = pnjlim(vbc, this.vbc, this.vtr, this.vcritR)
    if (Math.abs(vbel - vbe) > 1e-12 || Math.abs(vbcl - vbc) > 1e-12) ctx.limited = true
    vbe = vbel; vbc = vbcl
    this.vbe = vbe; this.vbc = vbc
    const d = 1e-7
    const I0 = this.I(vbe, vbc)
    const Ie1 = this.I(vbe + d, vbc), Ie2 = this.I(vbe - d, vbc)
    const Ic1 = this.I(vbe, vbc + d), Ic2 = this.I(vbe, vbc - d)
    const gcbe = (Ie1.ic - Ie2.ic) / (2 * d), gbbe = (Ie1.ib - Ie2.ib) / (2 * d)
    const gcbc = (Ic1.ic - Ic2.ic) / (2 * d), gbbc = (Ic1.ib - Ic2.ib) / (2 * d)
    // rows: current INTO device from node (= leaving node)
    const rc = R(this.c), rb = R(this.b), re = R(this.e)
    const row = (r, I, gbe, gbc) => {
      addA(ctx, r, rb, gbe + gbc); addA(ctx, r, re, -gbe); addA(ctx, r, rc, -gbc)
      addB(ctx, r, -(I - gbe * vbe - gbc * vbc))
    }
    row(rc, I0.ic, gcbe, gcbc)
    row(rb, I0.ib, gbbe, gbbc)
    row(re, -(I0.ic + I0.ib), -(gcbe + gbbe), -(gcbc + gbbc))
    const ch = this.charges(vbe, vbc, I0.If, I0.Ir)
    this.qbe.stamp(ctx, this.b, this.e, ch.qbe, ch.cbe, vbe)
    this.qbc.stamp(ctx, this.b, this.c, ch.qbc, ch.cbc, vbc)
  }
  _v(x) { const vb = vOf(x, this.b); return [vb - vOf(x, this.e), vb - vOf(x, this.c)] }
  initTran(ctx) { const [vbe, vbc] = this._v(ctx.x); const I = this.I(vbe, vbc); const ch = this.charges(vbe, vbc, I.If, I.Ir); this.qbe.init(ch.qbe); this.qbc.init(ch.qbc) }
  acceptTran(ctx) { const [vbe, vbc] = this._v(ctx.x); const I = this.I(vbe, vbc); const ch = this.charges(vbe, vbc, I.If, I.Ir); this.qbe.accept(ctx, ch.qbe); this.qbc.accept(ctx, ch.qbc) }
  loadAC(ctx) {
    const p = this.p
    if (p.RC > 0) acG(ctx, this.cx, this.c, 1 / p.RC)
    if (p.RB > 0) acG(ctx, this.bx, this.b, 1 / p.RB)
    if (p.RE > 0) acG(ctx, this.ex, this.e, 1 / p.RE)
    const [vbe, vbc] = this._v(ctx.x)
    const d = 1e-7
    const Ie1 = this.I(vbe + d, vbc), Ie2 = this.I(vbe - d, vbc)
    const Ic1 = this.I(vbe, vbc + d), Ic2 = this.I(vbe, vbc - d)
    const gcbe = (Ie1.ic - Ie2.ic) / (2 * d), gbbe = (Ie1.ib - Ie2.ib) / (2 * d)
    const gcbc = (Ic1.ic - Ic2.ic) / (2 * d), gbbc = (Ic1.ib - Ic2.ib) / (2 * d)
    const n = ctx.n, G = ctx.G
    const put = (i, j, v) => { if (i >= 0 && j >= 0) G[i * n + j] += v }
    const rc = R(this.c), rb = R(this.b), re = R(this.e)
    const row = (r, gbe, gbc) => { put(r, rb, gbe + gbc); put(r, re, -gbe); put(r, rc, -gbc) }
    row(rc, gcbe, gcbc); row(rb, gbbe, gbbc); row(re, -(gcbe + gbbe), -(gcbc + gbbc))
    const I0 = this.I(vbe, vbc)
    const ch = this.charges(vbe, vbc, I0.If, I0.Ir)
    acG(ctx, this.b, this.e, ch.cbe, ctx.C); acG(ctx, this.b, this.c, ch.cbc, ctx.C)
  }
  op(x) { const [vbe, vbc] = this._v(x); const I = this.I(vbe, vbc); return { vbe, vbc, vce: vbe - vbc, ic: I.ic, ib: I.ib } }
}

/* ───────────────────────── analysis helpers ───────────────────────── */
export const MODELS = `
* Standard vendor SPICE models (ON Semi / Fairchild 2N3904 & 2N2222A; NXP BC547B)
.model Q2N3904 NPN(IS=6.734f BF=416.4 NE=1.259 ISE=6.734f IKF=66.78m BR=.7371 NC=2 RC=1 RB=10 VAF=74.03 CJC=3.638p MJC=.3085 VJC=.75 FC=.5 CJE=4.493p MJE=.2593 VJE=.75 TR=239.5n TF=301.2p)
.model Q2N2222A NPN(IS=14.34f BF=255.9 NE=1.307 ISE=14.34f IKF=.2847 BR=6.092 NC=2 RC=1 RB=10 VAF=74.03 CJC=7.306p MJC=.3416 VJC=.75 FC=.5 CJE=22.01p MJE=.377 VJE=.75 TR=46.91n TF=411.1p)
.model BC547B NPN(IS=2.39E-14 NF=1.008 ISE=3.545E-15 NE=1.541 BF=294.3 IKF=0.1357 VAF=63.2 NR=1.004 ISC=6.272E-14 NC=1.243 BR=7.946 IKR=0.1144 VAR=25.9 RB=1 RE=0.4683 RC=0.85 CJE=1.358E-11 VJE=0.65 MJE=0.3279 TF=4.391E-10 CJC=3.728E-12 VJC=0.3997 MJC=0.2955 TR=1E-9 FC=0.9579)
.model D1N34A D(IS=1.3e-7 N=1.3 RS=7 CJO=0.6p VJ=0.3 M=0.4 TT=2n)
.model D1N4148 D(IS=2.52n N=1.752 RS=0.568 CJO=4p M=0.4 VJ=0.75 TT=20n)
.model LEDG D(IS=4.7e-20 N=2 RS=5 CJO=20p)
`
export function rms(a) { let s = 0; for (const v of a) s += v * v; return Math.sqrt(s / a.length) }
export function mean(a) { let s = 0; for (const v of a) s += v; return s / a.length }
/** frequency by mean-crossing interpolation over [t0,t1] */
export function freq(t, y, t0 = -Infinity, t1 = Infinity) {
  const idx = []
  for (let i = 0; i < t.length; i++) if (t[i] >= t0 && t[i] <= t1) idx.push(i)
  const m = mean(idx.map((i) => y[i]))
  const cr = []
  for (let k = 1; k < idx.length; k++) {
    const a = y[idx[k - 1]] - m, b = y[idx[k]] - m
    if (a < 0 && b >= 0) cr.push(t[idx[k - 1]] + ((t[idx[k]] - t[idx[k - 1]]) * -a) / (b - a))
  }
  if (cr.length < 3) return 0
  return (cr.length - 1) / (cr[cr.length - 1] - cr[0])
}
/** peak-to-peak/2 in a window */
export function amp(t, y, t0, t1) {
  let mx = -Infinity, mn = Infinity
  for (let i = 0; i < t.length; i++) if (t[i] >= t0 && t[i] <= t1) { if (y[i] > mx) mx = y[i]; if (y[i] < mn) mn = y[i] }
  return (mx - mn) / 2
}
/** single-bin DFT amplitude at frequency f over [t0,t1] (uniform sampling assumed) */
export function tone(t, y, f, t0, t1) {
  let re = 0, im = 0, n = 0
  for (let i = 0; i < t.length; i++) if (t[i] >= t0 && t[i] <= t1) { re += y[i] * Math.cos(2 * Math.PI * f * t[i]); im += y[i] * Math.sin(2 * Math.PI * f * t[i]); n++ }
  return (2 * Math.hypot(re, im)) / n
}
