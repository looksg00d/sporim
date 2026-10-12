//! The program's copy of the domain's `allowedActions`, for the Bet format with mutual decision.
//!
//! Pure — no accounts, no clock. Instructions pass both in and call `require_allowed` before
//! they touch money, so "may this signer do this now" has one answer in the program, and
//! `tests/transitions_parity.rs` holds that answer to the domain's, case by case.

use anchor_lang::prelude::*;

use crate::constants::CLAIM_GRACE_SECONDS;
use crate::error::ErrorCode;
use crate::state::{Bet, BetState};

/// Who is asking, relative to this bet. A signer who is neither side is a `Stranger` — which is
/// who takes an open bet, and who may run any permissionless exit.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Actor {
    Creator,
    Opponent,
    Stranger,
}

/// One per instruction a signer can choose to send; the domain's `BetAction` minus `share`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Action {
    Accept,
    Cancel,
    ExpireUnaccepted,
    SubmitClaim,
    ConfirmClaim,
    DisputeClaim,
    SettleUncontested,
    RefundExpired,
}

pub struct RuleInput {
    pub state: BetState,
    pub actor: Actor,
    pub now: i64,
    pub accept_deadline: i64,
    pub deadline: i64,
    /// `None` until somebody has claimed.
    pub claim_by: Option<Actor>,
    pub claim_window_ends: i64,
}

pub fn allowed(input: &RuleInput) -> Vec<Action> {
    let is_party = matches!(input.actor, Actor::Creator | Actor::Opponent);

    match input.state {
        BetState::Open => {
            if input.now >= input.accept_deadline {
                return vec![Action::ExpireUnaccepted];
            }
            match input.actor {
                Actor::Creator => vec![Action::Cancel],
                _ => vec![Action::Accept],
            }
        }
        BetState::Active => {
            // Nobody claimed within the grace: the bet is abandoned, and anyone may refund it.
            if input.now >= input.deadline.saturating_add(CLAIM_GRACE_SECONDS) {
                return vec![Action::RefundExpired];
            }
            if input.now >= input.deadline && is_party {
                vec![Action::SubmitClaim]
            } else {
                vec![]
            }
        }
        BetState::Claimed => {
            if input.now >= input.claim_window_ends {
                return vec![Action::SettleUncontested];
            }
            if is_party && input.claim_by != Some(input.actor) {
                vec![Action::ConfirmClaim, Action::DisputeClaim]
            } else {
                vec![]
            }
        }
        BetState::Resolved | BetState::Refunded | BetState::Cancelled => vec![],
    }
}

impl RuleInput {
    /// The rule input for `signer` acting on `bet` at `now` — how every instruction asks.
    pub fn for_bet(bet: &Bet, signer: Pubkey, now: i64) -> Self {
        let actor_of = |key: Pubkey| {
            if key == bet.creator {
                Actor::Creator
            } else if Some(key) == bet.opponent {
                Actor::Opponent
            } else {
                Actor::Stranger
            }
        };
        RuleInput {
            state: bet.state,
            actor: actor_of(signer),
            now,
            accept_deadline: bet.accept_deadline,
            deadline: bet.deadline,
            claim_by: bet.claim_by.map(actor_of),
            claim_window_ends: bet.claim_window_ends,
        }
    }
}

/// For instructions: `InvalidState` unless `action` is allowed right now.
pub fn require_allowed(input: &RuleInput, action: Action) -> Result<()> {
    require!(allowed(input).contains(&action), ErrorCode::InvalidState);
    Ok(())
}
