#!/usr/bin/env python3
"""layout_check.py — instant courtyard-overlap checker for the fm-rx placement.
Parses receiver/index.tsx, models each footprint's bounding box (with courtyard),
reports overlaps + out-of-board. Iterate here BEFORE running the slow verifier."""
import re, sys

import re as _re
tsx = open("receiver/index.tsx").read()
_bm = _re.search(r'<board width="([\d.]+)mm" height="([\d.]+)mm"', tsx)
W, H = (float(_bm.group(1)), float(_bm.group(2))) if _bm else (99.06, 63.5)
HALF_X, HALF_Y = W / 2, H / 2
CLEAR = 0.25  # board-edge copper clearance (mm)

# bounding boxes (w, h) in mm INCLUDING courtyard, for horizontal placement
def box(part, value, name, fp=""):
    """courtyard (w, h, dy) in mm for horizontal placement — the same courtyards
    tscircuit's DRC uses (built-in footprints) or lib/parts.tsx declares (custom)"""
    if part in ("resistor", "Res", "AxialDiode", "diode"):
        return (9.62, 2.1, 0) if fp in ("axial_p7.62mm", "7.62") else (12.16, 2.1, 0)
    if part in ("capacitor", "Cap", "ECap"):
        if fp in ("radial_p5mm", "5"):
            return (10.5, 10.5, 0)
        return (5.58, 5.58, 0)        # 2.54 mm radial: circle r = 2.79
    if part in ("led", "Led5mm"):
        return (5.9, 5.9, 0)          # courtyard circle r = 2.95
    if part == "NpnTo92":
        return (6.8, 4.6, 0.45)
    if part in ("Battery9V", "PowerSwitch", "EarTerm", "AuxJack"):
        return (8.6, 4.0, 0)          # wire-terminal label boxes
    if part == "VolumePot":
        return (8.4, 4.4, 0)
    if part == "TrimmerCap":
        return (7.2, 4.8, 0.2)
    if part == "AntennaPad":
        return (3.1, 3.1, 0)
    if part == "AirCoil":
        return (7.7, 6.7, 0)
    return (6, 6, 0)

src = open("receiver/index.tsx").read()
comps = []
for m in re.finditer(r'<(resistor|capacitor|led|diode|Res|Cap|ECap|Led5mm|AxialDiode|NpnTo92|Battery9V|PowerSwitch|AirCoil|TrimmerCap|VolumePot|AntennaPad|EarTerm)\s+name="(\w+)"([^/]*)/>', src):
    part, name, attrs = m.group(1), m.group(2), m.group(3)
    x = re.search(r'pcbX={\s*(-?[\d.]+)\s*}', attrs)
    y = re.search(r'pcbY={\s*(-?[\d.]+)\s*}', attrs)
    val = re.search(r'(?:capacitance|resistance)="([^"]+)"', attrs)
    rot = re.search(r'(?:pcbRotation|rot)={\s*(\d+)', attrs)
    fp = re.search(r'footprint="([^"]+)"', attrs) or re.search(r'pitch=\{([\d.]+)\}', attrs)
    if not x or not y:
        continue
    x, y = float(x.group(1)), float(y.group(1))
    w, h, dy = box(part, val.group(1) if val else "", name, fp.group(1) if fp else "")
    r = float(rot.group(1)) if rot else 0
    if r % 180 == 90:
        w, h = h, w
    y += dy if r % 360 == 0 else -dy if r % 360 == 180 else 0
    round_ = part in ("capacitor", "Cap", "ECap", "led", "Led5mm", "AntennaPad")   # circular courtyards
    comps.append((name, x, y, w, h, round_))

bad = 0
for i in range(len(comps)):
    n1, x1, y1, w1, h1, c1 = comps[i]
    # board edges
    if x1 - w1 / 2 < -HALF_X + CLEAR or x1 + w1 / 2 > HALF_X - CLEAR:
        print(f"EDGE  {n1}: x {x1 - w1/2:.2f}..{x1 + w1/2:.2f} outside ±{HALF_X - CLEAR:.2f}")
        bad += 1
    if y1 - h1 / 2 < -HALF_Y + CLEAR or y1 + h1 / 2 > HALF_Y - CLEAR:
        print(f"EDGE  {n1}: y {y1 - h1/2:.2f}..{y1 + h1/2:.2f} outside ±{HALF_Y - CLEAR:.2f}")
        bad += 1
    for j in range(i + 1, len(comps)):
        n2, x2, y2, w2, h2, c2 = comps[j]
        dx = abs(x1 - x2) - (w1 + w2) / 2
        dy = abs(y1 - y2) - (h1 + h2) / 2
        if c1 and c2:                     # circle vs circle
            hit = ((x1 - x2) ** 2 + (y1 - y2) ** 2) ** 0.5 < (w1 + w2) / 2
        elif c1 or c2:                    # circle vs rectangle: nearest point of the rectangle
            (cx, cy, r), (rx, ry, rw, rh) = ((x1, y1, w1 / 2), (x2, y2, w2, h2)) if c1 else ((x2, y2, w2 / 2), (x1, y1, w1, h1))
            px, py = min(max(cx, rx - rw / 2), rx + rw / 2), min(max(cy, ry - rh / 2), ry + rh / 2)
            hit = ((cx - px) ** 2 + (cy - py) ** 2) ** 0.5 < r
        else:
            hit = dx < 0 and dy < 0
        if hit:
            print(f"OVERLAP {n1} × {n2}: dx={dx:.2f} dy={dy:.2f}  ({x1},{y1}) vs ({x2},{y2})")
            bad += 1

print(f"\n{len(comps)} components checked — {'✅ CLEAN' if bad == 0 else f'❌ {bad} issue(s)'}")
sys.exit(1 if bad else 0)
