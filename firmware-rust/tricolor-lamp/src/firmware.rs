//! The lamp's hands — the Rust counterpart of `tricolor_lamp/main.c`.
//!
//! The C main.c is ~200 lines welded to the ATtiny85's registers; testing
//! it on a PC took a whole stand-in avr-libc header suite (`sim_avr/`) and
//! a setjmp/longjmp harness (sim_firmware.c). Here the same firmware is
//! one generic function, [`run`], over the [`LampHal`] trait — the
//! simulator in tests/lamp_sim.rs is just another backend, and the
//! ATtiny85 build (src/bin/tricolor_lamp.rs) is the third. The life of the
//! lamp — boot, fade in, watch the 12 V, time the off, decide the colour —
//! is unchanged; only the hands are different.
//!
//! HOW IT NOTICES THE SWITCH (unchanged from the C): a supply that was
//! just switched off doesn't drop to 0 V at once — it holds, then sags.
//! While on, the firmware measures the 12 V about once a millisecond and
//! calls it "switched off" as soon as it has fallen 1/8 below normal.
//! While off, the chip sleeps, waking every 32 ms on its watchdog timer
//! to measure and count the time. If its own reservoir (C5) runs flat
//! first, the chip browns out and the next power-up is a cold boot.

use crate::journal::{self, Store};
use crate::logic::{self, Color, OffKind, SUPPLY_MIN};

/// The watchdog tick we program (ms) — the sleep unit while the lamp is off.
pub const WDT_TICK_MS: u32 = 32;
/// The stopwatch gives up counting after a minute: the verdict ("long off")
/// can no longer change, and 32-bit ms would wrap at ~49 days.
pub const OFF_CAP_MS: u32 = 60_000;
/// Only write the EEPROM with a healthy VCC (a brown-out mid-write is how
/// bytes get corrupted).
pub const SAVE_MIN_MV: u16 = 3_500;
/// The fade is 30 PWM steps ≈ 0.3 s.
pub const FADE_STEPS: u8 = 30;

/// Everything the firmware touches on the chip (≡ the registers main.c
/// pokes). One trait, three implementations — chip, model, fake — with
/// the calls monomorphized to plain register access on the real hardware.
pub trait LampHal: Store {
    /// The 12 V as a fraction of VCC, 0..1023 (ADC3 = PB3 on the chip,
    /// where R2/R3 scaled it below VCC so the meter can read it).
    fn supply_adc(&mut self) -> u16;
    /// The MODE jumper pin, 0..1023 (ADC1 = PB2) — [`logic::mode_from_adc`]
    /// turns it into a [`Mode`].
    fn mode_adc(&mut self) -> u16;
    /// VCC in millivolts, from measuring the 1.1 V bandgap against it:
    /// VCC = 1.1 V × 1024 / reading. Only needed to judge "is the chip's
    /// own supply healthy enough to risk an EEPROM write?".
    fn vcc_mv(&mut self) -> u16;
    /// Exactly one colour's gate commanded on (≡ `led_on` — one bit set).
    fn drive_color(&mut self, color: Color);
    /// All three gates off (the SAFE state).
    fn leds_off(&mut self);
    /// Which colour is being driven right now? Reads the output latch, like
    /// the C's `lit()` + `PORTB & led_pin[c]`. `None` = dark (the C could
    /// also say "two at once" here; the electronics model detects that bug
    /// separately by watching the pins).
    fn driven(&self) -> Option<Color>;
    /// One software-PWM period: the gate on for `level`/255 of ≈0.8 ms.
    /// (The chip's Timer1 output has a silicon quirk on PB4, so all three
    /// channels are treated identically in software — unchanged from the C.)
    fn pwm_pulse(&mut self, color: Color, level: u8);
    /// Busy-wait `ms` milliseconds.
    fn delay_ms(&mut self, ms: u16);
    /// Sleep until the next watchdog tick (≈32 ms), at ≈4 µA.
    fn sleep_wdt_tick(&mut self);
}

/// The journal bookkeeping main.c kept in locals: what (if anything) the
/// EEPROM remembers, and where it lives. (The C passed `&have, &saved,
/// &slot` around; a struct keeps the three in lockstep.)
struct Memory {
    have: bool,
    saved: Color,
    slot: u16,
}

