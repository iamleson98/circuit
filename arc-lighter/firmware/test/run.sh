#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────
# run.sh — build & run the arc lighter's unit tests ON YOUR PC (no chip needed)
#
# FOR A NOVICE — which part gets tested here?
#   The firmware splits in two (see arc_lighter/main.c's header comment):
#     • lighter.c — every SAFETY DECISION, written with no hardware in it.
#     • main.c    — the chip's hands: registers, timers, sleep. Chip-only.
#   This script compiles lighter.c (unchanged) together with test_lighter.c
#   (a script of scripted button/USB/battery/coil situations) using an
#   ordinary PC compiler, and runs it. If a safety rule misfires, you read
#   about it here in a second — no build-flash-test cycle on real hardware.
#   (The lamp project goes further and simulates main.c too; here main.c
#   is thin enough that unit-testing the brain covers it.)
#
# Usage:  sh firmware/test/run.sh    (from the arc-lighter/ folder)
#   Any C compiler works: cc, clang, gcc — override with CC=clang sh …
# ─────────────────────────────────────────────────────────────────────────

# abort on the first failure: a compile error must stop the script, not
# let it run a stale binary and report false success
set -e

# work from THIS script's folder whatever the caller's cwd:
cd "$(dirname "$0")"

# CC=${CC:-cc}: the caller's CC, else the default compiler "cc"
CC=${CC:-cc}

# BIN=$(mktemp): a scratch FILE for the test binary (the lamp's script uses
# a scratch DIR; one binary is all we need here). mktemp also guarantees a
# never-before-used name — no clobbering, no collisions.
BIN=$(mktemp)
# delete the scratch binary on exit — any exit, including failures
trap 'rm -f "$BIN"' EXIT

# Compile: the tests + the code under test, in one step.
# Same strictness as the chip build (-Wall -Wextra -Werror) so a warning
# can never pass silently here; -O1 to keep the test run fast.
$CC -std=c11 -Wall -Wextra -Werror -O1 -o "$BIN" test_lighter.c ../arc_lighter/lighter.c

# Run it: prints one line per safety situation; exits nonzero on any FAIL
# (which set -e above turns into this script failing).
"$BIN"
