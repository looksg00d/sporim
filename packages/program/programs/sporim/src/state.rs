use anchor_lang::prelude::*;

/// Mirrors `packages/domain/src/types/bet.ts` `BetState`, minus `draft` (a bet never touches the
/// chain until it is shared) and `disputed` (no referee in this increment — see `constants.rs`).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum BetState {
    Open,
    Active,
    Claimed,
    Resolved,
    Refunded,
    Cancelled,
}

/// Mirrors `packages/domain/src/types/bet.ts` `Outcome`. `Draw` is reachable here even without a
/// referee: the two parties can agree the terms tied, exactly like `calculateSettlement`'s
/// `outcome === 'draw'` branch — a referee is only needed when they *disagree*, which this
/// increment does not yet resolve on-chain.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Outcome {
    CreatorWins,
    OpponentWins,
    Draw,
}

/// The on-chain half of `packages/domain`'s `Bet`. Fixed-size and `Vec`/`String`-free like the
/// design in `docs/09-phase0-plan.md` §2.5 calls for — rent is deterministic and known before the
/// account is ever created.
///
/// `opponent` starts `None`: like the database's `accept-by-link` capability, whoever calls
/// `accept_bet` first (and is not the creator) takes the seat. There is no pinned-opponent path
/// in this increment — every bet is "anyone with the link".
#[account]
#[derive(InitSpace)]
pub struct Bet {
    pub bump: u8,
    pub bet_id: [u8; 16],
    pub state: BetState,
    pub creator: Pubkey,
    pub opponent: Option<Pubkey>,
    pub mint: Pubkey,
    pub stake_creator: u64,
    pub stake_opponent: u64,
    pub created_at: i64,
    pub accept_deadline: i64,
    pub deadline: i64,
    /// Set by `submit_claim`, read by `confirm_claim` and `settle_uncontested`. `None` before a
    /// claim exists — there is no sentinel outcome value standing in for "nobody has claimed".
    pub claim_outcome: Option<Outcome>,
    pub claim_by: Option<Pubkey>,
    pub claim_window_ends: i64,
}

impl Bet {
    pub fn other_party(&self, side: Pubkey) -> Option<Pubkey> {
        if side == self.creator {
            self.opponent
        } else if Some(side) == self.opponent {
            Some(self.creator)
        } else {
            None
        }
    }
}
