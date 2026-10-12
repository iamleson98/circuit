/* sim_avr/avr/sleep.h — stand-in for avr-libc's <avr/sleep.h>.
 *
 * FOR A NOVICE — what the REAL header provides on the chip:
 *   SLEEP MODES: the ATtiny85 can stop almost all of itself — CPU, the
 *   clocks, most peripherals — and draw ~4 µA instead of ~300 µA. The
 *   sequence in real firmware is: pick a mode (set_sleep_mode), arm the
 *   mechanism (sleep_enable), then sleep_cpu() — the instruction that
 *   actually stops the CPU. The chip restarts at the next line when an
 *   enabled interrupt (here: the watchdog) fires.
 *
 * In the simulation, "sleeping for 32 ms" cannot stop a PC's CPU — instead
 * the model's clock must advance 32 ms while the firmware "is not looking".
 * So sleep_cpu() calls sim_sleep(), which advances the electrical model
 * (the power supply draining, capacitors emptying…) by one watchdog tick
 * and returns. To the firmware, the same amount of model-time has passed
 * as real-time would on the chip. */
#pragma once
/* the mode number is a constant the real library defines too; nothing in
 * the model reads it, but main.c assigns it — so it must exist: */
#define SLEEP_MODE_PWR_DOWN 2
/* sim_sleep(): "fast-forward the world by one watchdog tick" — defined in
 * sim_firmware.c, stepping the model 32 ms: */
void sim_sleep(void);                       /* sleeps until the next watchdog tick */
/* the rest are the real API's shape as empty inline functions — arming
 * and disarming the latch are chip bookkeeping the model does not need: */
static inline void set_sleep_mode(int m) { (void)m; }
static inline void sleep_enable(void) {}
static inline void sleep_disable(void) {}
static inline void sleep_cpu(void) { sim_sleep(); }
