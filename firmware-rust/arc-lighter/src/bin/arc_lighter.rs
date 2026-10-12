//! `arc_lighter` — the flash image for the ATtiny85.
//!
//! Building on the host produces an empty stub (tests exercise the firmware
//! through the trait; there is nothing for a host binary to do). Building
//! for an AVR target (`avr-none`, `-C target-cpu=attiny85`) produces the
//! real thing from `avr_backend` below — the counterpart of the C
//! `arc_lighter/main.c`, register for register.
//!
//! HOW TO READ `avr_backend` (the C→Rust dictionary for one file):
//!   C (avr-libc)                          Rust (avr-device, here)
//!   ────────────────────────────────────  ──────────────────────────────
//!   `#include <avr/io.h>` + `-mmcu=…`     `avr_device::attiny85` (feature
//!                                          "attiny85" selects the chip)
//!   `PORTB |= _BV(PB4)`                   `dp.PORTB.portb.modify(|_, w|
//!                                          w.pb4().set_bit())` — the bit
//!                                          now has a NAME and a TYPE; the
//!                                          write is a volatile store the
//!                                          compiler may not elide
//!   `PORTB &= ~_BV(PB4)`                  `… .pb4().clear_bit()`
//!   `x = PINB & _BV(PB3)`                 `dp.PORTB.pinb.read().pb3()
//!                                          .bit_is_set()`
//!   `ISR(TIMER1_COMPA_vect) { … }`        `#[avr_device::interrupt(attiny85)]
//!                                          fn TIMER1_COMPA() { … }`
//!   `sei()` / `cli()`                     `unsafe { interrupt::enable() }`
//!                                          / `interrupt::disable()`; short
//!                                          critical sections: `interrupt::
//!                                          free(|_| { … })`
//!   `volatile uint8_t tick_flag`          `static TICK_FLAG: AtomicU8` —
//!                                          the same single-instruction
//!                                          load/store, but the guarantee
//!                                          ("atomic on this target") is
//!                                          in the TYPE, not a comment
//!   `_delay_ms(5)` at 1 MHz              `asm::delay_cycles(5 * 1000)`
//!   `sleep_cpu()` + set_sleep_mode       `MCUCR: se/sm` + `asm::sleep()`
//!   `_BV(CTC1)|_BV(CS12)|…`               `w.ctc1().set_bit().cs1().
//!                                          prescale_64()` — the prescaler
//!                                          table is now an ENUM: "64" can
//!                                          no longer be typo'd as "6"

// The flash image is no_std (there is no std for AVR); host builds keep std
// for the trivial stub below. Inner attributes — must sit before any item.
#![cfg_attr(target_arch = "avr", no_std)]
#![cfg_attr(target_arch = "avr", no_main)] // the #[entry] trampoline provides `main`
#![cfg_attr(target_arch = "avr", feature(abi_avr_interrupt))]

#[cfg(not(target_arch = "avr"))]
fn main() {
    // Host stub: all verification happens in `cargo test`.
}

#[cfg(target_arch = "avr")]
mod avr_backend {
    //! The ATtiny85 hands for the arc lighter (≡ arc_lighter/main.c).
    //! Pins (board/index.tsx §3):
    //!   PB3  FIRE button to GND (internal pull-up), pin-change wake-up
    //!   PB4  Q1 gate: LOW = arc power on (the driver inverts)
    //!   PB2  T0 counter input: coil pulses from Q2's collector (R12/R13)
    //!   PB0  VBUS sense (R7/R8): HIGH = USB plugged in
    //!   PB1  status LED
    //! Clock: the factory 1 MHz (internal 8 MHz ÷ 8, lfuse 0x62).

    use avr_device::attiny85::Peripherals;
    use avr_device::interrupt;
    use avr_device::{asm, entry};

    use arc_lighter::firmware::{LighterHal, run};
    use core::sync::atomic::{AtomicU8, Ordering};

    // Shared between an ISR and the main loop. In C this was `static
    // volatile uint8_t` — "an 8-bit read/write is atomic on AVR, so no
    // locking is needed" was a COMMENT. AtomicU8 with Relaxed orderings
    // makes the same promise in the type system, and still compiles to a
    // single `st`/`ld`.
    static TICK_FLAG: AtomicU8 = AtomicU8::new(0);
    static T0_OVERFLOWS: AtomicU8 = AtomicU8::new(0);

    /// 100 Hz — the heartbeat. Just raise the flag; the loop does the work.
    /// (≡ `ISR(TIMER1_COMPA_vect) { tick_flag = 1; }`)
    #[avr_device::interrupt(attiny85)]
    fn TIMER1_COMPA() {
        TICK_FLAG.store(1, Ordering::Relaxed);
    }

