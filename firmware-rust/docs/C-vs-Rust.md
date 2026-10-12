# C vs Rust, on real firmware — a working comparison

You asked the practical question: *I want to see the difference between
writing Rust and C, so I can decide what to use for my career.* The honest
way to answer it is not with slogans but with the same firmware written
twice, verified the same way, built for the same chip — which is exactly
what [`firmware-rust/`](../) now is. This document walks through every
layer where the two languages actually diverged, with the real numbers at
the end. No marketing in either direction.

The method mattered as much as the code: the Rust was **not** transliterated.
Each module was re-designed the way Rust wants it, then held to the C's own
test suites (same scenarios, same trip points, same expected numbers). If a
test had failed, either the port or the original would have been wrong —
parity is falsifiable, not vibes.

## 1. The one-screen dictionary

| layer | C (avr-libc) | Rust (here) | what changed |
|---|---|---|---|
| chip registers | `<avr/io.h>` macros: `PORTB`, `_BV(PB4)` | `avr-device` PAC: `dp.PORTB.portb.modify(\|_, w\| w.pb4().set_bit())` | every bit has a name, a type, and a checked accessor |
| board wiring | welded into `main.c` | a **trait** (`LighterHal`/`LampHal`) the firmware is generic over; the chip is one backend, the test simulator another | the firmware layer became testable *by construction* |
| decisions | `lighter.c` / `lamp.c`, pure functions + int enums | `logic.rs` (+ `journal.rs`), real enums, `Option` returns | invalid values became unrepresentable |
| persistence | `store_t` — two function pointers | `Store` — a trait, monomorphized to direct calls | same idea, checked at compile time |
| interrupts | `ISR(TIMER1_COMPA_vect)`, `cli()/sei()` | `#[avr_device::interrupt(attiny85)]`, `interrupt::free(\|_\| …)`, `AtomicU8` | the "this is atomic" promise moved from comments into types |
| tests | host-compile the logic (`run.sh`); stand-in avr headers + `setjmp/longjmp` to run all of `main.c` | the *same firmware*, generic over the trait, runs on a PC; panics + `catch_unwind` replace longjmp | whole-firmware testing became free |
| build | Makefile + avr-gcc + avrdude | Cargo + rustc(nightly, `avr-none`) + avr-gcc + avrdude | one tool does deps, features, profiles, tests — see §7 |

## 2. State machines: the compiler joins the design review

The arc lighter is a safety device, so it is a state machine. The C keeps
its states in an `int` enum and three "watch" counters as loose struct
fields that only *mean* something while firing:

```c
typedef enum { ST_IDLE, ST_FIRING, ST_WAIT_RELEASE } lighter_state_t;
typedef struct {
  lighter_state_t state;
  uint16_t fire_ms, window_ms, window_pulses, low_ms;   /* only valid in ST_FIRING… by convention */
  ...
} lighter_t;
```

Rust puts the watches **inside the state that owns them**
([`arc-lighter/src/logic.rs`](../arc-lighter/src/logic.rs)):

```rust
enum State {
    Idle,
    Firing { fire_ms: u16, window: OscWindow, low_ms: u16 },  // born on entry,
    WaitRelease,                                              // destroyed on exit
}
```

Now "reading `fire_ms` while IDLE" is not a bug you hope not to write — it
is a sentence the compiler rejects. Re-entering `Firing` *constructs* fresh
watches; the C had to remember to zero them by hand (and did, correctly —
but the next maintainer has to keep remembering).

The same force shows up at every `match`: C's `switch` silently ignores a
missing case; a Rust `match` must be exhaustive, so adding a state later
breaks the *build* until every handler copes. With a device that can make
10 kV arcs, "the compiler checks the state machine's totality" is not
academia — it is one less class of field failure.

The lamp's colour rules got the same treatment: C represented colours as
`uint8_t` 0..2 and defended every use with `saved >= NCOLORS` guards. Rust
represents them as `enum Color`; the guard simply **vanished** because the
invalid case is unrepresentable ([`tricolor-lamp/src/logic.rs`](../tricolor-lamp/src/logic.rs)).

## 3. Out-parameters vs values

C returns several things by writing through pointers — and every such call
carries invisible questions: *is the pointer null? Which fields are valid
when it returns false?*

