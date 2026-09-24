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
