/*
 * sim_firmware.c — runs the REAL firmware (tricolor_lamp/main.c, unchanged)
 * on a PC, wired to a model of the lamp's electronics, and flips the wall
 * switch in many ways to check what colour you would see.
 *
 *   sh firmware/test/run.sh
 *
 * main.c is compiled against the stand-in headers in sim_avr/: its register
 * reads/writes, delays, ADC conversions, sleeps and EEPROM writes land here.
 *
 * THE MODEL (one-millisecond-ish physics, numbers from the parts' datasheets)
 *   power supply  after the wall switch closes it takes TS (0.3 s) to start,
 *                 then ramps to 12 V. After the switch opens it keeps 12 V for
 *                 its hold-up time H, then stops: its output capacitors
 *                 (C1 470 µF + ≈ 1000 µF inside the supply) then sag as the
 *                 load draws them down.
 *   load          the lit colour's six LED strings (each n LEDs + resistor:
 *                 ≈ 15 mA at 11.65 V, less as the voltage falls), the 78L05
 *                 (4 mA), R2+R3.
 *   chip supply   78L05 → D2 → VCC with C5 = 220 µF. When the 12 V goes, C5
 *                 alone runs the chip: 0.8 mA awake, 12 µA asleep, + the
 *                 MODE divider, + 44 µA per lit gate (R10-R12). Below 2.7 V
 *                 the brown-out detector resets it; it restarts 64 ms after
 *                 VCC is back.
 *   ADC           PB3 = 12 V × 33k/133k, PB2 = the MODE divider, the 1.1 V
 *                 bandgap — all measured against VCC, as the real chip does.
 */
#include <math.h>
#include <setjmp.h>
#include <stdio.h>
#include <string.h>

#include "../tricolor_lamp/lamp.h"

int firmware_main(void); /* main.c's main(), renamed when compiling it */

/* ── the registers main.c touches ─────────────────────────────────────── */
volatile uint8_t PORTB, DDRB, ADMUX, DIDR0, WDTCR, MCUSR;
static volatile uint8_t adcsra;
static uint16_t adc_result;
static unsigned noise_hits;

/* ── the model's state ────────────────────────────────────────────────── */
enum { EV_ON, EV_OFF, EV_GLITCH, EV_VOUT, EV_REVIVE, EV_NOISE, EV_END };
typedef struct { double t; int type; double value; } event_t;
typedef struct { double t; int color; } probe_t; /* color: 0-2, -1 = dark */
typedef struct {
  const char *name;
  lamp_mode_t mode;
  double hold, ts, ramp, cout, vout;
  event_t ev[16];
  probe_t probe[16];
  int saves_expected;  /* -1 = don't check */
  int flashes_allowed;  /* times light may appear while the wall switch is off; -1 = don't check */
} scenario_t;

static const scenario_t *sc;
static double t, v12, vcc, t_power;
static int mains, asleep, chip_running, boots, two_colors, lit_while_dead, saves, flashes;
static double dark_since;
static double start_at, stop_at, ramp_start, glitch_until, revive_from, revive_until, noise_until, vout;
static bool running;
static int prev_lit;
static int next_ev, next_probe, probe_fail;
static uint8_t eeprom[512];
static jmp_buf reset_jb, end_jb;

static int lit_color(void) {
  int c = -1, n = 0;
  for (int i = 0; i < 3; i++)
    if (PORTB & (i == 0 ? 0x01 : i == 1 ? 0x02 : 0x10)) { c = i; n++; }
  return n > 1 ? 9 : c;
}

static bool sourcing(void) {
  if (t < glitch_until) return false;
  if (t >= revive_from && t < revive_until) return true;
  return running;
}

/* current drawn from the 12 V by one colour's six strings */
static double led_current(int color, double v) {
  double n = color == 2 ? 4 : 3, vt = color == 2 ? 1.85 : 2.85, rd = color == 2 ? 15 : 18, r = color == 2 ? 220 : 150;
  double i = (v - n * vt) / (r + n * rd);
  return i > 0 ? 6 * i : 0;
}

static const char *cname(int c) { return c == 0 ? "BLUE" : c == 1 ? "WHITE" : c == 2 ? "YELLOW" : c == -1 ? "dark" : "TWO AT ONCE"; }

