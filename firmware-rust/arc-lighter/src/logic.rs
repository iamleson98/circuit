//! The arc lighter's safety logic — the Rust counterpart of `lighter.c`.
//!
//! The rules, in order of precedence while firing (unchanged from the C:
//! these ARE the product):
//!   1. FIRE released          → stop (normal use)
//!   2. USB plugged in         → stop, blink 2
//!   3. coil not oscillating   → stop, blink 4
//!   4. cell sagging < 3.0 V   → stop, blink 3
//!   5. 8 s of continuous arc  → stop, blink 1, 5 s cooldown
//!
//! After any stop other than a release, the button must be let go before
//! the lighter fires again — a held button never re-triggers, not even
//! after a reset.
//!
//! WHERE THE RUST DIFFERS FROM THE C (the point of the exercise):
//! * C keeps the state (`ST_IDLE`…) in an int enum and the three "watches"
//!   (fire_ms, window, low_ms) as loose struct fields that only *mean*
//!   something while firing. Rust puts the watches INSIDE the state:
//!   [`State::Firing`] owns them, so they cannot be read, kept, or
//!   forgotten in the wrong state — re-entering Firing constructs fresh
//!   watches, leaving Firing destroys them. The compiler now enforces
//!   what the C code had to promise by convention.
//! * C's `switch` silently falls through if a case is missing; a Rust
//!   `match` must be exhaustive, so adding a state forces every handler
//!   to acknowledge it (see [`Lighter::tick`]).
//! * C returns outputs through a pointer (`lighter_tick(l, &in, &out)`);
//!   Rust returns a value ([`Outputs`]). No out-parameters, no "did the
//!   caller pass null?" — the type system carries the contract.
//! * Blink codes were an anonymous enum of u8 constants; they are now
//!   [`StopCode`], a real type — passing `7` is a compile error now.

// ── tunables (≡ lighter.h's #defines; change behaviour HERE, never in the logic) ──

/// The whole design runs on this drumbeat: main samples the world and calls
/// [`Lighter::tick`] once every `TICK_MS` milliseconds.
pub const TICK_MS: u16 = 10;

/// 30 ms of a steady button before it counts: a physical contact "bounces"
/// for a few ms on press; demanding 3 agreeing ticks filters it in time.
pub const DEBOUNCE_TICKS: u8 = 3;
/// Longest continuous arc — the coil's heat budget.
pub const FIRE_MAX_MS: u16 = 8_000;
/// After hitting the limit: let the coil and the cell cool before another arc.
pub const COOLDOWN_MS: u16 = 5_000;
/// Let the oscillator start before judging it (a cold oscillator needs a few ms).
pub const OSC_SETTLE_MS: u16 = 20;
/// Count coil pulses over this window…
pub const OSC_WINDOW_MS: u16 = 20;
/// …and demand ≥ 40 of them (2 kHz). A stalled driver gives 0.
pub const OSC_MIN_PULSES: u16 = 40;
/// Refuse to start below this (cell at rest).
pub const VBAT_REST_MIN_MV: u16 = 3_400;
/// Stop if the cell sags below this while firing…
pub const VBAT_LOAD_MIN_MV: u16 = 3_000;
/// …for this long (100 ms of sag is inrush; 200 ms is a tired cell).
pub const VBAT_LOAD_MS: u16 = 200;

/// The blink pattern's shape (≡ lighter.c's private #defines).
const BLINK_ON_MS: u16 = 200;
const BLINK_OFF_MS: u16 = 250;
const BLINK_PAUSE_MS: u16 = 800;
const BLINK_REPEATS: u16 = 2;

