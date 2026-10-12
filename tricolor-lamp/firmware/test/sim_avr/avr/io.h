/* sim_avr/avr/io.h — stand-in for avr-libc's <avr/io.h> when main.c runs on a
 * PC inside sim_firmware.c. Registers are plain variables (bit numbers from
 * the ATtiny85 datasheet); ADCSRA and ADC call into the electrical model so
 * a conversion measures the simulated voltages and takes simulated time. */
#pragma once
#include <stdint.h>
#define _BV(b) (1u << (b))
extern volatile uint8_t PORTB, DDRB, ADMUX, DIDR0, WDTCR, MCUSR;
volatile uint8_t *sim_adcsra(void);
uint16_t sim_adc(void);
#define ADCSRA (*sim_adcsra())
#define ADC (sim_adc())
enum { PB0, PB1, PB2, PB3, PB4, PB5 };
enum { MUX0 = 0, MUX1 = 1, MUX2 = 2, MUX3 = 3, REFS2 = 4, ADLAR = 5, REFS0 = 6, REFS1 = 7 };
enum { ADPS0 = 0, ADPS1 = 1, ADPS2 = 2, ADIE = 3, ADIF = 4, ADATE = 5, ADSC = 6, ADEN = 7 };
enum { AIN0D = 0, AIN1D = 1, ADC1D = 2, ADC3D = 3, ADC2D = 4, ADC0D = 5 };
enum { WDP0 = 0, WDP1 = 1, WDP2 = 2, WDE = 3, WDCE = 4, WDP3 = 5, WDIE = 6, WDIF = 7 };
