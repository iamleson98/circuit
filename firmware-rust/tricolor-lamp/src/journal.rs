//! The wear-levelled EEPROM journal — the Rust counterpart of `lamp.c`'s
//! journal section (plus its `store_t` toolbox).
//!
//! A record is one byte, `0b10 ssss cc`: a 4-bit sequence number and the
//! colour; erased bytes are 0xFF. A save writes the next record (its
//! sequence one past the current) into the next slot FIRST, then erases
//! every older record — so a power cut at any moment leaves the old
//! record, the new one, or both, and the loader picks the newest by
//! sequence number. Each byte sees about 2 writes per [`SLOTS`] saves
//! (a 100 000-cycle EEPROM therefore survives millions of switch flips).
//!
//! WHERE THE RUST DIFFERS FROM THE C:
//! * The C's `store_t` is a struct of two FUNCTION POINTERS, filled in by
//!   main.c with the real EEPROM functions and by the tests with a plain
//!   array — dependency injection through raw pointers, resolved (or not)
//!   at runtime. Rust's [`Store`] is a TRAIT: the same idea, but checked
//!   at compile time and monomorphized — the chip build gets direct calls
//!   into the EEPROM driver with zero indirection, and a store that
//!   doesn't implement the trait simply cannot be passed in.
//! * The C's `journal_load` returns bool and fills `*color`/`*slot`
//!   through out-pointers. Rust returns [`Option<Record>`] — "found or
//!   not" is the type, not a flag plus two mutable addresses.
//! * The C's `journal_save` takes `have_record` and `&slot`. Rust takes
///   `prev: Option<u16>` — same information, impossible to get out of sync.
use crate::logic::Color;

/// Journal slots (bytes). The ring's size (≡ `JOURNAL_SLOTS`).
pub const SLOTS: u16 = 128;

/// `0b10xxxxxx`: the two tag bits that say "this is a record".
const REC_TAG: u8 = 0x80;
/// `0b11000000`: mask to isolate them.
const REC_MASK: u8 = 0xC0;

/// Pull the 4-bit sequence number out of a record (≡ the `SEQ` macro).
const fn seq(v: u8) -> u8 {
    (v >> 2) & 0x0F
}

/// Pull the 2-bit colour out of a record (≡ the `COL` macro).
const fn col(v: u8) -> u8 {
    v & 0x03
}

/// Does this byte look like a record? Tag bits must be exactly "10" AND
/// the colour field must name a real colour (0, 1 or 2 — never 3). This is
/// where garbage gets rejected — the single place raw bytes become values.
const fn valid(v: u8) -> bool {
    (v & REC_MASK) == REC_TAG && col(v) < Color::ALL.len() as u8
}

/// a is newer than b if it is 1–7 steps ahead of it, modulo 16 (≡ `newer`).
/// Sequence numbers are 4 bits, so they wrap 15 → 0; the gap 9..15 means
/// b is newer, 0 or 8 means same/ambiguous (never happens: only one record
/// survives a save).
const fn newer(a: u8, b: u8) -> bool {
    let d = seq(a).wrapping_sub(seq(b)) & 0x0F;
    matches!(d, 1..=7)
}

/// The memory toolbox (≡ `store_t`). Implementations: the ATtiny85's
/// EEPROM (src/bin/tricolor_lamp.rs), the PC tests' fake array, and the
/// electronics model's time-charging EEPROM (tests/lamp_sim.rs) — one
/// interface, three worlds, all checked at compile time.
pub trait Store {
    /// "give me the byte at addr".
    fn read(&mut self, addr: u16) -> u8;
    /// "set the byte at addr" (real "update" semantics may skip identical
    /// writes — that is the wear saver).
    fn write(&mut self, addr: u16, value: u8);
}

/// What a successful load found: the colour and where it lives.
/// (≡ the C's `*color`/`*slot` out-parameters.)
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Record {
    pub color: Color,
    pub slot: u16,
}

/// Scan all [`SLOTS`] slots, keep the valid record with the newest
/// sequence (≡ `journal_load`). `None` = EEPROM blank: first ever run.
pub fn load<S: Store>(store: &mut S) -> Option<Record> {
    let mut best: Option<(u8, u16)> = None; // (record byte, its slot)
    for i in 0..SLOTS {
        let v = store.read(i);
        if !valid(v) {
            continue; // erased (0xFF) or garbage: skip
        }
        let replace = match best {
            None => true,                // first find
            Some((b, _)) => newer(v, b), // or a strictly newer one
        };
        if replace {
            best = Some((v, i));
        }
    }
    best.map(|(v, slot)| Record {
        color: Color::ALL[col(v) as usize], // unpack the colour from the winner
        slot,
    })
}

/// Save `color` so that a power cut at ANY instant loses nothing:
/// write-new-first, erase-old-second (≡ `journal_save`).
///
/// `prev` is where the current record lives, if any (`Option<u16>` ≡ the
/// C's `have_record` + `&slot`). Returns the new record's slot.
pub fn save<S: Store>(store: &mut S, color: Color, prev: Option<u16>) -> u16 {
    let (seq, next) = match prev {
        Some(p) => (
            seq(store.read(p)).wrapping_add(1) & 0x0F, // one past the current record's number, 15→0
            (p + 1) % SLOTS,                           // the following slot, 127→0 (a ring)
        ),
        None => (0, 0), // no record yet: sequence 0 at slot 0
    };
    // 1: the new record — tag | sequence | colour, packed into one byte.
    // (color as u8 is 0..=2 BY CONSTRUCTION — the C needed `% NCOLORS`
    // here to defend against garbage; the type makes the guard redundant.)
    store.write(next, REC_TAG | (seq << 2) | color as u8);
    // 2: retire all others (an erased EEPROM byte reads 0xFF).
    for i in 0..SLOTS {
        if i != next && valid(store.read(i)) {
            store.write(i, 0xFF);
        }
    }
    next
}
