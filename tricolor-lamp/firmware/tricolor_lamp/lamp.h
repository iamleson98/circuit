/*
 * lamp.h — the tri-color lamp's decisions, with no hardware in them.
 *
 * main.c measures how long the 12 V was off, reads the MODE jumper and the
 * EEPROM, and asks these functions what colour to show. Being plain C, the
 * same code is compiled and unit-tested on a PC (firmware/test/test_lamp.c).
 *
 * ── FOR A NOVICE: what is this file? ────────────────────────────────────
 * A ".h" file is a *header*: a list of promises. It contains no working
 * code, only DECLARATIONS — "these functions exist, these are the numbers
 * the lamp uses". The working code lives in lamp.c. Other files (main.c and
 * the tests) #include this header to see the promises, then the build
 * connects them to the real code. Splitting "what" (header) from "how"
 * (lamp.c) is the oldest trick in software: you can read the contract
 * without reading the implementation.
 *
 * This header deliberately mentions NO chip hardware: no PORTB, no ADC.
 * Why? So the same lamp.c file can be compiled twice —
 *   1. by avr-gcc for the ATtiny85 chip inside the lamp, and
 *   2. by your PC's ordinary C compiler for the automated tests.
 * That trick ("dual-targeting") is why the tests can prove the lamp's
 * behaviour without ever touching real hardware.
 */
#ifndef LAMP_H   /* "if not defined" — see the include guard below */
#define LAMP_H   /* the first time this file is read, LAMP_H gets defined */

/* An include guard: if two files both #include "lamp.h", the compiler would
 * see every promise twice and complain. The two lines above + the #endif at
 * the bottom make the whole file invisible on every read but the first. */

#include <stdbool.h>   /* gives us `bool`, `true`, `false` (C99 and later)  */
#include <stdint.h>    /* gives us fixed-size types: uint8_t = unsigned 8-bit
                          integer (0..255), uint16_t = 0..65535, uint32_t =
                          0..4294967295. On a PC "int" might be 32 or 64
                          bits — these names pin the size down, which
                          matters both for the chip (8-bit CPU!) and for
                          exact arithmetic in the tests. */

/* An anonymous enum used as a list of constants — the three colours the
 * lamp can show, plus NCOLORS ("number of colours") as a handy count.
 * Numbers are explicit so nothing shifts silently if lines get reordered.
 * COLOR_BLUE = 0, COLOR_WHITE = 1, COLOR_YELLOW = 2, NCOLORS = 3. */
enum { COLOR_BLUE = 0, COLOR_WHITE = 1, COLOR_YELLOW = 2, NCOLORS = 3 };

/* A named enum + typedef = a small type with exactly 3 legal values.
 * "typedef" means: after this line, "lamp_mode_t" IS this enum; you don't
 * have to write "enum lamp_mode_t" everywhere. The _t suffix is a common
 * convention for type names. These are the three positions of the MODE
 * jumper soldered on the board (see the project README): */
typedef enum { MODE_STEP, MODE_MEMORY, MODE_RESET } lamp_mode_t;

/* how long the power was off.
 * #define is a find-and-replace the compiler runs before compiling:
 * every later "GLITCH_MAX_MS" becomes "150u". The "u" suffix means
 * "unsigned" — it keeps the arithmetic in unsigned land, matching the
 * unsigned types above (mixing signed/unsigned in C is a classic bug). */
#define GLITCH_MAX_MS 150u   /* shorter: a supply hiccup, not you — keep the colour */
#define QUICK_MAX_MS 3000u   /* up to this: a quick flip — next colour */

/* The three possible verdicts about an off period. main.c measures the
 * milliseconds, lamp_classify_off() (below) sorts them into one of these. */
typedef enum { OFF_GLITCH, OFF_QUICK, OFF_LONG } off_kind_t;

