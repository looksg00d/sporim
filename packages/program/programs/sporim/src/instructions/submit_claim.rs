use anchor_lang::prelude::*;

use crate::constants::{BET_SEED, CLAIM_WINDOW_SECONDS};
use crate::error::ErrorCode;
use crate::state::{Bet, BetState, Outcome};

/// Either side may say how it went, once the deadline has passed. Mirrors `submitClaim`: no
/// money moves here — this only opens the 48h window the other side has to confirm or, in a
/// later increment, dispute.
#[derive(Accounts)]
pub struct SubmitClaim<'info> {
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [BET_SEED, bet.bet_id.as_ref()],
        bump = bet.bump,
    )]
    pub bet: Account<'info, Bet>,
}

pub fn handle_submit_claim(ctx: Context<SubmitClaim>, outcome: Outcome) -> Result<()> {
    require!(ctx.accounts.bet.state == BetState::Active, ErrorCode::InvalidState);

    let now = Clock::get()?.unix_timestamp;
    require!(now >= ctx.accounts.bet.deadline, ErrorCode::DeadlineNotReached);

    let signer_key = ctx.accounts.signer.key();
    let is_party =
        signer_key == ctx.accounts.bet.creator || Some(signer_key) == ctx.accounts.bet.opponent;
    require!(is_party, ErrorCode::NotAParty);

    ctx.accounts.bet.claim_outcome = Some(outcome);
    ctx.accounts.bet.claim_by = Some(signer_key);
    ctx.accounts.bet.claim_window_ends = now
        .checked_add(CLAIM_WINDOW_SECONDS)
        .ok_or(ErrorCode::MathOverflow)?;
    ctx.accounts.bet.state = BetState::Claimed;

    Ok(())
}
