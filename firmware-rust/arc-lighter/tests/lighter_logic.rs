//! `lighter_logic` — the Rust counterpart of `firmware/test/test_lighter.c`.
//!
//! Every test drives the real [`Lighter::tick`] with 10 ms ticks, exactly
//! like main.c. The scenarios, the numbers and the messages are the C
//! suite's, unchanged — that is the parity claim: this brain is verified
//! against the C brain's OWN test suite, not a rewritten one. If the C
//! and the Rust ever disagree, one of them is wrong, and these tests say
//! which.
//!
//! C had one `main()` with 28 CHECKs; Rust idiom is one `#[test]` per
//! behaviour — the counts still add up to the same 28 promises.

use arc_lighter::logic::{Inputs, Lighter, Outputs, StopCode, TICK_MS};

/// One scripted environment: what the world looks like for a stretch of
/// ticks — button down?, USB in?, cell at mV, coil buzzing at kHz.
/// (≡ the C `env_t`; a plain struct, constructed per scenario.)
#[derive(Clone, Copy)]
struct Env {
    button: bool,
    usb: bool,
    vbat: u16,
    khz: u16,
}

/// The two baselines: idle (nothing pressed, healthy cell, silent coil)
/// and press (FIRE held, 3.9 V, healthy 40 kHz coil).
const IDLE: Env = Env {
    button: false,
    usb: false,
    vbat: 3900,
    khz: 0,
};
const PRESS: Env = Env {
    button: true,
    usb: false,
    vbat: 3900,
    khz: 40,
};

/// Run `ticks` ticks of one environment; return how many had the arc on,
/// and leave the last tick's outputs in `out`. (≡ the C `run()` helper.)
/// Pulses per tick = kHz × TICK_MS — exactly what main.c's hardware
/// counter would deliver.
fn run(l: &mut Lighter, e: Env, ticks: u32, out: &mut Outputs) -> u32 {
    let mut on = 0;
    for _ in 0..ticks {
        *out = l.tick(Inputs {
            button: e.button,
            usb: e.usb,
            vbat_mv: e.vbat,
            pulses: e.khz * TICK_MS,
        });
        on += u32::from(out.fire);
    }
    on
}

/// Count LED flash ONSETS (rising edges): n edges = the LED lit n times.
/// (≡ the C `led_flashes()` helper.)
fn led_flashes(l: &mut Lighter, e: Env, ticks: u32) -> u32 {
    let mut out = Outputs {
        fire: false,
        led: false,
        may_sleep: false,
    };
    let mut n = 0;
    let mut prev = false;
    for _ in 0..ticks {
        run(l, e, 1, &mut out);
        if out.led && !prev {
            n += 1;
        }
        prev = out.led;
    }
    n
}

#[test]
fn happy_path() {
    let mut l = Lighter::new(false, false); // fresh brain, button not held at boot
    let mut out = Outputs {
        fire: false,
        led: false,
        may_sleep: false,
    };

    run(&mut l, IDLE, 10, &mut out); // 100 ms of nothing
    assert!(!out.fire && out.may_sleep, "idle: arc off, may sleep");

    run(&mut l, PRESS, 2, &mut out); // 20 ms of press…
    assert!(!out.fire, "a 20 ms press is still bouncing: no arc yet");
    run(&mut l, PRESS, 2, &mut out); // 30 ms of steady press reached
    assert!(out.fire, "after 30 ms of a steady press the arc starts");

    assert_eq!(
        run(&mut l, PRESS, 300, &mut out),
        300,
        "the arc stays on while FIRE is held (3 s)"
    );

    run(&mut l, IDLE, 3, &mut out); // release
    assert!(
        !out.fire && l.last_stop() == StopCode::None,
        "releasing FIRE stops the arc, no error code"
    );
}

#[test]
fn bouncing_contact_never_fires() {
    // Contact bounce must not fire: alternate the environment every tick
    // (10 ms on, 10 ms off) — what a sparking contact looks like to the chip.
    let mut l = Lighter::new(false, false);
    let mut out = Outputs {
        fire: false,
        led: false,
        may_sleep: false,
    };
    let mut bounce_on = 0;
    for i in 0..40 {
        let e = if i % 2 == 1 { PRESS } else { IDLE };
        bounce_on += run(&mut l, e, 1, &mut out); // 400 ms of chatter
    }
    assert_eq!(
        bounce_on, 0,
        "a bouncing contact (10 ms on/off) never fires"
    );
}