```c
bool journal_load(const store_t *s, uint8_t *color, uint16_t *slot);   /* C */
```

The same contract in Rust is a type:

```rust
pub fn load<S: Store>(store: &mut S) -> Option<Record>;   /* Record { color, slot } */
```

`Option<Record>` cannot be passed null, and the "found / not found"
distinction lives in the type, not in a bool plus two maybe-written
addresses. This single change deleted an entire *genre* of C bug from the
journal, the tests, and the firmware — and it is why the port reads
smaller than the original in several places.

## 4. Dependency injection: function pointers vs traits

The lamp's journal talks to memory through `store_t` — a struct of two
function pointers. Real EEPROM here, a plain array in the tests. That is
dependency injection, 1970s style: resolved at runtime, unchecked, and it
costs an indirect call per access.

```c
typedef struct {
  uint8_t (*read)(uint16_t);
  void (*write)(uint16_t, uint8_t);
} store_t;
```

Rust's version is a trait ([`journal.rs`](../tricolor-lamp/src/journal.rs)).
The same three implementations exist (chip EEPROM, test array, the
simulator's time-charging EEPROM) — but the compiler *monomorphizes* the
calls: on the ATtiny85 they become direct register accesses, zero
indirection, zero cost for the abstraction. And a type that doesn't
implement `Store` cannot even be passed in; in C, passing the wrong
function-pointer shape compiles fine and fails at 3 a.m.

This one pattern is the heart of "the Rust difference" in embedded: the
hardware seam (`LighterHal`, `LampHal`) that makes whole-firmware testing
free on a PC is *the same mechanism* as the store. In C, each seam was a
separate trick — `run.sh`'s dual-compile, `sim_avr/`'s stand-in headers,
`store_t`'s pointers. In Rust they are all just traits.

## 5. Interrupts and shared state

`main.c` shares `tick_flag` between a timer ISR and the main loop. C:

```c
static volatile uint8_t tick_flag;   /* "an 8-bit access is atomic on AVR" — trust me */
```

That comment is *correct* — and it is the kind of correctness that lives
only in comments. Rust says it in the type
([`arc_lighter.rs`](../arc-lighter/src/bin/arc_lighter.rs)):

```rust
static TICK_FLAG: AtomicU8 = AtomicU8::new(0);   /* same single-instruction st/ld */
```

`AtomicU8` with `Relaxed` orderings compiles to exactly the same `ld`/`st`
— no lock, no overhead — but the promise is now checkable, and the
snapshot-and-reset race in `take_pulses()` (C: a careful `cli()/sei()`
block) is `interrupt::free(|_| { … })`, which restores the *previous*
interrupt state instead of blindly re-enabling — a subtle improvement over
the C that costs nothing.

The empty-wake-up ISR is a tale worth keeping: the lamp's C defines
`EMPTY_INTERRUPT(WDT_vect)` — a handler that does nothing, whose only job
is to exist so the CPU can resume from power-down. Porting to Rust, I
initially forgot it. Nothing caught it — no compiler in either language
can know that the watchdog vector is load-bearing. I caught it by
re-reading the C against my port, line by line. **The lesson for your
career: the language changes what classes of bug are *possible*; no
language removes the need to read the original like a contract.**

## 6. Testing: the biggest practical gap

This is where the two projects diverged the most, and it is the strongest
argument for Rust in embedded.

**C:** testing the *decisions* was easy — they are plain functions, so
`run.sh` compiles `lighter.c`/`lamp.c` with a PC compiler. Testing the
*whole firmware* meant faking the chip: `sim_avr/` redefines every avr-libc
header so `PORTB` becomes a global variable, and `sim_firmware.c` kills and
restarts the firmware with `setjmp/longjmp` to simulate brown-outs. It is
genuinely clever — and it is per-project scaffolding: the arc lighter never
got it (its `main.c` went to the chip untested).

**Rust:** because the firmware is generic over a trait, the simulator is
*just another backend*. `tests/lamp_sim.rs` ports the C model — the same
physics, the same 15 scenarios, the same probes — and runs the real
`firmware::run()` against it; brown-outs and scenario-ends are panics that
`catch_unwind` turns into control flow (the moral equivalent of the
longjmp, but with destructors run on the way out). `tests/lighter_firmware.rs`
then goes *further than the C ever did*: the lighter's wiring — debounce
feeding the tick loop, gate polarity, sleep decisions — is checked on a PC
for the first time.

One concrete catch during the port proves the workflow: the C `main.c`
lamp comment claims "pin HIGH = gate off" — while its own code, its own
simulator, and the board all treat bit-SET as channel-ON. Comments rot;
the 15 replayed scenarios don't. Every ported test is now a machine that
keeps the truth honest.

## 7. Toolchain and build — the honest ledger

The C build is a Makefile: 40 lines, transparent, 1976-vintage, zero
surprises. Rust's is Cargo: dependencies, features, profiles and tests in
one tool — but on AVR today you pay a complexity tax. What the flash images
actually required here:

- **C:** `apt install gcc-avr avr-libc` (or any vendor toolchain) and `make`.
- **Rust:** a **nightly** toolchain (`avr-none` is new; `rustup target add`
  cannot even serve it — you build `core` from source with
  `-Z build-std=core`), `rust-src`, a feature gate for the interrupt ABI,
  and avr-gcc *anyway* as the linker. Plus Cargo quirks: target-gated
  dependencies so host tests don't compile the PAC; a release profile with
  `panic="abort"`, `opt-level="s"`, LTO, one codegen unit to fit 8 KB.

That is the real state of Rust-on-AVR in 2026: workable, improving fast,
and still visibly younger than avr-gcc. On ARM Cortex-M the story inverts —
`rustup target add thumbv6m-none-euphf` (pre-built std) and `probe-rs`
flashing make Rust *smoother* than the C vendor workflows there.

## 8. Size and speed — no spin

Measured, same chip, same optimisation intent (`-Os` vs `opt-level="s"` +
LTO), both linking their own runtime:

| flash image (ATtiny85, 8 KB flash) | C | Rust | ratio |
|---|---|---|---|
| `arc_lighter` | **1174 bytes** (14.3 %) | **2746 bytes** (33.5 %) | 2.3× |
| `tricolor_lamp` | **2056 bytes** (25.1 %) | **3826 bytes** (46.7 %) | 1.9× |
| RAM: lighter / lamp | 2 / 8 bytes | 3 / 17 bytes | small, both irrelevant |

Rust on an 8-bit target is roughly **2× larger**. The causes are concrete:
the PAC's typed accessors expand to more setup than a bare `out` instruction,
generics instantiate per-type, `delay_cycles` loops are wider than C's
3-cycle `_delay_loop_1`, and panic/abort machinery plus formatting pull in
bytes C never spends. Both images fit with room to spare — but on an 8 KB
part, 2× is a tax that compounds with every feature. On a 32-bit part with
256 KB flash, the same tax shrinks to noise, and Rust's *other* savings
(no whole classes of defect, cheaper refactoring, tests as a first-class
citizen) start to dominate. Speed on these chips is a non-issue — the
firmware is idle 99.9 % of the time by design.

## 9. So, which for your career? — a decision rule, not a verdict

**Learn C first, seriously.** Not as a fallback — as the *lingua franca*.
Every datasheet, every vendor SDK, every app note, every existing product
you will maintain is C-shaped. The register-level literacy you build in C
transfers directly: in this very port, the Rust backend was written by
reading the ATtiny85 datasheet through avr-libc's headers — the C
knowledge *was* the research method. Embedded interviewers will ask you to
read a schematic and talk about registers; that skill looks identical in
both languages.

**Then add Rust where it pays.** Use it when correctness is expensive
(safety logic, anything that can burn or charge or fly), when the codebase
will outlive its authors, and when you want whole-firmware CI testing like
this repo now has. The industry trajectory is real — Rust is in
production at scale in automotive, aerospace, and cloud infra, and
embedded-hal means drivers written once work across chip families. Rust
jobs skew toward newer, larger, safety-conscious teams; C jobs are
everywhere, forever, especially in maintenance and small-parts work.

**The actual decision rule I'd give a student:**
1. C to fluency — you must be able to read a datasheet and write the
   register code cold. That's the entrance exam to embedded, full stop.
2. Rust to productivity — because once you have felt "the invalid state
   is unrepresentable" and "the tests replay the physics", it is hard to
   go back to hoping.
3. And read both sides of this repo, side by side. That comparison —
   same circuit, same rules, same tests, two languages — is worth more
   than any blog post, because you can *diff* it.
