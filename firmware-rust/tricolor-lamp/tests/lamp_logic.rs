//! `lamp_logic` — the Rust counterpart of `firmware/test/test_lamp.c`.
//!
//! The fake EEPROM, the power-cycle harness and every case below are the
//! C suite's, unchanged — including the exact trip points (376 vs 377,
//! 600 vs 608) that pin the thresholds with no tolerance left for
//! "approximately". If the C and the Rust ever disagree, one of them is
//! wrong, and these tests say which.
//!
//! C had one `main()` with 33 CHECKs; Rust idiom is one `#[test]` per
//! behaviour — the counts still add up to the same 33 promises.

use tricolor_lamp::journal::{self, Record, Store};
use tricolor_lamp::logic::{self, Color, Mode, OffKind};

// ── a fake EEPROM that counts writes per cell and can "lose power" ──────
// The real journal only ever sees memory through the Store trait. So the
// test provides a Store of the SAME SHAPE that operates on a plain array —
// and records a little extra bookkeeping: writes[a] (the wear test needs
// it) and cut_after ("simulate a power cut: after N writes, writes stop
// landing"). (≡ test_lamp.c's statics + rd/wr.)
struct FakeEeprom {
    mem: [u8; 512],     // the "EEPROM": 512 bytes like the real one
    writes: [u32; 512], // per-cell write counters (wear tracking)
    cut_after: isize,   // -1 = unlimited; 0 = next write is lost; >0 = writes left
}

impl FakeEeprom {
    /// Reset to "brand new": every cell 0xFF (an erased EEPROM byte reads
    /// 0xFF), zero wear counters, power back on. (≡ erase_all.)
    fn erased() -> Self {
        FakeEeprom {
            mem: [0xFF; 512],
            writes: [0; 512],
            cut_after: -1,
        }
    }
}

impl Store for FakeEeprom {
    fn read(&mut self, a: u16) -> u8 {
        self.mem[a as usize]
    }
    fn write(&mut self, a: u16, v: u8) {
        // Honour the power cut FIRST (and spend one of the remaining
        // writes even when it does write — the cut counts attempts).
        if self.cut_after == 0 {
            return;
        }
        if self.cut_after > 0 {
            self.cut_after -= 1;
        }
        let i = a as usize;
        self.mem[i] = v;
        self.writes[i] += 1;
    }
}

// ── the power-cycle harness (≡ power_cycles) ────────────────────────────
// Plays a whole lamp "life": for each power-on, ask the real functions
// what colour to show, remember it in the journal (like the firmware
// does), and record what the user would have SEEN. `offs[i]` is how long
// the power was off before power-on i; a NEGATIVE number means "the chip
// itself browned out" (cold boot) — the firmware then re-reads the
// EEPROM as if from scratch, which the last statement of the loop replays.
fn power_cycles(store: &mut FakeEeprom, mode: Mode, offs: &[isize]) -> Vec<Color> {
    let mut saved = Color::Blue;
    let mut slot = 0;
    let mut have = false;
    if let Some(r) = journal::load(store) {
        saved = r.color;
        slot = r.slot;
        have = true;
    }
    let mut shown = Vec::with_capacity(offs.len());
    for &off in offs {
        let k = if off < 0 {
            logic::classify_off(0, true) // negative = cold boot
        } else {
            logic::classify_off(off as u32, false)
        };
        let c = logic::next_color(mode, k, have, saved);
        if !have || c != saved {
            // remember it, exactly as main.c does after a held switch-on
            slot = journal::save(store, c, have.then_some(slot));
            have = true;
            saved = c;
        }
        shown.push(c); // what colour the user sees at this power-on
        if off < 0 {
            // a cold boot re-reads EEPROM
            match journal::load(store) {
                Some(r) => {
                    have = true;
                    saved = r.color;
                    slot = r.slot;
                }
                None => have = false,
            }
        }
    }
    shown
}

#[test]
fn mode_jumper() {
    assert_eq!(
        logic::mode_from_adc(5),
        Mode::Memory,
        "jumper LO (≈0 V) → MEMORY"
    );
    assert_eq!(
        logic::mode_from_adc(512),
        Mode::Step,
        "no jumper (VCC/2) → STEP"
    );
    assert_eq!(
        logic::mode_from_adc(1015),
        Mode::Reset,
        "jumper HI (≈VCC) → RESET"
    );
    assert!(
        logic::mode_from_adc(450) == Mode::Step && logic::mode_from_adc(600) == Mode::Step,
        "±20 % around VCC/2 still reads STEP"
    );
}

