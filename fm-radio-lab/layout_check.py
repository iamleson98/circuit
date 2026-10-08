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
def box(part, value, name):
    if part == "resistor":            # axial_p10.16mm
        return (12.4, 4.6)
    if part == "capacitor":
        if value in ("47uF",):        # radial_p5mm
            return (8.4, 8.4)
        return (5.6, 5.6)             # radial_p2.54mm
    if part == "led":
        return (5.6, 5.6)
    if part == "NpnTo92":             # to92_inline + courtyard
        return (9.0, 6.6)
    if name.startswith("BT1") or name.startswith("SW1") or name.startswith("EAR"):
        return (10.8, 5.6)            # wire-terminal boxes
    if name.startswith("RV1"):
        return (8.8, 4.8)             # pot
    if name.startswith("TRIM"):
        return (9.2, 9.0)             # trimmer + arrow motif
    if name.startswith("ANT"):
        return (4.5, 8.5)             # pad + arrow
    if name.startswith("L1"):
        return (9.6, 4.2)             # air coil motif
    return (6, 6)

src = open("receiver/index.tsx").read()
comps = []
for m in re.finditer(r'<(resistor|capacitor|led|NpnTo92|Battery9V|PowerSwitch|AirCoil|TrimmerCap|VolumePot|AntennaPad|EarTerm)\s+name="(\w+)"([^/]*)/>', src):
    part, name, attrs = m.group(1), m.group(2), m.group(3)
    x = re.search(r'pcbX={\s*(-?[\d.]+)\s*}', attrs)
    y = re.search(r'pcbY={\s*(-?[\d.]+)\s*}', attrs)
    val = re.search(r'(?:capacitance|resistance)="([^"]+)"', attrs)
    rot = re.search(r'rot={\s*(\d+)', attrs)
    if not x or not y:
        continue
    x, y = float(x.group(1)), float(y.group(1))
    w, h = box(part, val.group(1) if val else "", name)
    r = float(rot.group(1)) if rot else 0
    if r % 180 == 90:
        w, h = h, w
    comps.append((name, x, y, w, h))

bad = 0
for i in range(len(comps)):
    n1, x1, y1, w1, h1 = comps[i]
    # board edges
    if x1 - w1 / 2 < -HALF_X + CLEAR or x1 + w1 / 2 > HALF_X - CLEAR:
        print(f"EDGE  {n1}: x {x1 - w1/2:.2f}..{x1 + w1/2:.2f} outside ±{HALF_X - CLEAR:.2f}")
        bad += 1
    if y1 - h1 / 2 < -HALF_Y + CLEAR or y1 + h1 / 2 > HALF_Y - CLEAR:
        print(f"EDGE  {n1}: y {y1 - h1/2:.2f}..{y1 + h1/2:.2f} outside ±{HALF_Y - CLEAR:.2f}")
        bad += 1
    for j in range(i + 1, len(comps)):
        n2, x2, y2, w2, h2 = comps[j]
        dx = abs(x1 - x2) - (w1 + w2) / 2
        dy = abs(y1 - y2) - (h1 + h2) / 2
        if dx < 0 and dy < 0:
            print(f"OVERLAP {n1} × {n2}: dx={dx:.2f} dy={dy:.2f}  ({x1},{y1}) vs ({x2},{y2})")
            bad += 1

print(f"\n{len(comps)} components checked — {'✅ CLEAN' if bad == 0 else f'❌ {bad} issue(s)'}")
sys.exit(1 if bad else 0)
