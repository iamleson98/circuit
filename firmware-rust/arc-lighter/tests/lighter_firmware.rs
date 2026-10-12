//! `lighter_firmware` — the WHOLE firmware ([`run`]), wiring and all, run
//! against a scripted world.
//!
//! The C project could not do this: its main.c is welded to the registers,
//! so only the lamp project went to the trouble of a stand-in avr-libc
//! header suite (sim_avr/) to run it on a PC. Here the firmware is generic
//! over [`LighterHal`], so the "simulator" is just a second implementation
//! of the trait — a `Sim` struct with a time-indexed script of what the
//! world does, plus a log of what the firmware did about it.
//!
//! The scenario ends by "pulling the power": `wait_tick` panics with
//! `SimExit::End`, which `catch_unwind` turns back into a normal return —
//! the Rust equivalent of the C simulator's setjmp/longjmp, but with the
//! unwinding guaranteed to run every destructor on the way out.

use arc_lighter::firmware::{LighterHal, run};
use std::panic::{AssertUnwindSafe, catch_unwind, panic_any, resume_unwind};
use std::sync::OnceLock;

/// How the simulator ends a scenario (≡ the C sim's `longjmp(end_jb)`).
#[derive(Debug)]
struct SimExit;

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

/// One stretch of the world's script: from `from_ms` on, the button is
/// down/up, the cell sits at `vbat`, the coil buzzes at `khz`, USB is in/out.
#[derive(Clone)]
struct Phase {
    from_ms: u32,
    button: bool,
    usb: bool,
    vbat: u16,
    khz: u16,
}

/// The world + everything the firmware did to it.
struct Sim {
    t_ms: u32,
    end_at_ms: u32,
    phases: Vec<Phase>,
    gate: bool,
    gate_log: Vec<(u32, bool)>, // (instant, gate state) — one sample per tick
    sleeps: u32,
}

impl Sim {
    fn new(end_at_ms: u32, phases: &[Phase]) -> Self {
        Sim {
            t_ms: 0,
            end_at_ms,
            phases: phases.to_vec(),
            gate: false,
            gate_log: Vec::new(),
            sleeps: 0,
        }
    }

    /// The phase in force right now (script times are increasing).
    fn phase(&self) -> &Phase {
        self.phases
            .iter()
            .rev()
            .find(|p| p.from_ms <= self.t_ms)
            .expect("the script must cover all time")
    }

    /// Ticks with the arc on, inside [a, b) — the C suite's "on" counter.
    fn on_ticks(&self, a: u32, b: u32) -> u32 {
        self.gate_log
            .iter()
            .filter(|&&(t, on)| on && a <= t && t < b)
            .count() as u32
    }

    fn first_on(&self) -> u32 {
        self.gate_log
            .iter()
            .find(|&&(_, on)| on)
            .map(|&(t, _)| t)
            .expect("the gate never came on")
    }

    fn last_on(&self) -> u32 {
        self.gate_log
            .iter()
            .rev()
            .find(|&&(_, on)| on)
            .map(|&(t, _)| t)
            .expect("the gate never came on")
    }

    /// Run the firmware to the end of the script, then hand the Sim back
    /// with its logs intact.
    fn play(mut self, module_mode: bool) -> Self {
        let result = catch_unwind(AssertUnwindSafe(|| run(&mut self, module_mode)));
        match result {
            Ok(never) => match never {},
            Err(e) if e.downcast_ref::<SimExit>().is_some() => self,
            Err(e) => resume_unwind(e),
        }
    }
}

impl LighterHal for Sim {
    fn button_pressed(&self) -> bool {
        self.phase().button
    }
    fn usb_present(&self) -> bool {
        self.phase().usb
    }
    fn vcc_mv(&mut self) -> u16 {
        self.phase().vbat
    }
    fn take_pulses(&mut self) -> u16 {
        self.phase().khz * 10 // pulses per tick = kHz × 10 ms, as the C tests script it
    }
    fn set_gate(&mut self, on: bool) {
        self.gate = on;
    }
    fn set_led(&mut self, _on: bool) {}
    fn wait_tick(&mut self) {
        // One heartbeat: the completed tick's gate state is now history.
        self.gate_log.push((self.t_ms, self.gate));
        self.t_ms += 10;
        if self.t_ms > self.end_at_ms {
            panic_any(SimExit); // end of scenario: "pull the power"
        }
    }
    fn sleep_until_button(&mut self) {
        self.sleeps += 1; // the real chip powers down here; the sim just notes it
    }
    fn delay_ms(&mut self, _ms: u16) {}
}

