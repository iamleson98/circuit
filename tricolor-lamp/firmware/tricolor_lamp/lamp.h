/*
 * lamp.h — the tri-color lamp's decisions, with no hardware in them.
 *
 * main.c measures how long the 12 V was off, reads the MODE jumper and the
 * EEPROM, and asks these functions what colour to show. Being plain C, the
 * same code is compiled and unit-tested on a PC (firmware/test/test_lamp.c).
 */
#ifndef LAMP_H
#define LAMP_H

#include <stdbool.h>
#include <stdint.h>

enum { COLOR_BLUE = 0, COLOR_WHITE = 1, COLOR_YELLOW = 2, NCOLORS = 3 };

typedef enum { MODE_STEP, MODE_MEMORY, MODE_RESET } lamp_mode_t;

/* how long the power was off */
#define GLITCH_MAX_MS 150u   /* shorter: a supply hiccup, not you — keep the colour */
#define QUICK_MAX_MS 3000u   /* up to this: a quick flip — next colour */
typedef enum { OFF_GLITCH, OFF_QUICK, OFF_LONG } off_kind_t;

/* ── is the 12 V there? ─────────────────────────────────────────────────
 * main.c measures the 12 V (scaled down by R2/R3) with the ADC, as a
 * fraction of the chip's own VCC: 0..1023, about 670 for 12 V. A switched-
 * off supply doesn't drop to 0 V at once — it holds on, then sags — so
 * instead of waiting for "zero" the lamp compares each reading with
 * on_level, what it read while the lamp was on: */
#define SUPPLY_MIN 560u      /* below this (≈ 9-10 V) it isn't a working 12 V supply */
bool lamp_supply_dropped(uint16_t now, uint16_t on_level); /* < 7/8 of on_level: switched off */
bool lamp_supply_dead(uint16_t now, uint16_t on_level);    /* < 9/16 of on_level: the supply has died */
bool lamp_supply_back(uint16_t now, uint16_t on_level);    /* ≥ 29/32 of on_level: switched on again */
bool lamp_supply_steady(uint16_t now, uint16_t before);    /* within 1/32 of before */

/* MODE jumper, read with the ADC against VCC (0..1023): LO = MEMORY, open = STEP, HI = RESET */
lamp_mode_t lamp_mode_from_adc(uint16_t adc);

/* cold_boot: the chip itself lost power (its reservoir C5 ran flat) — always a long off */
off_kind_t lamp_classify_off(uint32_t off_ms, bool cold_boot);

/* the colour to show after a power-on */
uint8_t lamp_next_color(lamp_mode_t mode, off_kind_t kind, bool have_saved, uint8_t saved);

/* ── wear-levelled EEPROM journal ─────────────────────────────────────────
 * JOURNAL_SLOTS bytes. A record is one byte, 0b10 ssss cc: a 4-bit sequence
 * number and the colour; erased bytes are 0xFF. A save writes the next
 * record (sequence + 1) into the next slot FIRST, then erases every older
 * record — so a power cut at any moment leaves the old record, the new
 * one, or both, and the loader picks the newest by sequence number. Each
 * byte sees about 2 writes per JOURNAL_SLOTS saves (100 000-cycle EEPROM →
 * millions of switch flips). */
#define JOURNAL_SLOTS 128u
typedef struct {
  uint8_t (*read)(uint16_t addr);
  void (*write)(uint16_t addr, uint8_t value);
} store_t;

/* returns true and fills *color and *slot with the newest record, if any */
bool journal_load(const store_t *s, uint8_t *color, uint16_t *slot);
/* *slot: where the newest record is (ignored if have_record is false); updated */
void journal_save(const store_t *s, uint8_t color, bool have_record, uint16_t *slot);

#endif
