/*
 * main.c — arc lighter firmware for the ATtiny85 (avr-gcc / avr-libc).
 *
 * Pins (board/index.tsx §3):
 *   PB3  FIRE button to GND (internal pull-up), pin-change wake-up
 *   PB4  Q1 gate: LOW = arc power on. R6 pulls it HIGH (off) in reset.
 *   PB2  T0 counter input: coil pulses from Q2's collector (R12/R13)
 *   PB0  VBUS sense (R7/R8): HIGH = USB plugged in
 *   PB1  status LED (also MISO when programming)
 * The cell voltage is read through the ADC's internal 1.1 V reference.
 *
 * Clock: the factory 1 MHz (internal 8 MHz ÷ 8). Fuses: lfuse 0x62 (factory),
 * hfuse 0xDD (brown-out reset at 2.7 V), efuse 0xFF.
 * Build with MODULE=1 when a complete arc module is wired to MOD+/MOD−
 * (it has no collector for the monitor to watch).
 *
 * ── FOR A NOVICE — the shape of this firmware ───────────────────────────
 * Two files, two jobs (the same split as the lamp):
 *   lighter.c = every SAFETY DECISION, in plain C, tested on the PC.
 *   this file = the chip's HANDS: it wires real pins and timers to the
 *               decisions. If a rule is ever wrong, that is lighter.c's
 *               fault and the tests catch it. If the chip doesn't do what
 *               lighter.c decided, that is HERE, and only here.
 *
 * The heartbeat: Timer1 interrupts at 100 Hz — every 10 ms ("tick"),
 * main() wakes, samples the four inputs, hands them to lighter_tick(),
 * and applies the three outputs. Between ticks the loop spins on tick_flag
 * (or sleeps entirely if lighter.c says "nothing to do for a long while").
 *
 * The clever input is PB2: the chip's Timer0 is wired as a HARDWARE pulse
 * counter on that pin — every rising edge from the coil's feedback ticks
 * the 8-bit counter by itself, even while the CPU is busy. Firmware just
 * reads the accumulated count: the coil is being listened to at 2-50 kHz
 * with zero CPU load. Software could never sample that fast at 1 MHz.
 */
#include <avr/interrupt.h>   /* sei()/cli(), ISR(): the interrupt machinery */
#include <avr/io.h>          /* every register and bit name for the ATtiny85 */
#include <avr/sleep.h>       /* power-down sleep until the button wakes us */
#include <util/delay.h>      /* _delay_us/_delay_ms: calibrated busy-waits */

#include "lighter.h"         /* the safety brain's contract */

/* MODULE: a complete arc module (MOD+/MOD−) has no collector to watch, so
 * the coil monitor is compiled out. The Makefile passes -DMODULE=1 for
 * that build; default here is 0 so a bare compile works too. */
#ifndef MODULE
#define MODULE 0
#endif

/* pin names, local aliases. PB3 = the FIRE button, PB4 = the arc driver's
 * gate (LOW = on, the driver inverts), PB2 = Timer0's external input T0,
 * PB0 = USB VBUS sense, PB1 = the status LED. */
#define BTN PB3
#define GATE PB4
#define OSC PB2
#define VBUS PB0
#define LED PB1

/* Shared between an ISR and the main loop → `volatile`: forbids the
 * compiler from caching these in a register across the loop. Without it,
 * `while (!tick_flag)` could spin forever on a stale copy even though the
 * ISR wrote the real byte. The single-byte type also matters: an 8-bit
 * read/write is atomic on AVR, so no locking is needed around it. */
static volatile uint8_t tick_flag;       /* set by Timer1: "a 10 ms tick passed" */
static volatile uint8_t t0_overflows;   /* how many times the 8-bit pulse counter wrapped past 255 */

/* the interrupt handlers. ISR(vector) places the function's address in the
 * chip's vector table: hardware jumps here the instant the event fires.
 * Each body is deliberately tiny — interrupts pause whatever main was
 * doing, so they must finish fast and touch only a flag or a counter. */
