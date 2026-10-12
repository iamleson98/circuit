#pragma once
void sim_wait(double seconds);
#define _delay_ms(ms) sim_wait((ms) * 1e-3)
#define _delay_us(us) sim_wait((us) * 1e-6)
