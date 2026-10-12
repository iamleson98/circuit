# ─────────────────────────────────────────────────────────────────────────
# ATtiny85 tri-color lamp firmware — Makefile for avr-gcc + avrdude
#
# FOR A NOVICE — what is a Makefile?
#   A Makefile is a build recipe list. Each rule looks like:
#
#       target: ingredients
#       <TAB>  shell command
#       <TAB>  another command
#
#   Running `make <target>` checks the target's file-time against its
#   ingredients: if any ingredient is NEWER, the commands re-run; if not,
#   make says 'up to date' and does nothing. That one trick is why make
#   (the original build tool, 1976) recompiles only what changed.
#   NOTE: the commands MUST be indented with a real TAB character — spaces
#   are a syntax error in Make.
#
#   The toolchain here (all free, standard for AVR chips):
#     avr-gcc      the C compiler, CROSS-compiling: it reads C and emits
#                  AVR machine code — code that cannot run on your PC,
#                  only inside the chip (that is what "cross" means; your
#                  PC's cc emits x86-64 instead)
#     avr-objcopy  pulls the raw program bytes out of the compiled file and
#                  lays them out as an Intel HEX (.hex) text file — the
#                  format every chip programmer understands
#     avrdude      the flasher: talks SPI through a programmer, erases the
#                  chip's flash, and burns the .hex into it
#
# Usage:
#   make                      build tricolor_lamp.hex
#   make flash                program it (default: an Arduino running "ArduinoISP")
#   make fuses                set the fuses once per chip: 1 MHz, brown-out 2.7 V, keep EEPROM
#   make PROGRAMMER=usbasp PORT=usb flash    (USBasp instead)
# ─────────────────────────────────────────────────────────────────────────

# ── variables (used below with $(NAME) — Make substitutes the text) ──────
# (comments live on their OWN lines here: a comment sharing a line with an
#  assignment would let its leading spaces leak into the value's expansion)
# which chip: tells avr-gcc which register names <avr/io.h> must expose
# and which instruction set / memory layout to emit:
MCU        = attiny85
# the clock speed in Hz, passed as -DF_CPU so _delay_ms() can turn
# "milliseconds" into exact clock cycles. UL = unsigned long (32-bit):
F_CPU      = 1000000UL
# ?= means "set only if not already given on the command line".
# avrdude's name for an Arduino-as-ISP programmer; overridable per run:
PROGRAMMER ?= stk500v1
# where the programmer is plugged in (macOS device name; on Linux typically
# /dev/ttyACM0). The * is a glob — handy when the number changes:
PORT      ?= /dev/tty.usbmodem*
# the serial rate the ArduinoISP sketch talks (must match that sketch):
BAUD      ?= 19200

# CFLAGS = options for the COMPILER, applied to each .c file:
CFLAGS = -mmcu=$(MCU) -DF_CPU=$(F_CPU) -std=gnu11 -Os -Wall -Wextra -Werror -ffunction-sections -fdata-sections
#  -mmcu=attiny85     target chip (the instruction set to emit)
#  -DF_CPU=1 MHz      define the F_CPU macro for <util/delay.h>
#  -std=gnu11         the C standard: C11 plus GNU extensions
#  -Os                optimise for SIZE (8 KB of flash total — every byte counts)
#  -Wall -Wextra      turn on ~100 extra warnings…
#  -Werror            …and make every one of them a hard error. Firmware has
#                     no console to print errors to later, so problems must
#                     be impossible to compile in the first place
#  -ffunction-sections -fdata-sections
#                     place each function/data in its own section, so the
#                     linker (see --gc-sections below) can drop the ones we
#                     never call — smaller binary

# LDFLAGS = options for the LINKER, the stage that joins the compiled .c
# files into one program, resolves function addresses, and lays out memory:
LDFLAGS = -mmcu=$(MCU) -Wl,--gc-sections
#  -mmcu=attiny85     the memory map to link against (flash at 0, RAM at …)
#  -Wl,--gc-sections  "garbage-collect sections": with -ffunction-sections
#                     above, delete any function nothing calls. Dead code
#                     costs flash; this makes it cost zero

