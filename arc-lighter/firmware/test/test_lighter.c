/*
 * test_lighter.c — unit tests for the arc lighter's safety logic, on a PC.
 *   sh firmware/test/run.sh        (any C compiler: cc, clang or gcc)
 * Every test drives lighter_tick() with 10 ms ticks, exactly like main.c.
 *
 * FOR A NOVICE — how to read this file:
 *   Each CHECK is one safety promise, in English, turned into code:
 *   "hold FIRE for 8 s → the arc stops", "a bouncing button never fires".
 *   The helpers run()/led_flashes() below are miniature players: they call
 *   the REAL lighter_tick() in a loop with scripted inputs, as if the
 *   hardware were attached. The one struct `l` is the real brain's state;
 *   the tests never peek inside it except for fields lighter.h exposes as
 *   readable (last_stop — "why did it stop" — for assertions).
 */
#include <stdio.h>     /* printf: reporting */
#include <string.h>    /* (kept for symmetry with the lamp's tests) */

#include "../arc_lighter/lighter.h"   /* the code under test's promises */

/* the tiny assertion framework — identical in spirit to the lamp's:
 * count passes, print the message + line number on a fail. */
static int passed, failed;
#define CHECK(cond, msg) do { if (cond) passed++; else { failed++; printf("  ✗ FAIL  %s (line %d)\n", msg, __LINE__); } } while (0)

/* one scripted environment: what the world looks like for a stretch of
 * ticks — button down?, USB in?, cell at mV, coil buzzing at kHz */
typedef struct { bool button, usb; uint16_t vbat, khz; } env_t;

/* run n ticks; returns how many of them had the arc on; leaves the last output in *o.
 * Each tick is 10 ms of the chosen environment; pulses per tick = kHz ×
 * TICK_MS (e.g. 5 kHz → 50 pulses per 10 ms tick) — exactly what main.c's
 * hardware counter would deliver. */
static int run(lighter_t *l, env_t e, int ticks, lighter_out_t *o) {
  int on = 0;                                  /* arc-on tick counter */
  for (int i = 0; i < ticks; i++) {
    lighter_in_t in = { e.button, e.usb, e.vbat, (uint16_t)(e.khz * TICK_MS) };   /* build this tick's inputs */
    lighter_tick(l, &in, o);                   /* one heartbeat of the real brain */
    on += o->fire;                            /* remember: was the arc on? */
  }
  return on;                                   /* how many ticks had the arc lit */
}

/* count LED flash ONSETS (rising edges): n edges = the LED lit n times */
static int led_flashes(lighter_t *l, env_t e, int ticks) {
  lighter_out_t o; int n = 0; bool prev = false;
  for (int i = 0; i < ticks; i++) { run(l, e, 1, &o); if (o.led && !prev) n++; prev = o.led; }  /* count false→true transitions */
  return n;
}

