# Chapter 10 — The brain: how the C code controls the chip

> **What you will be able to do afterwards:** read the `firmware/` folders of
> the Tri-Color Lamp and the Arc Lighter like a book — know what library the
> C is written against, what each module exposes and why it exists, what the
> `.sh` scripts and `Makefile`s actually *do* to the C files, and the deep
> part: what a microcontroller's "API" is, how a `.c` file becomes bytes in
> flash, how those bytes get into the chip, and what mechanism makes the
> chip *execute* them. Every claim is cross-referenced to real lines in the
> annotated source files, which are written as a novice-level commentary.

You have met the two drawings (schematic + PCB). This chapter is about the
third artifact every board carries: **the program**. Two of the five
projects in this repo have one — `tricolor-lamp/firmware/` and
`arc-lighter/firmware/` — and both were written so that a beginner can read
every line: the files now carry line-by-line comments written for someone
who has never written firmware.

No background is assumed. If you already know C from any course, you know
enough; the chapter re-explains the C itself (`static`, `volatile`, function
pointers) where it appears.

---

## 10.1 What a microcontroller actually is

A **microcontroller (MCU)** — "the brain chip" — is an entire computer
shrink-wrapped onto one piece of silicon:

| Part | Plain meaning | Size in the ATtiny85 |
|---|---|---|
| **CPU core** | the part that executes instructions, one after another | 8-bit, 1 MHz (a million simple steps per second) |
| **Flash** | the program's permanent home. Keeps its contents with power off. What you *flash* is written here. | 8 KB |
| **SRAM** | the scratchpad for variables. Blank at every power-up. | 512 bytes |
| **EEPROM** | a tiny notebook that keeps its contents with power off, writable *while the program runs* | 512 bytes |
| **peripherals** | hardware helpers welded next to the CPU: GPIO pins, timers, an ADC (voltmeter), the watchdog clock, the sleep machinery, SPI/ISP | — |

Two facts do most of the work in this chapter:

1. **There is no operating system.** When the ATtiny85 powers up, exactly
   one program exists — yours. When `main()` returns, nothing catches it.
   Every "service" other code would call an OS for, you address directly.
   This style is called **bare metal**.
2. **AVR is a Harvard architecture**: the program lives in flash, the data
   in SRAM, in two separate memories. (The consequences are hidden by the
   compiler and matter only in §10.7.)

The bigger sibling **ATmega32U4** (the μNode32U4 board's chip) is the same
idea with more of everything: 32 KB flash, 2.5 KB SRAM, 1 KB EEPROM, USB
hardware built in. Everything in this chapter applies to it identically —
same instruction set, same avr-gcc, same avr-libc.

---

## 10.2 The chip's API: registers

> "What API do those chips offer so the C code can interact with?"

This is the question that unlocks all firmware. The answer: **the chip
offers you a few hundred named, one-byte **registers**, and the datasheet
is the API documentation.**

A *register* is a byte-sized memory cell that is **wired to hardware**.
The CPU can read or write it like any variable — but writing it *does
something physical*, and reading it *reports something physical*.

The three most important registers, on one port (bank) of pins, are:

```
DDRB   direction:  bit = 1 → that pin is an OUTPUT,  0 → an input.   (write-only intent)
PORTB  output latch: what the pin should DRIVE, if it is an output.
                 As an input, writing 1 here turns on an internal ~35 kΩ
                 pull-up resistor to VCC — a "weak default high".      (read/write)
PINB   live pin state: what the outside world is actually doing to the
                 pin right now — high or low, input or output.          (read-only)
```

So `DDRB = 0b00010011; PORTB = 0;` means: "PB0, PB1, PB4 are outputs,
driven LOW; the rest are inputs." That pair of lines is GPIO — the entire
API for "turn a pin on and off".

**The registers of this repo's firmware, in one table** (each is
documented in the chip's datasheet, chapter by chapter):

| Register | Peripheral | What writing it does | Where you can watch it |
|---|---|---|---|
| `DDRB` `PORTB` `PINB` | GPIO | drive pins / read pins | both `main.c`s, first lines of `main()` |
| `ADMUX`, `ADCSRA`, `ADC` | ADC (voltmeter) | choose input + reference; start a conversion; read the 0..1023 result | `adc_read()` (lamp), `read_vcc_mv()` (lighter) |
| `TCNT0`, `TCCR0A/B`, `TIFR` | Timer0 | here: count *external pulses* on pin T0 at 2–50 kHz with zero CPU load | `take_pulses()` (lighter) |
| `OCR1A`, `TCCR1`, `TIMSK` | Timer1 | the 100 Hz "tick" interrupt that paces the lighter | `main()` (lighter), first lines |
| `WDTCR` | watchdog timer | re-tasked as a 32 ms alarm clock to wake the lamp from sleep | `wait_while_off()` (lamp) |
| `GIMSK`, `PCMSK` | pin-change interrupt | wake the chip when the FIRE button moves | `sleep_until_button()` (lighter) |
| `MCUSR`, `DIDR0` | housekeeping | "why did we reset?"; "disable unused digital input buffers" | `main()` (lamp) |
| the 3 fuse bytes | fuses | *not* registers in RAM: configuration bits in a separate memory, see §10.6 | both `Makefile`s, `make fuses` |

### Bit twiddling — the idiom you will see a hundred times

Registers are one byte = 8 switches, and each switch has a documented
name (`PB0`, `ADEN`, `WDIE`…). The code always manipulates them the same
three ways, using avr-libc's `_BV(b)` (= "bit value", a 1 shifted left `b`
places — so `_BV(3)` is `0b00001000`):