# ── the rules, from the bottom of the pipeline up ─────────────────────────

# Rule 1: .hex ← .elf. Takes the compiler's output and makes the flasher's
# input. $< means "the first ingredient" (the .elf), $@ means "the target".
tricolor_lamp.hex: tricolor_lamp.elf
	avr-objcopy -O ihex -R .eeprom $< $@
	# -O ihex   output in Intel HEX format (text lines of hex address:data)
	# -R .eeprom  REMOVE the EEPROM section — this file is for FLASH only
	#             (the firmware never ships EEPROM data; the journal starts
	#             empty and fills itself at runtime)
	avr-size --format=avr --mcu=$(MCU) $<
	# a report, not a build step: prints how many bytes of flash/RAM the
	# program uses — so you SEE it approaching the 8 192-byte flash limit

# Rule 2: .elf ← the sources. This is the actual compile+link. Listing the
# .h here means editing the header also triggers a rebuild (Make does not
# read #includes itself).
tricolor_lamp.elf: main.c lamp.c lamp.h
	avr-gcc $(CFLAGS) $(LDFLAGS) -o $@ main.c lamp.c
	# one command: each .c is compiled to an object in memory, then linked
	# with avr-libc and the chip's startup code (crt: zeroes RAM, copies
	# initial values, then calls main()) into the .elf — a file that still
	# carries symbols/debug info. avr-objcopy above strips it down to bytes

# Rule 3: flash. Depends on the .hex (so `make flash` builds it first if
# needed). Not file-based — always runs when asked; see .PHONY below.
flash: tricolor_lamp.hex
	avrdude -c $(PROGRAMMER) -P $(PORT) -b $(BAUD) -p $(MCU) -U flash:w:$<:i
	#  -c stk500v1   which programmer protocol to speak
	#  -P /dev/…     which port it is on
	#  -b 19200      serial speed
	#  -p attiny85   which chip we expect to find (avrdude refuses if the
	#                signature doesn't match — a wrong-chip guard)
	#  -U flash:w:FILE:i  the work order: flash memory, w=write, Intel HEX
	#                (avrdude erases flash first, then burns, then verifies)

# Rule 4: fuses. NOT part of the program — three configuration bytes that
# live outside flash and tell the chip how to BEHAVE at power-up (clock
# source, brown-out trigger, whether a re-flash may erase the EEPROM).
# Written once per chip; `make flash` never touches them.
fuses:
	avrdude -c $(PROGRAMMER) -P $(PORT) -b $(BAUD) -p $(MCU) -U lfuse:w:0x62:m -U hfuse:w:0xD5:m -U efuse:w:0xFF:m
	#  lfuse 0x62  factory default: 1 MHz from the internal 8 MHz RC
	#              oscillator ÷ 8 (bit CKDIV8 set). We keep it: 1 MHz is
	#              plenty for this lamp and sips current
	#  hfuse 0xD5  the interesting one. Bits, 0 = enabled:
	#                • BODLEVEL 2.7 V — brown-out detector resets the chip
	#                  if VCC sinks below 2.7 V (so it can never execute
	#                  wild instructions on a dying supply)
	#                • EESAVE — a re-flash keeps the EEPROM (our colour
	#                  memory survives updating the program!)
	#                • SPIEN — ISP programming enabled (how we flash)
	#                • RSTDISBL clear — the RESET pin stays a reset pin
	#  efuse 0xFF  SELFPRGEN clear: no boot-loader; the whole app sits at
	#              the reset vector and starts on every power-up
	#  :m at the end = "literal value" (as opposed to reading a file)

# Rule 5: clean — throw away build outputs.
clean:
	rm -f tricolor_lamp.elf tricolor_lamp.hex

# .PHONY declares targets that are NOT files (flash, fuses, clean). Without
# it, a stray file literally named "flash" would confuse Make.
.PHONY: flash fuses clean