static void step(double h) {
  /* events */
  while (sc->ev[next_ev].type != EV_END && sc->ev[next_ev].t <= t) {
    const event_t *e = &sc->ev[next_ev++];
    if (e->type == EV_ON) { mains = 1; if (!running) start_at = e->t + sc->ts; }   /* a supply still holding up just carries on */
    if (e->type == EV_OFF) { mains = 0; stop_at = e->t + sc->hold; }
    if (e->type == EV_GLITCH) glitch_until = e->t + e->value;
    if (e->type == EV_VOUT) vout = e->value;
    if (e->type == EV_REVIVE) { revive_from = e->t; revive_until = e->t + e->value; }
    if (e->type == EV_NOISE) noise_until = e->t + e->value;
  }
  /* the power supply */
  if (mains && !running && t >= start_at) { running = true; ramp_start = t; }
  if (!mains && running && t >= stop_at) running = false;
  /* the 12 V node */
  int c = chip_running ? lit_color() : -1;
  double load = 0.004 + v12 / 133e3;
  if (c >= 0 && c <= 2) load += led_current(c, v12);
  bool src = sourcing();
  double target = vout * fmin(1, (t - ramp_start) / sc->ramp);
  if (src && v12 < target) v12 = target;
  else { v12 -= load / sc->cout * h; if (v12 < 0) v12 = 0; }
  /* the chip's supply */
  double vreg = fmin(5.0, v12 - 1.7);
  if (vreg - 0.6 > vcc) vcc = vreg - 0.6;
  else {
    double i = chip_running ? (asleep ? 12e-6 : 0.8e-3) : 1e-6;
    i += sc->mode == MODE_STEP ? vcc / 2e6 : vcc / 1.01e6;
    if (chip_running) for (int k = 0; k < 3; k++) if (PORTB & (k == 0 ? 0x01 : k == 1 ? 0x02 : 0x10)) i += vcc / 100.1e3;
    vcc -= i / 220e-6 * h;
    if (vcc < 0) vcc = 0;
  }
  if (vcc < 2.75 && t_power >= 0 && !chip_running) t_power = -1;
  if (vcc >= 2.75 && t_power < 0) t_power = t;
  t += h;
  /* observations */
  if (chip_running) {
    int now = lit_color();
    if (now == 9) two_colors++;
    /* lighting a colour once the 12 V has clearly sagged (below 80 %) would be a bug;
       finishing a fade on what the supply's capacitors still hold is just physics */
    if (now >= 0 && now != prev_lit && !sourcing() && v12 < 0.8 * vout) lit_while_dead++;
    if (now >= 0 && prev_lit < 0 && !mains && t - dark_since > 0.05) flashes++; /* light out of a dark, switched-off lamp */
    if (now < 0 && prev_lit >= 0) dark_since = t;
    prev_lit = now;
  }
  while (sc->probe[next_probe].t > 0 && sc->probe[next_probe].t <= t) {
    const probe_t *p = &sc->probe[next_probe++];
    int seen = chip_running ? lit_color() : -1;
    if (seen != p->color) { probe_fail++; printf("      at %6.2f s: saw %s, expected %s  (12 V node %.2f V, VCC %.2f V)\n", p->t, cname(seen), cname(p->color), v12, vcc); }
  }
  if (sc->ev[next_ev].type == EV_END && t >= sc->ev[next_ev].t) longjmp(end_jb, 1);
  if (chip_running && vcc < 2.7) longjmp(reset_jb, 1); /* brown-out reset */
}

void sim_wait(double s) {
  while (s > 0) { double h = s < 5e-4 ? s : 5e-4; step(h); s -= h; }
}
void sim_sleep(void) { asleep = 1; sim_wait(32e-3); asleep = 0; } /* until the next watchdog tick */

volatile uint8_t *sim_adcsra(void) {
  if (adcsra & (1u << 6)) { /* ADSC: a conversion */
    uint8_t mux = ADMUX & 0x0F;
    double v = 0;
    if (mux == 3) {
      v = v12 * 33.0 / 133.0;
      if (t < noise_until && (noise_hits++ & 1) == 0) v += 3.0; /* interference: every other reading is hit */
    }
    if (mux == 1) {
      double settle = 1 - exp(-(t - t_power) / 5e-3); /* C8 charging through R4‖R5 */
      v = sc->mode == MODE_STEP ? vcc / 2 * settle : sc->mode == MODE_MEMORY ? vcc * 0.0099 : vcc * 0.990;
    }
    if (mux == 12) v = 1.1;
    double raw = v / vcc * 1024;
    adc_result = (uint16_t)(raw > 1023 ? 1023 : raw < 0 ? 0 : raw);
    adcsra &= (uint8_t)~(1u << 6);
    sim_wait(100e-6);
  }
  return &adcsra;
}
uint16_t sim_adc(void) { return adc_result; }

