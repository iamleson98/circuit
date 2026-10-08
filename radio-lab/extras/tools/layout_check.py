#!/usr/bin/env python3
"""
layout_check.py — placement feasibility checker for the radio-lab boards.

Encodes every component's COURTYARD size and PAD positions (extracted
empirically from tscircuit's footprints via dump_courtyards.py), then
checks a candidate placement for:
  R1. courtyard-vs-courtyard overlaps (components with courtyards)
  R2. pads inside another component's courtyard
  R3. pad-vs-pad collisions (< 2.0mm center distance)
  R4. courtyard/pads outside board bounds (with 1.5mm margin)

Custom wire-terminal parts (battery, switch, varcap, mic, speaker, antenna,
pot) have no courtyard → only their pads are checked.
"""
import math
import sys

# kind -> (courtyard_w, courtyard_h, [(pad_dx, pad_dy)...]) unrotated
KINDS = {
    "axial_h":  (12.17, 2.10, [(-5.08, 0), (5.08, 0)]),
    "axial_v":  (2.10, 12.17, [(0, -5.08), (0, 5.08)]),
    "radial2":  (5.58, 5.58, [(-1.27, 0), (1.27, 0)]),
    "radial5":  (10.50, 10.50, [(-2.54, 0), (2.54, 0)]),
    "to92":     (5.00, 5.00, [(-2.54, 0), (0, 0), (2.54, 0)]),
    "dip8":     (9.72, 10.66, [(x, y) for x in (-3.81, 3.81) for y in (-3.81, -1.27, 1.27, 3.81)]),
    # custom wire-terminal parts: no courtyard
    "term2w":   (None, None, [(-2.54, 0), (2.54, 0)]),   # battery/switch/speaker (5.08 pitch)
    "varcap":   (None, None, [(-2.54, 0), (0, 0), (2.54, 0)]),
    "pot3":     (None, None, [(-2.54, 0), (0, 0), (2.54, 0)]),
    "mic":      (None, None, [(-1.27, 0), (1.27, 0)]),
    "ant":      (None, None, [(0, 0)]),
}

def check(board_name, board_w, board_h, comps, margin=0.2, pad_clear=2.0, edge=1.5):
    errs = []
    # expand to absolute geometry
    geo = {}
    for c in comps:
        name, kind, x, y = c["name"], c["kind"], c["x"], c["y"]
        cw, ch, pads = KINDS[kind]
        cyw = None if cw is None else cw / 2
        cyh = None if ch is None else ch / 2
        abs_pads = [(x + dx, y + dy) for dx, dy in pads]
        geo[name] = dict(bbox=(x - cyw, y - cyh, x + cyw, y + cyh) if cw else None, pads=abs_pads, center=(x, y))
    # R4 bounds
    for name, g in geo.items():
        if g["bbox"]:
            x0, y0, x1, y1 = g["bbox"]
            if x0 < -board_w / 2 + edge or x1 > board_w / 2 - edge or y0 < -board_h / 2 + edge or y1 > board_h / 2 - edge:
                errs.append(f"R4 {name}: courtyard outside board ({x0:.2f},{y0:.2f})..({x1:.2f},{y1:.2f})")
        for px, py in g["pads"]:
            if abs(px) > board_w / 2 - 1.0 or abs(py) > board_h / 2 - 1.0:
                errs.append(f"R4 {name}: pad ({px:.2f},{py:.2f}) outside board")
    names = list(geo)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = geo[names[i]], geo[names[j]]
            # R1 courtyard-courtyard
            if a["bbox"] and b["bbox"]:
                ax0, ay0, ax1, ay1 = a["bbox"]; bx0, by0, bx1, by1 = b["bbox"]
                if ax0 < bx1 + margin and bx0 < ax1 + margin and ay0 < by1 + margin and by0 < ay1 + margin:
                    errs.append(f"R1 {names[i]} ~ {names[j]}: courtyard overlap")
            # R2 pads inside other's courtyard
            for (pa, pb) in ((a, b), (b, a)):
                if pb["bbox"]:
                    x0, y0, x1, y1 = pb["bbox"]
                    for px, py in pa["pads"]:
                        if x0 - 0.7 < px < x1 + 0.7 and y0 - 0.7 < py < y1 + 0.7:
                            errs.append(f"R2 pad of {names[i] if pa is a else names[j]} at ({px:.2f},{py:.2f}) inside courtyard of {names[j] if pa is a else names[i]}")
            # R3 pad-pad
            for px, py in a["pads"]:
                for qx, qy in b["pads"]:
                    if math.hypot(px - qx, py - qy) < pad_clear:
                        errs.append(f"R3 {names[i]} ~ {names[j]}: pad collision at ({px:.2f},{py:.2f})/({qx:.2f},{qy:.2f})")
    return errs