#[test]
fn timeout_and_cooldown() {
    let mut l = Lighter::new(false, false);
    let mut out = Outputs {
        fire: false,
        led: false,
        may_sleep: false,
    };

    // 8 s limit: hold FIRE a full 10 s.
    let on = run(&mut l, PRESS, 1000, &mut out);
    assert!(
        (795..=800).contains(&on) && !out.fire && l.last_stop() == StopCode::Timeout,
        "holding FIRE: the arc stops at 8 s (on-ticks: {on})"
    );

    // Still holding after the timeout: it does NOT re-fire.
    let mut l2 = Lighter::new(false, false);
    run(&mut l2, PRESS, 803, &mut out); // timed out just now
    assert_eq!(
        run(&mut l2, PRESS, 100, &mut out),
        0,
        "still holding after the timeout: it does NOT re-fire"
    );

    // Released and pressed again inside the 5 s cooldown: refused.
    run(&mut l2, IDLE, 5, &mut out); // release…
    assert_eq!(
        run(&mut l2, PRESS, 50, &mut out),
        0,
        "released and pressed again inside the 5 s cooldown: refused"
    );

    // …let the cooldown melt away.
    run(&mut l2, IDLE, 400, &mut out); // 4 s more idle
    assert!(
        run(&mut l2, PRESS, 10, &mut out) > 0,
        "after the cooldown it fires again"
    );

    // Jabbing FIRE during the cooldown doesn't extend it.
    let mut l3 = Lighter::new(false, false);
    run(&mut l3, PRESS, 805, &mut out); // timed out
    for _ in 0..4 {
        run(&mut l3, IDLE, 50, &mut out);
        run(&mut l3, PRESS, 50, &mut out); // jab during cooldown
    }
    run(&mut l3, IDLE, 105, &mut out); // 5.0 s since the timeout
    assert!(
        run(&mut l3, PRESS, 10, &mut out) > 0,
        "jabbing FIRE during the cooldown doesn't extend it"
    );
}

#[test]
fn usb_lockout() {
    let mut l = Lighter::new(false, false);
    let mut out = Outputs {
        fire: false,
        led: false,
        may_sleep: false,
    };
    let usb = Env { usb: true, ..PRESS }; // FIRE held AND USB plugged in

    assert!(
        run(&mut l, usb, 100, &mut out) == 0 && l.last_stop() == StopCode::Usb,
        "USB plugged in: firing refused"
    );

    let mut l2 = Lighter::new(false, false);
    run(&mut l2, PRESS, 50, &mut out); // already firing…
    assert!(out.fire, "(firing)"); // …sanity: the arc really was on
    run(&mut l2, usb, 1, &mut out); // USB lands mid-arc: ONE tick later…
    assert!(
        !out.fire && l2.last_stop() == StopCode::Usb,
        "USB plugged in while firing: stops at once"
    );
    run(&mut l2, PRESS, 100, &mut out); // USB gone, still holding
    assert!(
        !out.fire,
        "…and stays off until FIRE is released and pressed again"
    );
}

#[test]
fn low_battery() {
    let mut l = Lighter::new(false, false);
    let mut out = Outputs {
        fire: false,
        led: false,
        may_sleep: false,
    };
    let low = Env {
        vbat: 3300,
        ..PRESS
    }; // 3.3 V at rest — below the 3.4 V line

    assert!(
        run(&mut l, low, 100, &mut out) == 0 && l.last_stop() == StopCode::LowBattery,
        "cell at 3.3 V at rest: refused"
    );

    // Under load: a 100 ms sag is tolerated; 200 ms of sag stops the arc.
    let mut l2 = Lighter::new(false, false);
    run(&mut l2, PRESS, 50, &mut out); // firing happily…
    let sag = Env {
        vbat: 2900,
        ..PRESS
    }; // the cell sags to 2.9 V under load
    run(&mut l2, sag, 10, &mut out); // 100 ms of sag
    assert!(out.fire, "a 100 ms sag under load is tolerated");
    run(&mut l2, PRESS, 10, &mut out); // back up (resets the accumulator)
    run(&mut l2, sag, 25, &mut out); // …and down again for 250 ms
    assert!(
        !out.fire && l2.last_stop() == StopCode::LowBattery,
        "a sag below 3.0 V for 200 ms stops the arc"
    );
}