#[test]
fn fires_holds_times_out_cools_down_and_fires_again() {
    silence_sim_exit();
    let sim = Sim::new(
        14_200,
        &[
            // boot quiet — the chip may power down (and does)
            Phase {
                from_ms: 0,
                button: false,
                usb: false,
                vbat: 3900,
                khz: 0,
            },
            // FIRE held 8.3 s: the arc lights after the 30 ms debounce,
            // runs to the 8 s heat budget, is cut, and (still held) must
            // NOT re-fire.
            Phase {
                from_ms: 100,
                button: true,
                usb: false,
                vbat: 3900,
                khz: 40,
            },
            Phase {
                from_ms: 8_300,
                button: true,
                usb: false,
                vbat: 3900,
                khz: 40,
            },
            // released; pressed again INSIDE the 5 s cooldown: refused.
            Phase {
                from_ms: 9_300,
                button: false,
                usb: false,
                vbat: 3900,
                khz: 0,
            },
            Phase {
                from_ms: 9_800,
                button: true,
                usb: false,
                vbat: 3900,
                khz: 40,
            },
            Phase {
                from_ms: 10_300,
                button: false,
                usb: false,
                vbat: 3900,
                khz: 0,
            },
            // cooldown melted: a fresh press lights it again.
            Phase {
                from_ms: 13_400,
                button: true,
                usb: false,
                vbat: 3900,
                khz: 40,
            },
        ],
    )
    .play(false);

    // The chip slept while idle at boot (may_sleep wired correctly).
    assert!(
        sim.sleeps > 0,
        "an idle lighter powers down until the button"
    );

    // The arc starts within the 30 ms debounce window of the press (the
    // flip lands on the 3rd agreeing tick), and stays on for the full heat
    // budget (same count range as the C suite).
    assert_eq!(
        sim.first_on(),
        120,
        "the arc starts ~20 ms after the press begins (3rd tick)"
    );
    let on = sim.on_ticks(0, 8_300);
    assert!(
        (795..=810).contains(&on),
        "the arc runs to the 8 s limit then stops (on-ticks: {on})"
    );

    // Held after the timeout, refused inside the cooldown: no arc at all
    // for the whole stretch until the cooldown has melted.
    assert_eq!(
        sim.on_ticks(8_300, 13_400),
        0,
        "held after the timeout / re-pressed inside the cooldown: no re-fire"
    );

    // After the cooldown, a fresh press lights it again.
    assert!(
        sim.on_ticks(13_400, 14_200) > 0,
        "after the cooldown it fires again"
    );
    assert!(
        sim.last_on() >= 13_420,
        "the re-fire is a new press, debounced afresh"
    );
}

#[test]
fn a_dead_coil_cuts_the_arc_within_50ms() {
    silence_sim_exit();
    let sim = Sim::new(
        600,
        &[
            Phase {
                from_ms: 0,
                button: false,
                usb: false,
                vbat: 3900,
                khz: 0,
            },
            Phase {
                from_ms: 100,
                button: true,
                usb: false,
                vbat: 3900,
                khz: 0,
            }, // silent coil
        ],
    )
    .play(false);

    assert_eq!(sim.first_on(), 120, "the arc starts as usual");
    let on = sim.on_ticks(100, 600);
    assert!(
        on <= 8 && sim.last_on() <= 160,
        "no coil pulses: the arc is cut within 50 ms of starting (on-ticks: {on})"
    );
    assert_eq!(
        sim.on_ticks(200, 600),
        0,
        "and it stays off (the button is still held — release-before-refire)"
    );
}

#[test]
fn usb_mid_arc_stops_it_at_once_and_it_stays_off() {
    silence_sim_exit();
    let sim = Sim::new(
        800,
        &[
            Phase {
                from_ms: 0,
                button: false,
                usb: false,
                vbat: 3900,
                khz: 0,
            },
            Phase {
                from_ms: 100,
                button: true,
                usb: false,
                vbat: 3900,
                khz: 40,
            },
            Phase {
                from_ms: 400,
                button: true,
                usb: true,
                vbat: 3900,
                khz: 40,
            }, // USB lands
            Phase {
                from_ms: 500,
                button: true,
                usb: false,
                vbat: 3900,
                khz: 40,
            }, // USB gone, still held
        ],
    )
    .play(false);

    assert!(
        sim.on_ticks(100, 400) > 25,
        "it was firing before USB landed"
    );
    assert_eq!(
        sim.on_ticks(400, 800),
        0,
        "USB stops the arc within one tick and it stays off until FIRE is released"
    );
}
