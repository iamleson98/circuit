/*
 * lighter.c — the arc lighter's safety logic (see lighter.h).
 *
 * The rules, in order of precedence while firing:
 *   1. FIRE released          → stop (normal use)
 *   2. USB plugged in         → stop, blink 2
 *   3. coil not oscillating   → stop, blink 4 (feedback wires swapped, coil open…)
 *   4. cell sagging < 3.0 V   → stop, blink 3
 *   5. 8 s of continuous arc  → stop, blink 1, 5 s cooldown
 * After any stop other than a release, the button must be let go before the
 * lighter will fire again — a held button never re-triggers by itself, not
 * even after a reset.
 *
 * ── FOR A NOVICE — this file is a STATE MACHINE, on purpose ─────────────
 * Safety logic written as "if (button) fire" tangles together; the rules
 * above can conflict and the tangle hides which rule won. So instead the
 * lighter is always in ONE named state (IDLE / FIRING / WAIT_RELEASE), and
 * each tick asks: "in THIS state, with THESE inputs, what happens?" The
 * switch below is that question, once. Every `stop()` records WHY (the
 * blink code), and WAIT_RELEASE enforces the release-before-refire rule in
 * one place instead of five.
 */
#include "lighter.h"     /* the tunables, the state enum, the API shapes */

/* the blink pattern's shape, in ms. The LED "language": N flashes, a
 * pause, the whole thing repeated BLINK_REPEATS times. */
#define BLINK_ON_MS 200u
#define BLINK_OFF_MS 250u
#define BLINK_PAUSE_MS 800u
#define BLINK_REPEATS 2u

/* start showing a blink code: remember which one, restart its clock */
static void show(lighter_t *l, uint8_t code) {
  l->code = code;        /* which code (1..4)… */
  l->blink_ms = 0;       /* …from the top of its pattern */
}

/* a SAFETY stop (not a plain release): enter WAIT_RELEASE, tell the user
 * why, and arm the cooldown if the reason was the 8 s timeout. */
static void stop(lighter_t *l, uint8_t code) {
  l->last_stop = code;                     /* for the tests / debugging */
  l->state = ST_WAIT_RELEASE;              /* the button must be let go first */
  if (code != CODE_NONE) show(l, code);    /* CODE_NONE = a release: no message */
  if (code == CODE_TIMEOUT) l->cooldown_ms = COOLDOWN_MS;   /* only the timeout earns the cooldown */
}

/* set a fresh state struct going (called once from main). *l = (lighter_t){0}
 * is C's "zero the whole struct" idiom — every counter starts at 0. */
void lighter_init(lighter_t *l, bool module_mode, bool button_held_at_boot) {
  *l = (lighter_t){0};
  l->module_mode = module_mode;                            /* MODULE=1: a sealed arc module, no coil monitor */
  l->pressed = button_held_at_boot;                        /* the raw press IS this press (no debounce history yet) */
  l->state = button_held_at_boot ? ST_WAIT_RELEASE : ST_IDLE;  /* held at boot (a reset while firing?): wait for a release */
}

/* LED pattern for the current code: `code` flashes, a pause, repeated twice.
 * Returns "LED on right now?" — main.c applies it to the pin every tick.
 * The maths slices one repeating timeline [flash × code | pause] and asks
 * where blink_ms falls inside it. */
static bool blink_led(lighter_t *l) {
  if (l->code == CODE_NONE) return false;                     /* nothing to say */
  uint16_t flash = BLINK_ON_MS + BLINK_OFF_MS;                /* one flash slot: 200 on + 250 off */
  uint16_t one = (uint16_t)(l->code * flash + BLINK_PAUSE_MS);/* one full cycle: code slots + the pause */
  if (l->blink_ms >= one * BLINK_REPEATS) { l->code = CODE_NONE; return false; }  /* both repeats played out: message over */
  uint16_t t = l->blink_ms % one;                             /* where in THIS cycle are we? */
  l->blink_ms += TICK_MS;                                     /* the clock advances one tick */
  if (t >= l->code * flash) return false;                     /* inside the trailing pause: LED off */
  return (t % flash) < BLINK_ON_MS;                           /* inside a flash slot: on for the first 200 ms of it */
}

