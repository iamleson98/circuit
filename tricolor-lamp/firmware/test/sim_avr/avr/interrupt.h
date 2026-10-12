/* sim_avr/avr/interrupt.h — stand-in for avr-libc's <avr/interrupt.h>.
 *
 * FOR A NOVICE — what the REAL header provides on the chip:
 *   • ISR(vector): defines an interrupt handler — a function whose ADDRESS
 *     is placed in the chip's interrupt vector table, so hardware events
 *     (a timer firing, a pin changing) jump to it instantly
 *   • sei()/cli(): one machine instruction each — globally allow/ban
 *     interrupts by setting/clearing the I bit in the status register
 *   • EMPTY_INTERRUPT(vector): an ISR with an empty body — used when the
 *     interrupt's only job is to wake the CPU from sleep
 *
 * In the simulation none of that machinery exists (there is no vector
 * table on a PC), so each tool becomes a no-op or a plain function: */
#pragma once
/* EMPTY_INTERRUPT expands to a declaration + empty definition: on the PC it
 * is just a never-called function — main.c compiles identically either way. */
#define EMPTY_INTERRUPT(v) void v(void); void v(void) {}
/* sei()/cli() become empty inline functions: the model is single-threaded
 * and always "interruptible", so there is nothing to enable or disable. */
static inline void sei(void) {}
static inline void cli(void) {}
