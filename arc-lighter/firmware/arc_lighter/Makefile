# ─────────────────────────────────────────────────────────────────────────
# ATtiny85 arc lighter firmware — Makefile for avr-gcc + avrdude
#
# FOR A NOVICE — the same recipe-list format as the lamp's Makefile (see
# the long teaching comment there). Differences worth noticing:
#   • MODULE ?= 0 — a build VARIANT. `make MODULE=1` compiles the same
#     sources with the coil monitor compiled out (for a sealed arc module).
#     One source tree, two products, chosen at build time by a -D flag.
#   • hfuse 0xDD vs the lamp's 0xD5 — this project does NOT keep the
#     EEPROM across re-flashing (there is no journal), so EESAVE is clear.
#
# Usage:
#   make                      build arc_lighter.hex
#   make MODULE=1             build for a complete arc module on MOD+/MOD−
#   make flash                program it (default: an Arduino running "ArduinoISP")
#   make fuses                set the fuses once per chip: 1 MHz, brown-out 2.7 V
#   make PROGRAMMER=usbasp PORT=usb flash    (USBasp instead)
# ─────────────────────────────────────────────────────────────────────────

# (comments on their own lines: text after `#` never enters the values)
# which chip avr-gcc compiles for — selects <avr/io.h>'s contents:
MCU        = attiny85
# the clock speed, handed to the compiler as -DF_CPU (for _delay_*()):
F_CPU      = 1000000UL
# the build variant: 0 = discrete driver (coil monitor on), 1 = module:
MODULE    ?= 0
# the programmer (an Arduino flashed as "ArduinoISP"); ?= = overridable:
PROGRAMMER ?= stk500v1
# the programmer's serial port (macOS name; Linux: /dev/ttyACM0):
PORT      ?= /dev/tty.usbmodem*
# the serial speed that sketch expects:
BAUD      ?= 19200

# compiler flags — same philosophy as the lamp's (see its Makefile):
CFLAGS = -mmcu=$(MCU) -DF_CPU=$(F_CPU) -DMODULE=$(MODULE) -std=gnu11 -Os -Wall -Wextra -Werror -ffunction-sections -fdata-sections
#  …identical to the lamp's, plus:
#  -DMODULE=$(MODULE)  the variant switch: main.c's `#ifndef MODULE` picks it up

# linker flags — drop uncalled functions so flash stays small:
LDFLAGS = -mmcu=$(MCU) -Wl,--gc-sections

# Intel HEX ← the linked .elf (what avrdude consumes). $< = first
# ingredient, $@ = the target:
arc_lighter.hex: arc_lighter.elf
	avr-objcopy -O ihex -R .eeprom $< $@
	# strip to pure flash bytes; EEPROM section not shipped
	avr-size --format=avr --mcu=$(MCU) $<
	# size report: watch it against the 8 192-byte flash budget

# compile + link: two .c files, one shared header:
arc_lighter.elf: main.c lighter.c lighter.h
	avr-gcc $(CFLAGS) $(LDFLAGS) -o $@ main.c lighter.c
	# compile both, link with avr-libc + the chip's startup code

# flash: build the .hex first, then burn it over SPI:
flash: arc_lighter.hex
	avrdude -c $(PROGRAMMER) -P $(PORT) -b $(BAUD) -p $(MCU) -U flash:w:$<:i
	# -c protocol, -P port, -b speed, -p expect this chip, -U write FILE

# fuses: three config bytes OUTSIDE the program. hfuse 0xDD here:
#   BODLEVEL 2.7 V (reset on a dying cell), SPIEN (ISP flashing), and —
#   unlike the lamp — EESAVE CLEAR: a re-flash may erase the EEPROM
#   (nothing needs to survive; no journal in this project):
fuses:
	avrdude -c $(PROGRAMMER) -P $(PORT) -b $(BAUD) -p $(MCU) -U lfuse:w:0x62:m -U hfuse:w:0xDD:m -U efuse:w:0xFF:m
	# lfuse 0x62  factory: 1 MHz (8 MHz RC ÷ 8) — sips current, plenty fast
	# hfuse 0xDD  brown-out 2.7 V; EESAVE clear (EEPROM erased on re-flash)
	# efuse 0xFF  no bootloader: the app starts at reset

# clean: remove build outputs:
clean:
	rm -f arc_lighter.elf arc_lighter.hex

# these targets are verbs, not files:
.PHONY: flash fuses clean
