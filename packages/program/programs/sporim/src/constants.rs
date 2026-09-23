use anchor_lang::prelude::*;
use std::str::FromStr;

/// First on-chain slice: the `Bet` format only (symmetric stakes, mutual confirmation, timeout
/// settle). No `Config` account yet — fee and treasury are compiled in, the way
/// `packages/domain/src/constants.ts` already treats `FEE_BPS` as a literal rather than a
/// mutable row. A real `Config` PDA is the first thing the next increment adds, once there is
/// an actual reason to change either value without a program upgrade.

pub const BET_SEED: &[u8] = b"bet";

/// Mirrors `packages/domain/src/constants.ts`. Kept as a plain literal on both sides rather than
/// fetched from a shared source, because the parity test (see `tests/`) is what catches drift,
/// not a build-time import — a Rust program cannot import a `.ts` file.
pub const FEE_BPS: u16 = 300; // 3% of net winnings, matches domain FEE_BPS
pub const BPS_DENOMINATOR: u64 = 10_000;

/// Base units, decimals implied by whatever mint a given bet uses (6 for a USDC-shaped token).
pub const MIN_STAKE: u64 = 1_000_000;
pub const MAX_STAKE: u64 = 100_000_000;

pub const MIN_DEADLINE_LEAD_SECONDS: i64 = 15 * 60;
pub const MAX_DEADLINE_LEAD_SECONDS: i64 = 365 * 86_400;
pub const CLAIM_WINDOW_SECONDS: i64 = 48 * 3_600;

/// Mirrors the domain's `CLAIM_GRACE_SECONDS`. After `deadline + CLAIM_GRACE_SECONDS` with no
/// claim the bet is abandoned: nobody may claim it any more, and anybody may refund it. Checked
/// against `constants.v1.json` by `tests/constants_parity.rs`.
pub const CLAIM_GRACE_SECONDS: i64 = 14 * 86_400;

/// Devnet-only admin/treasury wallet, generated for this milestone
/// (`~/.config/solana/sporim/treasury.json`, never checked in). A real `Config` account replaces
/// this with a settable value before mainnet — see the module doc above.
pub fn treasury() -> Pubkey {
    Pubkey::from_str("HsN55AF4EzoAMFbDpvZfz2twVEUMacLw7GwHxaYG8Jvv")
        .expect("treasury constant is a valid base58 pubkey")
}