uint8_t eeprom_read_byte(const uint8_t *a) { return eeprom[(uintptr_t)a & 511]; }
void eeprom_update_byte(uint8_t *a, uint8_t v) {
  uintptr_t i = (uintptr_t)a & 511;
  if (eeprom[i] == v) return;
  eeprom[i] = v;
  if (v != 0xFF) saves++;
  sim_wait(3.4e-3);
}

static int passed, failed;
static void run(const scenario_t *s, bool fresh_eeprom) {
  sc = s;
  t = 0; v12 = 0; vcc = 0; t_power = -1;
  mains = 0; asleep = 0; chip_running = 0; boots = 0; two_colors = 0; lit_while_dead = 0; saves = 0; flashes = 0; dark_since = 0;
  start_at = stop_at = 1e9; ramp_start = 0; running = false; glitch_until = -1; noise_until = -1; revive_from = revive_until = -1; vout = s->vout; prev_lit = -1;
  next_ev = 0; next_probe = 0; probe_fail = 0;
  if (fresh_eeprom) memset(eeprom, 0xFF, sizeof eeprom);
  PORTB = 0;
  if (!setjmp(end_jb)) {
    for (;;) {
      if (!setjmp(reset_jb)) {
        chip_running = 0; PORTB = 0; DDRB = 0;
        while (vcc < 2.75) sim_wait(1e-3);   /* unpowered */
        sim_wait(64e-3);                      /* start-up delay (fuses) */
        if (vcc < 2.75) continue;
        chip_running = 1; boots++;
        firmware_main();
      }
    }
  }
  bool ok = probe_fail == 0 && two_colors == 0 && lit_while_dead == 0 && (s->saves_expected < 0 || saves == s->saves_expected) &&
            (s->flashes_allowed < 0 || flashes <= s->flashes_allowed);
  ok ? passed++ : failed++;
  printf("  %s  %s\n", ok ? "✓" : "✗ FAIL", s->name);
  if (two_colors) printf("      two colours lit at once (%d steps)\n", two_colors);
  if (lit_while_dead) printf("      a colour came ON after the 12 V had sagged (%d times)\n", lit_while_dead);
  if (s->flashes_allowed >= 0 && flashes > s->flashes_allowed) printf("      light appeared %d times with the switch off\n", flashes);
  if (s->saves_expected >= 0 && saves != s->saves_expected) printf("      %d colours saved to EEPROM, expected %d\n", saves, s->saves_expected);
}

#define ON(x) { x, EV_ON, 0 }
#define OFF(x) { x, EV_OFF, 0 }
#define END(x) { x, EV_END, 0 }
enum { B = COLOR_BLUE, W = COLOR_WHITE, Y = COLOR_YELLOW, DARK = -1 };
/* the supply: hold-up (s), ramp (s), output capacitance; it starts 0.3 s after the switch
   closes and gives 11.65 V at the 12 V node (12 V − D1) */
#define PSU(h, r, c) .hold = (h), .ts = 0.3, .ramp = (r), .cout = (c), .vout = 11.65
#define STD PSU(0.1, 0.02, 1470e-6)

