#!/usr/bin/env python3
"""make_plots.py — generate the tutorial's matplotlib figures:
AM concept, LC-tank resonance/selectivity, and the 4 simulation plots.
Palette matches the cascade palette used across the document."""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ACCENT = "#3681a6"; ACCENT2 = "#b43a4e"; HEADER = "#334650"; MUTED = "#6f7578"
BORDER = "#b8c8cf"; FILL = "#eff0f1"
plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 10,
    "axes.edgecolor": BORDER, "axes.labelcolor": HEADER,
    "xtick.color": MUTED, "ytick.color": MUTED,
    "axes.titlecolor": HEADER, "axes.titleweight": "bold",
    "axes.spines.top": False, "axes.spines.right": False,
    "figure.facecolor": "white", "axes.facecolor": "white",
    "legend.frameon": False,
})
OUT = "/home/z/my-project/scripts/radio_pdf/diagrams"

def save(fig, name):
    fig.savefig(f"{OUT}/{name}", dpi=200, facecolor="white")
    plt.close(fig)
    print("wrote", name)

# ── 1. AM concept: audio × carrier = AM ────────────────────────────────────
fig, axes = plt.subplots(3, 1, figsize=(7.4, 5.6), constrained_layout=True)
t = np.linspace(0, 1, 4000)
fa, fc = 8, 160                     # audio 8 Hz-ish visual, carrier 160 (not to scale)
audio = 0.6 * np.sin(2 * np.pi * fa * t)
carrier = np.sin(2 * np.pi * fc * t)
m = 0.55
am = (1 + m * np.sin(2 * np.pi * fa * t)) * np.sin(2 * np.pi * fc * t)

axes[0].plot(t, audio, color=ACCENT2, lw=1.8)
axes[0].set_title("1 · The message — your voice (slow, a few kHz)")
axes[0].set_ylabel("voltage")
axes[0].set_ylim(-1, 1)

axes[1].plot(t, carrier, color=HEADER, lw=0.9)
axes[1].set_title("2 · The carrier — the transmitter's own sine wave (fast, ~750 kHz here)")
axes[1].set_ylabel("voltage")
axes[1].set_ylim(-1, 1)

axes[2].plot(t, am, color=ACCENT, lw=0.9)
axes[2].plot(t, 1 + m * np.sin(2 * np.pi * fa * t), color=ACCENT2, lw=1.2, ls="--", label="envelope = the message")
axes[2].plot(t, -(1 + m * np.sin(2 * np.pi * fa * t)), color=ACCENT2, lw=1.2, ls="--")
axes[2].set_title("3 · AM — the carrier's AMPLITUDE carries the message")
axes[2].set_ylabel("voltage"); axes[2].set_xlabel("time (not to scale — the carrier is ~100× faster)")
axes[2].set_ylim(-1.9, 1.9); axes[2].legend(loc="upper right", fontsize=9)
save(fig, "am-concept.png")

# ── 2. LC tank: resonance + selectivity ────────────────────────────────────
fig, axes = plt.subplots(1, 2, figsize=(8.6, 3.7), constrained_layout=True)
f = np.linspace(400e3, 1.1e6, 1200)
L, Q = 220e-6, 50
f0 = 1 / (2 * np.pi * np.sqrt(L * 300e-12))
Zmag = Q * 2 * np.pi * f * L / np.sqrt(1 + Q**2 * (f / f0 - f0 / f) ** 2)
ax = axes[0]
ax.plot(f / 1e6, Zmag / 1e3, color=ACCENT, lw=2.2)
ax.axvline(f0 / 1e6, color=ACCENT2, lw=1.2, ls="--")
bw = f0 / Q
ax.axvspan((f0 - bw / 2) / 1e6, (f0 + bw / 2) / 1e6, color=FILL)
ax.annotate(f"f₀ = {f0/1e3:.0f} kHz\n(TUNE knob)", xy=(f0 / 1e6, Q * 2 * np.pi * f0 * L / 1e3 * 0.96),
            xytext=(0.72, 60), fontsize=9.5, color=HEADER,
            arrowprops=dict(arrowstyle="->", color=MUTED))
ax.set_title("Tank impedance vs frequency")
ax.set_xlabel("frequency (MHz)"); ax.set_ylabel("|Z| (kΩ)")
ax.set_ylim(0, 75)

