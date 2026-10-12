//! `lamp_sim` — the Rust counterpart of `firmware/test/sim_firmware.c`:
//! the REAL firmware ([`firmware::run`], unchanged) running on a PC, wired
//! to a model of the lamp's electronics, flipping the wall switch in many
//! ways to check what colour you would see.
//!
//! THE MODEL (one-millisecond-ish physics, numbers from the parts'
//! datasheets — identical to the C model):
//!   power supply  after the wall switch closes it takes ts (0.3 s) to
//!                 start, then ramps to 12 V. After the switch opens it
//!                 keeps 12 V for its hold-up time, then stops: its output
//!                 capacitors then sag as the load draws them down.
//!   load           the lit colour's six LED strings, the 78L05 (4 mA),
//!                 the sense divider.
//!   chip supply   78L05 → D2 → VCC with C5 = 220 µF. When the 12 V goes,
//!                 C5 alone runs the chip: 0.8 mA awake, 12 µA asleep.
//!                 Below 2.7 V the brown-out detector resets it; it
//!                 restarts 64 ms after VCC is back.
//!   ADC           PB3 = 12 V × 33k/133k, PB2 = the MODE divider, the 1.1 V
//!                 bandgap — all measured against VCC, as the real chip does.
//!
//! HOW THE SIMULATOR TALKS TO THE FIRMWARE — the C way vs the Rust way:
//! the C compiled main.c against stand-in headers (sim_avr/) that turn
//! every register into a global variable, and killed/restarted the
//! firmware with setjmp/longjmp. Here the firmware is generic over the
//! [`LampHal`] trait: the model IS the backend (its ADC answers with the
//! voltages its physics would produce, its EEPROM charges model-time for
//! writes), and a brown-out or the scenario's end is a panic that
//! `catch_unwind` catches — the same "reset the chip without its
//! cooperation" trick, with types instead of global variables.

use std::panic::{AssertUnwindSafe, catch_unwind, panic_any, resume_unwind};
use std::sync::OnceLock;

use tricolor_lamp::firmware::{FADE_STEPS, LampHal, run};
use tricolor_lamp::journal::Store;
use tricolor_lamp::logic::{Color, Mode};

// ── how a scenario ends / a chip browns out (≡ the C's two longjmps) ────
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum SimExit {
    /// The script reached its END event (≡ longjmp(end_jb)).
    End,
    /// VCC sank below 2.7 V under load (≡ longjmp(reset_jb)).
    BrownOut,
}

fn is_exit(e: &Box<dyn std::any::Any + Send>, which: SimExit) -> bool {
    matches!(e.downcast_ref::<SimExit>(), Some(x) if *x == which)
}

/// Silence the default panic printing *for SimExit only* — it is control
/// flow here, not an error. Anything else panics loudly, as it should.
fn silence_sim_exit() {
    static ONCE: OnceLock<()> = OnceLock::new();
    ONCE.get_or_init(|| {
        let previous = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            if info.payload().downcast_ref::<SimExit>().is_some() {
                return;
            }
            previous(info);
        }));
    });
}

// ── the scenario table's vocabulary (≡ event_t / probe_t / scenario_t) ──
#[derive(Clone, Copy)]
enum Ev {
    On,
    Off,
    Glitch(f64),
    Vout(f64),
    Revive(f64),
    Noise(f64),
    End,
}
#[derive(Clone, Copy)]
struct Event {
    t: f64,
    ev: Ev,
}
const fn on(t: f64) -> Event {
    Event { t, ev: Ev::On }
}
const fn off(t: f64) -> Event {
    Event { t, ev: Ev::Off }
}
const fn glitch(t: f64, for_s: f64) -> Event {
    Event {
        t,
        ev: Ev::Glitch(for_s),
    }
}
const fn vout(t: f64, volts: f64) -> Event {
    Event {
        t,
        ev: Ev::Vout(volts),
    }
}
const fn revive(t: f64, for_s: f64) -> Event {
    Event {
        t,
        ev: Ev::Revive(for_s),
    }
}
const fn noise(t: f64, for_s: f64) -> Event {
    Event {
        t,
        ev: Ev::Noise(for_s),
    }
}
/// the terminating END event (the script's last entry)
const fn end(t: f64) -> Event {
    Event { t, ev: Ev::End }
}