static const scenario_t scenarios[] = {
  { "STEP: blue → white → yellow → blue on 1 s flips; a 10 s off steps; a 3-minute off (chip flat) steps",
    MODE_STEP, STD,
    { ON(0), OFF(5), ON(6), OFF(10), ON(11.5), OFF(15), ON(16), OFF(20), ON(30), OFF(35), ON(200), END(203) },
    { { 2, B }, { 5.05, B }, { 8, W }, { 13, Y }, { 18, B }, { 25, DARK }, { 32, W }, { 190, DARK }, { 202, Y } }, 6, 0 },
  { "STEP, a big supply that holds 12 V for 0.8 s: a 0.5 s flip is too short to notice, 1.5 s steps",
    MODE_STEP, PSU(0.8, 0.02, 1470e-6),
    { ON(0), OFF(5), ON(5.5), OFF(10), ON(11.5), END(14) },
    { { 3, B }, { 5.4, B }, { 5.7, B }, { 8, B }, { 13, W } }, 2, 0 },
  { "a 60 ms break in the 12 V wire is a glitch (no change); a 0.25 s break counts as a flip",
    MODE_STEP, STD,
    { ON(0), { 5, EV_GLITCH, 0.06 }, { 8, EV_GLITCH, 0.25 }, END(11) },
    { { 3, B }, { 6, B }, { 10, W } }, 2, 0 },
  { "MEMORY: quick flips step; after 10 s off, or with the chip flat, it comes back the same",
    MODE_MEMORY, STD,
    { ON(0), OFF(5), ON(6), OFF(10), ON(20), OFF(25), ON(190), OFF(195), ON(196), END(199) },
    { { 3, B }, { 8, W }, { 22, W }, { 192, W }, { 198, Y } }, 3, 0 },
  { "RESET: quick flips step; after 10 s off, or with the chip flat, it starts blue",
    MODE_RESET, STD,
    { ON(0), OFF(5), ON(6), OFF(10), ON(20), OFF(25), ON(26), OFF(30), ON(195), END(198) },
    { { 3, B }, { 8, W }, { 22, B }, { 28, W }, { 197, B } }, 5, 0 },
  { "a dying supply that hiccups back to 12 V for 40 ms (after the LEDs are out) doesn't count",
    MODE_STEP, STD,
    { ON(0), OFF(5), { 6.2, EV_REVIVE, 0.04 }, ON(7.5), END(10) },
    { { 3, B }, { 6.15, DARK }, { 9.5, W } }, 2, -1 },
  { "… nor one that hiccups while the old colour is still fading out",
    MODE_STEP, STD,
    { ON(0), OFF(5), { 5.16, EV_REVIVE, 0.04 }, ON(6.5), END(9) },
    { { 3, B }, { 8.5, W } }, 2, -1 },
  { "swapped to a weaker (10.5 V) supply while off: it still comes on (and steps)",
    MODE_STEP, STD,
    { ON(0), OFF(5), { 6.4, EV_VOUT, 10.5 }, ON(6.5), END(10) },
    { { 3, B }, { 9.5, W } }, 2, 0 },
  { "a supply that sags very slowly (10 000 µF): no false switch-on while it dies",
    MODE_STEP, PSU(0.3, 0.02, 10e-3),
    { ON(0), OFF(5), ON(20), END(23) },
    { { 3, B }, { 22, W } }, 2, 0 },
  { "a supply that ramps up slowly (0.3 s) at first power-up still starts blue",
    MODE_STEP, PSU(0.1, 0.3, 1470e-6),
    { ON(0), END(3) },
    { { 2.5, B } }, 1, 0 },
  { "skip a colour: off 1 s, on until the colour is fully lit, off 1 s, on",
    MODE_STEP, STD,
    { ON(0), OFF(5), ON(6), OFF(7.2), ON(8.2), END(11) },
    { { 3, B }, { 7.1, W }, { 10, Y } }, 3, 0 },
  { "flipping on-off faster than the colour can fade in counts as one flip",
    MODE_STEP, STD,
    { ON(0), OFF(5), ON(6), OFF(6.45), ON(7.45), END(10) },
    { { 3, B }, { 9.5, W } }, 2, 0 },
  { "0.3 s of interference on the sense wire (every other reading wrong) while off: no light",
    MODE_STEP, STD,
    { ON(0), OFF(5), { 6.5, EV_NOISE, 0.3 }, ON(8), END(10) },
    { { 3, B }, { 6.6, DARK }, { 9.5, W } }, 2, 0 },
  { "a dead supply that hiccups for 10 ms refills its capacitors: at most one dim flash, no colour change",
    MODE_STEP, STD,
    { ON(0), OFF(5), { 6.5, EV_REVIVE, 0.01 }, ON(8), END(10) },
    { { 3, B }, { 7.5, DARK }, { 9.5, W } }, 2, 1 },
  { "MEMORY: a supply hiccup in the middle of a 4 s off doesn't split it into two short offs",
    MODE_MEMORY, STD,
    { ON(0), OFF(5), { 7.2, EV_REVIVE, 0.04 }, ON(9), END(11) },
    { { 3, B }, { 10.5, B } }, 1, -1 },
};

int main(void) {
  puts("tri-color lamp firmware (main.c) on a model of the lamp:");
  for (size_t i = 0; i < sizeof scenarios / sizeof *scenarios; i++) run(&scenarios[i], true);
  printf("RESULT: %d passed, %d failed\n", passed, failed);
  return failed != 0;
}
