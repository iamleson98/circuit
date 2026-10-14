#!/usr/bin/env python3
"""
plot.py — turn the simulation harness's result JSON (harness/out/data/) into
PNG plots (harness/out/plots/).

    python3 harness/plot.py                # every scenario
    python3 harness/plot.py unode-32u4.crystal-ring arc-lighter.firing

Each scenario gets one PNG: waveforms (transient), a frequency response
(AC sweep), a characteristic curve (DC sweep) or a results card (op points).
Requires numpy + matplotlib.
"""
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent.parent          # simulation/
DATA_DIR = ROOT / "harness" / "out" / "data"
OUT_DIR = ROOT / "harness" / "out" / "plots"

PALETTE = ["#315cff", "#e05a00", "#00967c", "#c4142d", "#7a3ff2", "#b8860b"]
GRID_KW = dict(color="#d8dce6", linewidth=0.7)


def fmt_time(xs_ms):
    span = max(xs_ms) - min(xs_ms) if len(xs_ms) > 1 else 0
    if span >= 1.0:
        return xs_ms, "time (ms)"
    if span >= 1e-3:
        return [x * 1e3 for x in xs_ms], "time (µs)"
    return [x * 1e6 for x in xs_ms], "time (ns)"


def eng_unit(values, unit):
    vmax = max(abs(v) for v in values) if len(values) else 0
    if unit == "V":
        if vmax >= 1: return values, "voltage (V)"
        if vmax >= 1e-3: return [v * 1e3 for v in values], "voltage (mV)"
        if vmax >= 1e-6: return [v * 1e6 for v in values], "voltage (µV)"
        return [v * 1e9 for v in values], "voltage (nV)"
    if unit == "A":
        if vmax >= 1: return values, "current (A)"
        if vmax >= 1e-3: return [v * 1e3 for v in values], "current (mA)"
        if vmax >= 1e-6: return [v * 1e6 for v in values], "current (µA)"
        return [v * 1e9 for v in values], "current (nA)"
    return values, unit


def plot_transient(results, title, out_path, footer):
    by_unit = {}
    for r in results:
        by_unit.setdefault(r["unit"], []).append(r)
    units = [u for u in ("V", "A") if u in by_unit] or list(by_unit)

    npts = max(len(r["x"]) for r in results)
    zoom = npts > 1200
    nrows = len(units) * (2 if zoom else 1)

    fig, axes = plt.subplots(nrows, 1, figsize=(10, 2.6 * nrows + 1.0),
                             constrained_layout=True, squeeze=False)
    axes = axes[:, 0]
    row = 0
    for unit in units:
        for scope, suffix in (("full", ""), ("zoom", " — detail (tail)")) if zoom else (("full", ""),):
            ax = axes[row]
            for idx, r in enumerate(by_unit[unit]):
                x, xlab = fmt_time(r["x"])
                y, ylab = eng_unit(r["y"], unit)
                if scope == "zoom":
                    k = max(len(x) - 100, int(len(x) * 0.98))
                    x, y = x[k:], y[k:]
                ax.plot(x, y, color=PALETTE[idx % len(PALETTE)],
                        linewidth=1.0 if scope == "zoom" else 0.8, label=r["label"])
                ax.set_ylabel(ylab, fontsize=10)
            ax.grid(True, **GRID_KW)
            ax.legend(loc="upper right", fontsize=8, framealpha=0.9, edgecolor="#c8ccd8")
            ax.tick_params(labelsize=9)
            ax.set_xlabel(fmt_time(results[0]["x"])[1], fontsize=10)
            if suffix:
                ax.set_title(suffix, fontsize=9, color="#667")
            row += 1
    fig.suptitle(title, fontsize=13, fontweight="bold")
    fig.text(0.995, 0.003, footer, ha="right", va="bottom", fontsize=7.5, color="#567")
    fig.savefig(out_path, dpi=160)
    plt.close(fig)


