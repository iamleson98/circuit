/* sim_avr/avr/wdt.h — stand-in for avr-libc's <avr/wdt.h>.
 *
 * FOR A NOVICE — what the REAL header provides on the chip:
 *   The watchdog timer is an independent little clock inside the chip. Its
 *   day job is safety: if the program ever hangs, the watchdog resets the
 *   chip after a chosen period. Its NIGHT job — how this lamp uses it — is
 *   as an alarm clock: with WDIE (interrupt-enable) instead of WDE
 *   (reset-enable), each expiry just raises an interrupt, which is exactly
 *   what wakes power-down sleep every 32 ms.
 *
 *   wdt_reset() = "pat the dog": restart the countdown, proving the program
 *   is alive. wdt_disable() = stop the timer entirely.
 *
 * In the simulation the model keeps its own sense of time (sim_sleep()
 * steps in units of one watchdog tick), so the real operations are no-ops.
 * main.c still calls them — compiling identically in both worlds. */
#pragma once
static inline void wdt_disable(void) {}
static inline void wdt_reset(void) {}
