//! The tri-color lamp's decisions — the Rust counterpart of `lamp.c`
//! (part 1: the pure arithmetic; the EEPROM journal lives in [`crate::journal`]).
//!
//! Everything here is small pure functions: same inputs → same answer, no
//! hidden state, no "time" — time arrives as a number, exactly like the C.
//! That is what lets the same code be compiled for the chip AND for the PC
//! tests, in either language.
//!
//! WHERE THE RUST DIFFERS FROM THE C:
//! * The three colours were an anonymous enum of ints (`COLOR_BLUE = 0`).
//!   They are now [`Color`] — a real type. `saved >= NCOLORS` (the C's
//!   guard against garbage) is no longer expressible: a `Color` IS a valid
//!   colour by construction. The guard moved to where garbage can actually
//!   appear — the journal's record parser ([`crate::journal`]).
//! * Fractions stay fractions: `now * 8 < on_level * 7` — the C's
//!   overflow-avoiding `(uint32_t)` casts become plain `as u32` promotions
//!   that C needed and Rust would catch if they wrapped (debug builds
//!   panic on integer overflow instead of silently wrapping).

/// A shorter off than this is a supply hiccup, not you — keep the colour.
pub const GLITCH_MAX_MS: u32 = 150;
/// Up to this: a quick flip — next colour.
pub const QUICK_MAX_MS: u32 = 3_000;

/// Below this (≈ 9–10 V) it isn't a working 12 V supply.
pub const SUPPLY_MIN: u16 = 560;

/// The three colours the lamp can show (≡ `COLOR_*`). Order matters: it is
/// the stepping order blue → white → yellow → blue.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Color {
    Blue,
    White,
    Yellow,
}

impl Color {
    /// All colours, in stepping order (≡ `NCOLORS` as an array).
    pub const ALL: [Color; 3] = [Color::Blue, Color::White, Color::Yellow];

    /// The colour after this one, wrapping (blue → white → yellow → blue).
    /// (≡ the C's `(saved + 1) % NCOLORS`.)
    pub const fn next(self) -> Color {
        match self {
            Color::Blue => Color::White,
            Color::White => Color::Yellow,
            Color::Yellow => Color::Blue,
        }
    }
}

/// The three positions of the MODE jumper soldered on the board
/// (≡ `MODE_STEP`, `MODE_MEMORY`, `MODE_RESET`).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mode {
    Step,
    Memory,
    Reset,
}

/// The three possible verdicts about an off period (≡ `off_kind_t`).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum OffKind {
    Glitch,
    Quick,
    Long,
}

// ── is the 12 V there? ──────────────────────────────────────────────────
// Each function is one comparison written as a FRACTION, so no floating
// point is needed (the ATtiny85 has none; integer maths is also exact, so
// the tests can pin the exact trip point). The trick: instead of
// "now < 7/8 × on_level" (a division), multiply both sides by 8:
// "now × 8 < on_level × 7" — exact, no rounding.

/// More than 1/8 below normal: the supply was switched off.
pub fn supply_dropped(now: u16, on_level: u16) -> bool {
    now as u32 * 8 < on_level as u32 * 7
}

/// Below 9/16 of normal: the supply has truly collapsed — now it is safe
/// to switch the LEDs off (they were helping drain the supply).
pub fn supply_dead(now: u16, on_level: u16) -> bool {
    now as u32 * 16 < on_level as u32 * 9
}

/// Within 3/32 of normal — a whisker above the "dropped" line, so the two
/// can't chatter back and forth in a grey zone.
pub fn supply_back(now: u16, on_level: u16) -> bool {
    now as u32 * 32 >= on_level as u32 * 29
}

/// The reading has moved less than 1/32 since the last one. The C needed a
/// ternary for the absolute difference; `u16::abs_diff` says it in one word.
pub fn supply_steady(now: u16, before: u16) -> bool {
    let d = now.abs_diff(before);
    d as u32 * 32 <= before as u32
}

// ── the MODE jumper ─────────────────────────────────────────────────────
// The ADC returns 0..1023; the board's resistors place the pin at one of
// three well-separated voltages, so two cuts split the range into thirds.

/// LO (jumper to GND, ≈0 V) → MEMORY; HI (to VCC, ≈1023) → RESET;
/// open (R4/R5 hold it at VCC/2) → STEP. (≡ `lamp_mode_from_adc`.)
pub fn mode_from_adc(adc: u16) -> Mode {
    if adc < 341 {
        Mode::Memory
    } else if adc > 682 {
        Mode::Reset
    } else {
        Mode::Step
    }
}

// ── how long was the power off? ─────────────────────────────────────────

/// A stopwatch reading becomes a verdict (≡ `lamp_classify_off`).
/// 150 ms / 3000 ms are the two borders; a cold boot (the chip itself
/// blacked out and restarted) can never prove how long the power was
/// gone, so it plays safe as "long".
pub fn classify_off(off_ms: u32, cold_boot: bool) -> OffKind {
    if cold_boot {
        return OffKind::Long;
    }
    if off_ms < GLITCH_MAX_MS {
        OffKind::Glitch
    } else if off_ms <= QUICK_MAX_MS {
        OffKind::Quick
    } else {
        OffKind::Long
    }
}

// ── the verdict → the colour you see ────────────────────────────────────
// This table IS the product spec, as code. Read it top to bottom.

/// The colour to show after a power-on (≡ `lamp_next_color`).
///
/// The C guarded `saved >= NCOLORS` here because its colours were raw
/// numbers and garbage could reach this function. With a typed [`Color`]
/// that case is unrepresentable — the journal only ever hands out valid
/// colours — so the guard is simply gone.
pub fn next_color(mode: Mode, kind: OffKind, have_saved: bool, saved: Color) -> Color {
    if !have_saved {
        return Color::Blue; // first power-up ever: blue
    }
    match kind {
        OffKind::Glitch => saved,       // not a flip
        OffKind::Quick => saved.next(), // every mode steps on a quick flip
        OffKind::Long => match mode {
            Mode::Step => saved.next(), // STEP: a long off still steps
            Mode::Memory => saved,      // MEMORY: come back in the same colour
            Mode::Reset => Color::Blue, // RESET: start from blue again
        },
    }
}
