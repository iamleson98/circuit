/* sim_avr/avr/eeprom.h — stand-in for avr-libc's <avr/eeprom.h>.
 *
 * FOR A NOVICE — what the REAL header provides on the chip:
 *   Direct, byte-at-a-time access to the chip's non-volatile EEPROM —
 *   the 512 bytes that remember things across power loss. Reads are
 *   instant; writes take ~3.4 ms each (the model charges that time) and
 *   each byte endures only ~100 000 writes, which is why lamp.c wraps
 *   them in the wear-levelling journal.
 *
 * In the simulation, the same two functions are provided by sim_firmware.c
 * — backed by a plain in-memory array plus a model of the write timing.
 * Because the signatures below match avr-libc's exactly, main.c's
 * ee_read/ee_write wrappers compile unchanged in both worlds. */
#pragma once
#include <stdint.h>
/* read the byte at address a — instant in both worlds: */
uint8_t eeprom_read_byte(const uint8_t *a);
/* write v at address a — takes ~3.4 ms of model-time when it actually writes: */
void eeprom_update_byte(uint8_t *a, uint8_t v);
