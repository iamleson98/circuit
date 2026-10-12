//! Tri-color lamp firmware — the Rust counterpart of
//! `tricolor-lamp/firmware/tricolor_lamp/`.
//!
//! The C firmware splits "decisions" from "hardware", and so does this
//! crate — the split is what makes the code testable, in either language:
//!
//! | C (avr-libc)                        | Rust (this crate)           |
//! |-------------------------------------|-----------------------------|
//! | `lamp.c` — decisions (pure maths)   | [`logic`] — same functions  |
//! | `lamp.c` — the EEPROM journal +     | [`journal`] — with the      |
//! | `store_t` function pointers         | [`journal::Store`] trait    |
//! | `main.c` — registers, ADC, PWM,     | [`firmware`] — generic over |
//! | sleep (welded to the chip)          | [`firmware::LampHal`]       |
//! | `<avr/io.h>` register names         | the `avr-device` crate, in  |
//! |                                       the flash image only         |
//! |                                       (src/bin/tricolor_lamp.rs)  |
//!
//! Because the hands are a TRAIT here, the whole firmware — not just the
//! decisions — runs on a PC: tests/lamp_sim.rs plugs it into a model of
//! the lamp's electronics (the Rust counterpart of the C project's
//! sim_firmware.c + sim_avr/ stand-in headers), replays the same 15
//! scenarios, and demands the same colours, the same EEPROM writes and
//! the same "no light while switched off" guarantees.

#![no_std]

pub mod firmware;
pub mod journal;
pub mod logic;
