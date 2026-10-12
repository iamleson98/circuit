/*
 * test_lamp.c — unit tests for the tri-color lamp's logic, on a PC.
 *   sh firmware/test/run.sh        (any C compiler: cc, clang or gcc)
 *
 * FOR A NOVICE — what is a unit test?
 *   A program whose main() job is to CALL the real code with chosen inputs
 *   and complain loudly if reality disagrees with expectation. We compile
 *   this file together with the real lamp.c and run the result: green lines
 *   pass, any ✗ FAIL line means the lamp would misbehave in real life.
 *   Testing the logic on a PC is why it was written with no hardware in it:
 *   a bug found here costs seconds; the same bug in a flashed chip costs a
 *   build-flash-test cycle — or a field failure.
 */
#include <stdio.h>     /* puts/printf: how a test reports itself */
#include <string.h>    /* memset: bulk-fill the fake EEPROM */

#include "../tricolor_lamp/lamp.h"   /* the code under test's promises */

/* A tiny assertion framework: passed/failed are counters; CHECK(cond, msg)
 * is a do/while macro so it works anywhere a statement can go. If `cond`
 * holds: count a pass. Else: count a fail AND print where — __LINE__ is the
 * compiler's current line number, which is how you find the failing case. */
static int passed, failed;
#define CHECK(cond, msg) do { if (cond) passed++; else { failed++; printf("  ✗ FAIL  %s (line %d)\n", msg, __LINE__); } } while (0)

/* ── a fake EEPROM that counts writes per cell and can "lose power" ──────
 * The real journal only ever sees memory through the two function pointers
 * in store_t (lamp.h). So the test provides functions of the SAME SHAPE
 * that operate on a plain array — and record a little extra bookkeeping:
 *   writes[a] — how many times cell `a` was written (the wear test needs it)
 *   cut_after — simulate a power cut: after N writes, writes stop landing */
static uint8_t mem[512];          /* the "EEPROM": 512 bytes like the real one */
static unsigned writes[512];      /* per-cell write counters (wear tracking) */
static int cut_after = -1;        /* -1 = unlimited; 0 = next write is lost; >0 = that many writes left before the cut */

/* the two plugs, same shape as the real EEPROM functions: */
static uint8_t rd(uint16_t a) { return mem[a]; }
/* wr honours the power cut FIRST (and spends one of the remaining writes
 * even when it does write — the cut counts attempts, like real hardware) */
static void wr(uint16_t a, uint8_t v) { if (cut_after == 0) return; if (cut_after > 0) cut_after--; mem[a] = v; writes[a]++; }

/* the toolbox handed to journal_load/save — exactly as main.c builds its
 * real-EEPROM one. lamp.c cannot tell the difference: that is the point. */
static const store_t S = { rd, wr };

/* reset the fake EEPROM to "brand new": every cell 0xFF (an erased EEPROM
 * byte reads 0xFF), zero the wear counters, power back on. */
static void erase_all(void) { memset(mem, 0xFF, sizeof mem); memset(writes, 0, sizeof writes); cut_after = -1; }

/* ── the power-cycle harness ─────────────────────────────────────────────
 * Plays a whole lamp "life": for each power-on in the sequence, ask the
 * real functions what colour to show, remember it in the journal (like the
 * firmware does), and record what the user would have SEEN. `offs[i]` is
 * how long the power was off before power-on i; a NEGATIVE number means
 * "the chip itself browned out" (cold boot) — the firmware then re-reads
 * the EEPROM as if from scratch, which the last line replays. */
static void power_cycles(lamp_mode_t mode, const long *offs, int n, uint8_t *shown) {
  uint8_t saved = 0; uint16_t slot = 0;
  bool have = journal_load(&S, &saved, &slot);           /* what does the notebook say at the start? */
  for (int i = 0; i < n; i++) {
    off_kind_t k = lamp_classify_off(offs[i] < 0 ? 0 : (uint32_t)offs[i], offs[i] < 0);  /* ms → verdict (negative = cold boot) */
    uint8_t c = lamp_next_color(mode, k, have, saved);   /* the decision the firmware would make */
    if (!have || c != saved) { journal_save(&S, c, have, &slot); have = true; saved = c; }  /* remember it, exactly as main.c does after a held switch-on */
    shown[i] = c;                                        /* what colour the user sees at this power-on */
    if (offs[i] < 0) { have = journal_load(&S, &saved, &slot); } /* a cold boot re-reads EEPROM */
  }
}

