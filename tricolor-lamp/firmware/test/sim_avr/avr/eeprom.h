#pragma once
#include <stdint.h>
uint8_t eeprom_read_byte(const uint8_t *a);
void eeprom_update_byte(uint8_t *a, uint8_t v);