```c
PORTB |=  _BV(PB4);            /* set bit 4: pin HIGH — everything else untouched   */
PORTB &= (uint8_t)~_BV(PB4);   /* clear bit 4: pin LOW                              */
if (PINB & _BV(PB3)) {}        /* test bit 3: is the live pin high right now?       */
```

`x |= mask` (OR-in) sets; `x &= ~mask` (AND-out) clears; `x & mask` tests.
That's the whole grammar — see `led_on()` / `gate_off()` for live examples.

### Interrupts: the chip calling *you*

An **interrupt** is the peripheral raising its hand: "the event you armed
me for just happened — jump here *now*." You register a handler by defining
a function with avr-libc's `ISR(VECTOR)` macro; its address lands in the
chip's **vector table** (a list of jump targets at the very start of
flash). While the handler runs, the main program is paused. Two rules keep
this sane:

* **keep handlers tiny** — in this repo they set a flag or bump a
  counter: `ISR(TIMER1_COMPA_vect) { tick_flag = 1; }`
* **shared with the main program ⇒ `volatile`** — it forbids the compiler
  from caching the variable in a register. `static volatile uint8_t
  tick_flag;` in the lighter's `main.c` has a comment explaining exactly
  this. Without it, `while (!tick_flag)` could spin forever on a stale
  copy even though the ISR wrote the real byte.

`sei()` / `cli()` are the global on/off switch for *all* interrupts
(set/clear the I bit in the status register) — one instruction each.

---

## 10.3 The library: avr-libc — and what each module exposes

> "What lib/framework is used to write those C code? What feature does each
> C module expose, and why is it needed?"

The framework is **avr-libc** — the standard C library for AVR chips,
maintained next to avr-gcc. It is deliberately thin. There is **no
Arduino** here: no `digitalWrite()`, no `Serial.begin()`, nothing between
you and the registers. What avr-libc adds on top of "just C" is:

* **one header per peripheral**, turning datasheet chapters into
  compile-time names: `<avr/io.h>` (all registers and bit names — which
  chip's set you get is chosen by the Makefile's `-mmcu=`), `<avr/sleep.h>`,
  `<avr/wdt.h>`, `<avr/eeprom.h>`, `<avr/interrupt.h>`, `<util/delay.h>`…
* **calibrated busy-waits** (`_delay_ms`) — possible only because the
  build tells it the clock rate via `-DF_CPU`;
* **the startup code** (`crt`) that runs before `main()` — see §10.7.

