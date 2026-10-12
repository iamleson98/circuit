#!/bin/sh
# Compile the firmware for this computer and run its tests:
#   1. test_lamp.c     — the decision logic (lamp.c), case by case
#   2. sim_firmware.c  — the whole firmware (main.c, unchanged) running against
#                        a model of the lamp's electronics
set -e
cd "$(dirname "$0")"
CC=${CC:-cc}
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
FLAGS="-std=gnu11 -Wall -Wextra -Werror -O1"
$CC $FLAGS -o "$T/test_lamp" test_lamp.c ../tricolor_lamp/lamp.c
"$T/test_lamp"
$CC $FLAGS -Isim_avr -DF_CPU=1000000UL -Dmain=firmware_main -c -o "$T/main.o" ../tricolor_lamp/main.c
$CC $FLAGS -o "$T/sim" sim_firmware.c "$T/main.o" ../tricolor_lamp/lamp.c -lm
"$T/sim"