/// After a cold boot: wait until the 12 V is up and steady; return its
/// level. Bounded by physics, not code (≡ `wait_for_supply`).
fn wait_for_supply<H: LampHal>(hal: &mut H) -> u16 {
    let mut before = 0;
    loop {
        let now = hal.supply_adc();
        if now >= SUPPLY_MIN && logic::supply_steady(now, before) {
            return now; // strong enough AND no longer climbing: a real supply
        }
        before = now;
        hal.delay_ms(20);
    }
}

/// Average of 8 readings: what "on" looks like. One ADC reading has ±2
/// counts of noise; the trip line (1/8 below normal) must not sit on top
/// of it (≡ `on_level_now`).
fn on_level_now<H: LampHal>(hal: &mut H) -> u16 {
    let mut sum: u16 = 0; // 8 × 1023 = 8184: still fits a u16
    for _ in 0..8 {
        sum += hal.supply_adc();
        hal.delay_ms(1);
    }
    sum / 8
}

/// The 12 V must not sag for 50 ms with the lamp lit at full — if a supply
/// can't hold 12 V under that load, it wasn't a real switch-on
/// (≡ `held_for_50ms`).
fn held_for_50ms<H: LampHal>(hal: &mut H, on_level: u16) -> bool {
    for _ in 0..50 {
        if logic::supply_dropped(hal.supply_adc(), on_level) {
            return false; // sagged: fail
        }
        hal.delay_ms(1);
    }
    true
}

/// Lamp on: measure about once a millisecond until the 12 V sags twice in
/// a row — one noisy reading can never end the ON phase (≡ `stay_on`).
fn stay_on<H: LampHal>(hal: &mut H, on_level: u16) {
    let mut low = 0u8;
    while low < 2 {
        low = if logic::supply_dropped(hal.supply_adc(), on_level) {
            low + 1
        } else {
            0
        };
        hal.delay_ms(1);
    }
}

/// Fade a colour in over ≈0.3 s: 30 steps of ≈10 ms, brightness rising as
/// the square (which the eye sees as an even rise). Checks the 12 V after
/// every step, so a supply that only looked "back" gives up long before
/// you could see anything. Returns the steps done (`FADE_STEPS` = fully
/// lit) — a half-fade that gave up still counts into the off time.
/// (≡ `fade_in`; level² maths in u32 so nothing overflows, like the C.)
fn fade_in<H: LampHal>(hal: &mut H, color: Color, on_level: u16) -> u8 {
    hal.leds_off(); // start dark, whatever was on before
    for step in 1..=FADE_STEPS {
        let level =
            ((step as u32 * step as u32 * 255) / (FADE_STEPS as u32 * FADE_STEPS as u32)) as u8; // step² scaled to 0..255
        for _ in 0..12 {
            hal.pwm_pulse(color, level); // ≈10 ms — one visible instant
        }
        if logic::supply_dropped(hal.supply_adc(), on_level) {
            return step; // the supply only looked "back": give up quietly
        }
    }
    hal.drive_color(color); // fully lit: the gate simply stays on from now
    FADE_STEPS
}

/// Remember the colour in the journal — but only if it changed AND the
/// chip's own supply is healthy (≡ `save_if_changed`).
fn save_if_changed<H: LampHal>(hal: &mut H, mem: &mut Memory, color: Color) {
    if mem.have && mem.saved == color {
        return; // nothing new to remember
    }
    if hal.vcc_mv() < SAVE_MIN_MV {
        return; // too risky right now: skip (re-saved on the next switch-on)
    }
    // Write new record first, retire old ones second (journal.rs) — and
    // update the bookkeeping so we don't rewrite the same colour.
    mem.slot = journal::save(hal, color, mem.have.then_some(mem.slot));
    mem.have = true;
    mem.saved = color;
}