/* ── is the 12 V there? ─────────────────────────────────────────────────
 * main.c measures the 12 V (scaled down by R2/R3) with the ADC, as a
 * fraction of the chip's own VCC: 0..1023, about 670 for 12 V. A switched-
 * off supply doesn't drop to 0 V at once — it holds on, then sags — so
 * instead of waiting for "zero" the lamp compares each reading with
 * on_level, what it read while the lamp was on: */
#define SUPPLY_MIN 560u      /* below this (≈ 9-10 V) it isn't a working 12 V supply */

/* Each of these four functions answers one question about a fresh ADC
 * reading (`now`) compared with a remembered one. They return bool —
 * true or false. The thresholds are written as fractions (7/8, 9/16,
 * 29/32) so the maths is visible in lamp.c; a fixed "10.4 volts" would
 * break the moment someone used a 9 V supply. */
bool lamp_supply_dropped(uint16_t now, uint16_t on_level); /* < 7/8 of on_level: switched off */
bool lamp_supply_dead(uint16_t now, uint16_t on_level);    /* < 9/16 of on_level: the supply has died */
bool lamp_supply_back(uint16_t now, uint16_t on_level);    /* ≥ 29/32 of on_level: switched on again */
bool lamp_supply_steady(uint16_t now, uint16_t before);    /* within 1/32 of before */

/* MODE jumper, read with the ADC against VCC (0..1023): LO = MEMORY, open = STEP, HI = RESET.
 * Turns the raw 0..1023 number into one of the three modes above: the
 * jumper grounds the pin (reading ≈ 0), leaves it at VCC/2 (≈ 512) via two
 * resistors, or ties it to VCC (≈ 1023). */
lamp_mode_t lamp_mode_from_adc(uint16_t adc);

/* cold_boot: the chip itself lost power (its reservoir C5 ran flat) — always a long off.
 * Turns "so many milliseconds off" (+ was it a cold boot?) into
 * GLITCH / QUICK / LONG using the two #define limits above. */
off_kind_t lamp_classify_off(uint32_t off_ms, bool cold_boot);

/* the colour to show after a power-on.
 * THE one function that decides what you see: given the jumper mode, the
 * kind of off that just ended, and what colour (if any) the EEPROM
 * remembers, returns the colour to light now. Pure arithmetic — testable. */
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

/* WHAT IS THE EEPROM? A small memory inside the chip that KEEPS its
 * contents when power is lost — the chip's notebook. The ATtiny85's flash
 * (the program itself) also survives, but rewriting flash mid-program is
 * slow and awkward; the EEPROM is meant exactly for small values that
 * change often. Its one weakness: each byte can only be rewritten about
 * 100 000 times before it wears out. Hence the "journal" scheme above —
 * spread the wear over 128 slots instead of hammering one byte.
 *
 * store_t is how lamp.c touches that memory WITHOUT knowing what it is:
 * a struct holding two FUNCTION POINTERS — `read` and `write` — i.e. the
 * addresses of two functions somebody else will provide. main.c plugs in
 * the real EEPROM functions (from avr-libc); the PC tests plug in a plain
 * array in memory. lamp.c just calls s->read(...) whichever it got. This
 * pattern is called dependency injection in fancy languages; in C it is
 * simply "pass the tools in a box". */
typedef struct {
  uint8_t (*read)(uint16_t addr);        /* "give me the byte at addr"    */
  void (*write)(uint16_t addr, uint8_t value); /* "set the byte at addr"  */
} store_t;

/* returns true and fills *color and *slot with the newest record, if any.
 * (Filling values through pointers — "*color" — is how C returns more than
 * one thing from one function. Callers pass the ADDRESS of their variable.) */
bool journal_load(const store_t *s, uint8_t *color, uint16_t *slot);

/* *slot: where the newest record is (ignored if have_record is false); updated */
void journal_save(const store_t *s, uint8_t color, bool have_record, uint16_t *slot);

#endif /* LAMP_H — end of the include guard */