/// Why an arc ended — and the status LED's whole vocabulary (≡ `CODE_*`).
/// The LED is the lighter's only display: N flashes, a pause, twice.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum StopCode {
    /// No stop, or a plain release: nothing to say. (≡ `CODE_NONE = 0`)
    #[default]
    None,
    /// Blink 1 — the 8 s heat budget ran out.
    Timeout,
    /// Blink 2 — never fire while charging.
    Usb,
    /// Blink 3 — the cell is empty / sagging.
    LowBattery,
    /// Blink 4 — the coil is not oscillating.
    CoilFault,
}

impl StopCode {
    /// How many flashes this code shows (0 for [`StopCode::None`]).
    /// C computed `l->code * flash` with a raw int; here the mapping
    /// lives in one obvious place.
    const fn flashes(self) -> u16 {
        match self {
            StopCode::None => 0,
            StopCode::Timeout => 1,
            StopCode::Usb => 2,
            StopCode::LowBattery => 3,
            StopCode::CoilFault => 4,
        }
    }
}

/// The machine's states. The [`State::Firing`] variant OWNS the three
/// watches (time under arc, the oscillator-check window, the sag timer):
/// they are born on entry, destroyed on exit, and cannot exist in the
/// other states — the C version enforced this only by discipline.
#[derive(Clone, Copy, Debug)]
enum State {
    /// Asleep until the button.
    Idle,
    /// Arc on, every rule in force. `fire_ms` = time under arc so far;
    /// `window` = the rolling oscillator check; `low_ms` = sag time.
    Firing {
        fire_ms: u16,
        window: OscWindow,
        low_ms: u16,
    },
    /// A safety stop happened: the button must be let go first.
    WaitRelease,
}

/// The rolling oscillator-check window (pulses counted over ~20 ms).
#[derive(Clone, Copy, Default, Debug)]
struct OscWindow {
    ms: u16,
    pulses: u16,
}

/// What the world looks like for one tick (≡ `lighter_in_t`).
/// Sampled by the firmware layer; fed to [`Lighter::tick`].
#[derive(Clone, Copy, Debug)]
pub struct Inputs {
    /// FIRE pressed (raw, not debounced).
    pub button: bool,
    /// USB power present.
    pub usb: bool,
    /// Cell voltage this tick, millivolts.
    pub vbat_mv: u16,
    /// Coil pulses counted during this tick (by hardware, on T0).
    pub pulses: u16,
}

/// What the firmware layer should make real after the tick (≡ `lighter_out_t`).
#[derive(Clone, Copy, Debug)]
pub struct Outputs {
    /// True = power the arc driver.
    pub fire: bool,
    /// Status LED.
    pub led: bool,
    /// Nothing to do until the button changes: the chip may power down.
    pub may_sleep: bool,
}

/// The lighter's private state (≡ `lighter_t`). One instance, owned by the
/// firmware layer; nothing outside this module can touch its fields —
/// tests observe behaviour through [`Lighter::tick`] and [`Lighter::last_stop`],
/// exactly like real callers.
pub struct Lighter {
    /// A sealed arc module is fitted: no coil monitor (≡ `MODULE=1`).
    module_mode: bool,
    state: State,
    /// The debounced button.
    pressed: bool,
    /// Ticks the raw button has disagreed with `pressed`.
    bounce: u8,
    /// Remaining cooldown after a timeout.
    cooldown_ms: u16,
    blink: Blinker,
    last_stop: StopCode,
}

impl Lighter {
    /// Set a fresh brain going (≡ `lighter_init`). Call once at boot.
    ///
    /// `button_held_at_boot`: if the button was already down when the chip
    /// came up (a reset while firing?), the lighter distrusts the present
    /// and waits for a release first — the same safety rule as the C.
    pub const fn new(module_mode: bool, button_held_at_boot: bool) -> Self {
        Lighter {
            state: if button_held_at_boot {
                State::WaitRelease
            } else {
                State::Idle
            },
            module_mode,
            // The raw press IS this press (no debounce history yet):
            pressed: button_held_at_boot,
            bounce: 0,
            cooldown_ms: 0,
            blink: Blinker::new(),
            last_stop: StopCode::None,
        }
    }