/// Lamp off: sleep, waking every 32 ms to measure the 12 V and count the
/// time. A colour still lit stays lit (its LEDs drain the dying supply, so
/// it can't creep back up and fake a switch-on) and goes out once the 12 V
/// is clearly gone. Returns how long the 12 V was off (≡ `wait_while_off`).
///
/// This is the power-budget heart of the design: C5 (220 µF) alone runs
/// the chip while the lamp is off, so it spends ~99.9 % of each 32 ms tick
/// asleep at ≈4 µA.
///
/// The `on_level` out-parameter of the C becomes `&mut u16`: someone
/// plugged in a different, lower 12 V supply and held it steady for half
/// a second — adopt it as the new "normal".
fn wait_while_off<H: LampHal>(hal: &mut H, on_level: &mut u16) -> u32 {
    let mut off_ms: u32 = 0; // the stopwatch (capped at a minute)
    let mut window_start: u16 = 0; // first reading of a "is a new supply settling?" window
    let mut steady: u8 = 0; // doubles as "had a candidate" (0/1) and the tick counter
    loop {
        hal.sleep_wdt_tick();
        if off_ms < OFF_CAP_MS {
            off_ms += WDT_TICK_MS; // one tick passed: add 32 ms
        }
        let now = hal.supply_adc();
        // The old colour is still draining the supply (on purpose); once
        // the supply is clearly DEAD, let it go out:
        if hal.driven().is_some() && logic::supply_dead(now, *on_level) {
            hal.leds_off();
        }
        // The 12 V is back (within 3/32 of normal): the OFF phase is over.
        if logic::supply_back(now, *on_level) {
            break;
        }
        // Someone plugged in a different, lower 12 V supply: accept it
        // once it has held within 1/32 for half a second.
        if now >= SUPPLY_MIN && steady > 0 && logic::supply_steady(now, window_start) {
            steady += 1;
            if steady >= 16 {
                *on_level = now; // adopt the new level as "normal"…
                break; // …and treat this as switched on
            }
        } else {
            // Start (or restart) the window with this reading; only a
            // working supply counts as a candidate.
            window_start = now;
            steady = u8::from(now >= SUPPLY_MIN);
        }
    }
    off_ms
}

/// The firmware: the C `main()`'s great ON/OFF loop, once, generically.
/// Each CALL of this function is one power-up (≡ one run of the C's
/// main()); the model calls it again whenever its version of the chip
/// powers up. Never returns — the model ends it by tearing the world down.
pub fn run<H: LampHal>(hal: &mut H) -> ! {
    // ≡ the C's boot: C8 (the MODE jumper's filter capacitor) needs a few
    // time-constants to charge before its voltage means anything.
    hal.delay_ms(30);
    let mode = logic::mode_from_adc(hal.mode_adc()); // ask the jumper how to behave

    // Read the notebook: was there a record at all?
    let mut mem = match journal::load(hal) {
        Some(r) => Memory {
            have: true,
            saved: r.color,
            slot: r.slot,
        },
        None => Memory {
            have: false,
            saved: Color::Blue,
            slot: 0,
        },
    };

    // Cold boot: this call IS a long off, whatever comes later.
    let mut color = logic::next_color(mode, OffKind::Long, mem.have, mem.saved);
    let mut long_off = true;
    let mut off_ms: u32 = 0;
    let mut on_level = wait_for_supply(hal);

    loop {
        // ON: show the colour. `showing` covers the glitch case — it never
        // went out, so it's still displaying the same colour (skip the fade).
        let showing = hal.driven() == Some(color);
        let steps = if showing {
            FADE_STEPS
        } else {
            fade_in(hal, color, on_level)
        };
        // Fully lit AND the supply held under the load? Then it counts:
        let held = steps == FADE_STEPS && held_for_50ms(hal, on_level);
        if held {
            // Re-learn "normal" with the LEDs lit (their load pulls the
            // supply down a little), remember the colour, and babysit the
            // 12 V every millisecond until it sags.
            on_level = on_level_now(hal);
            save_if_changed(hal, &mut mem, color);
            long_off = false;
            off_ms = 0; // a switch-on resets the stopwatch
            stay_on(hal, on_level);
        }
        // OFF: time it. A switch-on that didn't hold (a dying supply's last
        // hiccup, a bouncing contact) just adds to the same off period —
        // including the fade time already spent, so a half-fade that gave
        // up still counts into this off period. (≡ the C's
        // `wait_while_off(...) + (held ? 0 : steps * 10u + 50u)`.)
        let fade_ms = if held { 0 } else { u32::from(steps) * 10 + 50 };
        off_ms += wait_while_off(hal, &mut on_level) + fade_ms;
        let kind = if long_off {
            OffKind::Long // a boot is always a long off
        } else {
            logic::classify_off(off_ms, false)
        };
        let next = logic::next_color(mode, kind, mem.have, mem.saved);
        if next != color {
            hal.leds_off(); // colour changing: dark until the next fade-in
        }
        color = next; // …and around the loop we go: ON again
    }
}