    /// T0 pulse counter wrapped — 256 more pulses arrived; keep the high
    /// byte in software. Inside an ISR interrupts are off, so load+store
    /// needs no lock (≡ `t0_overflows++`).
    #[avr_device::interrupt(attiny85)]
    fn TIMER0_OVF() {
        let n = T0_OVERFLOWS.load(Ordering::Relaxed);
        T0_OVERFLOWS.store(n.wrapping_add(1), Ordering::Relaxed);
    }

    /// Button edge: just wakes us. An EMPTY handler — its only job is to
    /// exist, so the CPU can resume after `sleep` (≡ `ISR(PCINT0_vect) {}`).
    #[avr_device::interrupt(attiny85)]
    fn PCINT0() {}

    /// The chip, as seen by the generic firmware: one struct implementing
    /// the trait, owning the peripheral singleton.
    pub struct Chip {
        dp: Peripherals,
    }

    impl LighterHal for Chip {
        fn button_pressed(&self) -> bool {
            // the button reads the LIVE pin (PINB, not PORTB), inverted:
            // the pull-up makes idle HIGH, pressed LOW
            self.dp.PORTB.pinb.read().pb3().bit_is_clear()
        }

        fn usb_present(&self) -> bool {
            // VBUS divider: HIGH = USB plugged in
            self.dp.PORTB.pinb.read().pb0().bit_is_set()
        }

        /// VCC in mV (≡ C read_vcc_mv): the ADC measures the KNOWN 1.1 V
        /// bandgap with VCC as its reference and inverts:
        /// VCC = 1.1 V × 1024 / reading. The cell voltage IS VCC on this
        /// board, so this one conversion is the battery measurement.
        fn vcc_mv(&mut self) -> u16 {
            // REFS = 00 (VCC ref) is the reset default; input = VBG (1.1 V)
            self.dp.ADC.admux.write(|w| w.mux().adc_vbg());
            // 1 MHz / 8 = 125 kHz ADC clock — a touch slow = a touch more accurate
            self.dp
                .ADC
                .adcsra
                .write(|w| w.aden().set_bit().adps().prescaler_8());
            asm::delay_cycles(500); // let the bandgap settle — it is a lazy reference
            self.dp.ADC.adcsra.modify(|_, w| w.adsc().set_bit()); // start the conversion
            while self.dp.ADC.adcsra.read().adsc().bit_is_set() {} // ADSC clears itself when done
            let adc = self.dp.ADC.adc.read().bits(); // 0..1023, where 1023 = VCC itself
            if adc == 0 {
                return 0; // reading zero = broken; refuse to guess
            }
            // 1100×1024 needs 32-bit maths; the final `as u16` truncates
            // exactly like the C's `(uint16_t)(1100UL * 1024UL / adc)`.
            (1100u32 * 1024 / u32::from(adc)) as u16
        }

        /// Coil pulses since the last call (≡ C take_pulses): T0 counts
        /// rising edges in HARDWARE; firmware snapshots and resets both
        /// halves. Reading a pair an interrupt can change mid-read is a
        /// race — so the whole snapshot runs in a critical section
        /// (≡ cli … sei; here `interrupt::free`, which also RESTORES the
        /// previous state instead of blindly re-enabling).
        fn take_pulses(&mut self) -> u16 {
            interrupt::free(|_| {
                let mut lo = self.dp.TC0.tcnt0.read().bits();
                let mut ov = T0_OVERFLOWS.load(Ordering::Relaxed);
                // overflow pending right now — the ISR hasn't run yet; fold
                // it in by hand so nothing is lost (and re-read TCNT0: the
                // counter may already have wrapped on to a small value)
                if self.dp.TC0.tifr.read().tov0().bit_is_set() {
                    lo = self.dp.TC0.tcnt0.read().bits();
                    ov = ov.wrapping_add(1);
                }
                self.dp.TC0.tcnt0.write(|w| w.bits(0));
                T0_OVERFLOWS.store(0, Ordering::Relaxed);
                // TIFR is write-1-to-clear: writing the bit CLEARS the flag
                self.dp.TC0.tifr.write(|w| w.tov0().set_bit());
                (u16::from(ov) << 8) | u16::from(lo) // the 16-bit count
            })
        }

        /// The gate is active-LOW (the driver inverts): PB4 LOW = arc on.
        fn set_gate(&mut self, on: bool) {
            if on {
                self.dp.PORTB.portb.modify(|_, w| w.pb4().clear_bit());
            } else {
                // HIGH: arc power off — the SAFE default
                self.dp.PORTB.portb.modify(|_, w| w.pb4().set_bit());
            }
        }

        fn set_led(&mut self, on: bool) {
            if on {
                self.dp.PORTB.portb.modify(|_, w| w.pb1().set_bit());
            } else {
                self.dp.PORTB.portb.modify(|_, w| w.pb1().clear_bit());
            }
        }

