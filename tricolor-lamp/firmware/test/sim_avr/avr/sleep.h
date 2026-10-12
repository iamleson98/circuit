#pragma once
#define SLEEP_MODE_PWR_DOWN 2
void sim_sleep(void);                       /* sleeps until the next watchdog tick */
static inline void set_sleep_mode(int m) { (void)m; }
static inline void sleep_enable(void) {}
static inline void sleep_disable(void) {}
static inline void sleep_cpu(void) { sim_sleep(); }
