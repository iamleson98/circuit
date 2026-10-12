/*
 * main.c — tri-color lamp firmware for the ATtiny85 (avr-gcc / avr-libc).
 *
 * Pins (controller/index.tsx):
 *   PB3  SENSE (ADC3): the 12 V, scaled down by R2/R3 (12 V → ≈ 2.9 V)
 *   PB2  MODE jumper (ADC1): LO = MEMORY, open = STEP, HI = RESET
 *   PB0  BLUE channel gate
 *   PB1  WHITE channel gate
 *   PB4  YELLOW channel gate
 *
 * HOW IT NOTICES THE SWITCH
 * A power supply that has just been switched off doesn't drop to 0 V at
 * once: it holds 12 V for a moment, then sags. So while the lamp is on the
 * chip measures the 12 V about once a millisecond and calls it "switched
 * off" as soon as it has fallen 1/8 below normal (lamp.h has the rules).
 *
 * While the lamp is off the chip keeps running from C5. It sleeps, waking
 * every 32 ms on its watchdog timer to measure the 12 V and count the time.
 * If C5 runs flat first, the chip browns out and the next power-up is a
 * "cold boot" = a long off.
 *
 * Clock: factory 1 MHz. Fuses: lfuse 0x62 (factory), hfuse 0xD5 (brown-out
 * 2.7 V, EEPROM kept when re-flashing), efuse 0xFF.
 *
 * ── FOR A NOVICE: what library is this? ────────────────────────────────
 * There is NO operating system and NO Arduino here — this is "bare metal"
 * programming. The only library is avr-libc: the standard C library for
 * AVR chips, plus one header per piece of chip hardware. avr-libc's trick
 * is that each chip register (see below) is EXPOSED AS A GLOBAL VARIABLE:
 * "PORTB" really is a variable wired to hardware, so `PORTB = 0;` is a
 * store instruction that instantly drives real pins. The chip's datasheet
 * is effectively the API reference: every register below (PORTB, ADMUX,
 * ADCSRA, WDTCR …) has a chapter there.
 *
 * The file has two kinds of code, kept strictly apart:
 *   - everything chip-specific (registers, delays, sleep) lives HERE;
 *   - every decision (which colour, glitch or flip, journal) lives in
 *     lamp.c/lamp.h, which never mentions hardware — so the same lamp.c
 *     is unit-tested on a PC (firmware/test/) and only this file differs.
 *
 * Vocabulary you will meet (details at each use below):
 *   register   a byte-sized memory cell inside the chip wired to hardware;
 *              writing it changes pins, reading it reads pins or results
 *   bit        one of the 8 switches inside a register, numbered 0..7,
 *              each usually named (PB0, ADEN, …) with a documented meaning
 *   _BV(n)     "bit value" = (1 << n): a 1 in bit n, 0s elsewhere — the
 *              mask you OR-in to set a bit or AND-out to clear one
 *   ISR        Interrupt Service Routine: a function the chip jumps to
 *              the instant a hardware event fires (a "vector")
 *   sei()/cli()  globally enable/disable interrupts (Set/Clear the I-bit)
 */

/* ── the avr-libc headers, one per piece of the chip ─────────────────── */
#include <avr/eeprom.h>      /* eeprom_read_byte() / eeprom_update_byte():
                                the non-volatile "notebook" API. update_*
                                skips the write if the byte already holds
                                that value (writes are what wear it out) */
#include <avr/interrupt.h>   /* sei(), cli(), the ISR() and EMPTY_INTERRUPT()
                                macros that define interrupt handlers */
#include <avr/io.h>          /* THE big one: every register name (PORTB,
                                ADMUX, WDTCR …) and bit name (PB0, ADEN …)
                                for THIS chip, straight from the datasheet.
                                The Makefile's -mmcu=attiny85 picks which
                                chip's version you get */
#include <avr/sleep.h>       /* sleep_enable/disable/cpu(), set_sleep_mode():
                                the power-saving "stop the CPU" machinery */
