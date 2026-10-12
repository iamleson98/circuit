//! Arc-lighter firmware — the Rust counterpart of `arc-lighter/firmware/arc_lighter/`.
//!
//! The C firmware splits in two, and this crate keeps the exact same split
//! (it is the split that makes the code testable, and it is worth seeing it
//! survive the language change):
//!
//! | C (avr-libc)                     | Rust (this crate)              |
//! |----------------------------------|--------------------------------|
//! | `lighter.c` — safety decisions   | [`logic`] — same state machine |
//! | `main.c`   — registers & timers  | [`firmware`] — generic over a  |
//! |                                    hardware trait, [`firmware::    |
//! |                                    LighterHal`]                   |
//! | `<avr/io.h>` register names       | the `avr-device` crate, used   |
//! |                                    only by the flash image         |
//! |                                    (src/bin/arc_lighter.rs)       |
//!
//! * [`logic`] contains every safety decision and no hardware at all —
//!   `no_std`, dependency-free, pure. The same code is unit-tested on a PC
//!   (tests/) and runs on the ATtiny85, byte for byte, like `lighter.c`
//!   is compiled by both `cc` and `avr-gcc`.
//! * [`firmware`] is the chip's hands: it samples the world once per 10 ms
//!   tick, asks [`logic`] for a verdict, and applies it. In C those hands
//!   were soldered to the registers (`PORTB`, `ADMUX`…); here they are
//!   generic — `firmware::run<H: LighterHal>` works against ANY hardware
//!   that implements the trait. The ATtiny85 backend is one
//!   implementation; the test simulator (tests/lighter_firmware.rs) is
//!   another. That is how the *whole* firmware gets tested on a PC,
//!   something the C version only achieved for the lamp (with a stand-in
//!   header suite); here it costs one trait.
//!
//! Build/test/flash commands live in the workspace README.

#![no_std]

pub mod firmware;
pub mod logic;
