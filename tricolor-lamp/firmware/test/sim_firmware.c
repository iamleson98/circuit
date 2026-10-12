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
 *
 * ── FOR A NOVICE — how do you simulate a circuit? ────────────────────────
 * You keep a handful of NUMBERS that stand for the physical quantities —
 * v12 (the 12 V rail voltage), vcc (the chip's own supply) — and a function
 * step(h) that says "h seconds pass": the supply sags a bit, the capacitors
 * drain a bit, currents are drawn. Call step() often enough and you have a
 * movie of the electronics. The firmware runs INSIDE that movie through the
 * stand-in headers: when it writes PORTB, that changes the load current the
 * model sees; when it reads the ADC, the model answers with the voltage its
 * physics would produce. Nobody edits main.c — the same bytes that run in
 * the chip are what gets tested here.
 *
 * The scenarios at the bottom are the test cases: each is a script of wall-
 * switch events plus, at chosen moments, the colour a human should SEE.
 * setjmp/longjmp (used below) is C's "goto across functions" — it lets the
 * model kill and restart the firmware (a brown-out reset!) without the
 * firmware's cooperation: exactly what real hardware does to a chip.
 */
#include <math.h>       /* exp(): the RC settling curve; fmin(): clamping */
#include <setjmp.h>     /* setjmp/longjmp: "rewind" to a checkpoint — used to
                           reset or end the firmware without its permission */
#include <stdio.h>      /* printf: reporting probe mismatches */
#include <string.h>     /* memset: bulk-fill the fake EEPROM with 0xFF */

#include "../tricolor_lamp/lamp.h"   /* colours + the journal API the model checks */

int firmware_main(void); /* main.c's main(), renamed when compiling it —
                            see run.sh: -Dmain=firmware_main. The model calls
                            it whenever (its version of) the chip powers up. */

/* ── the registers main.c touches ─────────────────────────────────────── */
/* These ARE the definitions the stand-in headers (sim_avr/avr/io.h) point
 * at: `PORTB` here is an ordinary variable; writing it in main.c lands in
 * this one, and lit_color() below reads it back to see which LEDs would be
 * lit — closing the loop between firmware and model. */
volatile uint8_t PORTB, DDRB, ADMUX, DIDR0, WDTCR, MCUSR;
static volatile uint8_t adcsra;     /* ADCSRA: function-backed (see io.h) — kept private */
static uint16_t adc_result;         /* ADC: the last conversion's result */
static unsigned noise_hits;         /* how many readings the interference hit so far */

/* ── the model's state (all the physics' current numbers) ─────────────── */
/* event types: the vocabulary of the scenario scripts —
 * ON/OFF: the wall switch; GLITCH: the 12 V wire breaks briefly;
 * VOUT: swap in a different supply voltage; REVIVE: a dying supply coughs
 * back to life briefly; NOISE: interference on the sense wire; END: stop. */
enum { EV_ON, EV_OFF, EV_GLITCH, EV_VOUT, EV_REVIVE, EV_NOISE, EV_END };
typedef struct { double t; int type; double value; } event_t;          /* one scripted event at time t */
typedef struct { double t; int color; } probe_t; /* color: 0-2, -1 = dark */  /* one "what should be seen at t" */
typedef struct {
  const char *name;                 /* human-readable test title */
  lamp_mode_t mode;                 /* the MODE jumper position to assume */
  double hold, ts, ramp, cout, vout;/* the power supply's personality: hold-up time, start delay, ramp rate, output capacitance, voltage */
  event_t ev[16];                   /* the script of switch events (16 max) */
  probe_t probe[16];                /* the colour a human should see at each probe time */
  int saves_expected;  /* -1 = don't check */       /* how many EEPROM writes must happen */
  int flashes_allowed;  /* times light may appear while the wall switch is off; -1 = don't check */
} scenario_t;

/* the running state of one scenario, updated by step(): */
static const scenario_t *sc;        /* the scenario being played */
static double t, v12, vcc, t_power; /* clock, the 12 V node, the chip's VCC, when power last came (or -1 if gone) */
static int mains, asleep, chip_running, boots, two_colors, lit_while_dead, saves, flashes;
                                    /* mains: wall switch closed? asleep: firmware in sleep;
                                       chip_running: is the firmware live (not browning out)?
                                       the last four are OBSERVATIONS a passing test must produce */
static double dark_since;           /* when the lit colour last went dark (for flash counting) */
static double start_at, stop_at, ramp_start, glitch_until, revive_from, revive_until, noise_until, vout;
                                    /* book-keeping for each scripted mechanism */
static bool running;                /* is the power supply's output stage on? */
static int prev_lit;                /* which colour was lit at the previous step (edge detection) */
static int next_ev, next_probe, probe_fail;   /* cursors into the script and its probes */
static uint8_t eeprom[512];         /* the fake EEPROM (0xFF = erased) */
static jmp_buf reset_jb, end_jb;    /* checkpoints: "firmware was reset here" / "scenario over" */

/* what colour is being driven right now? Reads PORTB — the firmware's own
 * output latch — and maps bit patterns to colour numbers. Two bits at once
 * (=9) would be a firmware bug; -1 = dark. */
static int lit_color(void) {
  int c = -1, n = 0;
  for (int i = 0; i < 3; i++)
    if (PORTB & (i == 0 ? 0x01 : i == 1 ? 0x02 : 0x10)) { c = i; n++; }  /* count set gate bits (PB0=0x01, PB1=0x02, PB4=0x10) */
  return n > 1 ? 9 : c;               /* more than one → the "two at once" bug marker */
}

/* is the power supply actually sourcing current right now? It is OFF while
 * the wire is glitched, ON during a scripted revive, else following its own
 * start/stop delays (which encode its real hold-up time). */
static bool sourcing(void) {
  if (t < glitch_until) return false;
  if (t >= revive_from && t < revive_until) return true;
  return running;
}

/* current drawn from the 12 V by one colour's six LED strings: the diode
 * equation simplified to "each LED drops ~vt volts, the resistor takes the
 * rest" — i = (v − n·vt)/(r + n·rd) per string, × 6 strings. Clamped at 0:
 * below the LEDs' forward voltage no current flows at all. */
static double led_current(int color, double v) {
  double n = color == 2 ? 4 : 3, vt = color == 2 ? 1.85 : 2.85, rd = color == 2 ? 15 : 18, r = color == 2 ? 220 : 150;
  double i = (v - n * vt) / (r + n * rd);
  return i > 0 ? 6 * i : 0;
}

/* colour names for failure messages only: */
static const char *cname(int c) { return c == 0 ? "BLUE" : c == 1 ? "WHITE" : c == 2 ? "YELLOW" : c == -1 ? "dark" : "TWO AT ONCE"; }

/* ── step(h): let h seconds of physics pass ───────────────────────────── */
static void step(double h) {
  /* events: anything scripted to happen by now becomes reality. Reading
   * the script with a cursor (next_ev) means each event fires exactly once. */
  while (sc->ev[next_ev].type != EV_END && sc->ev[next_ev].t <= t) {
    const event_t *e = &sc->ev[next_ev++];
    if (e->type == EV_ON) { mains = 1; if (!running) start_at = e->t + sc->ts; }   /* a supply still holding up just carries on */
    if (e->type == EV_OFF) { mains = 0; stop_at = e->t + sc->hold; }  /* switch opened: the supply keeps 12 V until its hold-up time expires */
    if (e->type == EV_GLITCH) glitch_until = e->t + e->value;         /* the 12 V wire is broken until then */
    if (e->type == EV_VOUT) vout = e->value;                          /* a different supply was plugged in */
    if (e->type == EV_REVIVE) { revive_from = e->t; revive_until = e->t + e->value; }  /* a dying supply's last cough */
    if (e->type == EV_NOISE) noise_until = e->t + e->value;           /* interference on the sense wire until then */
  }
  /* the power supply: its output stage starts TS after the switch closes
   * and stops H (the hold-up time) after it opens: */
  if (mains && !running && t >= start_at) { running = true; ramp_start = t; }
  if (!mains && running && t >= stop_at) running = false;
  /* the 12 V node: if sourcing, it is at least its (ramping) target — a
   * supply cannot be dragged down by load faster than it ramps; if not
   * sourcing, the node sags as the load drains the output capacitors:
   * dv = −i·dt/C (C = C1 + the supply's internal ~1000 µF). */
  int c = chip_running ? lit_color() : -1;        /* which strings conduct (only if the chip drives them) */
  double load = 0.004 + v12 / 133e3;             /* the 78L05's 4 mA + the R2/R3 divider (12 V → 133 kΩ) */
  if (c >= 0 && c <= 2) load += led_current(c, v12);  /* plus the lit colour's strings */
  bool src = sourcing();
  double target = vout * fmin(1, (t - ramp_start) / sc->ramp);   /* the ramp: 0 % → 100 % over `ramp` seconds */
  if (src && v12 < target) v12 = target;          /* sourcing and below target: the supply wins, instantly */
  else { v12 -= load / sc->cout * h; if (v12 < 0) v12 = 0; }  /* sagging: dv = −i/C·h */
  /* the chip's supply: the 12 V → 78L05 (drops ≥1.7 V) → D2 (0.6 V) → C5.
   * If the chain can push current INTO C5, VCC rises to what it offers;
   * otherwise C5 discharges under the chip's own consumption — awake or
   * asleep — until the model declares a brown-out at 2.75 V. */
  double vreg = fmin(5.0, v12 - 1.7);            /* the regulator's best attempt (never above 5 V) */
  if (vreg - 0.6 > vcc) vcc = vreg - 0.6;        /* charging: D2's drop, then straight onto VCC */
  else {
    double i = chip_running ? (asleep ? 12e-6 : 0.8e-3) : 1e-6;   /* the chip: 12 µA asleep, 0.8 mA awake, 1 µA off */
    i += sc->mode == MODE_STEP ? vcc / 2e6 : vcc / 1.01e6;        /* the MODE divider (2 MΩ open / 1.01 MΩ with jumper) */
    if (chip_running) for (int k = 0; k < 3; k++) if (PORTB & (k == 0 ? 0x01 : k == 1 ? 0x02 : 0x10)) i += vcc / 100.1e3;  /* each lit gate leaks ~44 µA through its pull-up */
    vcc -= i / 220e-6 * h;                       /* C5 = 220 µF: dv = −i/C·h */
    if (vcc < 0) vcc = 0;
  }
  /* power-good book-keeping: t_power ≥ 0 while VCC ≥ 2.75 V, −1 while dead. */
  if (vcc < 2.75 && t_power >= 0 && !chip_running) t_power = -1;
  if (vcc >= 2.75 && t_power < 0) t_power = t;
  t += h;                                        /* the clock advances */
  /* observations: things a PASSING scenario must never show. */
  if (chip_running) {
    int now = lit_color();
    if (now == 9) two_colors++;                  /* two gate bits at once = a firmware bug */
    /* lighting a colour once the 12 V has clearly sagged (below 80 %) would be a bug;
       finishing a fade on what the supply's capacitors still hold is just physics */
    if (now >= 0 && now != prev_lit && !sourcing() && v12 < 0.8 * vout) lit_while_dead++;
    if (now >= 0 && prev_lit < 0 && !mains && t - dark_since > 0.05) flashes++; /* light out of a dark, switched-off lamp */
    if (now < 0 && prev_lit >= 0) dark_since = t;  /* remember when it went dark */
    prev_lit = now;
  }
  /* probes: at their scripted times, what a human sees must match the
   * expectation, or the scenario fails with this message: */
  while (sc->probe[next_probe].t > 0 && sc->probe[next_probe].t <= t) {
    const probe_t *p = &sc->probe[next_probe++];
    int seen = chip_running ? lit_color() : -1;  /* a dead chip shows nothing */
    if (seen != p->color) { probe_fail++; printf("      at %6.2f s: saw %s, expected %s  (12 V node %.2f V, VCC %.2f V)\n", p->t, cname(seen), cname(p->color), v12, vcc); }
  }
  /* scenario over? brown-out? — longjmp "rewinds" out of the firmware's
   * stack (any depth of main.c calls) back to the setjmp checkpoints below,
   * exactly like a real reset obliterates the CPU state. */
  if (sc->ev[next_ev].type == EV_END && t >= sc->ev[next_ev].t) longjmp(end_jb, 1);
  if (chip_running && vcc < 2.7) longjmp(reset_jb, 1); /* brown-out reset */
}

/* sim_wait(): the stand-in <util/delay.h> calls this. Advance the world in
 * 0.5 ms slices so no physics event can be missed, until the requested
 * delay has "elapsed" (in model-time, not PC-time). */
void sim_wait(double s) {
  while (s > 0) { double h = s < 5e-4 ? s : 5e-4; step(h); s -= h; }
}
/* sim_sleep(): the stand-in <avr/sleep.h> fast-forwards one watchdog tick
 * (32 ms) with the firmware marked asleep — so C5 drains at the 12 µA
 * rate instead of the 0.8 mA awake rate. */
void sim_sleep(void) { asleep = 1; sim_wait(32e-3); asleep = 0; } /* until the next watchdog tick */

/* sim_adcsra(): called whenever main.c touches ADCSRA. The clever part:
 * while a conversion is pending (ADSC still set in the returned byte), a
 * READ is answered here by finishing it — computing what the ADC would
 * measure from the model's voltages, selecting the input main.c asked for
 * via ADMUX's low bits: */
volatile uint8_t *sim_adcsra(void) {
  if (adcsra & (1u << 6)) { /* ADSC: a conversion */
    uint8_t mux = ADMUX & 0x0F;    /* which input was selected? */
    double v = 0;
    if (mux == 3) {                /* ADC3 = PB3 = the 12 V through R2/R3 (33k/133k) */
      v = v12 * 33.0 / 133.0;
      if (t < noise_until && (noise_hits++ & 1) == 0) v += 3.0; /* interference: every other reading is hit */
    }
    if (mux == 1) {                /* ADC1 = PB2 = the MODE divider — and C8 must settle first */
      double settle = 1 - exp(-(t - t_power) / 5e-3); /* C8 charging through R4‖R5 */
      v = sc->mode == MODE_STEP ? vcc / 2 * settle : sc->mode == MODE_MEMORY ? vcc * 0.0099 : vcc * 0.990;
    }
    if (mux == 12) v = 1.1;        /* the internal 1.1 V bandgap (for vcc_mv()) */
    double raw = v / vcc * 1024;   /* the ADC measures against VCC — 10-bit, as the real one does */
    adc_result = (uint16_t)(raw > 1023 ? 1023 : raw < 0 ? 0 : raw);   /* clamp to 0..1023 */
    adcsra &= (uint8_t)~(1u << 6); /* conversion done: ADSC clears itself, like the real register */
    sim_wait(100e-6);              /* a conversion costs ~0.1 ms of model-time */
  }
  return &adcsra;                  /* hand back the address of the (model's) ADCSRA */
}
uint16_t sim_adc(void) { return adc_result; }   /* the stand-in ADC data register */

/* the fake EEPROM: same signatures as avr-libc, backed by the array above.
 * A real write takes ~3.4 ms and wears the cell — the model charges the
 * time and counts the writes, because how OFTEN the firmware writes is
 * part of what the tests judge. */
uint8_t eeprom_read_byte(const uint8_t *a) { return eeprom[(uintptr_t)a & 511]; }
void eeprom_update_byte(uint8_t *a, uint8_t v) {
  uintptr_t i = (uintptr_t)a & 511;
  if (eeprom[i] == v) return;      /* real "update": skip identical writes (the wear saver) */
  eeprom[i] = v;
  if (v != 0xFF) saves++;          /* count it only when it lands a real record */
  sim_wait(3.4e-3);                /* the write time */
}

/* ── run(): play one scenario start to finish ─────────────────────────── */
static int passed, failed;
static void run(const scenario_t *s, bool fresh_eeprom) {
  sc = s;                                      /* the step() functions read the scenario through `sc` */
  t = 0; v12 = 0; vcc = 0; t_power = -1;       /* reset every state variable to "the world just began" */
  mains = 0; asleep = 0; chip_running = 0; boots = 0; two_colors = 0; lit_while_dead = 0; saves = 0; flashes = 0; dark_since = 0;
  start_at = stop_at = 1e9; ramp_start = 0; running = false; glitch_until = -1; noise_until = -1; revive_from = revive_until = -1; vout = s->vout; prev_lit = -1;
  next_ev = 0; next_probe = 0; probe_fail = 0; /* rewind the script and its probes */
  if (fresh_eeprom) memset(eeprom, 0xFF, sizeof eeprom);  /* brand-new EEPROM: every byte erased (0xFF) */
  PORTB = 0;                                   /* no outputs yet */
  if (!setjmp(end_jb)) {                       /* checkpoint: "scenario over" longjmps back here */
    for (;;) {                                 /* the chip's power-cycles: as many as physics demands */
      if (!setjmp(reset_jb)) {                 /* checkpoint: "brown-out" longjmps back here — this is the chip restarting */
        chip_running = 0; PORTB = 0; DDRB = 0; /* unpowered: outputs float, nothing is driven */
        while (vcc < 2.75) sim_wait(1e-3);     /* unpowered: wait for VCC to reach 2.75 V */
        sim_wait(64e-3);                       /* start-up delay (fuses): ~64 ms from power-good to first instruction */
        if (vcc < 2.75) continue;              /* it died again during the delay: start over */
        chip_running = 1; boots++;             /* now it is really running: */
        firmware_main();                       /* ← the REAL firmware, from its first line. It "never returns";
                                                 it returns here only via longjmp — a reset (below) or the end */
      }
    }
  }
  /* the verdict: every observation must be clean AND the EEPROM writes must
   * match. `ok ? passed++ : failed++` is the branchless idiom for counting. */
  bool ok = probe_fail == 0 && two_colors == 0 && lit_while_dead == 0 && (s->saves_expected < 0 || saves == s->saves_expected) &&
            (s->flashes_allowed < 0 || flashes <= s->flashes_allowed);
  ok ? passed++ : failed++;
  printf("  %s  %s\n", ok ? "✓" : "✗ FAIL", s->name);
  /* …and each violated observation gets its own explaining line: */
  if (two_colors) printf("      two colours lit at once (%d steps)\n", two_colors);
  if (lit_while_dead) printf("      a colour came ON after the 12 V had sagged (%d times)\n", lit_while_dead);
  if (s->flashes_allowed >= 0 && flashes > s->flashes_allowed) printf("      light appeared %d times with the switch off\n", flashes);
  if (s->saves_expected >= 0 && saves != s->saves_expected) printf("      %d colours saved to EEPROM, expected %d\n", saves, s->saves_expected);
}

/* ── script-building macros: keep the scenario table readable ─────────── */
#define ON(x) { x, EV_ON, 0 }     /* wall switch ON at t=x … */
#define OFF(x) { x, EV_OFF, 0 }   /* … OFF at t=x … */
#define END(x) { x, EV_END, 0 }   /* … scenario ends at t=x */
enum { B = COLOR_BLUE, W = COLOR_WHITE, Y = COLOR_YELLOW, DARK = -1 };  /* short aliases for probe expectations */
/* the supply's personality: hold-up (s), ramp (s), output capacitance; it
   starts 0.3 s after the switch closes and gives 11.65 V at the 12 V node
   (12 V − D1) — one macro so every scenario states its supply in one line: */
#define PSU(h, r, c) .hold = (h), .ts = 0.3, .ramp = (r), .cout = (c), .vout = 11.65
/* "standard supply": 100 ms hold-up, 20 ms ramp, 1470 µF of output caps: */
#define STD PSU(0.1, 0.02, 1470e-6)

/* ── the test scenarios, each a sentence of English turned into a script:
 * the events (2nd column) are what happens to the lamp; the probes (3rd)
 * are what a human must see at those times; the last two numbers check the
 * EEPROM write count and how often light may appear while switched off. */
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
  for (size_t i = 0; i < sizeof scenarios / sizeof *scenarios; i++) run(&scenarios[i], true);  /* play each with a fresh EEPROM */
  printf("RESULT: %d passed, %d failed\n", passed, failed);
  return failed != 0;              /* the exit code is run.sh's success signal */
}