def report(board_name, board_w, board_h, comps):
    errs = check(board_name, board_w, board_h, comps)
    print(f"── {board_name}  ({board_w}×{board_h}mm, {len(comps)} parts) ──")
    if errs:
        for e in errs:
            print("  ✗", e)
    else:
        print("  ✓ placement clean")
    return errs

# ═══════════════════════════ CANDIDATE PLACEMENTS ═══════════════════════
# Row structure (y): A1 21.59/26.67 bias feeders · A2 15.24/19.05 ·
# B 8.89/10.16 transistors+diode · C 2.54 ceramics · D -4.45/-5.08 ·
# E -13.97 big radial5 + misc · F -22.86/-24.13 battery/switch/LED

TX_W, TX_H = 91.44, 55.88
TX = [
    dict(name="BT1",  kind="term2w",  x=-38.10, y=-22.86),
    dict(name="SW1",  kind="term2w",  x=-30.48, y=-22.86),
    dict(name="C1",   kind="radial5", x=-38.10, y=-13.97),
    dict(name="C2",   kind="radial2", x=-29.21, y=-13.97),
    dict(name="LED1", kind="radial2", x=-21.59, y=-22.86),
    dict(name="R1",   kind="axial_h", x=-11.43, y=-22.86),
    dict(name="MIC1", kind="mic",     x=-40.64, y=8.89),
    dict(name="R2",   kind="axial_h", x=-33.02, y=21.59),
    dict(name="C3",   kind="radial2", x=-25.40, y=2.54),
    dict(name="Q1",   kind="to92",    x=-15.24, y=8.89),
    dict(name="R3",   kind="axial_h", x=-12.70, y=15.24),
    dict(name="R4",   kind="axial_h", x=-15.24, y=2.54),
    dict(name="R5",   kind="axial_h", x=-25.40, y=15.24),
    dict(name="R6",   kind="axial_h", x=-10.16, y=-4.45),
    dict(name="C4",   kind="radial5", x=-19.05, y=-13.97),
    dict(name="Q2",   kind="to92",    x=-1.27,  y=8.89),
    dict(name="R7",   kind="axial_h", x=-8.89,  y=21.59),
    dict(name="R8",   kind="axial_h", x=1.27,   y=15.24),
    dict(name="C5",   kind="radial2", x=-5.08,  y=2.54),
    dict(name="R10",  kind="axial_h", x=5.08,   y=21.59),
    dict(name="R14",  kind="axial_h", x=17.78,  y=21.59),
    dict(name="R11",  kind="axial_h", x=13.97,  y=15.24),
    dict(name="R17",  kind="axial_h", x=27.94,  y=15.24),
    dict(name="Q3",   kind="to92",    x=12.70,  y=8.89),
    dict(name="Q4",   kind="to92",    x=25.40,  y=8.89),
    dict(name="R15",  kind="axial_h", x=5.08,   y=2.54),
    dict(name="C6",   kind="radial2", x=15.24,  y=2.54),
    dict(name="C14",  kind="radial2", x=21.59,  y=2.54),
    dict(name="C17",  kind="radial2", x=27.94,  y=2.54),
    dict(name="R12",  kind="axial_h", x=8.89,   y=-4.45),
    dict(name="C15",  kind="radial2", x=19.05,  y=-4.45),
    dict(name="R16",  kind="axial_h", x=25.40,  y=-13.97),
    dict(name="L1",   kind="radial5", x=38.10,  y=-4.45),
    dict(name="CV1",  kind="varcap",  x=33.02,  y=21.59),
    dict(name="C16",  kind="radial2", x=35.56,  y=8.89),
    dict(name="ANT1", kind="ant",     x=40.64,  y=8.89),
]

