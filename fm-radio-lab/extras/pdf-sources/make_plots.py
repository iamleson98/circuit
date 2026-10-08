#!/usr/bin/env python3
"""make_plots.py — FM Radio Lab tutorial figures:
FM concept, the quench cycle concept, and 4 simulation plots from the
sim_*.csv files produced by calc/sim_fm.mjs."""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import csv, os

ACCENT = "#3681a6"; ACCENT2 = "#b43a4e"; HEADER = "#334650"; MUTED = "#6f7578"
BORDER = "#b8c8cf"; FILL = "#eff0f1"; OK = "#46875c"
plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 10,
    "axes.edgecolor": BORDER, "axes.labelcolor": HEADER,
    "xtick.color": MUTED, "ytick.color": MUTED,
    "axes.titlecolor": HEADER, "axes.titleweight": "bold",
    "axes.spines.top": False, "axes.spines.right": False,
    "figure.facecolor": "white", "axes.facecolor": "white",
    "legend.frameon": False,
})
OUT = "/home/z/my-project/scripts/fm_pdf/diagrams"
SIM = "/home/z/my-project/work/repo-circuit/fm-radio-lab"

def save(fig, name):
    fig.savefig(f"{OUT}/{name}", dpi=200, facecolor="white")
    plt.close(fig)
    print("wrote", name)

def read_csv(path):
    with open(path) as f:
        r = csv.reader(f)
        hdr = next(r)
        rows = [[float(x) for x in row] for row in r if row]
    return hdr, np.array(rows)

# ── 1. FM concept: same message, different carrier dance ──────────────────
fig, axes = plt.subplots(3, 1, figsize=(7.4, 5.6), constrained_layout=True)
t = np.linspace(0, 1, 6000)
fa, fc = 8, 160
audio = np.sin(2 * np.pi * fa * t)
dev = 0.35
inst_f = fc + dev * fc / 12 * audio
phase = 2 * np.pi * np.cumsum(inst_f) / 6000
fm = np.sin(phase)
am = (1 + 0.55 * audio) * np.sin(2 * np.pi * fc * t)

axes[0].plot(t, audio, color=ACCENT2, lw=1.8)
axes[0].set_title("1 · The message — your voice (slow, a few kHz)")
axes[0].set_ylabel("voltage"); axes[0].set_ylim(-1.2, 1.2)

axes[1].plot(t, am, color=MUTED, lw=0.8)
axes[1].set_title("2 · AM (the AM lab): the carrier's AMPLITUDE carries the message")
axes[1].set_ylabel("voltage")

axes[2].plot(t, fm, color=ACCENT, lw=0.8)
axes[2].set_title("3 · FM (this lab): the carrier's FREQUENCY carries the message — amplitude stays flat")
axes[2].set_ylabel("voltage"); axes[2].set_xlabel("time (not to scale — real carriers are ~100,000× faster than voice)")
save(fig, "fm-concept.png")

# ── 2. The quench cycle concept (one astable period) ─────────────────────
fig, ax = plt.subplots(figsize=(7.4, 4.2), constrained_layout=True)
T = 20.0  # µs
tt = np.linspace(0, 2 * T, 2000)
def astable(ph):
    if ph < 12.5: return 0.2
    return 0.2 + 8.8 * (1 - np.exp(-(ph - 12.5) / 4.7))
v_ast = np.array([astable(p % T) for p in tt])
env = np.zeros_like(tt)
for i, p in enumerate(tt):
    ph = p % T
    if ph < 12.5: env[i] = 0.02 * (ph / 12.5)
    elif ph < 18.4: env[i] = 0.05
    else: env[i] = min(2.0, 0.05 * np.exp((ph - 18.4) / 0.45))
ax.plot(tt, v_ast, color=HEADER, lw=2.2, label="astable output (gates Q1's base)")
ax2 = ax.twinx()
ax2.plot(tt, env, color=ACCENT2, lw=2.0, label="burst envelope (the tank)")
ax2.set_ylabel("burst envelope (V)", color=ACCENT2)
ax2.tick_params(axis="y", labelcolor=ACCENT2)
ax2.set_ylim(-0.1, 2.6)
ax.set_ylabel("astable collector (V)", color=HEADER)
ax.set_xlabel("time (µs) — two quench periods")
ax.set_title("The quench cycle: KILL (0-12.5µs) → SETTLE → RAMP → IGNITION → burst → repeat")
for x0, lbl in [(0, "KILL"), (12.5, "ramp starts"), (18.4, "ignition")]:
    ax.axvline(x0, color=BORDER, lw=1, ls=":")
ax.annotate("burst grows from\nnoise or carrier", xy=(19.5, 1.6), xytext=(13.8, 1.9),
            color=ACCENT2, fontsize=9, arrowprops=dict(arrowstyle="->", color=ACCENT2))
