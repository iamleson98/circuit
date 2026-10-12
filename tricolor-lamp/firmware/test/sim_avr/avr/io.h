/* sim_avr/avr/io.h — stand-in for avr-libc's <avr/io.h> when main.c runs on a
 * PC inside sim_firmware.c. Registers are plain variables (bit numbers from
 * the ATtiny85 datasheet); ADCSRA and ADC call into the electrical model so
 * a conversion measures the simulated voltages and takes simulated time.
 *
 * FOR A NOVICE — the whole trick in one sentence:
 *   When the compiler sees `#include <avr/io.h>`, it simply reads whatever
 *   file that name resolves to. run.sh compiles main.c with -Isim_avr, so
 *   "avr/io.h" resolves to THIS file instead of avr-libc's — and suddenly
 *   every register becomes an ordinary global variable that the simulator
 *   can watch. Same main.c, different world to run it in.
 *
 * Three kinds of definition live here:
 *   1. plain variables — the registers main.c only reads/writes as bytes
 *      (PORTB, DDRB, …): declared `extern` here, defined in sim_firmware.c
 *   2. function-backed macros — ADCSRA and ADC need to DO something when
 *      touched (start a conversion, hand back its result), so they are
 *      macros that expand to function calls
 *   3. plain enums — the bit NUMBERS (PB0 = 0, ADEN = 7 …) are pure
 *      arithmetic facts from the datasheet; the same values avr-libc uses,
 *      so _BV(PB0) means the same thing in both worlds */
#pragma once            /* "include once" (modern form of the #ifndef guard) */
#include <stdint.h>
/* _BV is the one macro avr-libc defines that is pure arithmetic — so the
 * stand-in defines the identical one: bit b → a 1 shifted left b places. */
#define _BV(b) (1u << (b))

/* 1. the registers as plain variables. `extern` = "these exist somewhere;
 * the linker finds them" — the definitions live in sim_firmware.c, which
 * also contains the electronics model that reacts to every write. */
extern volatile uint8_t PORTB, DDRB, ADMUX, DIDR0, WDTCR, MCUSR;

/* 2. the two registers that must trigger model work:
 * sim_adcsra() returns the ADDRESS of the (model's) ADCSRA byte. Reading
 * ADCSRA through it lets the model finish a pending conversion (bit ADSC
 * still set = "conversion in progress"); writing to it just writes. */
volatile uint8_t *sim_adcsra(void);
/* sim_adc() returns the last conversion result — the model's ADC "data
 * register". Reading ADC in main.c fetches the number the model computed
 * from the simulated voltages. */
uint16_t sim_adc(void);
/* and the macros that redirect the names: `ADCSRA = x;` or `if (ADCSRA …)`
 * both expand through the functions above, transparently to main.c. */
#define ADCSRA (*sim_adcsra())
#define ADC (sim_adc())

/* 3. the bit numbers, exactly as in the ATtiny85 datasheet — so the _BV()
 * masks main.c builds match the bits the model expects: */
enum { PB0, PB1, PB2, PB3, PB4, PB5 };                                        /* port-B pin numbers 0..5 */
enum { MUX0 = 0, MUX1 = 1, MUX2 = 2, MUX3 = 3, REFS2 = 4, ADLAR = 5, REFS0 = 6, REFS1 = 7 };  /* ADMUX bits */
enum { ADPS0 = 0, ADPS1 = 1, ADPS2 = 2, ADIE = 3, ADIF = 4, ADATE = 5, ADSC = 6, ADEN = 7 };   /* ADCSRA bits (ADSC: start/hardware-busy, ADEN: enable) */
enum { AIN0D = 0, AIN1D = 1, ADC1D = 2, ADC3D = 3, ADC2D = 4, ADC0D = 5 };   /* DIDR0 bits: digital-input disable per pin */
enum { WDP0 = 0, WDP1 = 1, WDP2 = 2, WDE = 3, WDCE = 4, WDP3 = 5, WDIE = 6, WDIF = 7 };        /* WDTCR bits: period, reset-enable, change-enable, interrupt-enable */
