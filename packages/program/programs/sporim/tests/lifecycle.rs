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

// ── B5: every instruction asks rules.rs ─────────────────────────────────────────────────

#[test]
fn a_claim_cannot_be_confirmed_once_its_window_has_closed() {
    let Some(mut w) = world() else { return };
    w.active_at_deadline();
    let (creator, opponent) = (w.creator.insecure_clone(), w.opponent.insecure_clone());
    let claim = w.claim_ix(&creator, Outcome::CreatorWins);
    w.run(claim, &creator).expect("claimed");
    w.set_time(DEADLINE + sporim::constants::CLAIM_WINDOW_SECONDS);

    // Past the window the claim stands on its own; agreeing now is not a move the domain offers.
    let confirm = w.confirm_ix(&opponent);
    assert!(w.run(confirm, &opponent).is_err(), "only settle_uncontested is left");
}

#[test]
fn the_creator_cannot_take_their_own_bet() {
    let Some(mut w) = world() else { return };
    w.create();
    let creator = w.creator.insecure_clone();
    let accept = w.accept_ix(&creator);
    assert!(w.run(accept, &creator).is_err());
}

#[test]
fn nobody_takes_a_bet_after_its_accept_window() {
    let Some(mut w) = world() else { return };
    w.create();
    w.set_time(ACCEPT_DEADLINE);
    let stranger = w.stranger.insecure_clone();
    let accept = w.accept_ix(&stranger);
    assert!(w.run(accept, &stranger).is_err());
}

#[test]
fn only_the_creator_cancels() {
    let Some(mut w) = world() else { return };
    w.create();
    let stranger = w.stranger.insecure_clone();
    let mut cancel = w.cancel_ix();
    let creator = w.creator.pubkey();
    for meta in cancel.accounts.iter_mut().filter(|m| m.pubkey == creator) {
        meta.pubkey = stranger.pubkey();
    }
    assert!(w.run(cancel, &stranger).is_err());
}

#[test]
fn an_unaccepted_bet_cannot_be_expired_early() {
    let Some(mut w) = world() else { return };
    w.create();
    w.set_time(ACCEPT_DEADLINE - 1);
    let stranger = w.stranger.insecure_clone();
    let expire = w.expire_ix(&stranger);
    assert!(w.run(expire, &stranger).is_err());
}

#[test]
fn an_uncontested_claim_cannot_be_settled_inside_its_window() {
    let Some(mut w) = world() else { return };
    w.active_at_deadline();
    let (creator, stranger) = (w.creator.insecure_clone(), w.stranger.insecure_clone());
    let claim = w.claim_ix(&creator, Outcome::CreatorWins);
    w.run(claim, &creator).expect("claimed");
    w.set_time(DEADLINE + sporim::constants::CLAIM_WINDOW_SECONDS - 1);
    let settle = w.settle_ix(&stranger);
    assert!(w.run(settle, &stranger).is_err());
}

// ── Review 2026-09-24, high: one mint only ──────────────────────────────────────────────

#[test]
fn a_bet_in_any_other_mint_is_refused() {
    let Some(mut w) = world() else { return };
    let other = Keypair::new().pubkey();
    let authority = w.payer.pubkey();
    put_mint(&mut w.svm, other, authority);
    w.mint = other;
    // Token accounts for the other mint so the only thing wrong is the mint itself.
    for owner in [w.creator.pubkey()] {
        let ix = anchor_spl::associated_token::spl_associated_token_account::instruction::create_associated_token_account(
            &w.payer.pubkey(),
            &owner,
            &other,
            &anchor_spl::token::ID,
        );
        let payer = w.payer.insecure_clone();
        send(&mut w.svm, &payer, &[ix], &[]).expect("ata");
    }
    // Funded, so a refusal can only come from the mint check and not from an empty account.
    w.mint_to(w.creator.pubkey(), FUNDED);
    let creator = w.creator.insecure_clone();
    let create = w.create_ix();
    assert!(w.run(create, &creator).is_err(), "only the allowed mint");
}

// ── Review 2026-09-24, critical: a donation to the vault must not lock the bet ──────────

/// One base unit: the cheapest possible attack. The payouts are computed from the bet's
/// fields, so without a sweep the vault keeps that unit and refuses to close.
const DUST: u64 = 1;

/// Runs `finish` after a stranger dusted the vault, and checks the bet still closes and the
/// dust went to the creator rather than staying behind.
fn finishes_despite_dust(w: &mut World, ix: Instruction, signer: &Keypair, creator_expected: u64) {
    w.donate_to_vault(DUST);
    w.run(ix, signer).expect("a donated unit must not block the terminal transition");
    assert!(!w.exists(w.vault()), "vault closed");
    assert!(!w.exists(w.bet()), "bet closed");
    assert_eq!(w.balance(w.creator.pubkey()), creator_expected + DUST, "dust swept to creator");
}

#[test]
fn dust_does_not_block_cancel() {
    let Some(mut w) = world() else { return };
    w.create();
    let creator = w.creator.insecure_clone();
    let ix = w.cancel_ix();
    finishes_despite_dust(&mut w, ix, &creator, FUNDED);
}

#[test]
fn dust_does_not_block_expiry() {
    let Some(mut w) = world() else { return };
    w.create();
    w.set_time(ACCEPT_DEADLINE);
    let stranger = w.stranger.insecure_clone();
    let ix = w.expire_ix(&stranger);
    finishes_despite_dust(&mut w, ix, &stranger, FUNDED);
}

#[test]
fn dust_does_not_block_confirm() {
    let Some(mut w) = world() else { return };
    w.active_at_deadline();
    let (creator, opponent) = (w.creator.insecure_clone(), w.opponent.insecure_clone());
    let claim = w.claim_ix(&creator, Outcome::OpponentWins);
    w.run(claim, &creator).expect("claimed");
    let ix = w.confirm_ix(&opponent);
    finishes_despite_dust(&mut w, ix, &opponent, FUNDED - STAKE);
}

#[test]
fn dust_does_not_block_settle() {
    let Some(mut w) = world() else { return };
    w.active_at_deadline();
    let (creator, stranger) = (w.creator.insecure_clone(), w.stranger.insecure_clone());
    let claim = w.claim_ix(&creator, Outcome::OpponentWins);
    w.run(claim, &creator).expect("claimed");
    w.set_time(DEADLINE + sporim::constants::CLAIM_WINDOW_SECONDS);
    let ix = w.settle_ix(&stranger);
    finishes_despite_dust(&mut w, ix, &stranger, FUNDED - STAKE);
}

#[test]
fn dust_does_not_block_refund() {
    let Some(mut w) = world() else { return };
    w.active_at_deadline();
    w.set_time(GRACE_ENDS);
    let stranger = w.stranger.insecure_clone();
    let ix = w.refund_expired_ix(&stranger);
    finishes_despite_dust(&mut w, ix, &stranger, FUNDED);
}

#[test]
fn dust_does_not_block_dispute() {
    let Some(mut w) = world() else { return };
    w.active_at_deadline();
    let (creator, opponent) = (w.creator.insecure_clone(), w.opponent.insecure_clone());
    let claim = w.claim_ix(&creator, Outcome::CreatorWins);
    w.run(claim, &creator).expect("claimed");
    let ix = w.dispute_ix(&opponent);
    finishes_despite_dust(&mut w, ix, &opponent, FUNDED);
}