        /// ≡ `while (!tick_flag) {}` — spin until Timer1 says "tick".
        /// (spin_loop(): a compiler hint that this loop is deliberate.)
        fn wait_tick(&mut self) {
            while TICK_FLAG.load(Ordering::Relaxed) == 0 {
                core::hint::spin_loop();
            }
            TICK_FLAG.store(0, Ordering::Relaxed);
        }

        /// Nothing to do for a long while: power down until FIRE moves
        /// (~0.1 µA). The wake source is a PIN-CHANGE interrupt on the
        /// button pin: any edge on PB3 fires PCINT0 (the empty ISR above)
        /// and the CPU resumes right here. (≡ C sleep_until_button.)
        fn sleep_until_button(&mut self) {
            self.dp.ADC.adcsra.reset(); // ADC off (it burns current)
            self.dp.EXINT.gimsk.modify(|_, w| w.pcie().set_bit()); // wake on the button pin bank
            // the deepest sleep, and arm the latch:
            self.dp
                .CPU
                .mcucr
                .modify(|_, w| w.se().set_bit().sm().pdown());
            // This exact order avoids an interrupt sneaking in between:
            interrupt::disable();
            // BOD off while asleep (~20 µA) — the timed BODS/BODSE dance:
            // changes are only accepted for 4 clock cycles after both are set.
            self.dp
                .CPU
                .mcucr
                .modify(|_, w| w.bods().set_bit().bodse().set_bit());
            self.dp
                .CPU
                .mcucr
                .modify(|_, w| w.bods().set_bit().bodse().clear_bit());
            unsafe { interrupt::enable() };
            asm::sleep(); // ≈0.1 µA until FIRE is pressed
            self.dp.CPU.mcucr.modify(|_, w| w.se().clear_bit()); // disarm the latch
            self.dp.EXINT.gimsk.modify(|_, w| w.pcie().clear_bit()); // the bank can go quiet again
        }

        /// ≡ _delay_ms at F_CPU = 1 MHz (the factory fuse): busy-wait.
        fn delay_ms(&mut self, ms: u16) {
            asm::delay_cycles(u32::from(ms) * 1000);
        }
    }

    /// The C had one `main()`; the entry macro gives it a trampoline that
    /// zeroes RAM and calls us — the same crt0 job avr-libc does for C.
    #[entry]
    fn main() -> ! {
        let dp = Peripherals::take().unwrap();

        // Safe state first: gate HIGH (off) BEFORE the pin becomes an
        // output — its very first driven level is already the safe one, so
        // there is no glitch at boot, even for a microsecond (≡ C main).
        dp.PORTB.portb.write(|w| w.pb4().set_bit().pb3().set_bit()); // gate high, button pull-up on
        dp.PORTB.ddrb.write(|w| w.pb4().set_bit().pb1().set_bit()); // only GATE and LED are outputs
        dp.EXINT.pcmsk.write(|w| w.pcint3().set_bit()); // watch just the button pin

        // Timer1: 1 MHz / 64 / 156 ≈ 100 Hz tick, CTC mode ("clear timer on
        // compare"): counts to OCR1A, fires, resets — a precise metronome.
        dp.TC1.ocr1a.write(|w| w.bits(155)); // 156 counts (0 counts too)
        dp.TC1.ocr1c.write(|w| w.bits(155)); // OCR1C mirrors for the PWM hardware
        dp.TC1
            .tccr1
            .write(|w| w.ctc1().set_bit().cs1().prescale_64());
        dp.TC1.timsk.modify(|_, w| w.ocie1a().set_bit()); // Timer1 compare interrupt…
        dp.TC0.timsk.modify(|_, w| w.toie0().set_bit()); // …and Timer0's overflow (pulse counting)

        // Timer0: external clock on T0 (PB2), rising edge — the counter now
        // increments on COIL pulses, not on time.
        dp.TC0.tccr0a.reset(); // no PWM on this timer — plain counter
        dp.TC0.tccr0b.write(|w| w.cs0().ext_rising());
        unsafe { interrupt::enable() }; // the heartbeat starts

        // Build variant (≡ the C's -DMODULE=1): a feature flag in Rust.
        let module_mode = cfg!(feature = "module");
        run(&mut Chip { dp }, module_mode)
    }

    /// A panic on the chip has no console to print to. What it CAN do — and
    /// what a safety device should do — is force the arc OFF, then halt.
    /// `steal()`: the singleton is already taken by main; in a panic we take
    /// it again regardless — sound because we are never coming back.
    #[panic_handler]
    fn panic(_: &core::panic::PanicInfo) -> ! {
        unsafe {
            let dp = Peripherals::steal();
            dp.PORTB.portb.modify(|_, w| w.pb4().set_bit()); // gate HIGH: the safe state
        }
        loop {}
    }
}
