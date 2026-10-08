#!/usr/bin/env python3
"""Retune schX/schY coordinates in the fm-radio-lab boards, following the
same schematic-cluster conventions that rendered cleanly in radio-lab:
transistor row y=9 · top feed y=12 · lower divider/emitter y=6 ·
power entry bottom-left · stages spaced left→right."""
import re, sys

TX = {  # mirrors radio-lab AM-TX cluster geometry 1:1 where topology matches
    "BT1": (-14, -7), "SW1": (-10, -7), "C1": (-12, -3), "C2": (-9, -3),
    "LED1": (-6, -6), "R1": (-4, -6),
    "MIC1": (-16, 9), "R2": (-14, 11), "C3": (-12, 9),
    "AUX1": (-16, 4), "C4": (-14, 4), "R3": (-12, 6),
    "Q1": (-9, 9), "R4": (-9, 12), "R5": (-9, 6), "R6": (-11.5, 9),
    "R7": (-7, 6), "R8": (-6, 4), "C5": (-4.5, 2),
    "C6": (-4, 11),
    "Q2": (1, 9), "R9": (1, 12), "R10": (1, 6), "R11": (3, 6),
    "C7": (3, 3.5), "C8": (4.5, 6), "C9": (3.5, 10),
    "L1": (5, 11), "TRIM1": (5, 7),
    "C11": (7.5, 12), "C12": (7.5, 10.5),
    "C13": (8, 9), "ANT1": (10, 9),
}

RX = {
    "BT1": (-14, -8), "SW1": (-10, -8), "C1": (-12, -4), "C2": (-9, -4),
    "LED1": (-6, -7), "R1": (-4, -7),
    "ANT1": (-17, 9), "C3": (-15, 9), "L1": (-13, 11),
    "TRIM1": (-13, 14),
    "Q1": (-8, 9), "R2": (-8, 12), "R3": (-9.5, 6), "C5": (-11.5, 6),
    "R4": (-6.5, 6), "C6": (-4.5, 6), "C7": (-10.5, 10.5),
    "C8": (-15.5, 12.5), "C9": (-15.5, 10.5),
    "Q2": (8, 9), "R5": (10, 12), "R6": (10, 6), "C10": (12, 4),
    "C11": (4, 13), "R7": (0, 14),
    "C12": (13, 9), "R8": (15, 7), "C13": (17, 5), "RV1": (19, 9),
    "EAR1": (21, 9),
}

def apply(path, coords):
    src = open(path).read()
    for name, (x, y) in coords.items():
        # match the component's element line and rewrite schX/schY inside it
        pat = re.compile(
            r'(<(?:resistor|capacitor|led|inductor|[A-Z][A-Za-z0-9]*) name="%s"[^>]*?)schX=\{[^}]*\} schY=\{[^}]*\}' % re.escape(name))
        new = r'\1schX={%s} schY={%s}' % (x, y)
        src, n = pat.subn(new, src, count=1)
        if n == 0:
            print(f"  !! {path}: {name} not patched")
    open(path, "w").write(src)
    print(f"  {path}: {len(coords)} parts retuned")

apply("transmitter/index.tsx", TX)
apply("receiver/index.tsx", RX)
