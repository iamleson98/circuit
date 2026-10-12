/*
 * test_lamp.c — unit tests for the tri-color lamp's logic, on a PC.
 *   sh firmware/test/run.sh        (any C compiler: cc, clang or gcc)
 */
#include <stdio.h>
#include <string.h>

#include "../tricolor_lamp/lamp.h"

static int passed, failed;
#define CHECK(cond, msg) do { if (cond) passed++; else { failed++; printf("  ✗ FAIL  %s (line %d)\n", msg, __LINE__); } } while (0)

/* a fake 512-byte EEPROM that counts writes per cell and can "lose power" */
static uint8_t mem[512];
static unsigned writes[512];
static int cut_after = -1; /* stop obeying writes after this many (simulated power cut) */
static uint8_t rd(uint16_t a) { return mem[a]; }
static void wr(uint16_t a, uint8_t v) { if (cut_after == 0) return; if (cut_after > 0) cut_after--; mem[a] = v; writes[a]++; }
static const store_t S = { rd, wr };
static void erase_all(void) { memset(mem, 0xFF, sizeof mem); memset(writes, 0, sizeof writes); cut_after = -1; }

/* the lamp across a sequence of power cycles: each entry is the off-time before a power-on
   (ms; < 0 = the chip browned out = cold boot). Returns the colours shown. */
static void power_cycles(lamp_mode_t mode, const long *offs, int n, uint8_t *shown) {
  uint8_t saved = 0; uint16_t slot = 0;
  bool have = journal_load(&S, &saved, &slot);
  for (int i = 0; i < n; i++) {
    off_kind_t k = lamp_classify_off(offs[i] < 0 ? 0 : (uint32_t)offs[i], offs[i] < 0);
    uint8_t c = lamp_next_color(mode, k, have, saved);
    if (!have || c != saved) { journal_save(&S, c, have, &slot); have = true; saved = c; }
    shown[i] = c;
    if (offs[i] < 0) { have = journal_load(&S, &saved, &slot); } /* a cold boot re-reads EEPROM */
  }
}