// probe colors: 0-2, -1 = dark (short aliases, ≡ the C's B/W/Y/DARK)
const B: i32 = Color::Blue as i32;
const W: i32 = Color::White as i32;
const Y: i32 = Color::Yellow as i32;
const DARK: i32 = -1;
#[derive(Clone, Copy)]
struct Probe {
    t: f64,
    color: i32,
}
const fn at(t: f64, color: i32) -> Probe {
    Probe { t, color }
}

/// the power supply's personality (≡ #define PSU(h, r, c): hold-up (s),
/// start delay 0.3 s, ramp (s), output capacitance; 11.65 V at the node).
#[derive(Clone, Copy)]
struct Psu {
    hold: f64,
    ts: f64,
    ramp: f64,
    cout: f64,
    vout: f64,
}
const fn psu(hold: f64, ramp: f64, cout: f64) -> Psu {
    Psu {
        hold,
        ts: 0.3,
        ramp,
        cout,
        vout: 11.65,
    }
}
/// "standard supply": 100 ms hold-up, 20 ms ramp, 1470 µF (≡ #define STD)
const STD_P: Psu = psu(0.1, 0.02, 1470e-6);

struct Scenario {
    name: &'static str,
    mode: Mode,
    psu: Psu,
    ev: &'static [Event], // the script (last entry is Ev::End)
    probe: &'static [Probe],
    /// how many EEPROM writes must happen; None = don't check (≡ -1)
    saves: Option<usize>,
    /// times light may appear while the wall switch is off; None = don't check
    flashes: Option<u32>,
}

// ── the running state of one scenario (≡ sim_firmware.c's statics) ──────
// PB0 = 0x01, PB1 = 0x02, PB4 = 0x10 — the three gate pins.
const PIN: [u8; 3] = [0x01, 0x02, 0x10];

struct Sim {
    sc: &'static Scenario,
    // the physics' current numbers:
    t: f64,
    v12: f64,
    vcc: f64,
    t_power: f64, // ≥ 0 while VCC ≥ 2.75 V, -1.0 while dead
    mains: bool,
    running: bool,
    asleep: bool,
    chip_running: bool,
    boots: u32,
    start_at: f64,
    stop_at: f64,
    ramp_start: f64,
    glitch_until: f64,
    revive_from: f64,
    revive_until: f64,
    noise_until: f64,
    vout: f64,
    // observations a passing test must produce:
    two_colors: u32,
    lit_while_dead: u32,
    flashes: u32,
    dark_since: f64,
    prev_lit: i32,
    saves: usize,
    // the firmware's outputs, as the model sees them (≡ PORTB):
    portb: u8,
    // the fake EEPROM:
    eeprom: [u8; 512],
    noise_hits: u32,
    // script cursors + the verdict:
    next_ev: usize,
    next_probe: usize,
    probe_fail: u32,
    fail_log: Vec<String>,
}

impl Sim {
    fn new(sc: &'static Scenario) -> Self {
        Sim {
            sc,
            t: 0.0,
            v12: 0.0,
            vcc: 0.0,
            t_power: -1.0,
            mains: false,
            running: false,
            asleep: false,
            chip_running: false,
            boots: 0,
            start_at: f64::INFINITY,
            stop_at: f64::INFINITY,
            ramp_start: 0.0,
            glitch_until: -1.0,
            revive_from: -1.0,
            revive_until: -1.0,
            noise_until: -1.0,
            vout: sc.psu.vout,
            two_colors: 0,
            lit_while_dead: 0,
            flashes: 0,
            dark_since: 0.0,
            prev_lit: -1,
            saves: 0,
            portb: 0,
            eeprom: [0xFF; 512], // brand-new EEPROM: every byte erased
            noise_hits: 0,
            next_ev: 0,
            next_probe: 0,
            probe_fail: 0,
            fail_log: Vec::new(),
        }
    }

