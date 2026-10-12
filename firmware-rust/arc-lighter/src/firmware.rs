//! The arc lighter's hands — the Rust counterpart of `arc_lighter/main.c`.
//!
//! The C main.c is welded to the ATtiny85: it reads `PINB`, programs
//! `TCCR1`, and its only "escape hatch" is that the *decisions* live in a
//! separate file. Here the hands are generic: [`run`] works against any
//! hardware that implements [`LighterHal`], so the SAME compiled firmware
//! runs:
//!   * on the ATtiny85 (src/bin/arc_lighter.rs — registers via avr-device), and
//!   * inside the PC simulator (tests/lighter_firmware.rs),
//!
//! which is how this crate tests the wiring too — not just the brain.
//!
//! The heartbeat is unchanged: Timer1 interrupts at 100 Hz; every 10 ms
//! this loop wakes, samples the four inputs, hands them to the brain, and
//! applies the three outputs. The clever input is the coil pulse counter:
//! on the chip it is Timer0 counting rising edges on T0 *in hardware* (the
//! firmware just snapshots the accumulated count — software could never
//! sample 2–50 kHz at 1 MHz); here it is whatever `take_pulses()` means
//! on the other side of the trait.

use crate::logic::{Inputs, Lighter};

/// Everything the firmware touches on the chip, as one trait — the
/// Rust answer to "which registers does main.c poke".
///
/// The C version had no such seam: `main.c` names `PORTB`/`ADMUX` directly,
/// so testing it needs a whole stand-in avr-libc header suite (see the
/// lamp's `sim_avr/`). A trait is the same idea with types: implementations
/// hand the firmware its world, and the compiler monomorphizes the calls
/// down to plain register writes on the chip — zero abstraction cost.
pub trait LighterHal {
    /// FIRE pressed right now (the live pin — raw, not debounced).
    fn button_pressed(&self) -> bool;
    /// USB power present (VBUS sense pin).
    fn usb_present(&self) -> bool;
    /// The cell voltage in millivolts. On the chip: the ADC measures the
    /// known 1.1 V bandgap against VCC and inverts (VCC = 1.1 V × 1024 /
    /// reading), because the cell *is* VCC on this board.
    fn vcc_mv(&mut self) -> u16;
    /// Coil pulses counted since the last call (snapshot AND reset of the
    /// hardware counter, in a critical section on the chip).
    fn take_pulses(&mut self) -> u16;
    /// Drive the arc-driver gate. True = arc power on (the driver inverts
    /// it on the board; the backend applies the polarity).
    fn set_gate(&mut self, on: bool);
    /// Drive the status LED.
    fn set_led(&mut self, on: bool);
    /// Block until the next 10 ms heartbeat (Timer1 on the chip).
    fn wait_tick(&mut self);
    /// Power down until the FIRE button moves (~0.1 µA on the chip).
    fn sleep_until_button(&mut self);
    /// Busy-wait `ms` milliseconds (the boot settle).
    fn delay_ms(&mut self, ms: u16);
}

/// The firmware: the C `main()`'s loop, once, generically.
///
/// `module_mode` ≡ the C's `MODULE=1` build (a sealed arc module with no
/// coil feedback to watch).
///
/// Never returns — like the C `for(;;)`. On the chip it really never does;
/// in the simulator it "never" returns too (the harness ends it by tearing
/// the world down, the moral equivalent of pulling the power).
pub fn run<H: LighterHal>(hal: &mut H, module_mode: bool) -> ! {
    // ≡ main.c: let the pull-up and inputs settle before believing them.
    hal.delay_ms(5);
    // One brain, initialised once. Note the boot-time pin read: a button
    // already down at boot waits for a release first — safety, same as C.
    let mut lighter = Lighter::new(module_mode, hal.button_pressed());

    loop {
        // The heartbeat: one tick every 10 ms.
        hal.wait_tick();
        // Sample the world, in the brain's input shape.
        let input = Inputs {
            button: hal.button_pressed(), // live pin read
            usb: hal.usb_present(),
            vbat_mv: hal.vcc_mv(),
            pulses: hal.take_pulses(),
        };
        // One brain tick on the drumbeat.
        let out = lighter.tick(input);
        // Apply the verdict. The gate follows the state, the LED follows
        // the blink clock; if everything is quiet, power down until FIRE.
        hal.set_gate(out.fire);
        hal.set_led(out.led);
        if out.may_sleep {
            hal.set_gate(false); // be safe: force the arc off before sleeping
            hal.sleep_until_button();
        }
    }
}