### Why the firmware is split into modules — and what each exposes

Both projects use the **same two-layer split**, and both `main.c`s open
with a comment explaining it in their own words:

```
   main.c        = hands and eyes  (chip registers, timing, sleep)
   lamp.c /      = the decisions   (pure C, no hardware words in it at all)
   lighter.c
```

The reason is **testability**, and it is worth saying plainly: the
decisions are where the bugs live, so the decisions are written where a PC
compiler can reach them and *unit-tested like any other C*. The hardware
layer is what differs between "in the chip" and "in a test", so it is kept
as thin as possible.

Module by module — this is the "what does each file expose and why" map:

**Tri-Color Lamp (`firmware/tricolor_lamp/`)**

| File | Exposes (its public API) | Why it is needed |
|---|---|---|
| `lamp.h` | the *contract* only: the colour/mode enums, the thresholds, the four `lamp_supply_*` questions, `lamp_classify_off`, `lamp_next_color`, and the `store_t` memory-toolbox type | lets `main.c` and the tests share one set of promises without sharing code |
| `lamp.c` | all the *decisions*: supply verdicts from ADC numbers, the mode-jumper reader, the glitch/quick/long classifier, the colour rule table, the wear-levelled EEPROM journal | the entire product spec, in plain C — 100% unit-testable |
| `main.c` | nothing to other files — only `main()`. Talks to the chip: ADC conversions, software PWM fade, watchdog sleep, the ON/OFF stopwatch loop | the only file that knows a chip exists; swapped for a simulation in the tests |
| `Makefile` / `platformio.ini` | two alternative *build front-ends* (§10.5) | turn the sources into flash-able bytes |

**Tri-Color Lamp tests (`firmware/test/`)**

| File | Exposes | Why |
|---|---|---|
| `test_lamp.c` | `main()` = 33 unit cases against `lamp.c`, incl. a fake EEPROM that counts writes and simulates power cuts | proves the decisions and the journal's crash-safety |
| `sim_avr/avr/*.h` | **stand-in headers**: the same names as avr-libc's, but each register becomes a plain variable / macro that calls into the simulator | trick that lets the *unchanged* `main.c` run on a PC (§10.8) |
| `sim_firmware.c` | a physics model of the lamp: power supply, LEDs, the 220 µF reservoir, brown-outs — plus 15 scripted wall-switch scenarios | runs the *real* firmware against realistic electronics, incl. resets mid-write |
| `run.sh` | the two-step build: compile tests; compile `main.c` against `sim_avr/` and link it into the simulator | one command, any C compiler |
| `mutation_test.py` | 12 realistic planted bugs; each must be *caught* by the tests | proves the tests are actually strong enough (§10.8) |

**Arc Lighter (`firmware/arc_lighter/` + `firmware/test/`)** — the same
pattern with a smaller footprint:

| File | Exposes | Why |
|---|---|---|
| `lighter.h` | tunables, blink codes, the 3-state machine's enum, `lighter_in_t`/`out_t`/state structs, `lighter_init` + `lighter_tick` | the safety contract |
| `lighter.c` | the safety state machine: debounce, USB lockout, coil-fault window, low-battery accumulator, 8 s limit, blink patterns | every safety rule in one auditable `switch` |
| `main.c` | `main()` only: 100 Hz Timer1 heartbeat, hardware pulse counting on T0, ADC cell voltage, pin-change wake-up, deep sleep | the hands |
| `test/test_lighter.c` + `test/run.sh` | 28 cases driving `lighter_tick()` with scripted worlds | proves the safety rules without a chip |

---

## 10.4 How the C controls the circuit — end to end

> "In general I want to understand how those C files control the circuit."

Follow one deliberate action from thought to copper, in the lamp
(`fade_in()` in `main.c`, annotated there line by line):

1. **Decision** (pure C, in `lamp.c`-land): after a quick flip, show the
   *next* colour → `lamp_next_color()` returns `COLOR_WHITE`.
2. **Software** (in `main.c`): `PORTB |= led_pin[color]` — OR the pin's bit
   into the output latch. One machine instruction, ~1 µs.