    /// Which colour is being driven right now? Reads the output latch the
    /// firmware last wrote; more than one gate at once (9) = a firmware bug.
    fn lit_color(&self) -> i32 {
        let mut c = -1;
        let mut n = 0;
        for (i, &pin) in PIN.iter().enumerate() {
            if self.portb & pin != 0 {
                c = i as i32;
                n += 1;
            }
        }
        if n > 1 { 9 } else { c }
    }

    /// Is the power supply actually sourcing current right now? Off while
    /// the wire is glitched, on during a scripted revive, else following
    /// its own start/stop delays (which encode its real hold-up time).
    fn sourcing(&self) -> bool {
        if self.t < self.glitch_until {
            return false;
        }
        if self.t >= self.revive_from && self.t < self.revive_until {
            return true;
        }
        self.running
    }

    /// Current drawn from the 12 V by one colour's six LED strings: each
    /// LED drops ~vt volts, the resistor takes the rest; clamped at 0.
    fn led_current(color: i32, v: f64) -> f64 {
        let (n, vt, rd, r) = match color {
            2 => (4.0, 1.85, 15.0, 220.0), // yellow: 4 LEDs, 220 Ω/string
            _ => (3.0, 2.85, 18.0, 150.0), // blue/white: 3 LEDs, 150 Ω/string
        };
        let i = (v - n * vt) / (r + n * rd);
        if i > 0.0 { 6.0 * i } else { 0.0 }
    }