/* ── the tick: the whole lighter brain, once ─────────────────────────── */
void lighter_tick(lighter_t *l, const lighter_in_t *in, lighter_out_t *out) {
  /* debounce: the raw level must disagree for DEBOUNCE_TICKS ticks in a row.
   * Each tick the raw button either agrees with the debounced opinion or
   * earns one more "strike"; 3 strikes in a row = the opinion flips. */
  if (in->button != l->pressed) {
    if (++l->bounce >= DEBOUNCE_TICKS) { l->pressed = in->button; l->bounce = 0; }
  } else l->bounce = 0;                        /* agreeing again: strikes reset */

  /* the cooldown just melts: a countdown in ticks, floor at 0 */
  if (l->cooldown_ms) l->cooldown_ms = l->cooldown_ms > TICK_MS ? (uint16_t)(l->cooldown_ms - TICK_MS) : 0;

  switch (l->state) {                          /* "in THIS state, with THESE inputs:" */
    case ST_IDLE:                              /* asleep; only a press can start anything */
      if (l->pressed) {
        if (in->usb) stop(l, CODE_USB);        /* rule 2 first: never fire while charging */
        else if (l->cooldown_ms) { l->state = ST_WAIT_RELEASE; show(l, CODE_TIMEOUT); } /* remind; don't restart the cooldown */
        else if (in->vbat_mv < VBAT_REST_MIN_MV) stop(l, CODE_LOW_BATTERY);  /* rule 4, checked at rest before we even start */
        else {
          l->state = ST_FIRING;               /* all clear: light it */
          l->fire_ms = l->window_ms = l->window_pulses = l->low_ms = 0;  /* zero the watches */
          l->code = CODE_NONE;                /* no message pending */
        }
      }
      break;

    case ST_FIRING:                            /* the arc is on: watch everything, in order */
      l->fire_ms += TICK_MS;                   /* time under arc */
      if (!l->pressed) { l->last_stop = CODE_NONE; l->state = ST_IDLE; break; }  /* rule 1: release — back to sleep, no code */
      if (in->usb) { stop(l, CODE_USB); break; }  /* rule 2 */
      if (!l->module_mode && l->fire_ms > OSC_SETTLE_MS) {  /* rule 3, after the settle grace period */
        l->window_pulses = (uint16_t)(l->window_pulses + in->pulses);  /* accumulate this tick's pulses into the window */
        l->window_ms += TICK_MS;
        if (l->window_ms >= OSC_WINDOW_MS) {   /* window closed: judge it */
          if (l->window_pulses < OSC_MIN_PULSES) { stop(l, CODE_COIL_FAULT); break; }  /* too slow or silent: the coil is not oscillating */
          l->window_ms = l->window_pulses = 0;  /* window passed: open the next */
        }
      }
      if (in->vbat_mv < VBAT_LOAD_MIN_MV) {    /* rule 4, under load */
        l->low_ms += TICK_MS;                  /* accumulate the sag time… */
        if (l->low_ms >= VBAT_LOAD_MS) { stop(l, CODE_LOW_BATTERY); break; }  /* …200 ms of sag = tired cell */
      } else l->low_ms = 0;                    /* recovered: the accumulator resets */
      if (l->fire_ms >= FIRE_MAX_MS) { stop(l, CODE_TIMEOUT); break; }  /* rule 5: the heat budget */
      break;

    case ST_WAIT_RELEASE:                      /* a safety stop: the button must go first */
      if (!l->pressed) l->state = ST_IDLE;     /* released: back to the start */
      break;
  }

  /* the outputs, derived from where the machine ended up: */
  out->fire = l->state == ST_FIRING;           /* the arc follows the state */
  out->led = blink_led(l);                     /* the LED follows the blink clock */
  out->may_sleep = l->state == ST_IDLE && !l->pressed && l->code == CODE_NONE && l->cooldown_ms == 0 && l->bounce == 0;
  /* may_sleep asks: nothing to do AND nothing in flight — no message still
   * blinking, no countdown running, no half-debounced press. If everything
   * is quiet, main.c may power the chip down until the button wakes it. */
}
