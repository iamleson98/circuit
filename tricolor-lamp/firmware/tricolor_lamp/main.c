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
 */
#include <avr/eeprom.h>
#include <avr/interrupt.h>
#include <avr/io.h>
#include <avr/sleep.h>
#include <avr/wdt.h>
#include <util/delay.h>
#include <util/delay_basic.h>

#include "lamp.h"

#define LED_PINS (_BV(PB0) | _BV(PB1) | _BV(PB4))
static const uint8_t led_pin[NCOLORS] = { _BV(PB0), _BV(PB1), _BV(PB4) }; /* blue, white, yellow */

#define WDT_TICK_MS 32u
#define OFF_CAP_MS 60000u
#define SAVE_MIN_MV 3500u   /* only write the EEPROM with a healthy VCC */
#define FADE_STEPS 30u

EMPTY_INTERRUPT(WDT_vect); /* the watchdog only wakes the chip up */

/* ── EEPROM journal glue ──────────────────────────────────────────────── */
static uint8_t ee_read(uint16_t a) { return eeprom_read_byte((const uint8_t *)(uintptr_t)a); }
static void ee_write(uint16_t a, uint8_t v) { eeprom_update_byte((uint8_t *)(uintptr_t)a, v); }
static const store_t store = { ee_read, ee_write };

/* ── measuring with the ADC (against VCC) ─────────────────────────────── */
static uint16_t adc_read(uint8_t admux) {
  ADMUX = admux;
  ADCSRA = _BV(ADEN) | _BV(ADPS1);           /* 1 MHz / 4 = 250 kHz ADC clock */
  ADCSRA |= _BV(ADSC);
  while (ADCSRA & _BV(ADSC)) {}
  uint16_t v = ADC;
  ADCSRA = 0;                                /* ADC off again: saves power */
  return v;
}
/* the 12 V as a fraction of VCC, 0..1023 */
static uint16_t supply(void) { return adc_read(_BV(MUX1) | _BV(MUX0)); }            /* ADC3 = PB3 */
static lamp_mode_t read_mode(void) { return lamp_mode_from_adc(adc_read(_BV(MUX0))); } /* ADC1 = PB2 */
/* VCC in mV, from measuring the 1.1 V bandgap against it */
static uint16_t vcc_mv(void) {
  adc_read(_BV(MUX3) | _BV(MUX2));           /* first reading after switching: discard */
  _delay_ms(1);
  uint16_t a = adc_read(_BV(MUX3) | _BV(MUX2));
  return a ? (uint16_t)(1100UL * 1024UL / a) : 0;
}

/* ── the three LED channels ───────────────────────────────────────────── */
static void leds_off(void) { PORTB &= (uint8_t)~LED_PINS; }
static void led_on(uint8_t color) { leds_off(); PORTB |= led_pin[color]; }
static bool lit(void) { return (PORTB & LED_PINS) != 0; }

/* software PWM: one ≈ 0.8 ms period, on for level/255 of it
   (_delay_loop_1(n) waits 3n clock cycles = 3n µs at 1 MHz) */
static void pwm_period(uint8_t pin, uint8_t level) {
  if (level) { PORTB |= pin; _delay_loop_1(level); }
  PORTB &= (uint8_t)~pin;
  if (level != 255) _delay_loop_1((uint8_t)(255 - level));
}

/* fade a colour in over ≈ 0.3 s: 30 steps of ≈ 10 ms, brightness rising as
   the square (which the eye sees as an even rise). It starts from zero and
   checks the 12 V after every step, so a supply that only looked "back"
   gives up long before you could see anything. Returns the steps done
   (FADE_STEPS = fully lit). */
static uint8_t fade_in(uint8_t color, uint16_t on_level) {
  leds_off();
  for (uint8_t step = 1; step <= FADE_STEPS; step++) {
    uint8_t level = (uint8_t)(((uint32_t)step * step * 255u) / ((uint32_t)FADE_STEPS * FADE_STEPS));
    for (uint8_t p = 0; p < 12; p++) pwm_period(led_pin[color], level); /* ≈ 10 ms */
    if (lamp_supply_dropped(supply(), on_level)) return step;
  }
  led_on(color);
  return FADE_STEPS;
}

static void save_if_changed(uint8_t color, bool *have, uint8_t *saved, uint16_t *slot) {
  if (*have && *saved == color) return;
  if (vcc_mv() < SAVE_MIN_MV) return;
  journal_save(&store, color, *have, slot);
  *have = true;
  *saved = color;
}