int main(void) {
  lighter_t l; lighter_out_t o;
  /* the two baseline environments: idle (nothing pressed, healthy cell,
   * silent coil) and press (FIRE held, 3.9 V, healthy 40 kHz coil): */
  const env_t idle = { false, false, 3900, 0 }, press = { true, false, 3900, 40 };

  puts("arc lighter logic:");

  /* normal use: the full happy path, then a release */
  lighter_init(&l, false, false);              /* fresh brain, button not held at boot */
  run(&l, idle, 10, &o);                      /* 100 ms of nothing */
  CHECK(!o.fire && o.may_sleep, "idle: arc off, may sleep");
  run(&l, press, 2, &o);                      /* 20 ms of press… */
  CHECK(!o.fire, "a 20 ms press is still bouncing: no arc yet");       /* …still inside the 30 ms debounce window */
  run(&l, press, 2, &o);                      /* 30 ms of steady press reached */
  CHECK(o.fire, "after 30 ms of a steady press the arc starts");
  CHECK(run(&l, press, 300, &o) == 300, "the arc stays on while FIRE is held (3 s)");  /* every one of 300 ticks lit */
  run(&l, idle, 3, &o);                       /* release */
  CHECK(!o.fire && l.last_stop == CODE_NONE, "releasing FIRE stops the arc, no error code");

  /* debounce: contact bounce must not fire.
   * Alternate the environment every tick (10 ms on, 10 ms off) — exactly
   * what a sparking physical contact looks like to the chip. */
  lighter_init(&l, false, false);
  int bounce_on = 0;
  for (int i = 0; i < 40; i++) bounce_on += run(&l, (i % 2) ? press : idle, 1, &o);   /* 400 ms of chatter */
  CHECK(bounce_on == 0, "a bouncing contact (10 ms on/off) never fires");              /* not one arc-on tick */

  /* 8 s limit + cooldown: the thermal-management story */
  lighter_init(&l, false, false);
  int on = run(&l, press, 1000, &o);          /* hold FIRE a full 10 s */
  CHECK(on >= 795 && on <= 800 && !o.fire && l.last_stop == CODE_TIMEOUT, "holding FIRE: the arc stops at 8 s");
  lighter_init(&l, false, false);
  run(&l, press, 803, &o);                    /* timed out just now */
  CHECK(run(&l, press, 100, &o) == 0, "still holding after the timeout: it does NOT re-fire");   /* held button ≠ new press */
  run(&l, idle, 5, &o);                       /* release… */
  CHECK(run(&l, press, 50, &o) == 0, "released and pressed again inside the 5 s cooldown: refused");
  run(&l, idle, 400, &o);                     /* …let the cooldown melt away (4 s idle) */
  CHECK(run(&l, press, 10, &o) > 0, "after the cooldown it fires again");
  lighter_init(&l, false, false);
  run(&l, press, 805, &o);                    /* timed out */
  for (int k = 0; k < 4; k++) { run(&l, idle, 50, &o); run(&l, press, 50, &o); } /* jab during cooldown */
  run(&l, idle, 105, &o);                     /* 5.0 s since the timeout */
  CHECK(run(&l, press, 10, &o) > 0, "jabbing FIRE during the cooldown doesn't extend it");

  /* USB lockout: charging and arcing never overlap */
  lighter_init(&l, false, false);
  env_t usb = press; usb.usb = true;          /* FIRE held AND USB plugged in */
  CHECK(run(&l, usb, 100, &o) == 0 && l.last_stop == CODE_USB, "USB plugged in: firing refused");
  lighter_init(&l, false, false);
  run(&l, press, 50, &o);                     /* already firing… */
  CHECK(o.fire, "(firing)");                  /* …sanity: the arc really was on */
  run(&l, usb, 1, &o);                        /* …USB lands mid-arc: ONE tick later… */
  CHECK(!o.fire && l.last_stop == CODE_USB, "USB plugged in while firing: stops at once");
  run(&l, press, 100, &o);                    /* USB gone, still holding */
  CHECK(!o.fire, "…and stays off until FIRE is released and pressed again");

  /* low battery: refused at rest; stopped under load */
  lighter_init(&l, false, false);
  env_t low = press; low.vbat = 3300;         /* 3.3 V at rest — below the 3.4 V refuse line */
  CHECK(run(&l, low, 100, &o) == 0 && l.last_stop == CODE_LOW_BATTERY, "cell at 3.3 V at rest: refused");
  lighter_init(&l, false, false);
  run(&l, press, 50, &o);                     /* firing happily… */
  env_t sag = press; sag.vbat = 2900;         /* …the cell sags to 2.9 V under the arc's load */
  run(&l, sag, 10, &o);                       /* 100 ms of sag */
  CHECK(o.fire, "a 100 ms sag under load is tolerated");          /* under the 200 ms tolerance */
  run(&l, press, 10, &o);                     /* back up… (also resets the accumulator) */
  run(&l, sag, 25, &o);                       /* …and down again for 250 ms */
  CHECK(!o.fire && l.last_stop == CODE_LOW_BATTERY, "a sag below 3.0 V for 200 ms stops the arc");

  /* coil monitor: the arc's most unusual input. kHz drives the pulse
   * count per tick; the brain demands ≥ 2 kHz (40 pulses per 20 ms window). */
  lighter_init(&l, false, false);
  env_t dead = press; dead.khz = 0;           /* total silence: 0 pulses */
  on = run(&l, dead, 100, &o);
  CHECK(!o.fire && l.last_stop == CODE_COIL_FAULT && on <= 8, "no coil pulses: the arc is cut within 50 ms of starting");  /* ≤ 8 ticks: the 20 ms settle + one window */
  lighter_init(&l, false, false);
  env_t slow = press; slow.khz = 1;           /* 1 kHz = 10 pulses per tick… */
  run(&l, slow, 100, &o);
  CHECK(!o.fire && l.last_stop == CODE_COIL_FAULT, "pulses at 1 kHz (< 2 kHz): treated as a fault");
  lighter_init(&l, false, false);
  env_t ok5 = press; ok5.khz = 5;             /* 5 kHz — comfortably healthy */
  CHECK(run(&l, ok5, 300, &o) == 298 && o.fire, "5 kHz (below the slowest simulated coil): keeps firing");
  lighter_init(&l, false, false);
  env_t ok20 = press; ok20.khz = 20;          /* 20 kHz — the slowest a real coil ever is */
  CHECK(run(&l, ok20, 300, &o) == 298 && o.fire, "20 kHz (the slowest simulated coil): keeps firing");
  lighter_init(&l, true, false);              /* module_mode = true: the monitor is compiled OUT */
  CHECK(run(&l, dead, 300, &o) == 298 && o.fire, "module mode (MODULE=1): no coil monitor");

  /* reset with the button held (e.g. a brown-out while firing):
   * after a reset the brain cannot know the past — so it distrusts the
   * present: a button ALREADY down at boot waits for a release first. */
  lighter_init(&l, false, true);
  CHECK(run(&l, press, 300, &o) == 0, "boot with FIRE held: waits for a release first");
  run(&l, idle, 5, &o);                       /* release… */
  CHECK(run(&l, press, 10, &o) > 0, "…then works normally");

  /* blink codes: the LED is the only display — count its flashes.
   * 6 onsets = "3 flashes" × BLINK_REPEATS(2); 8 = 4 × 2. */
  lighter_init(&l, false, false);
  run(&l, low, 4, &o);                        /* trigger low battery (blink 3) */
  CHECK(led_flashes(&l, idle, 600) == 6, "low battery blinks 3 × 2");
  lighter_init(&l, false, false);
  run(&l, dead, 9, &o);                       /* trigger coil fault (blink 4) */
  CHECK(led_flashes(&l, idle, 800) == 8, "coil fault blinks 4 × 2");
  run(&l, idle, 50, &o);
  CHECK(o.may_sleep && !o.led, "after the code the lighter goes back to sleep");

  /* the exit code is the contract with run.sh: 0 = all green */
  printf("RESULT: %d passed, %d failed\n", passed, failed);
  return failed != 0;
}