    /// Why the last arc stopped (≡ reading `l->last_stop` in the C tests).
    pub const fn last_stop(&self) -> StopCode {
        self.last_stop
    }

    /// One drumbeat: read `input`, update the machine, return the verdict.
    /// Call every [`TICK_MS`] ms, like the C `lighter_tick`.
    pub fn tick(&mut self, input: Inputs) -> Outputs {
        // Debounce: the raw level must disagree for DEBOUNCE_TICKS ticks in
        // a row; 3 strikes = the opinion flips. (saturating_add where C
        // relies on u8 wrap never being reached in 8 s — same behaviour,
        // and it can never overflow-panic.)
        if input.button != self.pressed {
            self.bounce = self.bounce.saturating_add(1);
            if self.bounce >= DEBOUNCE_TICKS {
                self.pressed = input.button;
                self.bounce = 0;
            }
        } else {
            self.bounce = 0;
        }

        // The cooldown just melts: a countdown per tick, floored at 0.
        // (C: `cooldown > TICK ? cooldown - TICK : 0` — saturating_sub is
        // the same thing without the branch; a new timeout is the only
        // thing that ever re-arms it.)
        if self.cooldown_ms > 0 {
            self.cooldown_ms = self.cooldown_ms.saturating_sub(TICK_MS);
        }

        // The state machine — "in THIS state, with THESE inputs:".
        // One method per state; the match is exhaustive, so a future new
        // State variant cannot compile until every handler copes with it.
        match self.state {
            State::Idle => self.step_idle(&input),
            State::Firing { .. } => self.step_firing(&input),
            State::WaitRelease => self.step_wait_release(),
        }

        // The outputs, derived from where the machine ended up.
        Outputs {
            fire: matches!(self.state, State::Firing { .. }),
            led: self.blink.step(),
            may_sleep: matches!(self.state, State::Idle)
                && !self.pressed
                && !self.blink.showing()
                && self.cooldown_ms == 0
                && self.bounce == 0,
        }
        // may_sleep asks: nothing to do AND nothing in flight — no message
        // still blinking, no countdown running, no half-debounced press.
    }

    /// IDLE: asleep; only a press can start anything.
    fn step_idle(&mut self, input: &Inputs) {
        if !self.pressed {
            return;
        }
        if input.usb {
            self.stop(StopCode::Usb); // rule 2 first: never fire while charging
        } else if self.cooldown_ms > 0 {
            // Inside the cooldown: remind (blink 1) but don't restart it.
            self.state = State::WaitRelease;
            self.blink.start(StopCode::Timeout);
        } else if input.vbat_mv < VBAT_REST_MIN_MV {
            self.stop(StopCode::LowBattery); // rule 4, at rest, before we even start
        } else {
            // All clear: light it. The watches are born here — fresh state,
            // no leftovers, by construction.
            self.state = State::Firing {
                fire_ms: 0,
                window: OscWindow::default(),
                low_ms: 0,
            };
            self.blink.clear(); // no message pending
        }
    }

