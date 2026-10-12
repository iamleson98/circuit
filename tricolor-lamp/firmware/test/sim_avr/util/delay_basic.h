/* sim_avr/util/delay_basic.h — stand-in for avr-libc's <util/delay_basic.h>.
 *
 * FOR A NOVICE — what the REAL header provides on the chip:
 *   The rawest delay avr-libc has: _delay_loop_1(n) is a 3-instruction
 *   loop the compiler emits verbatim, taking EXACTLY 3 CPU cycles per
 *   count. At the lamp's 1 MHz, 3 cycles = 3 µs. No calibration, no
 *   setup code — that determinism is why the software PWM (pwm_period in
 *   main.c) is built on it rather than on _delay_ms().
 *   A count of 0 means 256 (the 8-bit register wrapped), hence the "n ? n
 *   : 256" below — the real instruction's behaviour, kept identical.
 *
 * In the simulation the same time simply advances the electrical model: */
#pragma once
#include <stdint.h>
void sim_wait(double seconds);
/* (n ? n : 256): 0 wraps to 256, like the real 8-bit loop register; ×3 µs
 * is 3 cycles at 1 MHz — the real timing, in model-time: */
static inline void _delay_loop_1(uint8_t n) { sim_wait((n ? n : 256) * 3e-6); } /* 3 cycles of 1 MHz */
