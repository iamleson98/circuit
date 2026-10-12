# firmware-rust — the same two firmwares, again, in Rust

Rust counterparts of this repo's two C firmwares, written the way Rust wants
to be written (not transliterated), verified the same way the C was —
against the **C test suites themselves** — and built into real flash images
for the same ATtiny85 chips.

| | C original | Rust counterpart (here) |
|---|---|---|
| arc lighter | [`../arc-lighter/firmware/arc_lighter/`](../arc-lighter/firmware/arc_lighter/) | [`arc-lighter/`](arc-lighter/) |
| tri-color lamp | [`../tricolor-lamp/firmware/tricolor_lamp/`](../tricolor-lamp/firmware/tricolor_lamp/) | [`tricolor-lamp/`](tricolor-lamp/) |

**Why both?** So you can read the same firmware in two languages and decide
which you want in your career. The full comparison — line-by-line, with
honest numbers (including flash sizes) — is in
[`docs/C-vs-Rust.md`](docs/C-vs-Rust.md). The short version: the *decisions*
are identical (they are the product); the *guarantees* are not.

## Verification: what "working" means here

The C suites were not rewritten to make the port look good — they were
**replayed as-is** (same scenarios, same expected numbers, same trip points
like "376 vs 377"). If the C and the Rust ever disagree, one of them is
wrong, and these tests say which.

| suite | C result | Rust result |
|---|---|---|
| lighter logic (≡ `test_lighter.c`) | 28/28 | 28/28 — [`tests/lighter_logic.rs`](arc-lighter/tests/lighter_logic.rs) |
| lamp logic (≡ `test_lamp.c`) | 33/33 | 33/33 — [`tests/lamp_logic.rs`](tricolor-lamp/tests/lamp_logic.rs) |
| whole lamp firmware in a model of the electronics (≡ `sim_firmware.c`) | 15/15 | 15/15 — [`tests/lamp_sim.rs`](tricolor-lamp/tests/lamp_sim.rs) |
| whole lighter firmware, wiring and all | *(not attempted in C)* | 3/3 — [`tests/lighter_firmware.rs`](arc-lighter/tests/lighter_firmware.rs) |
| flash images for the ATtiny85 | both build (`make`) | both build (`cargo`, below) |

The last row is the one to dwell on. In C, testing `main.c` meant writing a
whole stand-in avr-libc header suite (`sim_avr/`) so the chip's registers
could become PC variables; the arc lighter's `main.c` was never tested at
all. In Rust the firmware layer is generic over a hardware trait
(`LighterHal` / `LampHal`), so "the simulator" is just a second
implementation of that trait — and the *whole* firmware, wiring included,
runs on a PC for free.

## Everyday commands (host — no chip needed)

```sh
cargo test                     # all 49 checks above; ≡ sh firmware/test/run.sh
cargo clippy --all-targets -- -D warnings   # zero warnings, enforced
cargo fmt --check
```

## Cross-compiling the flash images (≡ `make`)

Rust on AVR needs a nightly toolchain (the AVR backend is new) and the
`avr-gcc` linker (any avr-gcc ≥ 7 works; avrdude stays the flasher, as in C):

```sh
rustup toolchain install nightly
rustup component add rust-src --toolchain nightly
# get avr-gcc on your PATH (any source works; this repo used the Arduino one)

export RUSTFLAGS="-C target-cpu=attiny85"     # ≡ the Makefile's -mmcu=attiny85
cargo +nightly build --target avr-none -Z build-std=core --release

# produce .hex (≡ avr-objcopy in the Makefile) and flash (≡ make flash):
avr-objcopy -O ihex -R .eeprom target/avr-none/release/arc_lighter.elf arc_lighter.hex
avrdude -c stk500v1 -P /dev/ttyACM0 -b 19200 -p attiny85 -U flash:w:arc_lighter.hex:i
```

Fuses are a property of the *chip*, not the language — set them exactly as
the C project's `make fuses` does (same values; see each project's Makefile).

### Verified sizes (why the honest table matters)

| flash image | C (`-Os`) | Rust (`-Os`-equivalent) |
|---|---|---|
| `arc_lighter`  | **1174 bytes** (14.3 % of 8 KB) | **2746 bytes** (33.5 %) |
| `tricolor_lamp` | **2056 bytes** (25.1 %) | **3826 bytes** (46.7 %) |

Yes — Rust is roughly 2× larger on this 8-bit target. Both fit with room to
spare, but on an 8 KB part that ratio *will* eventually bite. That trade,
and every other, is discussed in [`docs/C-vs-Rust.md`](docs/C-vs-Rust.md).

## Layout (mirrors the C, one row per file)

```
arc-lighter/                 ≡ arc-lighter/firmware/arc_lighter/
  src/logic.rs                 lighter.c   — the safety brain (pure, no_std)
  src/firmware.rs              main.c      — the loop, generic over LighterHal
  src/bin/arc_lighter.rs       main.c's registers — the ATtiny85 backend (avr-device)
  tests/lighter_logic.rs       test_lighter.c
  tests/lighter_firmware.rs    (new: the whole firmware, on a PC)
tricolor-lamp/               ≡ tricolor-lamp/firmware/tricolor_lamp/
  src/logic.rs                 lamp.c part 1 — supply/mode/classify/colour rules
  src/journal.rs               lamp.c part 2 — the EEPROM journal (+ Store trait ≡ store_t)
  src/firmware.rs              main.c      — the lamp's life, generic over LampHal
  src/bin/tricolor_lamp.rs     main.c's registers — the ATtiny85 backend
  tests/lamp_logic.rs          test_lamp.c
  tests/lamp_sim.rs            sim_firmware.c + sim_avr/ — the electronics model, 15 scenarios
```

Build variants: `cargo build --features arc-lighter/module` ≡ the C's
`make MODULE=1` (a sealed arc module: no coil monitor).