/* ── watching the 12 V ────────────────────────────────────────────────── */
/* after a cold boot: wait until the 12 V is up and steady; returns its level */
static uint16_t wait_for_supply(void) {
  uint16_t before = 0;
  for (;;) {
    uint16_t now = supply();
    if (now >= SUPPLY_MIN && lamp_supply_steady(now, before)) return now;
    before = now;
    _delay_ms(20);
  }
}

/* average of 8 readings: what "on" looks like */
static uint16_t on_level_now(void) {
  uint16_t sum = 0;
  for (uint8_t i = 0; i < 8; i++) { sum += supply(); _delay_ms(1); }
  return sum / 8;
}

/* the 12 V must not sag for 50 ms (the lamp lit at full) */
static bool held_for_50ms(uint16_t on_level) {
  for (uint8_t i = 0; i < 50; i++) {
    if (lamp_supply_dropped(supply(), on_level)) return false;
    _delay_ms(1);
  }
  return true;
}

/* lamp on: measure about once a millisecond until the 12 V sags (twice in a row) */
static void stay_on(uint16_t on_level) {
  uint8_t low = 0;
  while (low < 2) {
    low = lamp_supply_dropped(supply(), on_level) ? (uint8_t)(low + 1) : 0;
    _delay_ms(1);
  }
}

/* lamp off: sleep, waking every 32 ms to measure the 12 V and count the time.
   A colour that is still lit stays lit for now — its LEDs drain the dying
   supply, so it can't creep back up and fake a switch-on — and goes out
   once the 12 V is clearly gone. Returns how long the 12 V was off (ms). */
static uint32_t wait_while_off(uint16_t *on_level) {
  uint32_t off_ms = 0;
  uint16_t window_start = 0;
  uint8_t steady = 0;
  wdt_reset();
  WDTCR = _BV(WDCE) | _BV(WDE);              /* timed sequence … */
  WDTCR = _BV(WDIE) | _BV(WDP0);             /* … watchdog = 32 ms wake-up timer */
  set_sleep_mode(SLEEP_MODE_PWR_DOWN);
  for (;;) {
    sleep_enable();
#if defined(BODS) && defined(BODSE)
    sleep_bod_disable();                     /* brown-out detector off while asleep */
#endif
    sei();
    sleep_cpu();
    sleep_disable();
    if (off_ms < OFF_CAP_MS) off_ms += WDT_TICK_MS;

    uint16_t now = supply();
    if (lit() && lamp_supply_dead(now, *on_level)) leds_off();
    if (lamp_supply_back(now, *on_level)) break;
    /* someone plugged in a different, lower 12 V supply: accept it once it
       has held within 1/32 for half a second */
    if (now >= SUPPLY_MIN && steady && lamp_supply_steady(now, window_start)) {
      if (++steady >= 16) { *on_level = now; break; }
    } else {
      window_start = now;
      steady = now >= SUPPLY_MIN;
    }
  }
  wdt_disable();
  return off_ms;
}

int main(void) {
  MCUSR = 0;
  wdt_disable();
  PORTB = 0;
  DDRB = LED_PINS;                           /* gates driven LOW first: LEDs off */
  DIDR0 = _BV(ADC3D) | _BV(ADC1D);           /* PB3, PB2 are analog-only: no digital input */
  sei();

  _delay_ms(30);                             /* C8 settles (R4‖R5 × C8 = 5 ms) */
  lamp_mode_t mode = read_mode();
  uint8_t saved = COLOR_BLUE;
  uint16_t slot = 0;
  bool have = journal_load(&store, &saved, &slot);

  /* cold boot: the chip was unpowered, so the lamp was off for a long time */
  uint8_t color = lamp_next_color(mode, OFF_LONG, have, saved);
  bool long_off = true;
  uint32_t off_ms = 0;
  uint16_t on_level = wait_for_supply();

  for (;;) {
    /* ON: show the colour. Once it is fully lit and the 12 V has held up
       under that load, the switch-on counts: remember the colour. */
    bool showing = lit() && (PORTB & led_pin[color]);   /* a glitch: it never went out */
    uint8_t steps = showing ? FADE_STEPS : fade_in(color, on_level);
    bool held = steps == FADE_STEPS && held_for_50ms(on_level);
    if (held) {
      on_level = on_level_now();
      save_if_changed(color, &have, &saved, &slot);
      long_off = false;
      off_ms = 0;
      stay_on(on_level);
    }
    /* OFF: time it. A switch-on that didn't hold (a dying supply's last
       hiccup, a bouncing contact) just adds to the same off time. */
    off_ms += wait_while_off(&on_level) + (held ? 0 : steps * 10u + 50u);
    off_kind_t kind = long_off ? OFF_LONG : lamp_classify_off(off_ms, false);
    uint8_t next = lamp_next_color(mode, kind, have, saved);
    if (next != color) leds_off();
    color = next;
  }
}
