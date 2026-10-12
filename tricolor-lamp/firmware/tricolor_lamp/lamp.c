/* lamp.c — the tri-color lamp's decisions (see lamp.h) */
#include "lamp.h"

#define REC_TAG 0x80u   /* 0b10xxxxxx */
#define REC_MASK 0xC0u
#define SEQ(v) (((v) >> 2) & 0x0Fu)
#define COL(v) ((v) & 0x03u)

bool lamp_supply_dropped(uint16_t now, uint16_t on_level) { return (uint32_t)now * 8u < (uint32_t)on_level * 7u; }
bool lamp_supply_dead(uint16_t now, uint16_t on_level) { return (uint32_t)now * 16u < (uint32_t)on_level * 9u; }
bool lamp_supply_back(uint16_t now, uint16_t on_level) { return (uint32_t)now * 32u >= (uint32_t)on_level * 29u; }
bool lamp_supply_steady(uint16_t now, uint16_t before) {
  uint16_t d = now > before ? (uint16_t)(now - before) : (uint16_t)(before - now);
  return (uint32_t)d * 32u <= before;
}

lamp_mode_t lamp_mode_from_adc(uint16_t adc) {
  if (adc < 341) return MODE_MEMORY;  /* jumper LO: pin pulled to GND */
  if (adc > 682) return MODE_RESET;   /* jumper HI: pin pulled to VCC */
  return MODE_STEP;                   /* no jumper: R4/R5 hold it at VCC/2 */
}

off_kind_t lamp_classify_off(uint32_t off_ms, bool cold_boot) {
  if (cold_boot) return OFF_LONG;
  if (off_ms < GLITCH_MAX_MS) return OFF_GLITCH;
  if (off_ms <= QUICK_MAX_MS) return OFF_QUICK;
  return OFF_LONG;
}

uint8_t lamp_next_color(lamp_mode_t mode, off_kind_t kind, bool have_saved, uint8_t saved) {
  if (!have_saved || saved >= NCOLORS) return COLOR_BLUE;   /* first power-up ever */
  uint8_t next = (uint8_t)((saved + 1) % NCOLORS);
  switch (kind) {
    case OFF_GLITCH: return saved;                           /* not a flip */
    case OFF_QUICK: return next;                             /* every mode steps on a quick flip */
    case OFF_LONG:
    default:
      if (mode == MODE_STEP) return next;
      if (mode == MODE_MEMORY) return saved;
      return COLOR_BLUE;                                     /* MODE_RESET */
  }
}

static bool valid(uint8_t v) { return (v & REC_MASK) == REC_TAG && COL(v) < NCOLORS; }
/* a is newer than b if it is 1-7 steps ahead of it, modulo 16 */
static bool newer(uint8_t a, uint8_t b) { uint8_t d = (uint8_t)((SEQ(a) - SEQ(b)) & 0x0F); return d >= 1 && d <= 7; }

bool journal_load(const store_t *s, uint8_t *color, uint16_t *slot) {
  bool any = false;
  uint8_t best = 0;
  for (uint16_t i = 0; i < JOURNAL_SLOTS; i++) {
    uint8_t v = s->read(i);
    if (!valid(v)) continue;
    if (!any || newer(v, best)) { best = v; *slot = i; any = true; }
  }
  if (any) *color = (uint8_t)COL(best);
  return any;
}

void journal_save(const store_t *s, uint8_t color, bool have_record, uint16_t *slot) {
  uint8_t seq = 0;
  uint16_t next = 0;
  if (have_record) {
    seq = (uint8_t)((SEQ(s->read(*slot)) + 1) & 0x0F);
    next = (uint16_t)((*slot + 1) % JOURNAL_SLOTS);
  }
  s->write(next, (uint8_t)(REC_TAG | (seq << 2) | (color % NCOLORS)));  /* 1: the new record */
  for (uint16_t i = 0; i < JOURNAL_SLOTS; i++)                         /* 2: retire all others */
    if (i != next && valid(s->read(i))) s->write(i, 0xFF);
  *slot = next;
}