ISR(TIMER1_COMPA_vect) { tick_flag = 1; }  /* 100 Hz — the heartbeat. Just raise the flag; the loop does the work */
ISR(TIMER0_OVF_vect) { t0_overflows++; }   /* T0 pulse counter wrapped — 256 more pulses arrived; keep the high byte in software */
ISR(PCINT0_vect) {}                         /* button edge: just wakes us — an EMPTY handler: its only job is to exist, so the CPU resumes after sleep_cpu() */

/* the gate is active-LOW (the driver inverts): Q1 conducts when PB4 is LOW */
static void gate_off(void) { PORTB |= _BV(GATE); }              /* HIGH: arc power off — the SAFE default */
static void gate_on(void) { PORTB &= (uint8_t)~_BV(GATE); }     /* LOW: arc power on */

/* VCC in mV: the ADC measures the 1.1 V bandgap with VCC as its reference.
 * Same trick as the lamp's, for the same reason: the "cell voltage" here
 * IS VCC (the cell feeds the chip directly), so measure the KNOWN 1.1 V
 * against the unknown VCC and invert: VCC = 1.1 V × 1024 / reading. */
static uint16_t read_vcc_mv(void) {
  ADMUX = _BV(MUX3) | _BV(MUX2);           /* REFS = VCC, input = VBG (1.1 V) */
  ADCSRA = _BV(ADEN) | _BV(ADPS1) | _BV(ADPS0); /* 1 MHz / 8 = 125 kHz — the ADC clock; a touch slow = a touch more accurate than the lamp's */
  _delay_us(500);                           /* let the bandgap settle — it is a lazy reference */
  ADCSRA |= _BV(ADSC);                      /* start the conversion */
  while (ADCSRA & _BV(ADSC)) {}             /* wait for it (ADSC clears itself when done) */
  uint16_t adc = ADC;                       /* 0..1023, where 1023 = VCC itself */
  if (adc == 0) return 0;                   /* reading zero = broken; refuse to guess */
  return (uint16_t)(1100UL * 1024UL / adc); /* the inversion; UL maths so 1100×1024 can't overflow */
}

/* coil pulses since the last call (T0 counts rising edges in hardware).
 * The 16-bit answer = an 8-bit hardware counter + an 8-bit software high
 * byte from the overflow ISR. Reading a pair that an interrupt can change
 * mid-read is a race — so stop interrupts for the three instructions it
 * takes to snapshot and reset them (cli/sei = the critical section). */
static uint16_t take_pulses(void) {
  cli();                                    /* interrupts off: the ISR can't touch these now */
  uint8_t lo = TCNT0, ov = t0_overflows;    /* snapshot the low byte and the high byte */
  if (TIFR & _BV(TOV0)) { lo = TCNT0; ov++; } /* overflow pending right now — the ISR hasn't run yet; fold it in by hand so nothing is lost */
  TCNT0 = 0; t0_overflows = 0; TIFR = _BV(TOV0);   /* reset both, and acknowledge the pending flag (writing 1 to a TIFR bit CLEARS it) */
  sei();                                    /* interrupts back on */
  return (uint16_t)((uint16_t)ov << 8 | lo);  /* the 16-bit count: hi<<8 | lo */
}

/* nothing to do for a long while: power down until the FIRE button moves.
 * ~0.1 µA. The wake source is a PIN-CHANGE interrupt on the button pin:
 * any edge on PB3 fires PCINT0 (the empty ISR above) and the CPU resumes
 * right here. BOD-off (sleep_bod_disable) saves ~20 µA while asleep —
 * same dance as the lamp's. */
static void sleep_until_button(void) {
  ADCSRA = 0;                               /* ADC off (it burns current) */
  GIMSK |= _BV(PCIE);                       /* wake on the button pin — pin-change interrupts: enable the bank */
  set_sleep_mode(SLEEP_MODE_PWR_DOWN);      /* the deepest sleep */
  cli();                                    /* a known-interrupts-off starting point… */
  sleep_enable();                           /* …arm the latch… */
#if defined(BODS) && defined(BODSE)         /* compile-time: does this chip have BOD-sleep control? (yes on real hw; the PC path has no such register) */
  sleep_bod_disable();                      /* brown-out detector off while asleep */
#endif
  sei();                                    /* …interrupts on, and NOW sleep — this exact order avoids an interrupt sneaking in between */
  sleep_cpu();                              /* ≈ 0.1 µA until FIRE is pressed */
  sleep_disable();                          /* awake: disarm the latch */
  GIMSK &= (uint8_t)~_BV(PCIE);             /* the button bank can go quiet again */
}

