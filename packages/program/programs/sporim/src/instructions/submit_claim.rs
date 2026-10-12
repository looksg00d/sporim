use anchor_lang::prelude::*;

use crate::constants::{BET_SEED, CLAIM_WINDOW_SECONDS};
use crate::error::ErrorCode;
use crate::rules::{require_allowed, Action, RuleInput};
use crate::state::{Bet, BetState, Outcome};

/// Either side may say how it went, once the deadline has passed and until the claim grace
/// ends. Mirrors `submitClaim`: no money moves here — this only opens the 48h window the other
/// side has to confirm or dispute.
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
    let now = Clock::get()?.unix_timestamp;
    let signer_key = ctx.accounts.signer.key();
    // The rules decide who and when: a party, after the deadline, before the grace ends.
    let rule = RuleInput::for_bet(&ctx.accounts.bet, signer_key, now);
    require_allowed(&rule, Action::SubmitClaim)?;

    ctx.accounts.bet.claim_outcome = Some(outcome);
    ctx.accounts.bet.claim_by = Some(signer_key);
    ctx.accounts.bet.claim_window_ends = now
        .checked_add(CLAIM_WINDOW_SECONDS)
        .ok_or(ErrorCode::MathOverflow)?;
    ctx.accounts.bet.state = BetState::Claimed;

    Ok(())
}
