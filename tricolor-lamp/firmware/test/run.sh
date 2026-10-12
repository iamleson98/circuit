#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────
# run.sh — build & run the tri-color lamp's tests ON YOUR PC (no chip needed)
#
# FOR A NOVICE — how can chip code run on a computer?
#   Two separate jobs live in the firmware:
#     • lamp.c  — the decisions (pure arithmetic: which colour, glitch or
#                 flip, the EEPROM journal). Nothing in it knows about the
#                 chip, so an ordinary C compiler can build it as-is.
#     • main.c  — the hardware (registers, ADC, sleep). The chip's real
#                 registers do not exist on a PC… so we give main.c a set
#                 of STAND-IN headers (sim_avr/) that define "PORTB" etc.
#                 as plain variables, and simulate the electronics around
#                 them. The SAME main.c, byte for byte, then runs on the PC
#                 against a model of the lamp's power supply.
#
#   That is this script's two steps:
#     1. test_lamp.c     — the decision logic (lamp.c), case by case
#     2. sim_firmware.c  — the whole firmware (main.c, unchanged) running against
#                          a model of the lamp's electronics
#
# Usage:   sh firmware/test/run.sh     (from the tricolor-lamp/ folder)
#   Needs any C compiler: cc, gcc or clang — set it with CC=clang if needed.
# ─────────────────────────────────────────────────────────────────────────

# "set -e": abort on the first failing command. Without it, a compile error
# would leave the script running old binaries and reporting false success.
set -e

# cd to THIS script's own folder, wherever it was invoked from — so the
# relative paths below (../tricolor_lamp/…) always mean the same thing.
# $(dirname "$0") = the directory part of the script's own path.
cd "$(dirname "$0")"

# CC=${CC:-cc}: use the CC environment variable if the caller set one,
# otherwise the default compiler "cc" (present on every Unix; usually gcc).
CC=${CC:-cc}

# T=$(mktemp -d): a fresh scratch folder for the binaries. Building into a
# temp dir keeps this folder clean (only sources are committed).
T=$(mktemp -d)
# trap … EXIT: when the script exits — for ANY reason, success or failure —
# delete the scratch folder. The word EXIT is the hook: "on exit, run this".
trap 'rm -rf "$T"' EXIT

# One set of flags for every compile below. Deliberately the SAME strictness
# the chip build uses (-Wall -Wextra -Werror): code that would warn for
# avr-gcc must not pass silently here either.
# -O1: optimised enough to run the (very long) simulations quickly, but
# light enough to debug step-by-step.
FLAGS="-std=gnu11 -Wall -Wextra -Werror -O1"

# ── test 1: the logic, unit-tested ──────────────────────────────────────
# Compile test_lamp.c (the test cases) together with lamp.c (the code under
# test) into one program; run it. It prints one line per case and exits
# nonzero if any failed (which set -e above turns into this script failing).
$CC $FLAGS -o "$T/test_lamp" test_lamp.c ../tricolor_lamp/lamp.c
"$T/test_lamp"

# ── test 2: the whole firmware, in a simulated lamp ─────────────────────
# main.c is compiled against the STAND-IN headers in sim_avr/ instead of
# avr-libc: every register becomes a variable defined by sim_firmware.c.
# -Dmain=firmware_main: the preprocessor renames main.c's main() to
# firmware_main() — so the SIMULATOR can keep its own main(), call
# firmware_main() when (its model of) the chip powers up, and even "reset"
# the firmware by calling it again.
# -c: compile to an object file only; do not link yet (there is no main()).
$CC $FLAGS -Isim_avr -DF_CPU=1000000UL -Dmain=firmware_main -c -o "$T/main.o" ../tricolor_lamp/main.c
# Link: the simulator (sim_firmware.c — provides main() and the model of
# the electronics) + main.o (the real firmware) + lamp.c (the decisions).
# -lm: the maths library (sim_firmware.c uses exp() and fmin()).
$CC $FLAGS -o "$T/sim" sim_firmware.c "$T/main.o" ../tricolor_lamp/lamp.c -lm
"$T/sim"
