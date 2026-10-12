/*
 * test_lighter.c — unit tests for the arc lighter's safety logic, on a PC.
 *   sh firmware/test/run.sh        (any C compiler: cc, clang or gcc)
 * Every test drives lighter_tick() with 10 ms ticks, exactly like main.c.
 */
#include <stdio.h>
#include <string.h>

#include "../arc_lighter/lighter.h"

static int passed, failed;
#define CHECK(cond, msg) do { if (cond) passed++; else { failed++; printf("  ✗ FAIL  %s (line %d)\n", msg, __LINE__); } } while (0)

typedef struct { bool button, usb; uint16_t vbat, khz; } env_t;

/* run n ticks; returns how many of them had the arc on; leaves the last output in *o */
static int run(lighter_t *l, env_t e, int ticks, lighter_out_t *o) {
  int on = 0;
  for (int i = 0; i < ticks; i++) {
    lighter_in_t in = { e.button, e.usb, e.vbat, (uint16_t)(e.khz * TICK_MS) };
    lighter_tick(l, &in, o);
    on += o->fire;
  }
  return on;
}
static int led_flashes(lighter_t *l, env_t e, int ticks) {
  lighter_out_t o; int n = 0; bool prev = false;
  for (int i = 0; i < ticks; i++) { run(l, e, 1, &o); if (o.led && !prev) n++; prev = o.led; }
  return n;
}

int main(void) {
  lighter_t l; lighter_out_t o;
  const env_t idle = { false, false, 3900, 0 }, press = { true, false, 3900, 40 };

  puts("arc lighter logic:");

  /* normal use */
  lighter_init(&l, false, false);
  run(&l, idle, 10, &o);
  CHECK(!o.fire && o.may_sleep, "idle: arc off, may sleep");
  run(&l, press, 2, &o);
  CHECK(!o.fire, "a 20 ms press is still bouncing: no arc yet");
  run(&l, press, 2, &o);
  CHECK(o.fire, "after 30 ms of a steady press the arc starts");
  CHECK(run(&l, press, 300, &o) == 300, "the arc stays on while FIRE is held (3 s)");
  run(&l, idle, 3, &o);
  CHECK(!o.fire && l.last_stop == CODE_NONE, "releasing FIRE stops the arc, no error code");

  /* debounce: contact bounce must not fire */
  lighter_init(&l, false, false);
  int bounce_on = 0;
  for (int i = 0; i < 40; i++) bounce_on += run(&l, (i % 2) ? press : idle, 1, &o);
  CHECK(bounce_on == 0, "a bouncing contact (10 ms on/off) never fires");

  /* 8 s limit + cooldown */
  lighter_init(&l, false, false);
  int on = run(&l, press, 1000, &o);
  CHECK(on >= 795 && on <= 800 && !o.fire && l.last_stop == CODE_TIMEOUT, "holding FIRE: the arc stops at 8 s");
  lighter_init(&l, false, false);
  run(&l, press, 803, &o);             /* timed out just now */
  CHECK(run(&l, press, 100, &o) == 0, "still holding after the timeout: it does NOT re-fire");
  run(&l, idle, 5, &o);
  CHECK(run(&l, press, 50, &o) == 0, "released and pressed again inside the 5 s cooldown: refused");
  run(&l, idle, 400, &o);
  CHECK(run(&l, press, 10, &o) > 0, "after the cooldown it fires again");
  lighter_init(&l, false, false);
  run(&l, press, 805, &o);            /* timed out */
  for (int k = 0; k < 4; k++) { run(&l, idle, 50, &o); run(&l, press, 50, &o); } /* jab during cooldown */
  run(&l, idle, 105, &o);              /* 5.0 s since the timeout */
  CHECK(run(&l, press, 10, &o) > 0, "jabbing FIRE during the cooldown doesn't extend it");

  /* USB lockout */
  lighter_init(&l, false, false);
  env_t usb = press; usb.usb = true;
  CHECK(run(&l, usb, 100, &o) == 0 && l.last_stop == CODE_USB, "USB plugged in: firing refused");
  lighter_init(&l, false, false);
  run(&l, press, 50, &o);
  CHECK(o.fire, "(firing)");
  run(&l, usb, 1, &o);
  CHECK(!o.fire && l.last_stop == CODE_USB, "USB plugged in while firing: stops at once");
  run(&l, press, 100, &o);
  CHECK(!o.fire, "…and stays off until FIRE is released and pressed again");

  /* low battery */
  lighter_init(&l, false, false);
  env_t low = press; low.vbat = 3300;
  CHECK(run(&l, low, 100, &o) == 0 && l.last_stop == CODE_LOW_BATTERY, "cell at 3.3 V at rest: refused");
  lighter_init(&l, false, false);
  run(&l, press, 50, &o);
  env_t sag = press; sag.vbat = 2900;
  run(&l, sag, 10, &o);
  CHECK(o.fire, "a 100 ms sag under load is tolerated");
  run(&l, press, 10, &o);
  run(&l, sag, 25, &o);
  CHECK(!o.fire && l.last_stop == CODE_LOW_BATTERY, "a sag below 3.0 V for 200 ms stops the arc");

  /* coil monitor */
  lighter_init(&l, false, false);
  env_t dead = press; dead.khz = 0;
  on = run(&l, dead, 100, &o);
  CHECK(!o.fire && l.last_stop == CODE_COIL_FAULT && on <= 8, "no coil pulses: the arc is cut within 50 ms of starting");
  lighter_init(&l, false, false);
  env_t slow = press; slow.khz = 1;
  run(&l, slow, 100, &o);
  CHECK(!o.fire && l.last_stop == CODE_COIL_FAULT, "pulses at 1 kHz (< 2 kHz): treated as a fault");
  lighter_init(&l, false, false);
  env_t ok5 = press; ok5.khz = 5;
  CHECK(run(&l, ok5, 300, &o) == 298 && o.fire, "5 kHz (below the slowest simulated coil): keeps firing");
  lighter_init(&l, false, false);
  env_t ok20 = press; ok20.khz = 20;
  CHECK(run(&l, ok20, 300, &o) == 298 && o.fire, "20 kHz (the slowest simulated coil): keeps firing");
  lighter_init(&l, true, false);
  CHECK(run(&l, dead, 300, &o) == 298 && o.fire, "module mode (MODULE=1): no coil monitor");

  /* reset with the button held (e.g. a brown-out while firing) */
  lighter_init(&l, false, true);
  CHECK(run(&l, press, 300, &o) == 0, "boot with FIRE held: waits for a release first");
  run(&l, idle, 5, &o);
  CHECK(run(&l, press, 10, &o) > 0, "…then works normally");

  /* blink codes */
  lighter_init(&l, false, false);
  run(&l, low, 4, &o);
  CHECK(led_flashes(&l, idle, 600) == 6, "low battery blinks 3 × 2");
  lighter_init(&l, false, false);
  run(&l, dead, 9, &o);
  CHECK(led_flashes(&l, idle, 800) == 8, "coil fault blinks 4 × 2");
  run(&l, idle, 50, &o);
  CHECK(o.may_sleep && !o.led, "after the code the lighter goes back to sleep");

  printf("RESULT: %d passed, %d failed\n", passed, failed);
  return failed != 0;
}