3. **Pin** (chip silicon): the pin driver in the ATtiny85 connects the pad
   to VCC through a transistor ~25 Ω strong. PB1 is now driven HIGH.
4. **Board** (the schematic you can read from chapter 1): PB1 → R10
   (100 kΩ) → the MOSFET Q_n's gate. The gate charges HIGH, the MOSFET's
   channel opens.
5. **Power** (the PCB you can read from chapter 2): the 12 V rail flows
   through six LED strings (each 3 LEDs + 150 Ω) whose copper is a trace
   on the LED panel board. Light.

Reading inputs is the same chain walked backwards: physics → pin →
`ADMUX`/`ADCSRA`/`ADC` registers → a 0..1023 number → a decision. The
firmware never "knows" about the MOSFET; it knows a pin bit. The schematic
is what connects the pin bit to the physical world. **That is the entire
contract between the two drawings and the code.**

The arc lighter adds the show-piece of input handling: its Timer0 is
configured (`TCCR0B`) to count *external rising edges on pin T0* — so the
coil's feedback winding, buzzing at 2–50 kHz, is counted *in hardware*
with zero CPU involvement. Firmware reads `TCNT0` like a taxi meter. At
1 MHz no software loop could sample that reliably — see
`take_pulses()` and its comments.

---

## 10.5 How compilation works — and what the Makefile does to the C

> "…build files of them and build, work procedures… what does the `.sh`
> and Makefile do toward the C source files?"

### The toolchain, front to back

```
 your.c files ──avr-gcc──▶ .elf ──avr-objcopy──▶ .hex ──avrdude──▶ the chip's flash
                (compile+link)    (extract pure    (text format     (erase flash,
                                  program bytes)   avrdude reads)   burn, verify)
```

`avr-gcc` is a **cross-compiler**: it reads C and emits AVR machine code
that *cannot run on your PC* — the PC's own compiler emits x86-64 instead.
"Cross" is the whole difference; the language, the warnings, the
optimisations are the same GCC you may know from Linux.

Inside that one `avr-gcc` command, four stages happen in order:

1. **preprocess** — literally text substitution: `#include` pastes the
   header in, `#define F_CPU 1000000UL` replaces a name with a number,
   `#if defined(BODS)` cuts unreachable code out *before* compiling.
2. **compile** — each `.c` becomes assembly, with all the flags applied:
   `-Os` (optimise for size — 8 KB of flash total), `-Wall -Wextra
   -Werror` (every warning is an error: firmware has no console to print
   a warning to later), `-mmcu=attiny85` (which instruction set, which
   registers exist, which memory layout).
3. **assemble** — assembly becomes object code, one blob per `.c`.
4. **link** — the blobs are joined; every call gets its final address;
   avr-libc is pulled in; and the **startup code (crt)** is placed first
   in flash. Output: an **ELF** file carrying symbols and debug info.

Then `avr-objcopy -O ihex` strips the ELF to *just the flash bytes* in
**Intel HEX** — an ancient, universal text format of `:LLAAAATT<bytes>CC`
lines (length, address, type, data, checksum) that every programmer tool
on earth understands. `make flash` never compiles anything — it moves
`.hex` bytes into the chip (§10.6).

### The Makefile — a rule engine, not a script

`make` is given a **dependency graph**, not a sequence. Each rule is:

```make
target: ingredients
⇥   shell command        # the ⇥ is a real TAB character — a Make law
```