ax.set_ylim(-0.5, 10)
save(fig, "quench-concept.png")

# ── 3. TX start-up (sim-tx-startup.csv) ──────────────────────────────────
hdr, d = read_csv(f"{SIM}/sim-tx-startup.csv")
fig, ax = plt.subplots(figsize=(7.4, 3.6), constrained_layout=True)
ax.plot(d[:, 0] / 1e3, d[:, 1], color=ACCENT, lw=0.7, label="tank voltage V_C")
ax.axhline(9, color=MUTED, lw=1, ls="--", label="9V rail")
ax.set_xlabel("time (ns)"); ax.set_ylabel("V_C (V)")
ax.set_title("FM-TX start-up: a 1mV seed grows to a 4.6Vp carrier in ~300ns")
ax.legend(loc="lower right")
save(fig, "tx-startup.png")

# ── 4. TX FM modulation (sim-tx-fm.csv) ──────────────────────────────────
hdr, d = read_csv(f"{SIM}/sim-tx-fm.csv")
fig, ax = plt.subplots(figsize=(7.4, 3.8), constrained_layout=True)
ax.plot(d[:, 0], d[:, 1], color=ACCENT, lw=1.0, label="instantaneous frequency (MHz)")
ax2 = ax.twinx()
ax2.plot(d[:, 0], d[:, 2], color=ACCENT2, lw=1.4, label="audio on the base (mV)")
ax2.set_ylabel("audio (mV)", color=ACCENT2); ax2.tick_params(axis="y", labelcolor=ACCENT2)
ax.set_ylabel("frequency (MHz)"); ax.set_xlabel("time (µs)")
ax.set_title("FM proven: the carrier's frequency dances with the audio (±75kHz deviation)")
ax.set_ylim(d[:, 1].min() - 0.02, d[:, 1].max() + 0.02)
save(fig, "tx-fm.png")

# ── 5. RX quench (sim-rx-quench.csv) ─────────────────────────────────────
hdr, d = read_csv(f"{SIM}/sim-rx-quench.csv")
fig, ax = plt.subplots(figsize=(7.4, 4.0), constrained_layout=True)
ax.plot(d[:, 0], d[:, 1], color=ACCENT, lw=0.6, label="tank V_C (the bursts)")
ax.plot(d[:, 0], d[:, 6], color=HEADER, lw=2.2, label="astable output")
ax2 = ax.twinx()
ax2.plot(d[:, 0], d[:, 2], color=ACCENT2, lw=1.6, label="emitter V_E (the audio rides here)")
ax2.set_ylabel("V_E (V)", color=ACCENT2); ax2.tick_params(axis="y", labelcolor=ACCENT2)
ax.set_xlabel("time (µs)"); ax.set_ylabel("V (V)")
ax.set_title("FM-RX: two quench cycles — burst, kill, settle, ramp (simulation)")
ax.legend(loc="upper left", fontsize=8.5)
save(fig, "rx-quench.png")

# ── 6. RX quieting (sim-rx-detect.csv) ───────────────────────────────────
hdr, d = read_csv(f"{SIM}/sim-rx-detect.csv")
fig, axes = plt.subplots(2, 1, figsize=(7.4, 4.6), constrained_layout=True, sharex=True)
axes[0].plot(d[:, 0], d[:, 1], color=MUTED, lw=0.6)
axes[0].set_title("Bursts with NO signal — noise-seeded: jittery, uneven (the HISS)")
axes[1].plot(d[:, 0], d[:, 3], color=ACCENT2, lw=0.6)
axes[1].set_title("Bursts with a carrier captured — steady, stronger (THE SILENCE IS THE SIGNAL)")
axes[1].set_xlabel("time (µs)"); axes[0].set_ylabel("V_C (V)"); axes[1].set_ylabel("V_C (V)")
save(fig, "rx-quieting.png")

# ── 7. RX FM detection (sim-rx-fm.csv) ───────────────────────────────────
hdr, d = read_csv(f"{SIM}/sim-rx-fm.csv")
fig, ax = plt.subplots(figsize=(7.4, 3.8), constrained_layout=True)
ax.plot(d[:, 0], d[:, 1], color=MUTED, lw=0.6, label="raw detector output (V_E)")
ax.plot(d[:, 0], d[:, 2], color=ACCENT, lw=2.2, label="after the 2-pole audio filter (what the earphone gets)")
ax.set_xlabel("time (µs)"); ax.set_ylabel("V_E (V)")
ax.set_title("End-to-end FM reception: an FM station on the slope → recovered audio")
ax.legend(loc="upper right", fontsize=8.5)
save(fig, "rx-fm.png")

print("all figures done")
