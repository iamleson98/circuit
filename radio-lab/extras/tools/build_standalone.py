#!/usr/bin/env python3
"""build_standalone.py — generate single-file playground versions of both
boards (paste into snippets.tscircuit.com, no imports needed)."""
import re

parts = open("lib/parts.tsx").read()
# strip the import lines and the CommonLayoutProps type import; keep everything else
parts = re.sub(r'^import .*$', '', parts, flags=re.M).strip()
# inline the type import as `any`-ish shim
parts = parts.replace('extends CommonLayoutProps {', 'extends Record<string, any> {')

for board, out in [("transmitter/index.tsx", "standalone/am-tx-playground.tsx"),
                   ("receiver/index.tsx", "standalone/am-rx-playground.tsx")]:
    src = open(board).read()
    # remove the lib import (everything comes inline)
    src = re.sub(r'import \{[^}]*\} from "\.\./lib/parts"\n', '', src)
    header = f"""/**
 * ═════════════════════════════════════════════════════════════════════════
 *  RADIO LAB · {'AM TRANSMITTER' if 'tx' in out else 'AM RECEIVER'} — standalone playground
 * ═════════════════════════════════════════════════════════════════════════
 *  A single-file, zero-import version of {"transmitter/index.tsx" if 'tx' in out else "receiver/index.tsx"}.
 *  Paste the whole file into https://snippets.tscircuit.com (or run
 *  `tsci dev` on it) to explore the board interactively.
 *
 *  The full project — with the tutorial PDF, proofs, and BOM — lives at:
 *  https://github.com/iamleson98/circuit  (radio-lab/)
 */
"""
    open(out, "w").write(header + parts + "\n\n" + src)
    print("wrote", out)