#[test]
fn supply_thresholds() {
    // (readings as the ADC gives them: 12 V ≈ 670) Each threshold is probed
    // from BOTH sides, one count apart where the exact boundary matters —
    // that is how you pin a trip point with no tolerance for "approximately".
    assert!(
        !logic::supply_dropped(670, 670) && !logic::supply_dropped(590, 670),
        "on: up to 1/8 below normal is still on"
    );
    assert!(
        logic::supply_dropped(585, 670),
        "off: more than 1/8 below normal (≈ 10.4 V)"
    );
    assert!(
        !logic::supply_back(600, 670) && logic::supply_back(608, 670),
        "back: within 3/32 of normal (≈ 10.9 V) — a little above the off line"
    );
    assert!(
        logic::supply_dead(376, 670) && !logic::supply_dead(377, 670),
        "dead: below 9/16 of normal (≈ 6.5 V): the LEDs can go out"
    );
    assert!(
        logic::supply_steady(660, 670)
            && logic::supply_steady(680, 670)
            && !logic::supply_steady(640, 670),
        "steady: within 1/32"
    );
    assert!(
        logic::supply_dropped(0, 1023) && logic::supply_back(1023, 1023),
        "no overflow at the ends of the range"
    );
}

#[test]
fn classify_borders() {
    assert_eq!(
        logic::classify_off(50, false),
        OffKind::Glitch,
        "50 ms off: a supply glitch"
    );
    assert_eq!(
        logic::classify_off(400, false),
        OffKind::Quick,
        "0.4 s off: a quick flip"
    );
    assert_eq!(
        logic::classify_off(3000, false),
        OffKind::Quick,
        "3.0 s off: still a quick flip"
    );
    assert_eq!(
        logic::classify_off(3100, false),
        OffKind::Long,
        "3.1 s off: a long off"
    );
    assert_eq!(
        logic::classify_off(0, true),
        OffKind::Long,
        "cold boot: always a long off"
    );
}

#[test]
fn step_flips() {
    let mut store = FakeEeprom::erased();
    let shown = power_cycles(&mut store, Mode::Step, &[-1, 500, 500, 500, 500]);
    assert_eq!(
        shown,
        vec![
            Color::Blue,
            Color::White,
            Color::Yellow,
            Color::Blue,
            Color::White
        ],
        "STEP: first power-up blue, then white, yellow, blue, white…"
    );
}

#[test]
fn step_long_offs_and_cold_boots() {
    let mut store = FakeEeprom::erased();
    let shown = power_cycles(&mut store, Mode::Step, &[-1, 10000, -1, -1]);
    assert_eq!(
        shown,
        vec![Color::Blue, Color::White, Color::Yellow, Color::Blue],
        "STEP: long offs and cold boots step too (exactly like the original lamp)"
    );
}

#[test]
fn step_glitches() {
    let mut store = FakeEeprom::erased();
    let shown = power_cycles(&mut store, Mode::Step, &[-1, 500, 60, 60, 500]);
    assert_eq!(
        shown,
        vec![
            Color::Blue,
            Color::White,
            Color::White,
            Color::White,
            Color::Yellow
        ],
        "glitches (< 150 ms) never change the colour"
    );
}

#[test]
fn memory_keeps_the_colour() {
    let mut store = FakeEeprom::erased();
    let shown = power_cycles(&mut store, Mode::Memory, &[-1, 500, 500, -1, 20000, 500]);
    assert_eq!(
        shown,
        vec![
            Color::Blue,
            Color::White,
            Color::Yellow,
            Color::Yellow,
            Color::Yellow,
            Color::Blue
        ],
        "MEMORY: quick flips step; after a long off it comes back in the same colour"
    );
}

#[test]
fn reset_restarts_blue() {
    let mut store = FakeEeprom::erased();
    let shown = power_cycles(&mut store, Mode::Reset, &[-1, 500, 500, -1, 500, 20000]);
    assert_eq!(
        shown,
        vec![
            Color::Blue,
            Color::White,
            Color::Yellow,
            Color::Blue,
            Color::White,
            Color::Blue
        ],
        "RESET: quick flips step; after a long off it starts blue"
    );
}

#[test]
fn journal_roundtrip_and_ring() {
    let mut store = FakeEeprom::erased();
    assert_eq!(journal::load(&mut store), None, "blank EEPROM: no record");

    let mut slot = journal::save(&mut store, Color::Yellow, None);
    assert_eq!(
        journal::load(&mut store),
        Some(Record {
            color: Color::Yellow,
            slot: 0
        }),
        "save then load"
    );

    for i in 0..300u32 {
        // hammer it around the whole ring
        slot = journal::save(&mut store, Color::ALL[(i % 3) as usize], Some(slot));
    }
    assert_eq!(
        journal::load(&mut store).map(|r| r.color),
        Some(Color::ALL[(299 % 3) as usize]),
        "300 saves later (wrapping the 128-slot ring) the newest record wins"
    );
    let live = store.mem.iter().filter(|&&v| v != 0xFF).count();
    assert_eq!(live, 1, "exactly one live record in the ring");
}