RX_W, RX_H = 99.06, 60.96
RX = [
    dict(name="BT1",  kind="term2w",  x=-38.10, y=-24.13),
    dict(name="SW1",  kind="term2w",  x=-30.48, y=-24.13),
    dict(name="C1",   kind="radial5", x=-38.10, y=-13.97),
    dict(name="C2",   kind="radial2", x=-29.21, y=-13.97),
    dict(name="LED1", kind="radial2", x=-21.59, y=-22.86),
    dict(name="R1",   kind="axial_h", x=-11.43, y=-22.86),
    dict(name="ANT1", kind="ant",     x=-46.99, y=15.24),
    dict(name="C3",   kind="radial2", x=-44.45, y=10.16),
    dict(name="L1",   kind="radial5", x=-35.56, y=10.16),
    dict(name="CV1",  kind="varcap",  x=-36.83, y=26.67),
    dict(name="C4",   kind="radial2", x=-25.40, y=2.54),
    dict(name="Q1",   kind="to92",    x=-19.05, y=10.16),
    dict(name="R2",   kind="axial_h", x=-22.86, y=26.67),
    dict(name="R3",   kind="axial_h", x=-25.40, y=19.05),
    dict(name="R4",   kind="axial_h", x=-19.05, y=-13.97),
    dict(name="C5",   kind="radial2", x=-12.70, y=2.54),
    dict(name="Q2",   kind="to92",    x=-5.08,  y=10.16),
    dict(name="R5",   kind="axial_h", x=-8.89,  y=26.67),
    dict(name="R6",   kind="axial_h", x=-15.24, y=-5.08),
    dict(name="R7",   kind="axial_h", x=-2.54,  y=-5.08),
    dict(name="R8",   kind="axial_h", x=3.81,   y=26.67),
    dict(name="C6",   kind="radial2", x=1.27,   y=2.54),
    dict(name="C7",   kind="radial2", x=8.89,   y=2.54),
    dict(name="D1",   kind="axial_h", x=6.35,   y=10.16),
    dict(name="C8",   kind="radial2", x=15.24,  y=2.54),
    dict(name="RV1",  kind="pot3",    x=11.43,  y=-13.97),
    dict(name="Q3",   kind="to92",    x=21.59,  y=10.16),
    dict(name="R9",   kind="axial_h", x=10.16,  y=19.05),
    dict(name="R10",  kind="axial_h", x=17.78,  y=26.67),
    dict(name="LED2", kind="radial2", x=25.40,  y=19.05),
    dict(name="C9",   kind="radial2", x=25.40,  y=-5.08),
    dict(name="U1",   kind="dip8",    x=34.29,  y=2.54),
    dict(name="C12",  kind="radial2", x=44.45,  y=8.89),
    dict(name="C10",  kind="radial2", x=44.45,  y=1.27),
    dict(name="C11",  kind="radial2", x=43.18,  y=15.24),
    dict(name="SW2",  kind="term2w",  x=44.45,  y=19.05),
    dict(name="C13",  kind="radial5", x=41.91,  y=-11.43),
    dict(name="R11",  kind="axial_h", x=29.21,  y=-13.97),
    dict(name="C14",  kind="radial2", x=19.05,  y=-13.97),
    dict(name="SPK1", kind="term2w",  x=43.18,  y=-24.13),
]

if __name__ == "__main__":
    e1 = report("am-tx", TX_W, TX_H, TX)
    e2 = report("am-rx", RX_W, RX_H, RX)
    sys.exit(1 if (e1 or e2) else 0)