int main(void) {
  puts("tri-color lamp logic:");
  uint8_t c, shown[16]; uint16_t slot;

  /* mode jumper */
  CHECK(lamp_mode_from_adc(5) == MODE_MEMORY, "jumper LO (≈0 V) → MEMORY");
  CHECK(lamp_mode_from_adc(512) == MODE_STEP, "no jumper (VCC/2) → STEP");
  CHECK(lamp_mode_from_adc(1015) == MODE_RESET, "jumper HI (≈VCC) → RESET");
  CHECK(lamp_mode_from_adc(450) == MODE_STEP && lamp_mode_from_adc(600) == MODE_STEP, "±20 % around VCC/2 still reads STEP");

  /* is the 12 V there? (readings as the ADC gives them: 12 V ≈ 670) */
  CHECK(!lamp_supply_dropped(670, 670) && !lamp_supply_dropped(590, 670), "on: up to 1/8 below normal is still on");
  CHECK(lamp_supply_dropped(585, 670), "off: more than 1/8 below normal (≈ 10.4 V)");
  CHECK(!lamp_supply_back(600, 670) && lamp_supply_back(608, 670), "back: within 3/32 of normal (≈ 10.9 V) — a little above the off line");
  CHECK(lamp_supply_dead(376, 670) && !lamp_supply_dead(377, 670), "dead: below 9/16 of normal (≈ 6.5 V): the LEDs can go out");
  CHECK(lamp_supply_steady(660, 670) && lamp_supply_steady(680, 670) && !lamp_supply_steady(640, 670), "steady: within 1/32");
  CHECK(lamp_supply_dropped(0, 1023) && lamp_supply_back(1023, 1023), "no overflow at the ends of the range");

  /* classification */
  CHECK(lamp_classify_off(50, false) == OFF_GLITCH, "50 ms off: a supply glitch");
  CHECK(lamp_classify_off(400, false) == OFF_QUICK, "0.4 s off: a quick flip");
  CHECK(lamp_classify_off(3000, false) == OFF_QUICK, "3.0 s off: still a quick flip");
  CHECK(lamp_classify_off(3100, false) == OFF_LONG, "3.1 s off: a long off");
  CHECK(lamp_classify_off(0, true) == OFF_LONG, "cold boot: always a long off");

  /* the user's lamp: every power-on steps, starting blue */
  erase_all();
  { long offs[] = { -1, 500, 500, 500, 500 }; power_cycles(MODE_STEP, offs, 5, shown); }
  CHECK(shown[0] == COLOR_BLUE && shown[1] == COLOR_WHITE && shown[2] == COLOR_YELLOW && shown[3] == COLOR_BLUE && shown[4] == COLOR_WHITE,
        "STEP: first power-up blue, then white, yellow, blue, white…");
  erase_all();
  { long offs[] = { -1, 10000, -1, -1 }; power_cycles(MODE_STEP, offs, 4, shown); }
  CHECK(shown[0] == COLOR_BLUE && shown[1] == COLOR_WHITE && shown[2] == COLOR_YELLOW && shown[3] == COLOR_BLUE,
        "STEP: long offs and cold boots step too (exactly like the original lamp)");
  erase_all();
  { long offs[] = { -1, 500, 60, 60, 500 }; power_cycles(MODE_STEP, offs, 5, shown); }
  CHECK(shown[1] == COLOR_WHITE && shown[2] == COLOR_WHITE && shown[3] == COLOR_WHITE && shown[4] == COLOR_YELLOW,
        "glitches (< 150 ms) never change the colour");

  /* MEMORY */
  erase_all();
  { long offs[] = { -1, 500, 500, -1, 20000, 500 }; power_cycles(MODE_MEMORY, offs, 6, shown); }
  CHECK(shown[0] == COLOR_BLUE && shown[1] == COLOR_WHITE && shown[2] == COLOR_YELLOW && shown[3] == COLOR_YELLOW && shown[4] == COLOR_YELLOW && shown[5] == COLOR_BLUE,
        "MEMORY: quick flips step; after a long off it comes back in the same colour");

  /* RESET */
  erase_all();
  { long offs[] = { -1, 500, 500, -1, 500, 20000 }; power_cycles(MODE_RESET, offs, 6, shown); }
  CHECK(shown[0] == COLOR_BLUE && shown[1] == COLOR_WHITE && shown[2] == COLOR_YELLOW && shown[3] == COLOR_BLUE && shown[4] == COLOR_WHITE && shown[5] == COLOR_BLUE,
        "RESET: quick flips step; after a long off it starts blue");

  /* journal */
  erase_all();
  CHECK(!journal_load(&S, &c, &slot), "blank EEPROM: no record");
  journal_save(&S, COLOR_YELLOW, false, &slot);
  CHECK(journal_load(&S, &c, &slot) && c == COLOR_YELLOW && slot == 0, "save then load");
  for (int i = 0; i < 300; i++) journal_save(&S, (uint8_t)(i % 3), true, &slot);
  CHECK(journal_load(&S, &c, &slot) && c == (299 % 3), "300 saves later (wrapping the 128-slot ring) the newest record wins");
  int valid = 0; for (int i = 0; i < 128; i++) valid += mem[i] != 0xFF;
  CHECK(valid == 1, "exactly one live record in the ring");

  /* power cut between "write new" and "erase old" */
  erase_all();
  journal_save(&S, COLOR_BLUE, false, &slot);
  cut_after = 1;                                  /* the new record lands, the erase doesn't */
  journal_save(&S, COLOR_WHITE, true, &slot);
  cut_after = -1;
  CHECK(journal_load(&S, &c, &slot) && c == COLOR_WHITE, "power cut after the new write: the new colour is kept");
  journal_save(&S, COLOR_YELLOW, true, &slot);
  valid = 0; for (int i = 0; i < 128; i++) valid += mem[i] != 0xFF;
  CHECK(journal_load(&S, &c, &slot) && c == COLOR_YELLOW, "…and the journal carries on normally");
  (void)valid;

  erase_all();
  journal_save(&S, COLOR_BLUE, false, &slot);
  cut_after = 0;                                  /* power cut before anything is written */
  journal_save(&S, COLOR_WHITE, true, &slot);
  cut_after = -1;
  CHECK(journal_load(&S, &c, &slot) && c == COLOR_BLUE, "power cut before the write: the old colour is kept");

  /* the record wraps from slot 127 to 0 */
  erase_all();
  slot = 127; mem[127] = 0x80 | (15 << 2) | 1;   /* sequence 15, white */
  CHECK(journal_load(&S, &c, &slot) && slot == 127 && c == COLOR_WHITE, "a record in the last slot loads");
  mem[0] = 0x80 | (0 << 2) | 2;                   /* sequence 0 (15 + 1), yellow, old one not erased yet */
  CHECK(journal_load(&S, &c, &slot) && slot == 0 && c == COLOR_YELLOW, "wrap-around half-save: sequence 0 follows 15");

  /* garbage is ignored */
  erase_all();
  mem[5] = 0x37; mem[6] = 0x83; mem[7] = 0x82;   /* 0x37: no tag; 0x83: colour 3 doesn't exist */
  CHECK(journal_load(&S, &c, &slot) && c == COLOR_YELLOW && slot == 7, "stray bytes and out-of-range colours are not records");

  /* two power cuts in a row: stale records anywhere still lose to the newest */
  erase_all();
  journal_save(&S, COLOR_BLUE, false, &slot);
  cut_after = 1; journal_save(&S, COLOR_WHITE, true, &slot); cut_after = -1;   /* cut #1: old not erased */
  journal_load(&S, &c, &slot);
  cut_after = 1; journal_save(&S, COLOR_YELLOW, true, &slot); cut_after = -1;  /* cut #2: cleanup interrupted */
  CHECK(journal_load(&S, &c, &slot) && c == COLOR_YELLOW, "two cuts in a row: the newest colour still wins");
  journal_save(&S, COLOR_BLUE, true, &slot);
  valid = 0; for (int i = 0; i < 128; i++) valid += mem[i] != 0xFF;
  CHECK(valid == 1 && journal_load(&S, &c, &slot) && c == COLOR_BLUE, "the next good save leaves exactly one record");

  /* EEPROM endurance */
  erase_all();
  journal_save(&S, 0, false, &slot);
  for (int i = 0; i < 100000; i++) journal_save(&S, (uint8_t)(i % 3), true, &slot);
  unsigned worst = 0; for (int i = 0; i < 128; i++) if (writes[i] > worst) worst = writes[i];
  CHECK(worst <= 1600, "100 000 flips cost each EEPROM byte ≤ 1 600 writes (rated 100 000)");
  printf("    (worst byte: %u writes after 100 000 colour changes → ≈ %u million flips to wear-out)\n", worst, 100000u / worst * 100000u / 1000000u);

  printf("RESULT: %d passed, %d failed\n", passed, failed);
  return failed != 0;
}
