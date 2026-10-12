/*
 * lighter.h — the arc lighter's safety logic, with no hardware in it.
 *
 * main.c samples the inputs every 10 ms (one "tick"), calls lighter_tick(),
 * and applies the outputs. Keeping the decisions here, in plain C, means the
 * exact code that runs on the ATtiny85 is also compiled and unit-tested on a
 * PC (firmware/test/test_lighter.c).
 */
#ifndef LIGHTER_H
#define LIGHTER_H

#include <stdbool.h>
#include <stdint.h>

#define TICK_MS 10u

/* thresholds (see README "Firmware") */
#define DEBOUNCE_TICKS 3u          /* 30 ms of a steady button before it counts */
#define FIRE_MAX_MS 8000u          /* longest continuous arc */
#define COOLDOWN_MS 5000u          /* after hitting the 8 s limit */
#define OSC_SETTLE_MS 20u          /* let the oscillator start before judging it */
#define OSC_WINDOW_MS 20u          /* count coil pulses over this window … */
#define OSC_MIN_PULSES 40u         /* … and demand ≥ 40 of them (2 kHz). A stalled driver gives 0;
                                      the slowest simulated coil gives 7.5 kHz of countable pulses */
#define VBAT_REST_MIN_MV 3400u     /* refuse to start below this (cell at rest) */
#define VBAT_LOAD_MIN_MV 3000u     /* stop if the cell sags below this while firing … */
#define VBAT_LOAD_MS 200u          /* … for this long */

/* blink codes on the status LED (number of flashes) */
enum { CODE_NONE = 0, CODE_TIMEOUT = 1, CODE_USB = 2, CODE_LOW_BATTERY = 3, CODE_COIL_FAULT = 4 };

typedef enum { ST_IDLE, ST_FIRING, ST_WAIT_RELEASE } lighter_state_t;

typedef struct {
  bool button;        /* FIRE pressed (raw, not debounced) */
  bool usb;           /* USB power present */
  uint16_t vbat_mv;   /* cell voltage, measured this tick */
  uint16_t pulses;    /* coil pulses counted during this tick */
} lighter_in_t;

typedef struct {
  bool fire;          /* true = power the arc driver */
  bool led;           /* status LED */
  bool may_sleep;     /* nothing to do until the button changes */
} lighter_out_t;

typedef struct {
  lighter_state_t state;
  bool module_mode;           /* a complete arc module is fitted: no coil monitor */
  bool pressed;               /* debounced button */
  uint8_t bounce;             /* ticks the raw button has disagreed with `pressed` */
  uint16_t fire_ms;           /* time in ST_FIRING */
  uint16_t window_ms, window_pulses;
  uint16_t low_ms;            /* time the cell has been below VBAT_LOAD_MIN_MV */
  uint16_t cooldown_ms;       /* remaining cooldown after a timeout */
  uint8_t code;               /* blink code being shown */
  uint16_t blink_ms;          /* position in the blink pattern */
  uint8_t last_stop;          /* why the last arc stopped (for tests / debugging) */
} lighter_t;

void lighter_init(lighter_t *l, bool module_mode, bool button_held_at_boot);
void lighter_tick(lighter_t *l, const lighter_in_t *in, lighter_out_t *out);

#endif