    /// step(h): let h seconds of physics pass. Ported line-for-line from
    /// the C — the firmware's behaviour is only as trustworthy as the
    /// physics it is judged against.
    fn step(&mut self, h: f64) {
        // 1. events: anything scripted to happen by now becomes reality.
        loop {
            let e = self.sc.ev[self.next_ev];
            if matches!(e.ev, Ev::End) || e.t > self.t {
                break;
            }
            match e.ev {
                Ev::On => {
                    self.mains = true;
                    if !self.running {
                        self.start_at = e.t + self.sc.psu.ts; // a supply still holding up carries on
                    }
                }
                Ev::Off => {
                    self.mains = false;
                    self.stop_at = e.t + self.sc.psu.hold; // keeps 12 V until hold-up expires
                }
                Ev::Glitch(d) => self.glitch_until = e.t + d,
                Ev::Vout(v) => self.vout = v,
                Ev::Revive(d) => {
                    self.revive_from = e.t;
                    self.revive_until = e.t + d;
                }
                Ev::Noise(d) => self.noise_until = e.t + d,
                Ev::End => unreachable!(),
            }
            self.next_ev += 1;
        }
        // 2. the supply's output stage: starts TS after the switch closes,
        //    stops H (hold-up) after it opens.
        if self.mains && !self.running && self.t >= self.start_at {
            self.running = true;
            self.ramp_start = self.t;
        }
        if !self.mains && self.running && self.t >= self.stop_at {
            self.running = false;
        }
        // 3. the 12 V node: sourcing → at least its (ramping) target; else
        //    sag as the load drains the output capacitors (dv = −i·dt/C).
        let c = if self.chip_running {
            self.lit_color()
        } else {
            -1
        };
        let mut load = 0.004 + self.v12 / 133e3; // the 78L05's 4 mA + R2/R3
        if (0..=2).contains(&c) {
            load += Self::led_current(c, self.v12);
        }
        let src = self.sourcing();
        let target = self.vout * f64::min(1.0, (self.t - self.ramp_start) / self.sc.psu.ramp);
        if src && self.v12 < target {
            self.v12 = target; // sourcing and below target: the supply wins
        } else {
            self.v12 -= load / self.sc.psu.cout * h;
            if self.v12 < 0.0 {
                self.v12 = 0.0;
            }
        }
        // 4. the chip's supply: 12 V → 78L05 (≥1.7 V) → D2 (0.6 V) → C5.
        //    If the chain can push current INTO C5, VCC rises; otherwise C5
        //    discharges under the chip's own consumption until brown-out.
        let vreg = f64::min(5.0, self.v12 - 1.7);
        if vreg - 0.6 > self.vcc {
            self.vcc = vreg - 0.6;
        } else {
            let mut i = if self.chip_running {
                if self.asleep { 12e-6 } else { 0.8e-3 }
            } else {
                1e-6
            };
            i += if self.sc.mode == Mode::Step {
                self.vcc / 2e6 // the MODE divider, no jumper
            } else {
                self.vcc / 1.01e6 // with a jumper
            };
            if self.chip_running {
                for &pin in PIN.iter() {
                    if self.portb & pin != 0 {
                        i += self.vcc / 100.1e3; // each lit gate leaks ~44 µA
                    }
                }
            }
            self.vcc -= i / 220e-6 * h; // C5 = 220 µF
            if self.vcc < 0.0 {
                self.vcc = 0.0;
            }
        }
        // 5. power-good book-keeping.
        if self.vcc < 2.75 && self.t_power >= 0.0 && !self.chip_running {
            self.t_power = -1.0;
        }
        if self.vcc >= 2.75 && self.t_power < 0.0 {
            self.t_power = self.t;
        }
        self.t += h;
        // 6. observations: things a PASSING scenario must never show.
        if self.chip_running {
            let now = self.lit_color();
            if now == 9 {
                self.two_colors += 1; // two gate bits at once = a firmware bug
            }
            // Lighting a colour once the 12 V has clearly sagged (below 80 %)
            // would be a bug; finishing a fade on what the supply's capacitors
            // still hold is just physics.
            if now >= 0 && now != self.prev_lit && !self.sourcing() && self.v12 < 0.8 * self.vout {
                self.lit_while_dead += 1;
            }
            // light out of a dark, switched-off lamp:
            if now >= 0 && self.prev_lit < 0 && !self.mains && self.t - self.dark_since > 0.05 {
                self.flashes += 1;
            }
            if now < 0 && self.prev_lit >= 0 {
                self.dark_since = self.t;
            }
            self.prev_lit = now;
        }
        // 7. probes: at their scripted times, what a human sees must match.
        while self.next_probe < self.sc.probe.len() && self.sc.probe[self.next_probe].t <= self.t {
            let p = self.sc.probe[self.next_probe];
            self.next_probe += 1;
            let seen = if self.chip_running {
                self.lit_color()
            } else {
                -1
            }; // a dead chip shows nothing
            if seen != p.color {
                self.probe_fail += 1;
                self.fail_log.push(format!(
                    "at {:6.2} s: saw {}, expected {} (12 V node {:.2} V, VCC {:.2} V)",
                    p.t,
                    cname(seen),
                    cname(p.color),
                    self.v12,
                    self.vcc
                ));
            }
        }
        // 8. scenario over? brown-out? — the panic unwinds out of the
        //    firmware's stack (any depth), exactly like the C's longjmp.
        let last = *self.sc.ev.last().expect("script ends with Ev::End");
        if matches!(last.ev, Ev::End) && self.t >= last.t {
            panic_any(SimExit::End);
        }
        if self.chip_running && self.vcc < 2.7 {
            panic_any(SimExit::BrownOut);
        }
    }

    /// Advance the world in 0.5 ms slices so no physics event can be
    /// missed (≡ sim_wait).
    fn advance(&mut self, s: f64) {
        let mut s = s;
        while s > 0.0 {
            let h = if s < 5e-4 { s } else { 5e-4 };
            self.step(h);
            s -= h;
        }
    }