int main(void) {
  puts("tri-color lamp logic:");
  uint8_t c, shown[16]; uint16_t slot;

  /* mode jumper: each CHECK feeds a chosen ADC reading into the real
   * classifier and demands the mode it must produce. 5/512/1015 sit in
   * the middle of each band; 450/600 straddle VCC/2 to prove the cuts are
   * where the design says (±20 % around the middle is still STEP). */
  CHECK(lamp_mode_from_adc(5) == MODE_MEMORY, "jumper LO (≈0 V) → MEMORY");
  CHECK(lamp_mode_from_adc(512) == MODE_STEP, "no jumper (VCC/2) → STEP");
  CHECK(lamp_mode_from_adc(1015) == MODE_RESET, "jumper HI (≈VCC) → RESET");
  CHECK(lamp_mode_from_adc(450) == MODE_STEP && lamp_mode_from_adc(600) == MODE_STEP, "±20 % around VCC/2 still reads STEP");

  /* is the 12 V there? (readings as the ADC gives them: 12 V ≈ 670)
   * Each threshold is probed from BOTH sides, one count apart where the
   * exact boundary matters (376 vs 377, 600 vs 608): that is how you pin
   * a trip point with no tolerance left for "approximately". */
  CHECK(!lamp_supply_dropped(670, 670) && !lamp_supply_dropped(590, 670), "on: up to 1/8 below normal is still on");
  CHECK(lamp_supply_dropped(585, 670), "off: more than 1/8 below normal (≈ 10.4 V)");
  CHECK(!lamp_supply_back(600, 670) && lamp_supply_back(608, 670), "back: within 3/32 of normal (≈ 10.9 V) — a little above the off line");
  CHECK(lamp_supply_dead(376, 670) && !lamp_supply_dead(377, 670), "dead: below 9/16 of normal (≈ 6.5 V): the LEDs can go out");
  CHECK(lamp_supply_steady(660, 670) && lamp_supply_steady(680, 670) && !lamp_supply_steady(640, 670), "steady: within 1/32");
  CHECK(lamp_supply_dropped(0, 1023) && lamp_supply_back(1023, 1023), "no overflow at the ends of the range");

  /* classification: the ms numbers → verdict mapping, borders included */
  CHECK(lamp_classify_off(50, false) == OFF_GLITCH, "50 ms off: a supply glitch");
  CHECK(lamp_classify_off(400, false) == OFF_QUICK, "0.4 s off: a quick flip");
  CHECK(lamp_classify_off(3000, false) == OFF_QUICK, "3.0 s off: still a quick flip");
  CHECK(lamp_classify_off(3100, false) == OFF_LONG, "3.1 s off: a long off");
  CHECK(lamp_classify_off(0, true) == OFF_LONG, "cold boot: always a long off");

  /* the user's lamp: every power-on steps, starting blue.
   * Each scenario: erase_all() (fresh EEPROM), run a list of off-times,
   * then CHECK the exact sequence of colours the user would have seen. */
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

  /* MEMORY: quick flips step; long offs / cold boots keep the colour */
  erase_all();
  { long offs[] = { -1, 500, 500, -1, 20000, 500 }; power_cycles(MODE_MEMORY, offs, 6, shown); }
  CHECK(shown[0] == COLOR_BLUE && shown[1] == COLOR_WHITE && shown[2] == COLOR_YELLOW && shown[3] == COLOR_YELLOW && shown[4] == COLOR_YELLOW && shown[5] == COLOR_BLUE,
        "MEMORY: quick flips step; after a long off it comes back in the same colour");

  /* RESET: quick flips step; long offs / cold boots go back to blue */
  erase_all();
  { long offs[] = { -1, 500, 500, -1, 500, 20000 }; power_cycles(MODE_RESET, offs, 6, shown); }
  CHECK(shown[0] == COLOR_BLUE && shown[1] == COLOR_WHITE && shown[2] == COLOR_YELLOW && shown[3] == COLOR_BLUE && shown[4] == COLOR_WHITE && shown[5] == COLOR_BLUE,
        "RESET: quick flips step; after a long off it starts blue");

  /* journal: save → load round-trips; garbage is ignored; and — the part
   * the tests exist for — power cuts at every possible MOMENT. cut_after=N
   * means "the Nth write from now is lost": that is exactly the window
   * between "new record written" and "old record erased" in journal_save. */
  erase_all();
  CHECK(!journal_load(&S, &c, &slot), "blank EEPROM: no record");
  journal_save(&S, COLOR_YELLOW, false, &slot);
  CHECK(journal_load(&S, &c, &slot) && c == COLOR_YELLOW && slot == 0, "save then load");
  for (int i = 0; i < 300; i++) journal_save(&S, (uint8_t)(i % 3), true, &slot);   /* hammer it around the whole ring */
  CHECK(journal_load(&S, &c, &slot) && c == (299 % 3), "300 saves later (wrapping the 128-slot ring) the newest record wins");
  int valid = 0; for (int i = 0; i < 128; i++) valid += mem[i] != 0xFF;
  CHECK(valid == 1, "exactly one live record in the ring");

  /* power cut between "write new" and "erase old" */
  erase_all();
  journal_save(&S, COLOR_BLUE, false, &slot);
  cut_after = 1;                                  /* the new record lands, the erase doesn't */
  journal_save(&S, COLOR_WHITE, true, &slot);     /* …so after this, BOTH records exist */
  cut_after = -1;                                 /* power restored */
  CHECK(journal_load(&S, &c, &slot) && c == COLOR_WHITE, "power cut after the new write: the new colour is kept");
  journal_save(&S, COLOR_YELLOW, true, &slot);    /* …and the journal carries on normally */
  valid = 0; for (int i = 0; i < 128; i++) valid += mem[i] != 0xFF;
  CHECK(journal_load(&S, &c, &slot) && c == COLOR_YELLOW, "…and the journal carries on normally");
  (void)valid;                                    /* `valid` was only needed for the count above */

  erase_all();
  journal_save(&S, COLOR_BLUE, false, &slot);
  cut_after = 0;                                  /* power cut before anything is written */
  journal_save(&S, COLOR_WHITE, true, &slot);     /* the whole save is lost */
  cut_after = -1;
  CHECK(journal_load(&S, &c, &slot) && c == COLOR_BLUE, "power cut before the write: the old colour is kept");

  /* the record wraps from slot 127 to 0: plant records by hand (bypassing
   * journal_save) to build the exact half-finished state a cut leaves */
  erase_all();
  slot = 127; mem[127] = 0x80 | (15 << 2) | 1;   /* sequence 15, white */
  CHECK(journal_load(&S, &c, &slot) && slot == 127 && c == COLOR_WHITE, "a record in the last slot loads");
  mem[0] = 0x80 | (0 << 2) | 2;                   /* sequence 0 (15 + 1), yellow, old one not erased yet */
  CHECK(journal_load(&S, &c, &slot) && slot == 0 && c == COLOR_YELLOW, "wrap-around half-save: sequence 0 follows 15");

  /* garbage is ignored: no tag bits / impossible colour = not a record */
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

  /* EEPROM endurance: run 100 000 saves (the rated life of ONE byte) and
   * measure the WORST cell. The ring must have spread the wear so thinly
   * that no cell comes anywhere near its 100 000-write limit. */
  erase_all();
  journal_save(&S, 0, false, &slot);
  for (int i = 0; i < 100000; i++) journal_save(&S, (uint8_t)(i % 3), true, &slot);
  unsigned worst = 0; for (int i = 0; i < 128; i++) if (writes[i] > worst) worst = writes[i];
  CHECK(worst <= 1600, "100 000 flips cost each EEPROM byte ≤ 1 600 writes (rated 100 000)");
  printf("    (worst byte: %u writes after 100 000 colour changes → ≈ %u million flips to wear-out)\n", worst, 100000u / worst * 100000u / 1000000u);

  /* the exit code is the contract with run.sh: 0 = all green, nonzero = at
   * least one case failed (run.sh's `set -e` then fails the whole script). */
  printf("RESULT: %d passed, %d failed\n", passed, failed);
  return failed != 0;
}
