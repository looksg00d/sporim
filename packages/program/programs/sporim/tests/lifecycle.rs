//! Instruction-level stories, run against the built program in LiteSVM.

mod common;

use common::*;
use solana_signer::Signer;
use solana_keypair::Keypair;
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

// ── B4: every terminal transition closes the bet and returns the rent ───────────────────

/// Two signatures per transaction in these stories: the payer and the acting signer.
const FEE: u64 = 2 * 5_000;

/// Sends `ix` as the last move of a story and checks the invariant: the bet and its vault no
/// longer exist, and the rent payer got back exactly the rent those two accounts held.
fn finish_and_assert_closed(w: &mut World, ix: Instruction, signer: &Keypair) {
    let rent = w.lamports(w.bet()) + w.lamports(w.vault());
    assert!(rent > 0, "the bet and vault hold rent before closing");
    let payer = w.payer.pubkey();
    let before = w.lamports(payer);

    w.run(ix, signer).expect("terminal transition");

    assert!(!w.exists(w.vault()), "vault closed");
    assert!(!w.exists(w.bet()), "bet account closed");
    assert_eq!(w.lamports(payer), before + rent - FEE, "rent returned to the payer");
}

#[test]
fn the_creator_pays_no_sol_for_rent() {
    let Some(mut w) = world() else { return };
    let before = w.lamports(w.creator.pubkey());
    w.create();
    assert_eq!(w.lamports(w.creator.pubkey()), before, "rent and fee came from the payer");
    assert!(w.state() == BetState::Open);
}

#[test]
fn confirm_closes_the_bet() {
    let Some(mut w) = world() else { return };
    w.active_at_deadline();
    let (creator, opponent) = (w.creator.insecure_clone(), w.opponent.insecure_clone());
    let claim = w.claim_ix(&creator, Outcome::CreatorWins);
    w.run(claim, &creator).expect("claimed");
    let ix = w.confirm_ix(&opponent);
    finish_and_assert_closed(&mut w, ix, &opponent);
}

#[test]
fn settling_an_uncontested_claim_closes_the_bet() {
    let Some(mut w) = world() else { return };
    w.active_at_deadline();
    let (creator, stranger) = (w.creator.insecure_clone(), w.stranger.insecure_clone());
    let claim = w.claim_ix(&creator, Outcome::OpponentWins);
    w.run(claim, &creator).expect("claimed");
    w.set_time(DEADLINE + sporim::constants::CLAIM_WINDOW_SECONDS);
    let ix = w.settle_ix(&stranger);
    finish_and_assert_closed(&mut w, ix, &stranger);
    assert_eq!(w.balance(w.opponent.pubkey()), FUNDED + STAKE - 600_000);
}

#[test]
fn cancelling_closes_the_bet() {
    let Some(mut w) = world() else { return };
    w.create();
    let creator = w.creator.insecure_clone();
    let ix = w.cancel_ix();
    finish_and_assert_closed(&mut w, ix, &creator);
    assert_eq!(w.balance(creator.pubkey()), FUNDED);
}

#[test]
fn expiring_an_unaccepted_bet_closes_it() {
    let Some(mut w) = world() else { return };
    w.create();
    w.set_time(ACCEPT_DEADLINE);
    let stranger = w.stranger.insecure_clone();
    let ix = w.expire_ix(&stranger);
    finish_and_assert_closed(&mut w, ix, &stranger);
    assert_eq!(w.balance(w.creator.pubkey()), FUNDED);
}

#[test]
fn refunding_an_abandoned_bet_closes_it() {
    let Some(mut w) = world() else { return };
    w.active_at_deadline();
    w.set_time(GRACE_ENDS);
    let stranger = w.stranger.insecure_clone();
    let ix = w.refund_expired_ix(&stranger);
    finish_and_assert_closed(&mut w, ix, &stranger);
}

#[test]
fn a_dispute_closes_the_bet() {
    let Some(mut w) = world() else { return };
    w.active_at_deadline();
    let (creator, opponent) = (w.creator.insecure_clone(), w.opponent.insecure_clone());
    let claim = w.claim_ix(&creator, Outcome::CreatorWins);
    w.run(claim, &creator).expect("claimed");
    let ix = w.dispute_ix(&opponent);
    finish_and_assert_closed(&mut w, ix, &opponent);
}

#[test]
fn rent_cannot_be_redirected_to_somebody_else() {
    let Some(mut w) = world() else { return };
    w.create();
    let creator = w.creator.insecure_clone();
    let mut ix = w.cancel_ix();
    // Swap the rent payer account for the creator's own wallet.
    let rent_payer = w.payer.pubkey();
    for meta in ix.accounts.iter_mut().filter(|m| m.pubkey == rent_payer) {
        meta.pubkey = creator.pubkey();
    }
    assert!(w.run(ix, &creator).is_err(), "rent_payer is pinned to the bet");
}