and `make` re-runs a rule's commands only when an ingredient is **newer**
than the target. That is the entire value: `make flash` after editing one
file recompiles that file, re-links, re-extracts, re-flashes — and skips
everything else. Both Makefiles in this repo are annotated line by line
(the lamp's is the fuller tutorial); the arcs worth remembering:

* `tricolor_lamp.elf: main.c lamp.c lamp.h` — the `.h` is listed so that
  editing the *contract* also triggers a rebuild (make does not read
  `#include`s itself);
* `$<` = "the first ingredient", `$@` = "the target being built";
* `PROGRAMMER ?= stk500v1` — `?=` means "only if not given on the command
  line", so `make PROGRAMMER=usbasp flash` overrides one knob;
* the arc lighter's `MODULE ?= 0` → `-DMODULE=$(MODULE)`: **one source
  tree, two products** (`MODULE=1` compiles the coil monitor out for a
  sealed arc module) — chosen at build time by a preprocessor flag, read
  by `#ifndef MODULE` in `main.c`;
* `.PHONY: flash fuses clean` marks targets that are verbs, not files.

`platformio.ini` is the *same build* wearing a different front-end: a
form you fill in instead of rules you write; underneath it calls the same
avr-gcc and the same avrdude. Keep whichever you prefer.

### The `.sh` scripts — the *other* toolchain

Here is the twist that confuses everyone at first, so it gets its own
paragraph: **`run.sh` compiles the same C with your PC's normal compiler.**
It can do that because `lamp.c`/`lighter.c` never mention hardware. The
scripts are annotated line by line; in one breath each of them:

* `cd` to its own folder (so relative paths always mean the same thing),
* `set -e` (abort on the first failure — never run a stale binary),
* compile the logic + tests with `-Wall -Wextra -Werror -O1` into a
  temp directory (`mktemp`), `trap … EXIT` to clean it up,
* and — the lamp only — compile `main.c` a *second* time against the
  stand-in headers `sim_avr/`, renaming its `main` to `firmware_main`
  (`-Dmain=firmware_main`) so the simulator can own the real `main()`
  and call the firmware whenever its model of the chip powers up.

---

## 10.6 How flashing works — avrdude, SPI, and the fuses

> "…how flash work."

**ISP (In-System Programming)** is how these chips are loaded: the chip
stays soldered on its board, and a programmer talks to it over the 6-pin
ICSP header (VCC, GND, RESET, SCK, MISO, MOSI — the last three are the
**SPI** serial lines; J2 on both boards, drawn in their schematics). The
programmer here is "an Arduino running the *ArduinoISP* sketch", which is
why the default `PROGRAMMER` is `stk500v1` and `PORT` a serial device.

The dance `avrdude -c stk500v1 -P … -p attiny85 -U flash:w:file.hex:i`
performs, in order:

1. wiggle RESET — held LOW, the chip's CPU halts and a built-in *boot ROM*
   takes over the SPI pins (this loader is hard-wired in silicon and
   cannot be bricked by bad firmware);
2. read the **chip signature** — a factory ID; avrdude refuses to continue
   if it isn't an ATtiny85 (the wrong-chip guard);
3. **erase** flash (flash on AVR is written in pages and can only be
   cleared wholesale — that's why EESAVE exists, below);
4. **burn** the `.hex` bytes page by page, then **verify** by reading back
   and comparing.

### Fuses: three bytes that are *not* program

The **fuses** are configuration bits in a separate memory, written the
same way but usually once per chip (`make fuses`). They answer "how
should this chip *behave* at power-up?" — clock source, brown-out
threshold, whether the EEPROM survives a re-flash, whether the reset pin
is a reset pin. Ours, decoded in the annotated Makefiles:

| Fuse | Value | Meaning in these projects |
|---|---|---|
| `lfuse` | `0x62` | factory: 1 MHz from the internal 8 MHz RC oscillator ÷ 8 (`CKDIV8`). Slow enough to sip current; fast enough for everything here |
| `hfuse` (lamp) | `0xD5` | BODLEVEL 2.7 V; **EESAVE set** — re-flashing keeps the EEPROM (the lamp's colour memory survives firmware updates); SPIEN; RESET stays RESET |
| `hfuse` (lighter) | `0xDD` | same, but **EESAVE clear** — nothing needs to survive there, so a re-flash may erase the EEPROM |
| `efuse` | `0xFF` | no bootloader — the app starts at the reset vector on every power-up (§10.7) |

Reading fuse bit-patterns is a skill of its own; the ATDF/datasheet has
the tables, and both Makefiles decode ours bit by bit in comments.

---

## 10.7 What makes the chip *execute* the code — power-up, step by step

> "…what mechanism allows the code to be executed within the chip."

This is the deepest question of the set, and it has a concrete answer.
What follows is the **exact** sequence for these projects, every time the
lamp's supply comes back:

1. **Power-good.** VCC crosses the brown-out threshold (2.7 V). The BOD
   holds the CPU in reset until VCC is stable — this is what keeps a
   dying supply from executing garbage instructions.
2. **Reset vector.** The hard-wired reset logic loads the program counter
   from flash address 0x0000. In AVR, address 0 holds a jump to the start
   of code — placed there by the linker. *There is no OS to boot:* the
   next thing to run is already your program.
3. **Startup code (`crt`), supplied by avr-libc, runs before `main()`:**
   * zeroes the `.bss` section (all uninitialized globals — C guarantees
     they start at 0; *somebody* has to do it, and it isn't silicon);
   * copies `.data` initializers from flash to SRAM (C guarantees
     `int x = 5;` starts at 5 — but SRAM is blank at power-up, so the 5
     is *stored in flash* and copied over; this is the Harvard tax);
   * `main()` is called. If it returns, crt falls into an infinite loop —
     nothing else exists to return *to*.
4. **Your `main()`.** In these firmwares it immediately puts the hardware
   in a safe state (gate off, pull-ups on) *before* enabling anything —
   the first lines of both `main()`s, annotated in place.
5. **From then on, two things share the CPU:**
   * the **main loop** — in the lamp, a `for(;;)` that fades, watches,
     sleeps; in the lighter, a heartbeat loop paced by `tick_flag`;
   * **interrupts** — the hardware helpers in §10.2, which can pause the
     loop at *any* instruction boundary, run a tiny handler, and resume.
     All of the lighter's timing hangs on Timer1's 100 Hz interrupt; all
     of the lamp's stopwatch hangs on the watchdog's 32 ms wake-up.
6. **Sleep.** When there is nothing to do, both chips power almost all of
   themselves down (`set_sleep_mode(SLEEP_MODE_PWR_DOWN)`, ≈0.1–4 µA) and
   let an interrupt restart step 5's loop — see `wait_while_off()` and
   `sleep_until_button()`, each annotated with the why.

So the "mechanism that allows execution" is: *silicon reset logic →
reset vector → crt → your main() → loop + interrupts.* No loader, no OS,
no scheduler — just that chain, forever.

---

## 10.8 How it is all *proven*: the PC-side test rig

The part that makes this repo's firmware unusual is its evidence trail.
Three layers, each annotated:

1. **Unit tests** (`test_lamp.c` 33 cases, `test_lighter.c` 28 cases) —
   the decision layer driven case by case on your PC. The lamp's also
   simulates **power cuts mid-EEPROM-write** with a counting fake, and
   proves the wear-levelling: 100 000 colour changes cost each byte ≤
   1 600 of its rated 100 000 writes.
2. **Full-firmware simulation** (`sim_firmware.c`) — the *same, unmodified
   `main.c`* compiled against the stand-in headers in `sim_avr/`: the
   trick is that `#include <avr/io.h>` just reads whatever file that name
   resolves to, and `-Isim_avr` points it at the stand-ins, where each
   register is a plain variable the simulator watches. Fifteen scripted
   wall-switch scenarios then play real physics (supply hold-up, the
   220 µF reservoir, brown-outs) against it. `setjmp/longjmp` lets the
   model kill and restart the firmware mid-instruction — exactly what a
   real reset does, without the firmware's cooperation.
3. **Mutation testing** (`mutation_test.py`) — plants 12 realistic bugs
   (a wrong constant, a deleted check, a moved line) and demands the
   tests *catch every one*. Tests that pass on the real code but survive
   a bug are decorations; this layer proves they are not.

Run everything the way the project READMEs say:

```bash
cd tricolor-lamp  && npm run test:firmware && npm run test:mutants
cd ../arc-lighter  && npm run test:firmware
```

---

## 10.9 Where to see each concept in real code

| Concept | Annotated, in this repo |
|---|---|
| register-as-variable, `_BV` idiom | `tricolor_lamp/main.c` — `LED_PINS`, `leds_off()`, `led_on()` |
| ADC: choose input, start, wait, read | `adc_read()` (lamp), `read_vcc_mv()` (both) |
| measuring VCC via the 1.1 V bandgap | `vcc_mv()` (lamp) and `read_vcc_mv()` (lighter) — each annotated with the arithmetic |
| software PWM + why square-law fading | `pwm_period()`, `fade_in()` (lamp) |
| watchdog as a 32 ms alarm clock | `wait_while_off()` (lamp) |
| hardware pulse counting on T0 | `take_pulses()` (lighter) |
| a 100 Hz heartbeat interrupt | Timer1 block in the lighter's `main()` |
| `volatile` and why | lighter's `main.c`, `tick_flag`/`t0_overflows` declarations |
| deep sleep + pin-change wake-up | `sleep_until_button()` (lighter), `wait_while_off()` (lamp) |
| EEPROM journal + wear levelling | `lamp.c` §journal, `journal_load/save` |
| the state machine pattern | `lighter_tick()`'s `switch` |
| cross-compilation flags, `-Os`, `-Werror`, `gc-sections` | both Makefiles, CFLAGS blocks |
| `objcopy` → Intel HEX | both Makefiles, Rule 1 |
| avrdude + ISP + signature check | both Makefiles, `flash:` rules |
| fuses, decoded bit by bit | both Makefiles, `fuses:` rules |
| crt startup, `.bss`, `.data` | lamp Makefile, Rule 2's comments; §10.7 above |
| dual-targeting via stand-in headers | `sim_avr/*` (all seven annotated), `run.sh` |
| mutation testing | `mutation_test.py` |

---

## 10.10 Check yourself

Answers upside-down at the bottom of this file.

1. `PORTB |= _BV(PB4);` — what did that just do, and which register would
   you read to learn what the *outside world* is doing to PB4?
2. Why does the lighter count coil pulses with Timer0 in hardware instead
   of sampling the pin in a loop?
3. Your friend says "just add `Serial.println()` for debugging." Why is
   there no `Serial` here — and what *is* the debug channel these boards
   offer?
4. `make flash` after editing `lamp.h` only. Which files get recompiled,
   and why does the `.h` appear in the rule at all?
5. The lamp's `hfuse` keeps the EEPROM across re-flashing. Why does the
   lighter's not bother?
6. What runs between "power-good" and the first line of `main()` — and
   who wrote it?
7. Why can `test_lamp.c` test `lamp.c` on a PC, and why can the same
   `main.c` be *simulated* — what one trick makes that possible?

---

*Answers: (1) set the PB4 output-latch bit HIGH — drive the pin high if it
is an output; read **PINB** for the live pin. (2) The coil runs at
2–50 kHz; at 1 MHz a polling loop would miss edges and burn the whole CPU
— Timer0 counts them in silicon for free; `take_pulses()` snapshots it.
(3) No OS/framework is compiled in — bare metal; avr-libc gives registers
and delays, not drivers. The debug channel is the status LED: the blink
codes, e.g. "4 flashes = coil fault." (4) `lamp.c` and `main.c` are
recompiled and re-linked; the `.h` is an *ingredient* of the rule because
make does not read `#include`s — listing it makes contract edits trigger
rebuilds. (5) The lighter keeps no state across power loss; the lamp's
colour memory (the journal) must survive firmware updates — EESAVE. (6)
The reset vector jumps to avr-libc's **crt**: zero `.bss`, copy `.data`
from flash to SRAM, then call `main()`; written by the avr-libc authors,
linked in by avr-gcc. (7) `lamp.c` never mentions hardware; and `#include
<avr/io.h>` reads *whatever file that name resolves to* — `run.sh` compiles
`main.c` with `-Isim_avr`, so the stand-in headers replace the chip's
registers with simulator-backed variables while the source stays
identical.*

---

**Next:** nothing — this is the last chapter. From here, open either
`firmware/` folder and just read: every file now explains itself.