ax = axes[1]
rng = np.random.default_rng(4)
freqs = np.array([560, 594, 630, 666, 702, 738, 774, 810, 846, 882, 918, 954])
levels = rng.uniform(0.35, 1.0, len(freqs))
levels[np.argmin(np.abs(freqs - 738))] = 1.0
sel = np.exp(-((freqs - f0 / 1e3) / (bw / 1e3 / 1.35)) ** 2)
ax.bar(freqs - 9, levels, width=17, color=BORDER, label="what the antenna hears")
ax.bar(freqs + 9, levels * sel, width=17, color=ACCENT, label="what the tank passes")
ax.set_title(f"Selectivity: bandwidth ≈ {bw/1e3:.0f} kHz")
ax.set_xlabel("station frequency (kHz)"); ax.set_ylabel("relative level")
ax.set_xticks(freqs[::2]); ax.tick_params(axis="x", labelsize=8)
ax.legend(fontsize=9, loc="upper right")
save(fig, "lc-tank.png")

# ── 3. Simulation plots from the CSVs ──────────────────────────────────────
# 3a. start-up transient
d = np.genfromtxt("/home/z/my-project/work/radio-lab/sim-startup.csv", delimiter=",", names=True)
fig, ax = plt.subplots(figsize=(7.4, 3.4), constrained_layout=True)
ax.plot(d["t_us"], d["V_C"], color=ACCENT, lw=0.8, label="V(collector) — the tank")
ax.plot(d["t_us"], d["V_E"], color=ACCENT2, lw=0.8, alpha=0.8, label="V(emitter)")
ax.set_xlabel("time (µs)"); ax.set_ylabel("voltage (V)")
ax.set_title("Simulation: the oscillator waking up (1 mV seed → full swing in ~200 µs)")
ax.legend(loc="lower right", fontsize=9)
save(fig, "sim-startup.png")

# 3b. tuning sweep
d = np.genfromtxt("/home/z/my-project/work/radio-lab/sim-tuning.csv", delimiter=",", names=True)
fig, ax = plt.subplots(figsize=(7.4, 3.4), constrained_layout=True)
cv = np.linspace(5, 290, 300)
cs = 680e-12 * 680e-12 / (2 * 680e-12)
ideal = 1 / (2 * np.pi * np.sqrt(100e-6 * (cs + cv * 1e-12 + 12e-12)))
ax.plot(cv, ideal / 1e3, color=BORDER, lw=2, label="textbook 1/(2π√(LC))")
ax.plot(d["CV_pF"], d["f_measured_Hz"] / 1e3, "o", color=ACCENT, ms=8, label="measured in simulation")
ax.set_xlabel("TUNE capacitor CV1 (pF)"); ax.set_ylabel("carrier frequency (kHz)")
ax.set_title("Simulation: turning the TUNE knob slides the carrier across the band")
ax.set_ylim(500, 1000)
ax.legend(loc="upper right", fontsize=9)
save(fig, "sim-tuning.png")

# 3c. oscillator cleanliness under voice
d = np.genfromtxt("/home/z/my-project/work/radio-lab/sim-am.csv", delimiter=",", names=True)
fig, ax = plt.subplots(figsize=(7.4, 3.4), constrained_layout=True)
ax.plot(d["t_us"], d["V_C"], color=ACCENT, lw=0.6, label="carrier (oscillator output)")
ax.plot(d["t_us"], d["envelope_V"], color=ACCENT2, lw=2, label="carrier envelope")
ax.plot(d["t_us"], d["V_MD"], color=HEADER, lw=1.4, ls="--", label="V_MD (the voice)")
ax.set_xlabel("time (µs)"); ax.set_ylabel("voltage (V)")
ax.set_title("Simulation: the carrier stays alive and fairly steady while V_MD sings")
ax.legend(loc="lower right", fontsize=9, ncol=2)
save(fig, "sim-am-osc.png")

# 3d. the final stage's AM
d = np.genfromtxt("/home/z/my-project/work/radio-lab/sim-am-final.csv", delimiter=",", names=True)
fig, ax = plt.subplots(figsize=(7.4, 3.6), constrained_layout=True)
ax.plot(d["t_us"], d["V_C4"], color=ACCENT, lw=0.6, label="Q4 output (modulated carrier)")
ax.plot(d["t_us"], d["envelope_V"], color=ACCENT2, lw=2, label="measured envelope")
ax.plot(d["t_us"], d["V_MD"], color=HEADER, lw=1.4, ls="--", label="V_MD (the voice)")
ax.set_xlabel("time (µs)"); ax.set_ylabel("voltage (V)")
ax.set_title("Simulation: the final stage stamps the voice onto the carrier (m ≈ 0.23)")
ax.legend(loc="lower right", fontsize=9, ncol=2)
save(fig, "sim-am-final.png")
print("all plots done")