    /// One ADC conversion of input `mux`, from the model's voltages,
    /// costing ~0.1 ms (≡ the clever half of sim_adcsra).
    fn convert(&mut self, mux: u8) -> u16 {
        let v = match mux {
            3 => {
                // ADC3 = PB3 = the 12 V through R2/R3 (33k/133k)
                let mut v = self.v12 * 33.0 / 133.0;
                if self.t < self.noise_until {
                    let hit = self.noise_hits;
                    self.noise_hits += 1;
                    if hit & 1 == 0 {
                        v += 3.0; // interference: every other reading is hit
                    }
                }
                v
            }
            1 => {
                // ADC1 = PB2 = the MODE divider — and C8 must settle first
                let settle = 1.0 - (-(self.t - self.t_power) / 5e-3).exp();
                match self.sc.mode {
                    Mode::Step => self.vcc / 2.0 * settle,
                    Mode::Memory => self.vcc * 0.0099,
                    Mode::Reset => self.vcc * 0.990,
                }
            }
            12 => 1.1, // the internal 1.1 V bandgap (for vcc_mv)
            _ => 0.0,
        };
        let raw = v / self.vcc * 1024.0; // measured against VCC — 10-bit
        let clamped = raw.clamp(0.0, 1023.0) as u16;
        self.advance(100e-6); // a conversion costs ~0.1 ms of model-time
        clamped
    }
}

/// colour names for failure messages only (≡ cname).
fn cname(c: i32) -> &'static str {
    match c {
        0 => "BLUE",
        1 => "WHITE",
        2 => "YELLOW",
        -1 => "dark",
        _ => "TWO AT ONCE",
    }
}

// ── the model's EEPROM: same semantics as avr-libc, backed by the array.
// A real write takes ~3.4 ms and wears the cell — the model charges the
// time and counts the saves, because how OFTEN the firmware writes is
// part of what the tests judge.
impl Store for Sim {
    fn read(&mut self, a: u16) -> u8 {
        self.eeprom[a as usize & 511]
    }
    fn write(&mut self, a: u16, v: u8) {
        let i = a as usize & 511;
        if self.eeprom[i] == v {
            return; // real "update": skip identical writes (the wear saver)
        }
        self.eeprom[i] = v;
        if v != 0xFF {
            self.saves += 1; // count it only when it lands a real record
        }
        self.advance(3.4e-3); // the write time
    }
}

impl LampHal for Sim {
    fn supply_adc(&mut self) -> u16 {
        self.convert(3)
    }
    fn mode_adc(&mut self) -> u16 {
        self.convert(1)
    }
    fn vcc_mv(&mut self) -> u16 {
        let _ = self.convert(12); // first reading after switching: discard
        self.delay_ms(1); // …and let the bandgap voltage stabilise
        let a = self.convert(12);
        if a == 0 {
            0
        } else {
            (1100u32 * 1024 / a as u32) as u16
        }
    }
    fn drive_color(&mut self, color: Color) {
        self.leds_off();
        self.portb |= PIN[color as usize];
    }
    fn leds_off(&mut self) {
        self.portb &= !(PIN[0] | PIN[1] | PIN[2]);
    }
    fn driven(&self) -> Option<Color> {
        match self.lit_color() {
            0 => Some(Color::Blue),
            1 => Some(Color::White),
            2 => Some(Color::Yellow),
            _ => None, // dark (the model detects "two at once" separately)
        }
    }
    fn pwm_pulse(&mut self, color: Color, level: u8) {
        let pin = PIN[color as usize];
        if level != 0 {
            self.portb |= pin;
            self.advance(f64::from(level) * 3e-6); // ON: level × 3 µs
        }
        self.portb &= !pin;
        if level != 255 {
            self.advance(f64::from(255 - level) * 3e-6); // OFF: (255−level) × 3 µs
        }
    }
    fn delay_ms(&mut self, ms: u16) {
        self.advance(f64::from(ms) / 1000.0);
    }
    fn sleep_wdt_tick(&mut self) {
        self.asleep = true; // C5 drains at the 12 µA rate instead of 0.8 mA
        self.advance(32e-3);
        self.asleep = false;
    }
}

