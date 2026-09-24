//! Instruction-level stories, run against the built program in LiteSVM.

mod common;

use common::*;
use solana_signer::Signer;
use sporim::state::{BetState, Outcome};

#[test]
fn a_confirmed_claim_pays_the_winner_and_the_fee() {
    let Some(mut w) = world() else { return };
    w.active_at_deadline();
    let (creator, opponent) = (w.creator.insecure_clone(), w.opponent.insecure_clone());

    let claim = w.claim_ix(&creator, Outcome::CreatorWins);
    w.run(claim, &creator).expect("claimed");
    let confirm = w.confirm_ix(&opponent);
    w.run(confirm, &opponent).expect("confirmed");

    // Pot 40, fee 3% of the net 20 = 0.6 — the numbers in settlement.v1.json.
    assert_eq!(w.balance(creator.pubkey()), FUNDED + STAKE - 600_000);
    assert_eq!(w.balance(opponent.pubkey()), FUNDED - STAKE);
    assert_eq!(w.balance(sporim::constants::treasury()), 600_000);
    assert_eq!(w.token_balance(w.vault()), 0);
    assert!(w.state() == BetState::Resolved);
}

const GRACE_ENDS: i64 = DEADLINE + sporim::constants::CLAIM_GRACE_SECONDS;

/// Both stakes back in full, nothing to the treasury, nothing left in the vault.
fn assert_refunded_in_full(w: &World) {
    assert_eq!(w.balance(w.creator.pubkey()), FUNDED, "creator refunded");
    assert_eq!(w.balance(w.opponent.pubkey()), FUNDED, "opponent refunded");
    assert_eq!(w.balance(sporim::constants::treasury()), 0, "no fee on a refund");
    assert_eq!(w.token_balance(w.vault()), 0, "vault empty");
}

// ── B1: an abandoned bet has an exit ─────────────────────────────────────────────────────

#[test]
fn anybody_refunds_a_bet_nobody_claimed_within_the_grace() {
    let Some(mut w) = world() else { return };
    w.active_at_deadline();
    w.set_time(GRACE_ENDS);

    let stranger = w.stranger.insecure_clone();
    let refund = w.refund_expired_ix(&stranger);
    w.run(refund, &stranger).expect("a stranger may refund an abandoned bet");

    assert_refunded_in_full(&w);
}

#[test]
fn an_active_bet_cannot_be_refunded_a_second_before_the_grace_ends() {
    let Some(mut w) = world() else { return };
    w.active_at_deadline();
    w.set_time(GRACE_ENDS - 1);

    let stranger = w.stranger.insecure_clone();
    let refund = w.refund_expired_ix(&stranger);
    assert!(w.run(refund, &stranger).is_err(), "grace is still running");
}

// ── B2: claims stop when the grace ends ──────────────────────────────────────────────────

#[test]
fn a_claim_is_refused_once_the_bet_is_abandoned() {
    let Some(mut w) = world() else { return };
    w.active_at_deadline();
    w.set_time(GRACE_ENDS);

    let creator = w.creator.insecure_clone();
    let claim = w.claim_ix(&creator, Outcome::CreatorWins);
    assert!(w.run(claim, &creator).is_err(), "too late to claim");
}

#[test]
fn a_claim_is_still_accepted_in_the_last_second_of_grace() {
    let Some(mut w) = world() else { return };
    w.active_at_deadline();
    w.set_time(GRACE_ENDS - 1);

    let creator = w.creator.insecure_clone();
    let claim = w.claim_ix(&creator, Outcome::CreatorWins);
    w.run(claim, &creator).expect("still in time");
}

// ── B3: disagreeing with no referee refunds both at once ─────────────────────────────────

#[test]
fn disputing_a_claim_with_no_referee_refunds_both_sides() {
    let Some(mut w) = world() else { return };
    w.active_at_deadline();
    let (creator, opponent) = (w.creator.insecure_clone(), w.opponent.insecure_clone());

    let claim = w.claim_ix(&creator, Outcome::CreatorWins);
    w.run(claim, &creator).expect("claimed");
    let dispute = w.dispute_ix(&opponent);
    w.run(dispute, &opponent).expect("the other side disagrees");

    assert_refunded_in_full(&w);
}

#[test]
fn the_claimant_cannot_dispute_their_own_claim() {
    let Some(mut w) = world() else { return };
    w.active_at_deadline();
    let creator = w.creator.insecure_clone();

    let claim = w.claim_ix(&creator, Outcome::CreatorWins);
    w.run(claim, &creator).expect("claimed");
    let dispute = w.dispute_ix(&creator);
    assert!(w.run(dispute, &creator).is_err(), "only the other side may disagree");
}

#[test]
fn a_stranger_cannot_dispute() {
    let Some(mut w) = world() else { return };
    w.active_at_deadline();
    let (creator, stranger) = (w.creator.insecure_clone(), w.stranger.insecure_clone());

    let claim = w.claim_ix(&creator, Outcome::CreatorWins);
    w.run(claim, &creator).expect("claimed");
    let dispute = w.dispute_ix(&stranger);
    assert!(w.run(dispute, &stranger).is_err(), "not a party");
}