def plot_dc_sweep(results, title, out_path, footer):
    by_unit = {}
    for r in results:
        by_unit.setdefault(r["unit"], []).append(r)
    units = list(by_unit)
    fig, axes = plt.subplots(len(units), 1, figsize=(10, 2.6 * len(units) + 1.0),
                             sharex=True, constrained_layout=True, squeeze=False)
    axes = axes[:, 0]
    for ax, unit in zip(axes, units):
        for idx, r in enumerate(by_unit[unit]):
            y, ylab = eng_unit(r["y"], unit)
            ax.plot(r["x"], y, color=PALETTE[idx % len(PALETTE)], linewidth=1.6, label=r["label"])
            ax.set_ylabel(ylab, fontsize=10)
        ax.grid(True, **GRID_KW)
        ax.legend(loc="best", fontsize=9, framealpha=0.9, edgecolor="#c8ccd8")
        ax.tick_params(labelsize=9)
    axes[-1].set_xlabel(results[0].get("x_label", "swept source"), fontsize=10)
    fig.suptitle(title, fontsize=13, fontweight="bold")
    fig.text(0.995, 0.003, footer, ha="right", va="bottom", fontsize=7.5, color="#567")
    fig.savefig(out_path, dpi=160)
    plt.close(fig)


def plot_ac_sweep(results, title, out_path, footer):
    fig, ax = plt.subplots(figsize=(10, 5.0), constrained_layout=True)
    for idx, r in enumerate(results):
        ax.plot(r["x"], r["y"], color=PALETTE[idx % len(PALETTE)], linewidth=1.6, label=r["label"])
    ax.set_xscale("log")
    ax.set_yscale("log" if results[0]["unit"] not in ("dB",) else "linear")
    ax.set_xlabel("frequency (Hz)", fontsize=10)
    ax.set_ylabel({"dB": "magnitude (dB)", "V": "amplitude (V)"}.get(results[0]["unit"], results[0]["unit"]), fontsize=10)
    ax.grid(True, which="major", **GRID_KW)
    ax.grid(True, which="minor", color="#eef1f6", linewidth=0.5)
    ax.legend(loc="best", fontsize=9, framealpha=0.9, edgecolor="#c8ccd8")
    ax.tick_params(labelsize=9)
    fig.suptitle(title, fontsize=13, fontweight="bold")
    fig.text(0.995, 0.003, footer, ha="right", va="bottom", fontsize=7.5, color="#567")
    fig.savefig(out_path, dpi=160)
    plt.close(fig)


def plot_op_points(results, title, out_path, footer):
    fig, ax = plt.subplots(figsize=(7.6, 1.0 + 0.42 * len(results)), constrained_layout=True)
    ax.axis("off")
    rows = []
    for r in results:
        v = r["point"]
        if r["unit"] == "A":
            s = f"{v*1e3:.2f} mA" if abs(v) < 1 else f"{v:.3f} A"
        else:
            s = f"{v:.3f} V"
        rows.append((r["label"], s))
    table = ax.table(cellText=rows, colLabels=["node / probe", "operating point"],
                     loc="center", cellLoc="left")
    table.auto_set_font_size(False)
    table.set_fontsize(11)
    table.scale(1, 1.6)
    for (row, col), cell in table.get_celld().items():
        cell.set_edgecolor("#c8ccd8")
        if row == 0:
            cell.set_facecolor("#eef1f8")
            cell.set_text_props(fontweight="bold")
    fig.suptitle(title, fontsize=13, fontweight="bold")
    fig.savefig(out_path, dpi=160)
    plt.close(fig)


def main():
    requested = sys.argv[1:]
    files = sorted(DATA_DIR.glob("*.json")) if not requested else \
        [DATA_DIR / f"{name}.json" for name in requested]
    if not files:
        print("no data files — run `node harness/run.mjs` first")
        sys.exit(1)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for f in files:
        data = json.loads(f.read_text())
        results = [r for r in data["results"] if r.get("x") is not None]
        points = [r for r in data["results"] if r.get("kind") == "op_point"]
        n_ok = sum(1 for c in data.get("checks", []) if c["ok"])
        n = len(data.get("checks", []))
        footer = f"{data.get('summary','')}  ·  {n_ok}/{n} checks pass"
        title = f"{data['title']} — {data['scenario_title']}"
        out = OUT_DIR / f"{data['board']}.{data['scenario']}.png"
        kinds = {r["kind"] for r in data["results"]}
        if "transient" in kinds and results:
            plot_transient([r for r in results if r["kind"] == "transient"], title, out, footer)
        elif "ac_sweep" in kinds and results:
            plot_ac_sweep([r for r in results if r["kind"] == "ac_sweep"], title, out, footer)
        elif "dc_sweep" in kinds and results:
            plot_dc_sweep([r for r in results if r["kind"] == "dc_sweep"], title, out, footer)
        elif points:
            plot_op_points(points, title, out, footer)
        else:
            print(f"  {f.stem}: nothing plottable, skipped")
            continue
        print(f"  {f.stem}: wrote {out.relative_to(ROOT)}")
    print("done")


if __name__ == "__main__":
    main()