// ── play one scenario start to finish (≡ run()) ──────────────────────────
/// The chip's power-cycles: as many as physics demands. Each call of
/// firmware::run is one boot; a brown-out unwinds back to the top of the
/// loop and the chip restarts; the scenario's END unwinds out of the
/// outer catch, which hands the Sim back with its logs intact.
fn play(sc: &'static Scenario) -> Sim {
    let mut sim = Sim::new(sc);
    let outcome = catch_unwind(AssertUnwindSafe(|| {
        'power: loop {
            sim.chip_running = false;
            sim.portb = 0; // unpowered: outputs float, nothing is driven
            while sim.vcc < 2.75 {
                sim.step(1e-3); // unpowered: wait for VCC to reach 2.75 V
            }
            sim.advance(64e-3); // start-up delay (fuses): ~64 ms to first instruction
            if sim.vcc < 2.75 {
                continue 'power; // it died again during the delay: start over
            }
            sim.chip_running = true;
            sim.boots += 1;
            // ← the REAL firmware, from its first line. It "never returns";
            // it comes back here only via a panic: a brown-out (restart the
            // chip) or the scenario's end (hand it to the outer catch).
            match catch_unwind(AssertUnwindSafe(|| run(&mut sim))) {
                Ok(never) => match never {},
                // a brown-out: the chip dies mid-firmware — restart it.
                Err(e) if is_exit(&e, SimExit::BrownOut) => continue 'power,
                // anything else (the scenario's end, or a real bug): let it
                // unwind all the way out of the closure; the outer catch
                // tells the two apart.
                Err(e) => resume_unwind(e),
            }
        }
    }));
    match outcome {
        Ok(_) => unreachable!(),
        Err(e) if is_exit(&e, SimExit::End) => sim,
        Err(e) => resume_unwind(e),
    }
}

/// The verdict: every observation must be clean AND the EEPROM writes must
/// match (≡ the tail of the C run()).
fn check(sc: &'static Scenario) {
    silence_sim_exit();
    let sim = play(sc);
    let ok = sim.probe_fail == 0
        && sim.two_colors == 0
        && sim.lit_while_dead == 0
        && sc.saves.is_none_or(|n| sim.saves == n)
        && sc.flashes.is_none_or(|n| sim.flashes <= n);

    let mut report = String::new();
    if sim.two_colors > 0 {
        report += &format!("      two colours lit at once ({} steps)\n", sim.two_colors);
    }
    if sim.lit_while_dead > 0 {
        report += &format!(
            "      a colour came ON after the 12 V had sagged ({} times)\n",
            sim.lit_while_dead
        );
    }
    if let Some(n) = sc.flashes
        && sim.flashes > n
    {
        report += &format!(
            "      light appeared {} times with the switch off\n",
            sim.flashes
        );
    }
    if let Some(n) = sc.saves
        && sim.saves != n
    {
        report += &format!(
            "      {} colours saved to EEPROM, expected {}\n",
            sim.saves, n
        );
    }
    for line in &sim.fail_log {
        report += line;
        report.push('\n');
    }
    assert!(
        ok,
        "{}\n{}(booted {} ×, worst supply {:.2} V)",
        sc.name, report, sim.boots, sim.v12
    );
}

