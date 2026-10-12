#!/bin/sh
# Compile the firmware's logic for this computer and run its unit tests.
set -e
cd "$(dirname "$0")"
CC=${CC:-cc}
BIN=$(mktemp)
trap 'rm -f "$BIN"' EXIT
$CC -std=c11 -Wall -Wextra -Werror -O1 -o "$BIN" test_lighter.c ../arc_lighter/lighter.c
"$BIN"
