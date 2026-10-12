/* sim_avr/util/delay.h — stand-in for avr-libc's <util/delay.h>.
 *
 * FOR A NOVICE — what the REAL header provides on the chip:
 *   _delay_ms(ms) / _delay_us(us): busy-wait loops CALIBRATED BY F_CPU.
 *   The compiler knows the clock rate (the Makefile passed -DF_CPU), so it
 *   can emit a loop that spins for EXACTLY the requested time — "waste 3
 *   cycles per count, N counts, with F_CPU cycles per second". The CPU
 *   does nothing useful meanwhile; that is the price of simplicity (and
 *   the chip cannot sleep for sub-millisecond waits without timers).
 *
 * In the simulation, waiting must not stop the PC's CPU — it must let the
 * ELECTRICAL MODEL advance instead (the supply keeps draining while the
 * firmware delays!). So each delay becomes a call into sim_wait(), which
 * steps the model forward by that many seconds. */
#pragma once
/* sim_wait(): "advance the simulated world by this many seconds" —
 * defined in sim_firmware.c: */
void sim_wait(double seconds);
/* the two familiar names, redirected to the model's clock: */
#define _delay_ms(ms) sim_wait((ms) * 1e-3)
#define _delay_us(us) sim_wait((us) * 1e-6)