int main(void) {
  /* safe state first: gate HIGH (off), then make it an output.
   * Writing PORTB BEFORE DDRB means the pin's very first driven level is
   * already the safe one — no glitch at boot, even for a microsecond. */
  PORTB = _BV(GATE) | _BV(BTN);             /* gate high, button pull-up on */
  DDRB = _BV(GATE) | _BV(LED);              /* only GATE and LED are outputs; the rest read */
  PCMSK = _BV(BTN);                         /* watch just the button pin for pin-change */

  /* Timer1: 1 MHz / 64 / 156 ≈ 100 Hz tick.
   * CTC mode ("clear timer on compare"): the timer counts up to OCR1A, fires
   * the compare interrupt, resets to 0 — a precise metronome without
   * overflow arithmetic. OCR1A = 155 means 156 counts (0 counts too). */
  OCR1A = OCR1C = 155;                      /* 156 ticks (155 + 1); OCR1C mirrors for the PWM hardware */
  TCCR1 = _BV(CTC1) | _BV(CS12) | _BV(CS11) | _BV(CS10);   /* CTC mode, clock ÷ 64 */
  TIMSK = _BV(OCIE1A) | _BV(TOIE0);         /* enable the Timer1 compare interrupt, and Timer0's overflow (for pulse counting) */
  /* Timer0: external clock on T0 (PB2), rising edge — counts coil pulses.
   * The three CS0x bits select "external, rising edge" as Timer0's clock
   * source: the counter now increments on COIL pulses, not on time. */
  TCCR0A = 0;                               /* no PWM on this timer — plain counter */
  TCCR0B = _BV(CS02) | _BV(CS01) | _BV(CS00);   /* 111 = external pin T0, rising edge */
  sei();                                    /* interrupts globally on: the heartbeat starts */

  _delay_ms(5);                             /* let the pull-up and inputs settle before believing them */
  lighter_t l;                              /* the brain's private state struct… */
  lighter_init(&l, MODULE, !(PINB & _BV(BTN)));  /* …initialised once. !(PINB & bit): the button reads the LIVE pin (PINB, not PORTB) — inverted because the pull-up makes idle HIGH, pressed LOW */

  for (;;) {                                /* the work loop, one heartbeat at a time */
    while (!tick_flag) {}                   /* spin until Timer1 says "tick" (sleep replaces this when allowed) */
    tick_flag = 0;                          /* consume the tick */
    lighter_in_t in = {                     /* sample the world, in lighter.h's input shape: */
      .button = !(PINB & _BV(BTN)),         /* designated initialisers (.field = value): read fields by name; live pin read, inverted = pressed */
      .usb = (PINB & _BV(VBUS)) != 0,       /* VBUS divider: HIGH = USB plugged in */
      .vbat_mv = read_vcc_mv(),             /* the cell IS VCC here — one ADC conversion */
      .pulses = take_pulses(),              /* the hardware pulse counter snapshot */
    };
    lighter_out_t out;                      /* the decisions' answer… */
    lighter_tick(&l, &in, &out);            /* …one brain tick on the drumbeat */
    if (out.fire) gate_on(); else gate_off();        /* apply: the arc follows the verdict */
    if (out.led) PORTB |= _BV(LED); else PORTB &= (uint8_t)~_BV(LED);   /* the status LED too */
    if (out.may_sleep) {                    /* nothing pending for a long while: */
      gate_off();                           /* be safe: force the arc off (it already is, but be sure) */
      sleep_until_button();                 /* …and power down until FIRE is pressed */
    }
  }
}
