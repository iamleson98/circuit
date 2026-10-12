/* lamp.c — the tri-color lamp's decisions (see lamp.h)
 *
 * ── FOR A NOVICE ────────────────────────────────────────────────────────
 * This file is the lamp's BRAIN, and it is deliberately built with no
 * hardware inside: no pins, no chip registers — only arithmetic on numbers
 * that main.c feeds in. That is what makes it testable on an ordinary
 * computer (firmware/test/test_lamp.c compiles this very file and throws
 * hundreds of cases at it).
 *
 * The pattern used here is the classic way to write firmware so it can be
 * proven correct:
 *   main.c  = hands and eyes  (chip registers: read the world, act on it)
 *   lamp.c  = policy          (decide what the hands should do next)
 * Everything in this file is small pure functions: same inputs → same
 * answer, no hidden state, no "time" — time arrives as a number.
 */
#include "lamp.h"   /* our own promises from lamp.h (colour numbers, modes,
                      the store_t "toolbox" type and the thresholds) */

/* ── the one-byte EEPROM record format ───────────────────────────────────
 * A saved colour is packed into ONE byte so an interrupted write can never
 * corrupt more than one record. The byte looks like this, bit by bit:
 *
 *     bit 7  bit 6  bit 5  bit 4  bit 3  bit 2  bit 1  bit 0
 *     1      0      s      s      s      s      c      c
 *     └─ tag "this is a record" ─┘└ sequence ─┘└colour┘
 *
 * 0x80 = 0b10000000 → the two tag bits (bit7=1, bit6=0). */
#define REC_TAG 0x80u   /* 0b10xxxxxx */
#define REC_MASK 0xC0u  /* 0b11000000: a mask to isolate the two tag bits */

/* Pull the 4-bit sequence number out of a record: shift right 2 places,
 * keep the low 4 bits. SEQ is a macro (a function-shaped #define) so it
 * works on any expression without a function call. */
#define SEQ(v) (((v) >> 2) & 0x0Fu)

/* Pull the 2-bit colour out of a record: keep the low 2 bits. */
#define COL(v) ((v) & 0x03u)

/* ── is the 12 V there? ──────────────────────────────────────────────────
 * Each function is one comparison written as a FRACTION so no floating
 * point is needed (the ATtiny85 has no floating-point hardware; integer
 * maths is also exact, so the tests can check the exact trip point).
 * The trick: instead of "now < 7/8 × on_level" (a division), multiply
 * both sides by 8: "now × 8 < on_level × 7" (exact, no rounding).
 * (uint32_t) casts stop the 16-bit × 8 products from overflowing. */

/* "dropped" = more than 1/8 below normal: the supply was switched off */
bool lamp_supply_dropped(uint16_t now, uint16_t on_level) { return (uint32_t)now * 8u < (uint32_t)on_level * 7u; }
/* "dead" = below 9/16 of normal: the supply has truly collapsed — now it
 * is safe to switch the LEDs off (they were helping drain the supply) */
bool lamp_supply_dead(uint16_t now, uint16_t on_level) { return (uint32_t)now * 16u < (uint32_t)on_level * 9u; }
/* "back" = within 3/32 of normal — a whisker above the "dropped" line, so
 * the two can't chatter back and forth in a grey zone */
bool lamp_supply_back(uint16_t now, uint16_t on_level) { return (uint32_t)now * 32u >= (uint32_t)on_level * 29u; }
/* "steady" = the reading has moved less than 1/32 since the last one.
 * First the absolute difference (whichever way it moved)… */
bool lamp_supply_steady(uint16_t now, uint16_t before) {
  uint16_t d = now > before ? (uint16_t)(now - before) : (uint16_t)(before - now);
  return (uint32_t)d * 32u <= before;   /* …then compare it, ×32 to avoid dividing */
}

/* ── the MODE jumper ─────────────────────────────────────────────────────
 * The ADC returns 0..1023. The board's resistors place the pin at one of
 * three well-separated voltages, so two cuts split the range into thirds. */
lamp_mode_t lamp_mode_from_adc(uint16_t adc) {
  if (adc < 341) return MODE_MEMORY;  /* jumper LO: pin pulled to GND */
  if (adc > 682) return MODE_RESET;   /* jumper HI: pin pulled to VCC */
  return MODE_STEP;                   /* no jumper: R4/R5 hold it at VCC/2 */
}

/* ── how long was the power off? ─────────────────────────────────────────
 * A stopwatch reading becomes a verdict. 150 ms / 3000 ms are the two
 * borders; a cold boot (the chip itself blacked out and restarted) can
 * never prove how long the power was gone, so it plays safe as "long". */