// ── the 15 test scenarios — the C table, verbatim ───────────────────────
const SCENARIOS: &[Scenario] = &[
    Scenario {
        name: "STEP: blue → white → yellow → blue on 1 s flips; a 10 s off steps; a 3-minute off (chip flat) steps",
        mode: Mode::Step,
        psu: STD_P,
        ev: &[
            on(0.0),
            off(5.0),
            on(6.0),
            off(10.0),
            on(11.5),
            off(15.0),
            on(16.0),
            off(20.0),
            on(30.0),
            off(35.0),
            on(200.0),
            end(203.0),
        ],
        probe: &[
            at(2.0, B),
            at(5.05, B),
            at(8.0, W),
            at(13.0, Y),
            at(18.0, B),
            at(25.0, DARK),
            at(32.0, W),
            at(190.0, DARK),
            at(202.0, Y),
        ],
        saves: Some(6),
        flashes: Some(0),
    },
    Scenario {
        name: "STEP, a big supply that holds 12 V for 0.8 s: a 0.5 s flip is too short to notice, 1.5 s steps",
        mode: Mode::Step,
        psu: psu(0.8, 0.02, 1470e-6),
        ev: &[on(0.0), off(5.0), on(5.5), off(10.0), on(11.5), end(14.0)],
        probe: &[at(3.0, B), at(5.4, B), at(5.7, B), at(8.0, B), at(13.0, W)],
        saves: Some(2),
        flashes: Some(0),
    },
    Scenario {
        name: "a 60 ms break in the 12 V wire is a glitch (no change); a 0.25 s break counts as a flip",
        mode: Mode::Step,
        psu: STD_P,
        ev: &[on(0.0), glitch(5.0, 0.06), glitch(8.0, 0.25), end(11.0)],
        probe: &[at(3.0, B), at(6.0, B), at(10.0, W)],
        saves: Some(2),
        flashes: Some(0),
    },
    Scenario {
        name: "MEMORY: quick flips step; after 10 s off, or with the chip flat, it comes back the same",
        mode: Mode::Memory,
        psu: STD_P,
        ev: &[
            on(0.0),
            off(5.0),
            on(6.0),
            off(10.0),
            on(20.0),
            off(25.0),
            on(190.0),
            off(195.0),
            on(196.0),
            end(199.0),
        ],
        probe: &[
            at(3.0, B),
            at(8.0, W),
            at(22.0, W),
            at(192.0, W),
            at(198.0, Y),
        ],
        saves: Some(3),
        flashes: Some(0),
    },
    Scenario {
        name: "RESET: quick flips step; after 10 s off, or with the chip flat, it starts blue",
        mode: Mode::Reset,
        psu: STD_P,
        ev: &[
            on(0.0),
            off(5.0),
            on(6.0),
            off(10.0),
            on(20.0),
            off(25.0),
            on(26.0),
            off(30.0),
            on(195.0),
            end(198.0),
        ],
        probe: &[
            at(3.0, B),
            at(8.0, W),
            at(22.0, B),
            at(28.0, W),
            at(197.0, B),
        ],
        saves: Some(5),
        flashes: Some(0),
    },
    Scenario {
        name: "a dying supply that hiccups back to 12 V for 40 ms (after the LEDs are out) doesn't count",
        mode: Mode::Step,
        psu: STD_P,
        ev: &[on(0.0), off(5.0), revive(6.2, 0.04), on(7.5), end(10.0)],
        probe: &[at(3.0, B), at(6.15, DARK), at(9.5, W)],
        saves: Some(2),
        flashes: None,
    },
    Scenario {
        name: "… nor one that hiccups while the old colour is still fading out",
        mode: Mode::Step,
        psu: STD_P,
        ev: &[on(0.0), off(5.0), revive(5.16, 0.04), on(6.5), end(9.0)],
        probe: &[at(3.0, B), at(8.5, W)],
        saves: Some(2),
        flashes: None,
    },
    Scenario {
        name: "swapped to a weaker (10.5 V) supply while off: it still comes on (and steps)",
        mode: Mode::Step,
        psu: STD_P,
        ev: &[on(0.0), off(5.0), vout(6.4, 10.5), on(6.5), end(10.0)],
        probe: &[at(3.0, B), at(9.5, W)],
        saves: Some(2),
        flashes: Some(0),
    },
    Scenario {
        name: "a supply that sags very slowly (10 000 µF): no false switch-on while it dies",
        mode: Mode::Step,
        psu: psu(0.3, 0.02, 10e-3),
        ev: &[on(0.0), off(5.0), on(20.0), end(23.0)],
        probe: &[at(3.0, B), at(22.0, W)],
        saves: Some(2),
        flashes: Some(0),
    },
    Scenario {
        name: "a supply that ramps up slowly (0.3 s) at first power-up still starts blue",
        mode: Mode::Step,
        psu: psu(0.1, 0.3, 1470e-6),
        ev: &[on(0.0), end(3.0)],
        probe: &[at(2.5, B)],
        saves: Some(1),
        flashes: Some(0),
    },
    Scenario {
        name: "skip a colour: off 1 s, on until the colour is fully lit, off 1 s, on",
        mode: Mode::Step,
        psu: STD_P,
        ev: &[on(0.0), off(5.0), on(6.0), off(7.2), on(8.2), end(11.0)],
        probe: &[at(3.0, B), at(7.1, W), at(10.0, Y)],
        saves: Some(3),
        flashes: Some(0),
    },
    Scenario {
        name: "flipping on-off faster than the colour can fade in counts as one flip",
        mode: Mode::Step,
        psu: STD_P,
        ev: &[on(0.0), off(5.0), on(6.0), off(6.45), on(7.45), end(10.0)],
        probe: &[at(3.0, B), at(9.5, W)],
        saves: Some(2),
        flashes: Some(0),
    },
    Scenario {
        name: "0.3 s of interference on the sense wire (every other reading wrong) while off: no light",
        mode: Mode::Step,
        psu: STD_P,
        ev: &[on(0.0), off(5.0), noise(6.5, 0.3), on(8.0), end(10.0)],
        probe: &[at(3.0, B), at(6.6, DARK), at(9.5, W)],
        saves: Some(2),
        flashes: Some(0),
    },
    Scenario {
        name: "a dead supply that hiccups for 10 ms refills its capacitors: at most one dim flash, no colour change",
        mode: Mode::Step,
        psu: STD_P,
        ev: &[on(0.0), off(5.0), revive(6.5, 0.01), on(8.0), end(10.0)],
        probe: &[at(3.0, B), at(7.5, DARK), at(9.5, W)],
        saves: Some(2),
        flashes: Some(1),
    },
    Scenario {
        name: "MEMORY: a supply hiccup in the middle of a 4 s off doesn't split it into two short offs",
        mode: Mode::Memory,
        psu: STD_P,
        ev: &[on(0.0), off(5.0), revive(7.2, 0.04), on(9.0), end(11.0)],
        probe: &[at(3.0, B), at(10.5, B)],
        saves: Some(1),
        flashes: None,
    },
];