    /// FIRING: the arc is on — watch everything, in order of precedence.
    /// Early `return` = the C `break` (skip the remaining rules this tick).
    fn step_firing(&mut self, input: &Inputs) {
        // Copy the watches out (State is Copy) so the borrows end and the
        // stop paths below can overwrite self.state freely:
        let State::Firing {
            mut fire_ms,
            mut window,
            mut low_ms,
        } = self.state
        else {
            return;
        };
        fire_ms += TICK_MS; // time under arc

        // Rule 1: release — back to sleep, no code.
        if !self.pressed {
            self.last_stop = StopCode::None;
            self.state = State::Idle;
            return;
        }
        // Rule 2: USB.
        if input.usb {
            self.stop(StopCode::Usb);
            return;
        }
        // Rule 3: the coil monitor (after the settle grace period; compiled
        // out entirely in module mode, like the C's `#ifndef MODULE`).
        if !self.module_mode && fire_ms > OSC_SETTLE_MS {
            // Accumulate this tick's pulses into the window (wrapping, like
            // the C's cast — it is never near the limit in practice).
            window.pulses = window.pulses.wrapping_add(input.pulses);
            window.ms += TICK_MS;
            if window.ms >= OSC_WINDOW_MS {
                // Window closed: judge it.
                if window.pulses < OSC_MIN_PULSES {
                    self.stop(StopCode::CoilFault); // silent or too slow
                    return;
                }
                window = OscWindow::default(); // passed: open the next
            }
        }
        // Rule 4: the cell under load. One 100 ms sag is inrush; 200 ms
        // of sag is a tired cell.
        if input.vbat_mv < VBAT_LOAD_MIN_MV {
            low_ms += TICK_MS;
            if low_ms >= VBAT_LOAD_MS {
                self.stop(StopCode::LowBattery);
                return;
            }
        } else {
            low_ms = 0; // recovered: the accumulator resets
        }
        // Rule 5: the heat budget.
        if fire_ms >= FIRE_MAX_MS {
            self.stop(StopCode::Timeout);
            return;
        }
        // Every rule survived: still firing — write the watches back.
        self.state = State::Firing {
            fire_ms,
            window,
            low_ms,
        };
    }

    /// WAIT_RELEASE: a safety stop; the button must go first.
    fn step_wait_release(&mut self) {
        if !self.pressed {
            self.state = State::Idle;
        }
    }

    /// A SAFETY stop (not a plain release): enter WAIT_RELEASE, tell the
    /// user why, and arm the cooldown if the reason was the 8 s timeout.
    /// (≡ the C `stop()` helper, used by every rule above.)
    fn stop(&mut self, code: StopCode) {
        self.last_stop = code; // for tests / debugging
        self.state = State::WaitRelease;
        if code != StopCode::None {
            self.blink.start(code); // CODE_NONE = a release: no message
        }
        if code == StopCode::Timeout {
            self.cooldown_ms = COOLDOWN_MS; // only the timeout earns a cooldown
        }
    }
}

/// The blink pattern player (≡ `blink_led` + `show` in lighter.c).
/// Encapsulated here so the tick's output stage is one line.
struct Blinker {
    code: StopCode,
    ms: u16,
}

impl Blinker {
    const fn new() -> Self {
        Blinker {
            code: StopCode::None,
            ms: 0,
        }
    }

    /// Start showing a code: remember which one, restart its clock.
    fn start(&mut self, code: StopCode) {
        self.code = code;
        self.ms = 0;
    }

    /// Retract any message (used when a new arc begins).
    fn clear(&mut self) {
        self.code = StopCode::None;
    }

    /// Is a message still being shown?
    const fn showing(&self) -> bool {
        !matches!(self.code, StopCode::None)
    }

    /// One tick of the pattern: "LED on right now?" (≡ `blink_led`).
    /// Slices one repeating timeline [flash × code | pause] and asks where
    /// `ms` falls inside it — the maths is the C's, unchanged.
    fn step(&mut self) -> bool {
        if self.code == StopCode::None {
            return false; // nothing to say
        }
        let n = self.code.flashes();
        let slot = BLINK_ON_MS + BLINK_OFF_MS; // one flash slot: 200 on + 250 off
        let cycle = n * slot + BLINK_PAUSE_MS; // one full cycle: n slots + the pause
        if self.ms >= cycle * BLINK_REPEATS {
            self.code = StopCode::None; // both repeats played out: message over
            return false;
        }
        let t = self.ms % cycle; // where in THIS cycle are we?
        self.ms += TICK_MS; // the clock advances one tick
        if t >= n * slot {
            return false; // inside the trailing pause: LED off
        }
        (t % slot) < BLINK_ON_MS // inside a flash slot: on for the first 200 ms
    }
}