#[test]
fn coil_monitor() {
    let mut l = Lighter::new(false, false);
    let mut out = Outputs {
        fire: false,
        led: false,
        may_sleep: false,
    };

    // Total silence: 0 pulses. The brain demands ≥ 2 kHz (40 pulses per
    // 20 ms window); the arc must be cut within 50 ms of starting.
    let dead = Env { khz: 0, ..PRESS };
    let on = run(&mut l, dead, 100, &mut out);
    assert!(
        !out.fire && l.last_stop() == StopCode::CoilFault && on <= 8,
        "no coil pulses: the arc is cut within 50 ms of starting (on-ticks: {on})"
    );

    // 1 kHz = 10 pulses per tick: treated as a fault.
    let mut l2 = Lighter::new(false, false);
    let slow = Env { khz: 1, ..PRESS };
    run(&mut l2, slow, 100, &mut out);
    assert!(
        !out.fire && l2.last_stop() == StopCode::CoilFault,
        "pulses at 1 kHz (< 2 kHz): treated as a fault"
    );

    // 5 kHz and 20 kHz — comfortably healthy: keeps firing the full 3 s.
    // (300 ticks, 2 of which are the debounce: on == 298.)
    let mut l3 = Lighter::new(false, false);
    let ok5 = Env { khz: 5, ..PRESS };
    assert!(
        run(&mut l3, ok5, 300, &mut out) == 298 && out.fire,
        "5 kHz (below the slowest simulated coil): keeps firing"
    );
    let mut l4 = Lighter::new(false, false);
    let ok20 = Env { khz: 20, ..PRESS };
    assert!(
        run(&mut l4, ok20, 300, &mut out) == 298 && out.fire,
        "20 kHz (the slowest simulated coil): keeps firing"
    );

    // Module mode (≡ MODULE=1): the monitor is compiled OUT of the logic.
    let mut l5 = Lighter::new(true, false);
    assert!(
        run(&mut l5, dead, 300, &mut out) == 298 && out.fire,
        "module mode (MODULE=1): no coil monitor"
    );
}

#[test]
fn boot_with_button_held() {
    // A reset while firing (e.g. a brown-out): after a reset the brain
    // cannot know the past — so it distrusts the present.
    let mut l = Lighter::new(false, true); // button ALREADY down at boot
    let mut out = Outputs {
        fire: false,
        led: false,
        may_sleep: false,
    };
    assert_eq!(
        run(&mut l, PRESS, 300, &mut out),
        0,
        "boot with FIRE held: waits for a release first"
    );
    run(&mut l, IDLE, 5, &mut out); // release…
    assert!(run(&mut l, PRESS, 10, &mut out) > 0, "…then works normally");
}

#[test]
fn blink_codes() {
    // The LED is the only display — count its flashes.
    // 6 onsets = "3 flashes" × 2 repeats; 8 = 4 × 2.
    let mut l = Lighter::new(false, false);
    let mut out = Outputs {
        fire: false,
        led: false,
        may_sleep: false,
    };
    let low = Env {
        vbat: 3300,
        ..PRESS
    };

    run(&mut l, low, 4, &mut out); // trigger low battery (blink 3)
    assert_eq!(
        led_flashes(&mut l, IDLE, 600),
        6,
        "low battery blinks 3 × 2"
    );

    let mut l2 = Lighter::new(false, false);
    let dead = Env { khz: 0, ..PRESS };
    run(&mut l2, dead, 9, &mut out); // trigger coil fault (blink 4)
    assert_eq!(
        led_flashes(&mut l2, IDLE, 800),
        8,
        "coil fault blinks 4 × 2"
    );

    run(&mut l2, IDLE, 50, &mut out);
    assert!(
        out.may_sleep && !out.led,
        "after the code the lighter goes back to sleep"
    );
}
