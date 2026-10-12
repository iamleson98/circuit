# ATtiny85 tri-color lamp firmware — avr-gcc + avrdude
#   make                      build tricolor_lamp.hex
#   make flash                program it (default: an Arduino running "ArduinoISP")
#   make fuses                set the fuses once per chip: 1 MHz, brown-out 2.7 V, keep EEPROM
#   make PROGRAMMER=usbasp PORT=usb flash    (USBasp instead)
MCU        = attiny85
F_CPU      = 1000000UL
PROGRAMMER ?= stk500v1
PORT      ?= /dev/tty.usbmodem*
BAUD      ?= 19200

CFLAGS = -mmcu=$(MCU) -DF_CPU=$(F_CPU) -std=gnu11 -Os -Wall -Wextra -Werror -ffunction-sections -fdata-sections
LDFLAGS = -mmcu=$(MCU) -Wl,--gc-sections

tricolor_lamp.hex: tricolor_lamp.elf
	avr-objcopy -O ihex -R .eeprom $< $@
	avr-size --format=avr --mcu=$(MCU) $<

tricolor_lamp.elf: main.c lamp.c lamp.h
	avr-gcc $(CFLAGS) $(LDFLAGS) -o $@ main.c lamp.c

flash: tricolor_lamp.hex
	avrdude -c $(PROGRAMMER) -P $(PORT) -b $(BAUD) -p $(MCU) -U flash:w:$<:i

fuses:
	avrdude -c $(PROGRAMMER) -P $(PORT) -b $(BAUD) -p $(MCU) -U lfuse:w:0x62:m -U hfuse:w:0xD5:m -U efuse:w:0xFF:m

clean:
	rm -f tricolor_lamp.elf tricolor_lamp.hex

.PHONY: flash fuses clean
