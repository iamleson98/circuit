# ATtiny85 arc lighter firmware — avr-gcc + avrdude
#   make                      build arc_lighter.hex
#   make MODULE=1             build for a complete arc module on MOD+/MOD−
#   make flash                program it (default: an Arduino running "ArduinoISP")
#   make fuses                set the fuses once per chip: 1 MHz, brown-out 2.7 V
#   make PROGRAMMER=usbasp PORT=usb flash    (USBasp instead)
MCU        = attiny85
F_CPU      = 1000000UL
MODULE    ?= 0
PROGRAMMER ?= stk500v1
PORT      ?= /dev/tty.usbmodem*
BAUD      ?= 19200

CFLAGS = -mmcu=$(MCU) -DF_CPU=$(F_CPU) -DMODULE=$(MODULE) -std=gnu11 -Os -Wall -Wextra -Werror -ffunction-sections -fdata-sections
LDFLAGS = -mmcu=$(MCU) -Wl,--gc-sections

arc_lighter.hex: arc_lighter.elf
	avr-objcopy -O ihex -R .eeprom $< $@
	avr-size --format=avr --mcu=$(MCU) $<

arc_lighter.elf: main.c lighter.c lighter.h
	avr-gcc $(CFLAGS) $(LDFLAGS) -o $@ main.c lighter.c

flash: arc_lighter.hex
	avrdude -c $(PROGRAMMER) -P $(PORT) -b $(BAUD) -p $(MCU) -U flash:w:$<:i

fuses:
	avrdude -c $(PROGRAMMER) -P $(PORT) -b $(BAUD) -p $(MCU) -U lfuse:w:0x62:m -U hfuse:w:0xDD:m -U efuse:w:0xFF:m

clean:
	rm -f arc_lighter.elf arc_lighter.hex

.PHONY: flash fuses clean
