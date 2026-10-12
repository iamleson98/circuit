#pragma once
#define EMPTY_INTERRUPT(v) void v(void); void v(void) {}
static inline void sei(void) {}
static inline void cli(void) {}
