#pragma once
#include <stdint.h>
void sim_wait(double seconds);
static inline void _delay_loop_1(uint8_t n) { sim_wait((n ? n : 256) * 3e-6); } /* 3 cycles of 1 MHz */
