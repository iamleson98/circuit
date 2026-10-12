#!/usr/bin/env python3
"""build_standalone.py — generate single-file playground versions of both
FM boards (paste into snippets.tscircuit.com, no local imports needed).
Run from fm-radio-lab/:  python3 extras/tools/build_standalone.py"""
import re

parts = open("lib/parts.tsx").read()
# strip the import lines and the CommonLayoutProps type import; keep everything else
parts = re.sub(r'^import .*$', '', parts, flags=re.M).strip()
# inline the type import as `any`-ish shim
parts = parts.replace('extends CommonLayoutProps {', 'extends Record<string, any> {')

for board, out, title in [("transmitter/index.tsx", "standalone/fm-tx-playground.tsx", "FM TRANSMITTER"),
                          ("receiver/index.tsx", "standalone/fm-rx-playground.tsx", "FM RECEIVER")]:
    src = open(board).read()
    # remove the lib import (everything comes inline) and the core import (once, at the top)
    src = re.sub(r'import \{[^}]*\} from "\.\./lib/parts"\n', '', src)
    src = re.sub(r'^import "@tscircuit/core"\n', '', src, flags=re.M)
    header = f"""/**
 * ═════════════════════════════════════════════════════════════════════════
 *  FM RADIO LAB · {title} — standalone playground
 * ═════════════════════════════════════════════════════════════════════════
 *  A single-file, zero-import version of {board}.
 *  Paste the whole file into https://snippets.tscircuit.com (or run
 *  `tsci dev` on it) to explore the board interactively.
 *
 *  The full project — with the tutorial PDF, proofs, and BOM — lives at:
 *  https://github.com/iamleson98/circuit  (fm-radio-lab/)
 */
import "@tscircuit/core"

"""
    open(out, "w").write(header + parts + "\n\n" + src)
    print("wrote", out)