// one #[test] per scenario — a failure names its scenario exactly.
#[test]
fn s01_step_flips() {
    check(&SCENARIOS[0]);
}
#[test]
fn s02_big_supply() {
    check(&SCENARIOS[1]);
}
#[test]
fn s03_glitch_vs_flip() {
    check(&SCENARIOS[2]);
}
#[test]
fn s04_memory() {
    check(&SCENARIOS[3]);
}
#[test]
fn s05_reset() {
    check(&SCENARIOS[4]);
}
#[test]
fn s06_revive_after_dark() {
    check(&SCENARIOS[5]);
}
#[test]
fn s07_revive_while_fading_out() {
    check(&SCENARIOS[6]);
}
#[test]
fn s08_weaker_supply() {
    check(&SCENARIOS[7]);
}
#[test]
fn s09_slow_sag() {
    check(&SCENARIOS[8]);
}
#[test]
fn s10_slow_ramp() {
    check(&SCENARIOS[9]);
}
#[test]
fn s11_skip_a_colour() {
    check(&SCENARIOS[10]);
}
#[test]
fn s12_flip_faster_than_fade() {
    check(&SCENARIOS[11]);
}
#[test]
fn s13_sense_noise() {
    check(&SCENARIOS[12]);
}
#[test]
fn s14_dead_hiccup() {
    check(&SCENARIOS[13]);
}
#[test]
fn s15_memory_hiccup() {
    check(&SCENARIOS[14]);
}

// a sanity check of the port itself: FADE_STEPS is what the firmware uses.
const _: () = assert!(FADE_STEPS == 30);