#[test]
fn journal_power_cuts() {
    // cut_after = N means "the Nth write from now is lost": exactly the
    // window between "new record written" and "old record erased".
    let mut store = FakeEeprom::erased();
    let mut slot = journal::save(&mut store, Color::Blue, None);
    store.cut_after = 1; // the new record lands, the erase doesn't
    slot = journal::save(&mut store, Color::White, Some(slot));
    store.cut_after = -1; // power restored
    assert_eq!(
        journal::load(&mut store),
        Some(Record {
            color: Color::White,
            slot: 1
        }),
        "power cut after the new write: the new colour is kept"
    );
    journal::save(&mut store, Color::Yellow, Some(slot));
    assert_eq!(
        journal::load(&mut store),
        Some(Record {
            color: Color::Yellow,
            slot: 2
        }),
        "…and the journal carries on normally"
    );

    // Power cut BEFORE anything is written: the whole save is lost.
    let mut store2 = FakeEeprom::erased();
    let slot2 = journal::save(&mut store2, Color::Blue, None);
    store2.cut_after = 0; // next write is lost
    journal::save(&mut store2, Color::White, Some(slot2));
    store2.cut_after = -1;
    assert_eq!(
        journal::load(&mut store2),
        Some(Record {
            color: Color::Blue,
            slot: 0
        }),
        "power cut before the write: the old colour is kept"
    );
}

#[test]
fn journal_wrap_and_garbage() {
    // The record wraps from slot 127 to 0: plant records by hand
    // (bypassing save) to build the exact half-finished state a cut leaves.
    let mut store = FakeEeprom::erased();
    store.mem[127] = 0x80 | (15 << 2) | 1; // sequence 15, white
    assert_eq!(
        journal::load(&mut store),
        Some(Record {
            color: Color::White,
            slot: 127
        }),
        "a record in the last slot loads"
    );
    store.mem[0] = 0x80 | 2; // tag | sequence 0 (15 + 1 wrapped) | yellow; old not erased
    assert_eq!(
        journal::load(&mut store),
        Some(Record {
            color: Color::Yellow,
            slot: 0
        }),
        "wrap-around half-save: sequence 0 follows 15"
    );

    // Garbage is ignored: no tag bits / impossible colour = not a record.
    let mut store2 = FakeEeprom::erased();
    store2.mem[5] = 0x37; // no tag
    store2.mem[6] = 0x83; // colour 3 doesn't exist
    store2.mem[7] = 0x82; // …and one valid one: yellow
    assert_eq!(
        journal::load(&mut store2),
        Some(Record {
            color: Color::Yellow,
            slot: 7
        }),
        "stray bytes and out-of-range colours are not records"
    );
}

#[test]
fn journal_two_cuts_in_a_row() {
    // Stale records anywhere still lose to the newest.
    let mut store = FakeEeprom::erased();
    let mut slot = journal::save(&mut store, Color::Blue, None);
    store.cut_after = 1; // cut #1: old not erased
    slot = journal::save(&mut store, Color::White, Some(slot));
    store.cut_after = -1;
    journal::load(&mut store); // the firmware re-reads after power is restored
    store.cut_after = 1; // cut #2: cleanup interrupted
    slot = journal::save(&mut store, Color::Yellow, Some(slot));
    store.cut_after = -1;
    assert_eq!(
        journal::load(&mut store),
        Some(Record {
            color: Color::Yellow,
            slot: 2
        }),
        "two cuts in a row: the newest colour still wins"
    );
    journal::save(&mut store, Color::Blue, Some(slot));
    let live = store.mem.iter().filter(|&&v| v != 0xFF).count();
    assert_eq!(
        (live, journal::load(&mut store)),
        (
            1,
            Some(Record {
                color: Color::Blue,
                slot: 3
            })
        ),
        "the next good save leaves exactly one record"
    );
}

#[test]
fn journal_endurance() {
    // Run 100 000 saves (the rated life of ONE byte) and measure the WORST
    // cell: the ring must have spread the wear so thinly that no cell
    // comes anywhere near its 100 000-write limit.
    let mut store = FakeEeprom::erased();
    let mut slot = journal::save(&mut store, Color::Blue, None);
    for i in 0..100_000u32 {
        slot = journal::save(&mut store, Color::ALL[(i % 3) as usize], Some(slot));
    }
    let worst = store.writes.iter().copied().max().unwrap();
    assert!(
        worst <= 1600,
        "100 000 flips cost each EEPROM byte ≤ 1 600 writes (rated 100 000) — worst: {worst}"
    );
}