off_kind_t lamp_classify_off(uint32_t off_ms, bool cold_boot) {
  if (cold_boot) return OFF_LONG;
  /* (no end-of-line comment here on purpose: the automated mutation test
 * finds this exact line and plants bugs in it — see mutation_test.py) */
  if (off_ms < GLITCH_MAX_MS) return OFF_GLITCH;
  if (off_ms <= QUICK_MAX_MS) return OFF_QUICK;
  return OFF_LONG;
}

/* ── the verdict → the colour you see ────────────────────────────────────
 * This table IS the product spec, as code. Read it top to bottom: */
uint8_t lamp_next_color(lamp_mode_t mode, off_kind_t kind, bool have_saved, uint8_t saved) {
  if (!have_saved || saved >= NCOLORS) return COLOR_BLUE;   /* first power-up ever: blue, and any nonsense value falls back to blue too */
  uint8_t next = (uint8_t)((saved + 1) % NCOLORS);          /* the colour after `saved`, wrapping: blue→white→yellow→blue… (% = remainder) */
  switch (kind) {                                           /* pick the rule by verdict: */
    case OFF_GLITCH: return saved;                           /* not a flip */
    case OFF_QUICK: return next;                             /* every mode steps on a quick flip */
    case OFF_LONG:
    default:
      if (mode == MODE_STEP) return next;                    /* STEP: a long off still steps */
      if (mode == MODE_MEMORY) return saved;                 /* MEMORY: come back in the same colour */
      return COLOR_BLUE;                                     /* MODE_RESET */
  }
}

/* ── the EEPROM journal ────────────────────────────────────────────────── */

/* Does this byte look like a record? Two tag bits must be exactly "10"
 * AND the colour field must name a real colour (0, 1 or 2 — never 3). */
static bool valid(uint8_t v) { return (v & REC_MASK) == REC_TAG && COL(v) < NCOLORS; }

/* a is newer than b if it is 1-7 steps ahead of it, modulo 16.
 * Sequence numbers are 4 bits, so they wrap 15 → 0. Subtracting two
 * sequences modulo 16 gives the gap: 1..7 forward = "a is newer",
 * 9..15 (i.e. -1..-7) = "b is newer", 0 or 8 = same or ambiguous half-way
 * point (never happens: only one record survives a save). */
static bool newer(uint8_t a, uint8_t b) { uint8_t d = (uint8_t)((SEQ(a) - SEQ(b)) & 0x0F); return d >= 1 && d <= 7; }

/* Scan all 128 slots, keep the valid record with the newest sequence.
 * *color and *slot are OUTPUTS (see lamp.h): we write the answers into the
 * caller's variables through the pointers. Returns: did we find anything? */
bool journal_load(const store_t *s, uint8_t *color, uint16_t *slot) {
  bool any = false;        /* have we seen even one valid record yet? */
  uint8_t best = 0;        /* the best (newest) record so far */
  for (uint16_t i = 0; i < JOURNAL_SLOTS; i++) {   /* walk every slot 0..127 */
    uint8_t v = s->read(i);                        /* read one byte through the toolbox */
    if (!valid(v)) continue;                       /* erased (0xFF) or garbage: skip */
    if (!any || newer(v, best)) { best = v; *slot = i; any = true; }  /* first find, or a newer one: remember it and where it lives */
  }
  if (any) *color = (uint8_t)COL(best);            /* unpack the colour from the winner */
  return any;                                      /* false = EEPROM was blank: first ever run */
}

/* Save `color` so that a power cut at ANY instant loses nothing:
 * write-new-first, erase-old-second (see lamp.h for the full argument). */
void journal_save(const store_t *s, uint8_t color, bool have_record, uint16_t *slot) {
  uint8_t seq = 0;         /* the new record's sequence number */
  uint16_t next = 0;       /* which slot it goes in */
  if (have_record) {
    seq = (uint8_t)((SEQ(s->read(*slot)) + 1) & 0x0F);      /* one past the current record's number, wrapping 15→0 */
    next = (uint16_t)((*slot + 1) % JOURNAL_SLOTS);         /* the following slot, wrapping 127→0 (a ring) */
  }
  s->write(next, (uint8_t)(REC_TAG | (seq << 2) | (color % NCOLORS)));  /* 1: the new record — tag | sequence | colour, all packed into one byte */
  for (uint16_t i = 0; i < JOURNAL_SLOTS; i++)                         /* 2: retire all others */
    if (i != next && valid(s->read(i))) s->write(i, 0xFF);              /* …an erased EEPROM byte reads 0xFF */
  *slot = next;                                            /* tell the caller where the record now lives */
}