#include <avr/wdt.h>         /* wdt_reset(), wdt_disable(): the watchdog
                                timer — an independent little clock that can
                                also wake the chip (that's how we use it) */
#include <util/delay.h>      /* _delay_ms(): calibrated busy-wait; needs
                                F_CPU (the Makefile passes -DF_CPU=1 MHz) */
#include <util/delay_basic.h> /* _delay_loop_1(n): the rawest delay —
                                exactly 3 CPU cycles per count, no setup.
                                Used for the fast bit-bangs inside PWM */

#include "lamp.h"            /* our decision layer (colours, rules, journal) */

/* LED_PINS: a mask with 1s in the three gate bits — PB0, PB1, PB4.
 * _BV(PB0) = (1<<0) = 0b00000001, _BV(PB1) = 0b00000010, _BV(PB4) =
 * 0b00010000; OR-ed together: 0b00010011. One write to PORTB can now
 * command all three gates at once. */
#define LED_PINS (_BV(PB0) | _BV(PB1) | _BV(PB4))

/* led_pin[c] = the single-bit mask for colour c (blue, white, yellow),
 * indexed 0..2 exactly like COLOR_BLUE/WHITE/YELLOW in lamp.h. */
static const uint8_t led_pin[NCOLORS] = { _BV(PB0), _BV(PB1), _BV(PB4) }; /* blue, white, yellow */

/* Timing numbers for this file:
 *  32u = the watchdog tick we program below (≈ 32 ms per wake-up) */
#define WDT_TICK_MS 32u
/*  the stopwatch gives up counting after a minute: by then the verdict
 *  ("long off") can no longer change, and 32-bit ms would wrap at ~49 days */
#define OFF_CAP_MS 60000u
#define SAVE_MIN_MV 3500u   /* only write the EEPROM with a healthy VCC */
#define FADE_STEPS 30u      /* the fade is 30 PWM steps ≈ 0.3 s (see fade_in) */

/* The handler for the watchdog interrupt. EMPTY_INTERRUPT builds a function
 * that does nothing — on purpose: waking sleep_cpu() is ALL we need. When
 * the timer fires, the CPU resumes right after the sleep_cpu() line below;
 * nothing else needs to happen, so the body is empty. (The chip cannot
 * sleep through an interrupt that has no handler at all.) */
EMPTY_INTERRUPT(WDT_vect); /* the watchdog only wakes the chip up */

/* ── EEPROM journal glue ──────────────────────────────────────────────── */
/* lamp.c's journal talks to memory only through the two-function "toolbox"
 * (store_t in lamp.h). Here we build that toolbox out of avr-libc:
 * the functions below adapt avr-libc's pointer-based API to the journal's
 * plain-integer addresses. */

/* read the byte at address a (a plain number) from the EEPROM */
static uint8_t ee_read(uint16_t a) { return eeprom_read_byte((const uint8_t *)(uintptr_t)a); }
/* write v at address a — "update" writes only if different (saves wear) */
static void ee_write(uint16_t a, uint8_t v) { eeprom_update_byte((uint8_t *)(uintptr_t)a, v); }
/* the toolbox itself: a struct of two function pointers, handed to the
 * journal code. From here on, lamp.c never knows what memory it is using. */
static const store_t store = { ee_read, ee_write };

/* ── measuring with the ADC (against VCC) ─────────────────────────────── */
/* The ADC (Analog-to-Digital Converter) is the chip's voltmeter: it turns
 * a pin voltage into a number 0..1023, measured AGAINST the chip's own
 * supply voltage VCC (that choice is made in ADMUX below: REFS bits = 00).
 * Measuring against VCC is clever for this lamp: if VCC droops a little
 * while C5 drains, both the reading AND its yardstick shrink together, so
 * ratios stay honest. */

/* One ADC conversion of whatever input `admux` selects.
 * `static` = private to this file (the linker won't export it, and the
 * compiler can warn if nothing uses it). */
static uint16_t adc_read(uint8_t admux) {
  ADMUX = admux;                              /* choose the input (and keep VCC as reference) */
  ADCSRA = _BV(ADEN) | _BV(ADPS1);           /* 1 MHz / 4 = 250 kHz ADC clock — power the ADC on (ADEN) and set its speed; the datasheet wants 50–200 kHz for full 10-bit accuracy, and 250 kHz is close enough for our 8-bit decisions */
  ADCSRA |= _BV(ADSC);                       /* ADSC = "start conversion": write 1 to begin */
  while (ADCSRA & _BV(ADSC)) {}              /* ADSC reads 1 while busy: spin until it clears (a few hundred µs) */
  uint16_t v = ADC;                          /* the finished 10-bit result, 0..1023 */
  ADCSRA = 0;                                /* ADC off again: saves power */
  return v;
}
/* the 12 V as a fraction of VCC, 0..1023.
 * MUX1|MUX0 selects input ADC3 = pin PB3, where the divider R2/R3 has
 * scaled the 12 V down to below VCC so the meter can read it. */
static uint16_t supply(void) { return adc_read(_BV(MUX1) | _BV(MUX0)); }            /* ADC3 = PB3 */
/* the MODE jumper pin (ADC1 = PB2) → MEMORY / STEP / RESET (lamp.c decides) */
static lamp_mode_t read_mode(void) { return lamp_mode_from_adc(adc_read(_BV(MUX0))); } /* ADC1 = PB2 */

/* VCC in mV, from measuring the 1.1 V bandgap against it.
 * Clever trick: normally you measure an unknown pin voltage against the
 * known VCC. Swap it — measure the KNOWN 1.1 V internal reference against
 * VCC — and the same arithmetic hands you VCC itself:
 *   VCC = 1.1 V × 1024 / reading. We only need it to judge "is the chip's
 * own supply healthy enough to risk an EEPROM write?" (SAVE_MIN_MV). */
static uint16_t vcc_mv(void) {
  adc_read(_BV(MUX3) | _BV(MUX2));           /* first reading after switching: discard — the ADC needs one dummy conversion to settle on a new input */
  _delay_ms(1);                              /* …and let the bandgap voltage stabilise */
  uint16_t a = adc_read(_BV(MUX3) | _BV(MUX2));  /* the real reading (MUX3|MUX2 = the 1.1 V bandgap input) */
  return a ? (uint16_t)(1100UL * 1024UL / a) : 0;  /* 1100 mV × 1024 / reading; UL keeps the maths 32-bit; 0 reading = something wrong, report 0 */
}

/* ── the three LED channels ───────────────────────────────────────────── */
/* The gates (MOSFETs that switch each colour's LED strings) are wired so
 * pin HIGH = gate off, LOW = gate on (see the schematic's driver stage).
 * A register READ of PORTB returns the last written OUTPUT LATCH, so we
 * can inspect our own commands without touching PINB (the live pin state). */

/* all three gates off at once: AND with the INVERTED mask clears just
 * those three bits, leaving the rest of PORTB untouched */
static void leds_off(void) { PORTB &= (uint8_t)~LED_PINS; }
/* exactly one colour on: clear all three first, then set the wanted bit */
static void led_on(uint8_t color) { leds_off(); PORTB |= led_pin[color]; }
/* is any colour being driven right now? (mask AND PORTB ≠ 0 → something) */
static bool lit(void) { return (PORTB & LED_PINS) != 0; }

/* software PWM: one ≈ 0.8 ms period, on for level/255 of it
   (_delay_loop_1(n) waits 3n clock cycles = 3n µs at 1 MHz)
 * PWM (Pulse-Width Modulation) = "blink it very fast, vary the ON
 * fraction". 255 levels of ON-time → the eye sees 255 brightnesses.
 * One period here: pin ON for `level`×3 µs, then OFF for the rest.
 * The chip has hardware PWM, but its Timer1 output has a silicon quirk
 * on PB4 — and this loop treats all three pins identically anyway. */
static void pwm_period(uint8_t pin, uint8_t level) {
  if (level) { PORTB |= pin; _delay_loop_1(level); }       /* ON part: skip entirely at level 0 (a 0-length pulse would still glitch) */
  PORTB &= (uint8_t)~pin;                                  /* pin OFF */
  if (level != 255) _delay_loop_1((uint8_t)(255 - level)); /* OFF part: skip at 255 (don't wrap to 256) */
}

/* fade a colour in over ≈ 0.3 s: 30 steps of ≈ 10 ms, brightness rising as
   the square (which the eye sees as an even rise). It starts from zero and
   checks the 12 V after every step, so a supply that only looked "back"
   gives up long before you could see anything. Returns the steps done
   (FADE_STEPS = fully lit).
 * Why step² ? At low brightness the eye notices tiny changes, at high
 * brightness it barely notices big ones; a square curve compensates, so
 * the fade FEELS even. 12 periods × (255+255)×3µs ≈ 10 ms per step. */
static uint8_t fade_in(uint8_t color, uint16_t on_level) {
  leds_off();                                             /* start dark, whatever was on before */
  for (uint8_t step = 1; step <= FADE_STEPS; step++) {    /* 30 steps, brighter each time */
    uint8_t level = (uint8_t)(((uint32_t)step * step * 255u) / ((uint32_t)FADE_STEPS * FADE_STEPS));  /* step² scaled to 0..255; 32-bit maths so nothing overflows */
    for (uint8_t p = 0; p < 12; p++) pwm_period(led_pin[color], level); /* ≈ 10 ms — one visible instant of this brightness */
    /* (the mutation test plants a bug on the next line — no comment there) */
    if (lamp_supply_dropped(supply(), on_level)) return step;
  }
  led_on(color);                                          /* fully lit: pin simply stays ON from now */
  return FADE_STEPS;                                      /* "the fade completed" */
}

/* Remember the colour in the EEPROM journal — but only if it actually
 * changed AND the chip's own supply (VCC) is healthy (a brown-out in the
 * middle of an EEPROM write is how bytes get corrupted). */
static void save_if_changed(uint8_t color, bool *have, uint8_t *saved, uint16_t *slot) {
  if (*have && *saved == color) return;                   /* nothing new to remember */
  if (vcc_mv() < SAVE_MIN_MV) return;                     /* too risky right now: skip (the colour is also re-saved on the next successful switch-on) */
  journal_save(&store, color, *have, slot);               /* write new record first, retire old ones second (lamp.c) */
  *have = true;                                           /* update the caller's bookkeeping… */
  *saved = color;                                         /* …so we don't rewrite the same colour */
}

/* ── watching the 12 V ────────────────────────────────────────────────── */
/* after a cold boot: wait until the 12 V is up and steady; returns its level.
 * Bounded by physics, not code: this loops until the world cooperates. */
static uint16_t wait_for_supply(void) {
  uint16_t before = 0;                    /* the previous reading, for steadiness */
  for (;;) {                              /* "for ever" — we return from inside */
    uint16_t now = supply();              /* fresh reading */
    if (now >= SUPPLY_MIN && lamp_supply_steady(now, before)) return now;  /* strong enough AND no longer climbing: that's a real supply */
    before = now;                         /* remember for the next comparison */
    _delay_ms(20);                        /* try again in 20 ms */
  }
}

/* average of 8 readings: what "on" looks like.
 * One ADC reading has ±2 counts of noise; eight averaged ≈ ±0.7 — and the
 * "switched off" trip line (1/8 below normal ≈ 84 counts) must not sit on
 * top of the noise. */
static uint16_t on_level_now(void) {
  uint16_t sum = 0;
  for (uint8_t i = 0; i < 8; i++) { sum += supply(); _delay_ms(1); }  /* eight samples, 1 ms apart — 8×1023 still fits a uint16_t */
  return sum / 8;
}

/* the 12 V must not sag for 50 ms (the lamp lit at full).
 * The LEDs draw their full current only once fully on; if a supply can't
 * hold 12 V under that load for 50 ms it wasn't a real switch-on. */
static bool held_for_50ms(uint16_t on_level) {
  for (uint8_t i = 0; i < 50; i++) {                            /* 50 × 1 ms */
    if (lamp_supply_dropped(supply(), on_level)) return false;  /* sagged: fail */
    _delay_ms(1);                                               /* next millisecond */
  }
  return true;                                                  /* held up: it counts */
}

/* lamp on: measure about once a millisecond until the 12 V sags (twice in a row).
 * "Twice in a row" = one noisy reading can never end the ON phase. */
static void stay_on(uint16_t on_level) {
  uint8_t low = 0;                                              /* consecutive low readings */
  while (low < 2) {
    low = lamp_supply_dropped(supply(), on_level) ? (uint8_t)(low + 1) : 0;  /* count up on low, reset to 0 on any good reading */
    _delay_ms(1);
  }
}

/* lamp off: sleep, waking every 32 ms to measure the 12 V and count the time.
   A colour that is still lit stays lit for now — its LEDs drain the dying
   supply, so it can't creep back up and fake a switch-on — and goes out
   once the 12 V is clearly gone. Returns how long the 12 V was off (ms).
 * This is the power-budget heart of the design: C5 (220 µF) alone runs the
 * chip while the lamp is off, so the chip spends ~99.9 % of each 32 ms
 * tick asleep at ≈ 4 µA, waking only to take one ADC reading. */
static uint32_t wait_while_off(uint16_t *on_level) {
  uint32_t off_ms = 0;                    /* the stopwatch (32-bit: up to ~49 days) */
  uint16_t window_start = 0;              /* first reading of a "is a new supply settling?" window */
  uint8_t steady = 0;                     /* how many ticks the new reading has held steady */
  wdt_reset();                            /* pat the watchdog before reconfiguring it (some fuse settings make it run at boot) */
  WDTCR = _BV(WDCE) | _BV(WDE);           /* timed sequence …  the watchdog registers are protected: changes are only accepted for 4 clock cycles after WDCE|WDE are both written together — a guard against a runaway program scrambling the timer by accident */
  WDTCR = _BV(WDIE) | _BV(WDP0);          /* … watchdog = 32 ms wake-up timer — WDIE (interrupt-enable) instead of WDE (reset): it INTERRUPTS (wakes us) rather than resetting the chip; WDP0 picks the ≈32 ms period */
  set_sleep_mode(SLEEP_MODE_PWR_DOWN);    /* the deepest sleep: CPU and most clocks stop, ≈ 4 µA */
  for (;;) {                              /* until the 12 V comes back (we break out) */
    sleep_enable();                       /* arm the sleep instruction (a safety latch: sleep_cpu() without this is a no-op) */
#if defined(BODS) && defined(BODSE)       /* compile-time #if: does this chip have BOD disable? (ATtiny85 does; the PC-test stand-ins don't — this is how one source file serves both targets) */
    sleep_bod_disable();                  /* brown-out detector off while asleep — the BOD burns ~20 µA watching VCC; it can't warn anyone while we're asleep anyway, so turn it off for this one sleep */
#endif
    sei();                                /* interrupts on — the wake-up interrupt must be allowed to fire */
    sleep_cpu();                          /* …and stop. The next line runs ~32 ms later, when the watchdog interrupt hits */
    sleep_disable();                      /* back awake: disarm the latch (so a stray sleep_cpu() elsewhere can't freeze us) */
    if (off_ms < OFF_CAP_MS) off_ms += WDT_TICK_MS;   /* one tick passed: add 32 ms, but stop counting at a minute (the verdict can't change anymore) */

    uint16_t now = supply();                                          /* one fresh reading of the 12 V */
    if (lit() && lamp_supply_dead(now, *on_level)) leds_off();        /* the old colour is still draining the supply (on purpose); once the supply is clearly DEAD, let it go out */
    if (lamp_supply_back(now, *on_level)) break;                      /* the 12 V is back (within 3/32 of normal): the OFF phase is over */
    /* someone plugged in a different, lower 12 V supply: accept it once it
       has held within 1/32 for half a second */
    if (now >= SUPPLY_MIN && steady && lamp_supply_steady(now, window_start)) {
      if (++steady >= 16) { *on_level = now; break; }  /* 16 ticks ≈ 0.5 s of a NEW, steady, lower level: adopt it as the new "normal" and treat this as switched on */
    } else {
      window_start = now;              /* start (or restart) the window with this reading */
      steady = now >= SUPPLY_MIN;      /* only counts as a candidate if it's at least a working supply */
    }
  }
  wdt_disable();                        /* wake-up service no longer needed: watchdog off (it costs current) */
  return off_ms;                        /* how long we were dark (capped at a minute) */
}

/* ── main(): the boot and the great ON/OFF loop ────────────────────────── */
int main(void) {
  /* The chip jumped here after reset (the reset vector points at the
   * startup code that sets up C, which then calls main). Order matters in
   * these first lines: make everything SAFE before making it live. */
  MCUSR = 0;                             /* clear the reset-cause flags (they say WHY we reset; nothing else reads them, so wipe them) */
  wdt_disable();                         /* if the watchdog caused that reset it is still running at the shortest period — kill it before anything else */
  PORTB = 0;                             /* all output latches LOW first… */
  DDRB = LED_PINS;                       /* …then make the three gate pins outputs (DDR = Data Direction Register: 1 = output, 0 = input). Gates driven LOW = LEDs off: the SAFE state comes alive in that order, so no pin ever flickers high during boot */
  DIDR0 = _BV(ADC3D) | _BV(ADC1D);       /* PB3, PB2 are analog-only: no digital input — their digital input buffers would just burn current on in-between voltages */
  sei();                                 /* interrupts globally enabled (the watchdog wake-up needs them later) */

  _delay_ms(30);                         /* C8 settles (R4‖R5 × C8 = 5 ms) — the MODE jumper's filter capacitor needs a few time-constants to charge before its voltage means anything */
  lamp_mode_t mode = read_mode();        /* ask the jumper how this lamp should behave (once: it's soldered) */
  uint8_t saved = COLOR_BLUE;            /* the colour remembered from last time (or blue if the notebook is empty) */
  uint16_t slot = 0;                     /* where that record lives in the EEPROM ring */
  bool have = journal_load(&store, &saved, &slot);   /* read the notebook: `have` = was there a record at all? */

  /* cold boot: the chip was unpowered, so the lamp was off for a long time */
  uint8_t color = lamp_next_color(mode, OFF_LONG, have, saved);  /* what colour after a long off? (the jumper decides) */
  bool long_off = true;                  /* this boot IS a long off, whatever comes later */
  uint32_t off_ms = 0;                   /* stopwatch starts at zero */
  uint16_t on_level = wait_for_supply(); /* block until the 12 V is properly up; remember what "on" looks like */

  for (;;) {                             /* ── the lamp's life, for ever ── */
    /* ON: show the colour. Once it is fully lit and the 12 V has held up
       under that load, the switch-on counts: remember the colour. */
    bool showing = lit() && (PORTB & led_pin[color]);   /* a glitch: it never went out — still showing the same colour from the previous cycle (skip the fade, it already happened) */
    uint8_t steps = showing ? FADE_STEPS : fade_in(color, on_level);  /* fade in (or pretend we did); steps = how far it got before any give-up */
    bool held = steps == FADE_STEPS && held_for_50ms(on_level);       /* fully lit AND the supply held under the load? */
    if (held) {
      on_level = on_level_now();         /* re-learn "normal" with the LEDs lit (their load pulls the supply down a little) */
      /* (the mutation test plants a bug on the next two lines — no comment there) */
      save_if_changed(color, &have, &saved, &slot);
      long_off = false;
      off_ms = 0;                        /* a switch-on resets the stopwatch */
      stay_on(on_level);                 /* …and babysit the 12 V every millisecond until it sags */
    }
    /* OFF: time it. A switch-on that didn't hold (a dying supply's last
       hiccup, a bouncing contact) just adds to the same off time. */
    off_ms += wait_while_off(&on_level) + (held ? 0 : steps * 10u + 50u);  /* time asleep + the fade time we spent (so a half-fade that gave up still counts into the same off period) */
    off_kind_t kind = long_off ? OFF_LONG : lamp_classify_off(off_ms, false);  /* verdict: glitch / quick / long (a boot is always long) */
    uint8_t next = lamp_next_color(mode, kind, have, saved);   /* ask the rules for the next colour */
    if (next != color) leds_off();       /* colour changing: dark until the next fade-in begins */
    color = next;                        /* …and around the loop we go: ON again with the new colour */
  }
}
