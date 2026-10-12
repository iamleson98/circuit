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
 */
#include "lighter.h"

#define BLINK_ON_MS 200u
#define BLINK_OFF_MS 250u
#define BLINK_PAUSE_MS 800u
#define BLINK_REPEATS 2u

static void show(lighter_t *l, uint8_t code) {
  l->code = code;
  l->blink_ms = 0;
}

static void stop(lighter_t *l, uint8_t code) {
  l->last_stop = code;
  l->state = ST_WAIT_RELEASE;
  if (code != CODE_NONE) show(l, code);
  if (code == CODE_TIMEOUT) l->cooldown_ms = COOLDOWN_MS;
}

void lighter_init(lighter_t *l, bool module_mode, bool button_held_at_boot) {
  *l = (lighter_t){0};
  l->module_mode = module_mode;
  l->pressed = button_held_at_boot;
  l->state = button_held_at_boot ? ST_WAIT_RELEASE : ST_IDLE;
}

/* LED pattern for the current code: `code` flashes, a pause, repeated twice */
static bool blink_led(lighter_t *l) {
  if (l->code == CODE_NONE) return false;
  uint16_t flash = BLINK_ON_MS + BLINK_OFF_MS;
  uint16_t one = (uint16_t)(l->code * flash + BLINK_PAUSE_MS);
  if (l->blink_ms >= one * BLINK_REPEATS) { l->code = CODE_NONE; return false; }
  uint16_t t = l->blink_ms % one;
  l->blink_ms += TICK_MS;
  if (t >= l->code * flash) return false;
  return (t % flash) < BLINK_ON_MS;
}

void lighter_tick(lighter_t *l, const lighter_in_t *in, lighter_out_t *out) {
  /* debounce: the raw level must disagree for DEBOUNCE_TICKS ticks in a row */
  if (in->button != l->pressed) {
    if (++l->bounce >= DEBOUNCE_TICKS) { l->pressed = in->button; l->bounce = 0; }
  } else l->bounce = 0;

  if (l->cooldown_ms) l->cooldown_ms = l->cooldown_ms > TICK_MS ? (uint16_t)(l->cooldown_ms - TICK_MS) : 0;

  switch (l->state) {
    case ST_IDLE:
      if (l->pressed) {
        if (in->usb) stop(l, CODE_USB);
        else if (l->cooldown_ms) { l->state = ST_WAIT_RELEASE; show(l, CODE_TIMEOUT); } /* remind; don't restart the cooldown */
        else if (in->vbat_mv < VBAT_REST_MIN_MV) stop(l, CODE_LOW_BATTERY);
        else {
          l->state = ST_FIRING;
          l->fire_ms = l->window_ms = l->window_pulses = l->low_ms = 0;
          l->code = CODE_NONE;
        }
      }
      break;

    case ST_FIRING:
      l->fire_ms += TICK_MS;
      if (!l->pressed) { l->last_stop = CODE_NONE; l->state = ST_IDLE; break; }
      if (in->usb) { stop(l, CODE_USB); break; }
      if (!l->module_mode && l->fire_ms > OSC_SETTLE_MS) {
        l->window_pulses = (uint16_t)(l->window_pulses + in->pulses);
        l->window_ms += TICK_MS;
        if (l->window_ms >= OSC_WINDOW_MS) {
          if (l->window_pulses < OSC_MIN_PULSES) { stop(l, CODE_COIL_FAULT); break; }
          l->window_ms = l->window_pulses = 0;
        }
      }
      if (in->vbat_mv < VBAT_LOAD_MIN_MV) {
        l->low_ms += TICK_MS;
        if (l->low_ms >= VBAT_LOAD_MS) { stop(l, CODE_LOW_BATTERY); break; }
      } else l->low_ms = 0;
      if (l->fire_ms >= FIRE_MAX_MS) { stop(l, CODE_TIMEOUT); break; }
      break;

    case ST_WAIT_RELEASE:
      if (!l->pressed) l->state = ST_IDLE;
      break;
  }

  out->fire = l->state == ST_FIRING;
  out->led = blink_led(l);
  out->may_sleep = l->state == ST_IDLE && !l->pressed && l->code == CODE_NONE && l->cooldown_ms == 0 && l->bounce == 0;
}
