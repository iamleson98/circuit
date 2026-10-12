#!/usr/bin/env python3
"""
mutation_test.py — do the firmware tests actually catch mistakes?

Each "mutant" below is the firmware with one deliberate bug planted in it.
The script copies the firmware to a temporary folder, plants the bug, and
runs firmware/test/run.sh. A good test suite fails ("catches the mutant")
for every one of them. If a mutant survives, either a test is missing or
the code it broke was never needed.

    python3 firmware/test/mutation_test.py

── FOR A NOVICE — what is mutation testing? ──────────────────────────────
Normal tests can only fail when the code is wrong RIGHT NOW. Mutation
testing asks the scarier question: "if the code had been written wrong,
would my tests even notice?" It works like this:

    1. copy the real firmware to a scratch folder
    2. plant ONE realistic bug — flip a constant, delete a check…
       (each entry in MUTANTS below is one such bug, written as
       "replace this exact text with this other text")
    3. run the full test suite against the buggy copy
    4. if any test fails → the bug would have been CAUGHT (good)
       if all pass     → the bug is INVISIBLE to the tests (a hole)

The bugs are chosen to be the kind a tired human actually makes: a wrong
constant, a check deleted, a line moved. That is why the list reads like
a catalogue of plausible mistakes — each one mapped to the test that
should catch it.

Note the last field of each tuple: the Python strings in MUTANTS match the
C source EXACTLY (including indentation). If you edit lamp.c/main.c and
change one of those lines, this script tells you to update it here — by
design, so the mutants always track the real code.
"""
import os            # paths: dirname, abspath, join
import shutil        # copytree: duplicate the firmware folder to a scratch dir
import subprocess    # run a child process (the test script) and capture output
import sys           # sys.exit(status): the script's verdict becomes its exit code
import tempfile      # TemporaryDirectory: auto-deleted scratch space

# HERE = .../firmware/test (this file's folder); FIRMWARE = .../firmware
HERE = os.path.dirname(os.path.abspath(__file__))
FIRMWARE = os.path.dirname(HERE)

# Each mutant: (a name for humans, [edits]).
# Each edit: (file relative to firmware/, exact old text, replacement text).
# The old text must match the REAL source exactly — replace() then swaps it
# for the "buggy" version in the scratch copy only.
MUTANTS = [
    ("off detected late (half voltage, like a plain logic input)",
     [("tricolor_lamp/lamp.c", "return (uint32_t)now * 8u < (uint32_t)on_level * 7u;", "return (uint32_t)now * 2u < (uint32_t)on_level;")]),
    ("colour saved at switch-on instead of once it has held",
     [("tricolor_lamp/main.c", "      save_if_changed(color, &have, &saved, &slot);\n      long_off = false;", "      long_off = false;"),
      ("tricolor_lamp/main.c", "    bool showing = lit()", "    save_if_changed(color, &have, &saved, &slot);\n    bool showing = lit()")]),
    ("LEDs switched off at once instead of draining the dying supply",
     [("tricolor_lamp/main.c", "    if (lit() && lamp_supply_dead(now, *on_level)) leds_off();", "    leds_off();")]),
    ("no fallback for a weaker supply",
     [("tricolor_lamp/main.c", "if (++steady >= 16)", "if (++steady >= 255)")]),
    ("a switch-on that didn't hold restarts the off timer",
     [("tricolor_lamp/main.c", "off_ms += wait_while_off(&on_level) + (held ? 0 : steps * 10u + 50u);", "off_ms = wait_while_off(&on_level);")]),
    ("fade starts at half brightness",
     [("tricolor_lamp/main.c", "uint8_t level = (uint8_t)(((uint32_t)step * step * 255u)", "uint8_t level = 128 + (uint8_t)(((uint32_t)step * step * 127u)")]),
    ("fade never re-checks the 12 V",
     [("tricolor_lamp/main.c", "    if (lamp_supply_dropped(supply(), on_level)) return step;\n", "    (void)on_level;\n")]),
    ("glitches step the colour too",
     [("tricolor_lamp/lamp.c", "  if (off_ms < GLITCH_MAX_MS) return OFF_GLITCH;\n", "")]),
    ("watchdog tick miscounted as 16 ms",
     [("tricolor_lamp/main.c", "#define WDT_TICK_MS 32u", "#define WDT_TICK_MS 16u")]),
    ("STEP mode keeps the colour after a long off",
     [("tricolor_lamp/lamp.c", "      if (mode == MODE_STEP) return next;", "      if (mode == MODE_STEP) return saved;")]),
    ("journal: old records never erased",
     [("tricolor_lamp/lamp.c", "    if (i != next && valid(s->read(i))) s->write(i, 0xFF);", "    (void)valid;")]),
    ("journal: sequence numbers ignored",
     [("tricolor_lamp/lamp.c", "    if (!any || newer(v, best)) {", "    if (!any || (newer(v, best), true)) {")]),  # the last record in the ring wins
]

caught = 0
for name, edits in MUTANTS:
    # a fresh copy of the WHOLE firmware folder per mutant — the copy gets
    # the bug; the real tree is never touched.
    with tempfile.TemporaryDirectory() as tmp:
        copy = os.path.join(tmp, "firmware")
        shutil.copytree(FIRMWARE, copy)
        for path, old, new in edits:
            p = os.path.join(copy, path)
            text = open(p).read()
            # if the exact text is not found, the mutant is stale — refuse
            # loudly rather than silently testing an unmutated copy:
            if old not in text:
                sys.exit(f"mutant '{name}': can't find the code to change in {path} — update this script")
            # replace once (count=1): only the intended site, not all of them
            open(p, "w").write(text.replace(old, new, 1))
        # run the test suite on the mutated copy (run.sh cds to its own dir,
        # so relative paths inside it resolve within the scratch folder):
        r = subprocess.run(["sh", os.path.join(copy, "test", "run.sh")], capture_output=True, text=True)
        test_failed = "FAIL" in r.stdout            # a test reported a failure…
        compile_error = r.returncode != 0 and not test_failed   # …or it didn't even build
        caught += test_failed
        print(f"  {'✓ caught  ' if test_failed else '✗ SURVIVED'}  {name}{'  (did not even compile — fix the mutant)' if compile_error else ''}")

# the verdict: every mutant must be caught; exit nonzero otherwise, so CI
# (and `npm run test:firmware` style wrappers) treat survival as failure.
print(f"RESULT: {caught} of {len(MUTANTS)} mutants caught")
sys.exit(caught != len(MUTANTS))
