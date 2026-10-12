//! `tricolor_lamp` — the flash image for the ATtiny85.
//!
//! Building on the host produces an empty stub (tests exercise the firmware
//! through the trait; there is nothing for a host binary to do). Building
//! for an AVR target (`avr-none`, `-C target-cpu=attiny85`) produces the
//! real thing from `avr_backend` below — the counterpart of the C
//! `tricolor_lamp/main.c`, register for register. The C→Rust dictionary
//! for the register layer is written out in arc_lighter.rs's header; this
//! file shows the parts the lamp adds: the ADC, the raw-datasheet EEPROM
//! sequence, the software PWM, and the watchdog-as-alarm-clock sleep.

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
    //! The ATtiny85 hands for the tri-color lamp (≡ tricolor_lamp/main.c).
    //! Pins (controller/index.tsx):
    //!   PB3  SENSE (ADC3): the 12 V, scaled down by R2/R3 (12 V → ≈2.9 V)
    //!   PB2  MODE jumper (ADC1): LO = MEMORY, open = STEP, HI = RESET
    //!   PB0/PB1/PB4  the blue/white/yellow channel gates
    //! Clock: the factory 1 MHz. Fuses: hfuse 0xD5 (brown-out 2.7 V, and
    //! EESAVE set — the EEPROM journal survives a re-flash).

    use avr_device::attiny85::Peripherals;
    use avr_device::interrupt;
    use avr_device::{asm, entry};

    use tricolor_lamp::firmware::{LampHal, run};
    use tricolor_lamp::journal::Store;
    use tricolor_lamp::logic::Color;

    /// The watchdog interrupt's only job is to WAKE the chip: an EMPTY
    /// handler, on purpose (≡ the C's `EMPTY_INTERRUPT(WDT_vect)`). Without
    /// a handler at all, the vector would fall through to the reset stub —
    /// the chip cannot sleep through an interrupt that has no entry.
    #[avr_device::interrupt(attiny85)]
    fn WDT() {}

    /// One ADC input, as the three call sites need it (≡ the ADMUX values
    /// the C passed to its adc_read helper).
    enum AdcInput {
        /// ADC3 = PB3: the 12 V through R2/R3 — the "is it there?" input.
        Supply,
        /// ADC1 = PB2: the MODE jumper divider.
        Mode,
        /// The internal 1.1 V bandgap, for the VCC measurement.
        Bandgap,
    }

    /// The chip, as seen by the generic firmware.
    pub struct Chip {
        dp: Peripherals,
    }

    impl Chip {
        /// One ADC conversion of whatever input is selected, measured
        /// against VCC (REFS = 00 is the reset default — measuring against
        /// VCC is deliberate: if VCC droops while C5 drains, both the
        /// reading AND its yardstick shrink together, so ratios stay
        /// honest). (≡ C adc_read(admux).)
        fn convert(&mut self, input: AdcInput) -> u16 {
            self.dp.ADC.admux.write(|w| match input {
                AdcInput::Supply => w.mux().adc3(),
                AdcInput::Mode => w.mux().adc1(),
                AdcInput::Bandgap => w.mux().adc_vbg(),
            });
            // 1 MHz / 4 = 250 kHz ADC clock — the datasheet wants 50–200 kHz
            // for full 10-bit accuracy; 250 kHz is close enough for the
            // lamp's 8-bit decisions (the C chose the same).
            self.dp
                .ADC
                .adcsra
                .write(|w| w.aden().set_bit().adps().prescaler_4());
            self.dp.ADC.adcsra.modify(|_, w| w.adsc().set_bit()); // start
            while self.dp.ADC.adcsra.read().adsc().bit_is_set() {} // ADSC clears itself when done
            let v = self.dp.ADC.adc.read().bits(); // the finished 10-bit result
            self.dp.ADC.adcsra.reset(); // ADC off again: saves power
            v
        }

        /// A previous EEPROM write may still be in progress (~3.4 ms):
        /// EEPE stays set until it lands (every access waits for it first —
        /// the datasheet's rule, avr-libc's busy loop).
        fn eeprom_wait(&mut self) {
            while self.dp.EEPROM.eecr.read().eepe().bit_is_set() {}
        }

        /// Drive exactly one colour's gate pin HIGH (bit SET = channel
        /// driven: the contract the electronics model validated 15 scenarios
        /// against — the code, the tests and the board all agree on this,
        /// whatever one comment in the C says about gate polarity. A good
        /// lesson: comments rot, tests don't).
        fn gate_set(&mut self, color: Color) {
            self.dp.PORTB.portb.modify(|_, w| match color {
                Color::Blue => w.pb0().set_bit(),
                Color::White => w.pb1().set_bit(),
                Color::Yellow => w.pb4().set_bit(),
            });
        }

        /// Drive one colour's gate pin LOW (channel dark).
        fn gate_clear(&mut self, color: Color) {
            self.dp.PORTB.portb.modify(|_, w| match color {
                Color::Blue => w.pb0().clear_bit(),
                Color::White => w.pb1().clear_bit(),
                Color::Yellow => w.pb4().clear_bit(),
            });
        }

        /// Watchdog = 32 ms INTERRUPT timer (≡ the C's `WDTCR = WDIE|WDP0`
        /// after the timed sequence). WDIE (interrupt-enable) instead of
        /// WDE (reset): it wakes us, it does not restart us. WDP value 1 =
        /// ~32 ms of the 128 kHz watchdog oscillator.
        fn wdt_wake_on(&mut self) {
            asm::wdr(); // pat the dog before reconfiguring it
            // the watchdog registers are protected: changes are only
            // accepted for 4 clock cycles after WDCE|WDE are written together
            self.dp
                .WDT
                .wdtcr
                .write(|w| w.wdce().set_bit().wde().set_bit());
            self.dp.WDT.wdtcr.write(|w| {
                w.wdie()
                    .set_bit() // interrupt, not reset
                    .wdpl()
                    .bits(1) // WDP = 1 → ~32 ms (of the 128 kHz WDT osc)
                    .wdph()
                    .clear_bit() // WDP3 (bit 5) off: the short range
            });
        }

        /// Watchdog off (≡ wdt_disable — it costs current when not needed).
        fn wdt_off(&mut self) {
            asm::wdr();
            self.dp
                .WDT
                .wdtcr
                .write(|w| w.wdce().set_bit().wde().set_bit());
            self.dp.WDT.wdtcr.reset();
        }
    }

    // ── the EEPROM journal glue (≡ avr-libc eeprom_read/update_byte) ─────
    // The C linked avr-libc's implementation; here the datasheet sequence
    // is written out in typed registers — the same six steps, visible.
    impl Store for Chip {
        fn read(&mut self, a: u16) -> u8 {
            self.eeprom_wait();
            self.dp.EEPROM.eear.write(|w| w.bits(a)); // choose the byte
            self.dp.EEPROM.eecr.modify(|_, w| w.eere().set_bit()); // start the read…
            self.dp.EEPROM.eedr.read().bits() // …data is available immediately
        }
        fn write(&mut self, a: u16, v: u8) {
            self.eeprom_wait();
            self.dp.EEPROM.eear.write(|w| w.bits(a));
            // "update" semantics: skip the write if the byte already holds
            // this value — writes are what wear the cell (the wear saver).
            if self.dp.EEPROM.eedr.read().bits() == v {
                return;
            }
            self.dp.EEPROM.eedr.write(|w| w.bits(v));
            // master-program-enable, then program-enable within 4 cycles:
            self.dp.EEPROM.eecr.modify(|_, w| w.eempe().set_bit());
            self.dp.EEPROM.eecr.modify(|_, w| w.eepe().set_bit());
        }
    }

    impl LampHal for Chip {
        fn supply_adc(&mut self) -> u16 {
            self.convert(AdcInput::Supply)
        }
        fn mode_adc(&mut self) -> u16 {
            self.convert(AdcInput::Mode)
        }

        /// VCC in mV, from the bandgap (≡ C vcc_mv): measure the KNOWN
        /// 1.1 V against the unknown VCC and invert: VCC = 1.1 V × 1024 /
        /// reading. Only needed to judge "is the chip's own supply healthy
        /// enough to risk an EEPROM write?".
        fn vcc_mv(&mut self) -> u16 {
            let _ = self.convert(AdcInput::Bandgap); // first reading after switching: discard
            self.delay_ms(1); // …and let the bandgap voltage stabilise
            let a = self.convert(AdcInput::Bandgap);
            if a == 0 {
                0 // 0 reading = something wrong, report 0
            } else {
                (1100u32 * 1024 / u32::from(a)) as u16
            }
        }

        /// Exactly one colour's gate commanded on, all others off
        /// (≡ C led_on = leds_off(); PORTB |= led_pin[c]).
        fn drive_color(&mut self, color: Color) {
            self.leds_off();
            self.gate_set(color);
        }

        /// All three gates off — the SAFE state.
        fn leds_off(&mut self) {
            self.dp
                .PORTB
                .portb
                .modify(|_, w| w.pb0().clear_bit().pb1().clear_bit().pb4().clear_bit());
        }

        /// Which colour is being driven right now? Reads the output LATCH
        /// (a register read of PORTB returns the last written latch — we
        /// can inspect our own commands without touching the live pins).
        fn driven(&self) -> Option<Color> {
            let p = self.dp.PORTB.portb.read();
            match (
                p.pb0().bit_is_set(),
                p.pb1().bit_is_set(),
                p.pb4().bit_is_set(),
            ) {
                (true, false, false) => Some(Color::Blue),
                (false, true, false) => Some(Color::White),
                (false, false, true) => Some(Color::Yellow),
                _ => None, // dark (the "two at once" bug case: None here; the model catches it)
            }
        }

        /// One software-PWM period (≡ C pwm_period with _delay_loop_1):
        /// ON for `level`×3 µs, OFF for the rest of ≈0.8 ms. The chip has
        /// hardware PWM, but its Timer1 output has a silicon quirk on PB4,
        /// and this loop treats all three pins identically — unchanged from
        /// the C. (asm::delay_cycles is "AT LEAST N cycles" where C's
        /// _delay_loop_1 was exactly 3N — close enough for a fade curve.)
        fn pwm_pulse(&mut self, color: Color, level: u8) {
            if level != 0 {
                self.gate_set(color);
                asm::delay_cycles(u32::from(level) * 3); // ON part
            }
            self.gate_clear(color);
            if level != 255 {
                asm::delay_cycles(u32::from(255 - level) * 3); // OFF part
            }
        }

        /// ≡ _delay_ms at F_CPU = 1 MHz (the factory fuse): busy-wait.
        fn delay_ms(&mut self, ms: u16) {
            asm::delay_cycles(u32::from(ms) * 1000);
        }

        /// Sleep until the next watchdog tick (≈32 ms) at ≈4 µA
        /// (≡ one iteration of the C wait_while_off's sleep). The WDT is
        /// re-armed per tick and retired after — the C did the same pair
        /// once around its whole loop; the trait's granularity is one tick,
        /// so the bracket is per tick. Behaviourally identical: the
        /// watchdog never runs while the lamp is ON.
        fn sleep_wdt_tick(&mut self) {
            self.wdt_wake_on();
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
            asm::sleep(); // ≈4 µA until the watchdog tick fires PCINT-style
            self.dp.CPU.mcucr.modify(|_, w| w.se().clear_bit()); // disarm the latch
            self.wdt_off(); // wake-up service no longer needed
        }
    }

    /// The C had one `main()`; the entry macro gives it a trampoline that
    /// zeroes RAM and calls us — the same crt0 job avr-libc does for C.
    #[entry]
    fn main() -> ! {
        let dp = Peripherals::take().unwrap();

        // ≡ the C's boot, same order: make everything SAFE before it goes
        // live, and kill anything the reset left running.
        dp.CPU.mcusr.reset(); // clear the reset-cause flags (why did we reset?)
        // if the watchdog caused that reset it is still running at the
        // shortest period — kill it before anything else:
        let mut probe = Chip { dp };
        probe.wdt_off();
        // All output latches LOW first, THEN the three gate pins become
        // outputs — driven LOW from the very first cycle: no boot glitch.
        // (DDRB = LED_PINS with PORTB = 0, ≡ the C.)
        probe.dp.PORTB.portb.reset();
        probe
            .dp
            .PORTB
            .ddrb
            .write(|w| w.pb0().set_bit().pb1().set_bit().pb4().set_bit());
        // PB3/PB2 are analog-only: no digital input — their buffers would
        // just burn current on in-between voltages.
        probe
            .dp
            .ADC
            .didr0
            .write(|w| w.adc3d().set_bit().adc1d().set_bit());
        unsafe { interrupt::enable() };

        run(&mut probe)
    }

    /// A panic on the chip has no console to print to. What it CAN do — and
    /// what a lamp should do — is drive the LEDs OFF, then halt. `steal()`:
    /// the singleton is already taken by main; in a panic we take it again
    /// regardless — sound because we are never coming back.
    #[panic_handler]
    fn panic(_: &core::panic::PanicInfo) -> ! {
        unsafe {
            let dp = Peripherals::steal();
            dp.PORTB
                .portb
                .modify(|_, w| w.pb0().clear_bit().pb1().clear_bit().pb4().clear_bit());
        }
        loop {}
    }
}
