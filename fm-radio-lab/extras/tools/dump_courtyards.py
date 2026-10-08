#!/usr/bin/env python3
"""dump_courtyards.py v2 — real courtyard bboxes per named component."""
import json, glob

for path in sorted(glob.glob("circuit-*.json")):
    data = json.load(open(path))
    src2name, cid2src = {}, {}
    for el in data:
        if el["type"] == "source_component":
            src2name[el["source_component_id"]] = el.get("name", "?")
    for el in data:
        if el["type"] == "pcb_component":
            cid2src[el["pcb_component_id"]] = el["source_component_id"]
    print(f"=== {path} ===")
    rows = []
    for el in data:
        if not el["type"].startswith("pcb_courtyard"):
            continue
        cid = el.get("pcb_component_id", "")
        name = src2name.get(cid2src.get(cid, ""), "?")
        if el["type"] == "pcb_courtyard_rect":
            cx, cy = el["center"]["x"], el["center"]["y"]
            w, h = el["width"], el["height"]
            rows.append((name, w, h, (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)))
        elif el["type"] == "pcb_courtyard_circle":
            c, r = el["center"], el["radius"]
            rows.append((name, 2 * r, 2 * r, (c["x"] - r, c["y"] - r, c["x"] + r, c["y"] + r)))
        else:
            pts = el.get("outline", [])
            if not pts:
                continue
            xs = [p["x"] for p in pts]; ys = [p["y"] for p in pts]
            rows.append((name, max(xs) - min(xs), max(ys) - min(ys), (min(xs), min(ys), max(xs), max(ys))))
    seen = {}
    for name, w, h, bb in rows:
        if name not in seen or w * h > seen[name][1] * seen[name][2]:
            seen[name] = (bb, w, h)
    for name in sorted(seen):
        bb, w, h = seen[name]
        print(f"  {name:8s} courtyard {w:6.2f} x {h:6.2f}   bbox x[{bb[0]:7.2f},{bb[2]:7.2f}] y[{bb[1]:7.2f},{bb[3]:7.2f}]")
