/*
 * lighter.h — the arc lighter's safety logic, with no hardware in it.
 *
 * main.c samples the inputs every 10 ms (one "tick"), calls lighter_tick(),
 * and applies the outputs. Keeping the decisions here, in plain C, means the
 * exact code that runs on the ATtiny85 is also compiled and unit-tested on a
 * PC (firmware/test/test_lighter.c).
 *
 * ── FOR A NOVICE — how to read this file ────────────────────────────────
 * This is the CONTRACT for the lighter's brain, in three parts:
 *   1. TUNABLES  — #define numbers: timings and safety thresholds. Change
 *                  behaviour HERE, never by editing the logic.
 *   2. VOCABULARY — enums: the blink codes, the state machine's states.
 *   3. THE API    — three structs (in / out / the private state) and the
 *                  two functions main.c is allowed to call.
 * Nothing here mentions a pin or a register: same file compiles into the
 * chip (via the Makefile, avr-gcc) and into the PC tests (via run.sh,
 * plain cc) — that dual use is why the header stays hardware-free.
 */
#ifndef LIGHTER_H       /* include guard (see any header for the idea) */
#define LIGHTER_H

#include <stdbool.h>    /* bool, true, false */
#include <stdint.h>     /* uint8_t/uint16_t: fixed-width integers (0..255 /
                          0..65535) — exact sizes matter on an 8-bit CPU */

/* ── 1. tunables ──────────────────────────────────────────────────────────
 * TICK_MS: the whole design runs on a 10 ms drumbeat. Timer1 interrupts at
 * 100 Hz; every wake main.c gathers inputs and calls lighter_tick() once. */
#define TICK_MS 10u

/* thresholds (see README "Firmware"). The u suffix keeps them unsigned. */
#define DEBOUNCE_TICKS 3u          /* 30 ms of a steady button before it counts — a physical contact "bounces" (sparks briefly open/closed) for a few ms on press; demanding 3 agreeing ticks filters it in TIME instead of hardware */
#define FIRE_MAX_MS 8000u          /* longest continuous arc — the heat budget of the coil and the politeness of a hand-held spark */
#define COOLDOWN_MS 5000u          /* after hitting the 8 s limit — let the coil and the cell cool before allowing another arc */
#define OSC_SETTLE_MS 20u          /* let the oscillator start before judging it — a cold oscillator takes a few ms to reach amplitude; judging at t=0 would cry fault on every start */
#define OSC_WINDOW_MS 20u          /* count coil pulses over this window … */
#define OSC_MIN_PULSES 40u         /* … and demand ≥ 40 of them (2 kHz). A stalled driver gives 0;
                                      the slowest simulated coil gives 7.5 kHz of countable pulses */
#define VBAT_REST_MIN_MV 3400u     /* refuse to start below this (cell at rest) — a rested lithium cell below 3.4 V is nearly empty; firing from there means instant deep-discharge */
#define VBAT_LOAD_MIN_MV 3000u     /* stop if the cell sags below this while firing … — under the arc's load a healthy cell stays above ~3.4 V; below 3.0 V it is struggling */
#define VBAT_LOAD_MS 200u          /* … for this long — one 100 ms sag is normal (the driver's inrush); 200 ms of sag is a tired cell */

/* blink codes on the status LED (number of flashes).
 * An enum of constants: the LED is the lighter's only display, so these
 * numbers ARE its language — 1..4 flashes, then a pause, twice. */
enum { CODE_NONE = 0, CODE_TIMEOUT = 1, CODE_USB = 2, CODE_LOW_BATTERY = 3, CODE_COIL_FAULT = 4 };

/* the state machine's states. Every tick, lighter_tick() is in exactly one:
 * IDLE (asleep until the button), FIRING (arc on, watching every rule),
 * WAIT_RELEASE (a safety stop happened: the button must be let go first,
 * so a held button can never re-trigger the arc). */
typedef enum { ST_IDLE, ST_FIRING, ST_WAIT_RELEASE } lighter_state_t;

/* 2a. inputs — the world, sampled by main.c once per tick: */
typedef struct {
  bool button;        /* FIRE pressed (raw, not debounced) */
  bool usb;           /* USB power present */
  uint16_t vbat_mv;   /* cell voltage, measured this tick */
  uint16_t pulses;    /* coil pulses counted during this tick */
} lighter_in_t;

/* 2b. outputs — what main.c should make real after the tick: */
typedef struct {
  bool fire;          /* true = power the arc driver */
  bool led;           /* status LED */
  bool may_sleep;     /* nothing to do until the button changes */
} lighter_out_t;

/* 3. the private state — one struct, owned by main.c, opaque to it.
 * `volatile` in main.c's instance (see there): the tick ISR vs the main
 * loop could race; here it is just a plain struct declaration. */
typedef struct {
  lighter_state_t state;     /* which state the machine is in */
  bool module_mode;          /* a complete arc module is fitted: no coil monitor */
  bool pressed;              /* debounced button */
  uint8_t bounce;            /* ticks the raw button has disagreed with `pressed` */
  uint16_t fire_ms;          /* time in ST_FIRING */
  uint16_t window_ms, window_pulses;   /* the rolling oscillator-check window */
  uint16_t low_ms;           /* time the cell has been below VBAT_LOAD_MIN_MV */
  uint16_t cooldown_ms;      /* remaining cooldown after a timeout */
  uint8_t code;              /* blink code being shown */
  uint16_t blink_ms;         /* position in the blink pattern */
  uint8_t last_stop;         /* why the last arc stopped (for tests / debugging) */
} lighter_t;

/* the API — two functions, nothing else touches the struct from outside: */
/* set a fresh struct going (call once); records whether the button was
 * already held at boot (then it waits for a release first — safety). */
void lighter_init(lighter_t *l, bool module_mode, bool button_held_at_boot);
/* one drumbeat: read `in`, update the machine, fill `out`. main.c calls
 * this every 10 ms; the PC tests call it with scripted `in`s. */
void lighter_tick(lighter_t *l, const lighter_in_t *in, lighter_out_t *out);

#endif /* LIGHTER_H */
