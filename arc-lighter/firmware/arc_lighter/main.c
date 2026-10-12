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
 */
#include <avr/interrupt.h>
#include <avr/io.h>
#include <avr/sleep.h>
#include <util/delay.h>

#include "lighter.h"

#ifndef MODULE
#define MODULE 0
#endif

#define BTN PB3
#define GATE PB4
#define OSC PB2
#define VBUS PB0
#define LED PB1

static volatile uint8_t tick_flag;
static volatile uint8_t t0_overflows;

ISR(TIMER1_COMPA_vect) { tick_flag = 1; }  /* 100 Hz */
ISR(TIMER0_OVF_vect) { t0_overflows++; }   /* T0 pulse counter wrapped */
ISR(PCINT0_vect) {}                         /* button edge: just wakes us */

static void gate_off(void) { PORTB |= _BV(GATE); }
static void gate_on(void) { PORTB &= (uint8_t)~_BV(GATE); }

/* VCC in mV: the ADC measures the 1.1 V bandgap with VCC as its reference */
static uint16_t read_vcc_mv(void) {
  ADMUX = _BV(MUX3) | _BV(MUX2);           /* REFS = VCC, input = VBG (1.1 V) */
  ADCSRA = _BV(ADEN) | _BV(ADPS1) | _BV(ADPS0); /* 1 MHz / 8 = 125 kHz */
  _delay_us(500);                           /* let the bandgap settle */
  ADCSRA |= _BV(ADSC);
  while (ADCSRA & _BV(ADSC)) {}
  uint16_t adc = ADC;
  if (adc == 0) return 0;
  return (uint16_t)(1100UL * 1024UL / adc);
}

/* coil pulses since the last call (T0 counts rising edges in hardware) */
static uint16_t take_pulses(void) {
  cli();
  uint8_t lo = TCNT0, ov = t0_overflows;
  if (TIFR & _BV(TOV0)) { lo = TCNT0; ov++; } /* overflow pending right now */
  TCNT0 = 0; t0_overflows = 0; TIFR = _BV(TOV0);
  sei();
  return (uint16_t)((uint16_t)ov << 8 | lo);
}

static void sleep_until_button(void) {
  ADCSRA = 0;                               /* ADC off */
  GIMSK |= _BV(PCIE);                       /* wake on the button pin */
  set_sleep_mode(SLEEP_MODE_PWR_DOWN);
  cli();
  sleep_enable();
#if defined(BODS) && defined(BODSE)
  sleep_bod_disable();                      /* brown-out detector off while asleep */
#endif
  sei();
  sleep_cpu();                              /* ≈ 0.1 µA until FIRE is pressed */
  sleep_disable();
  GIMSK &= (uint8_t)~_BV(PCIE);
}

int main(void) {
  /* safe state first: gate HIGH (off), then make it an output */
  PORTB = _BV(GATE) | _BV(BTN);             /* gate high, button pull-up on */
  DDRB = _BV(GATE) | _BV(LED);
  PCMSK = _BV(BTN);

  /* Timer1: 1 MHz / 64 / 156 ≈ 100 Hz tick */
  OCR1A = OCR1C = 155;
  TCCR1 = _BV(CTC1) | _BV(CS12) | _BV(CS11) | _BV(CS10);
  TIMSK = _BV(OCIE1A) | _BV(TOIE0);
  /* Timer0: external clock on T0 (PB2), rising edge — counts coil pulses */
  TCCR0A = 0;
  TCCR0B = _BV(CS02) | _BV(CS01) | _BV(CS00);
  sei();

  _delay_ms(5);
  lighter_t l;
  lighter_init(&l, MODULE, !(PINB & _BV(BTN)));

  for (;;) {
    while (!tick_flag) {}
    tick_flag = 0;
    lighter_in_t in = {
      .button = !(PINB & _BV(BTN)),
      .usb = (PINB & _BV(VBUS)) != 0,
      .vbat_mv = read_vcc_mv(),
      .pulses = take_pulses(),
    };
    lighter_out_t out;
    lighter_tick(&l, &in, &out);
    if (out.fire) gate_on(); else gate_off();
    if (out.led) PORTB |= _BV(LED); else PORTB &= (uint8_t)~_BV(LED);
    if (out.may_sleep) {
      gate_off();
      sleep_until_button();
    }
  }
}
