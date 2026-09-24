use anchor_lang::prelude::*;
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

use crate::constants::BET_SEED;
use crate::error::ErrorCode;
use crate::rules::{require_allowed, Action, RuleInput};
use crate::state::{Bet, BetState};

/// Takes the other side. Mirrors `accept.repo.ts`: whoever calls this first, is not the
/// creator, and gets here while the bet is still `Open` and before `accept_deadline` takes the
/// seat — there is no pinned-opponent path in this increment, every bet is "anyone with the
/// link", same as the database's short-code capability.
#[derive(Accounts)]
pub struct AcceptBet<'info> {
    #[account(mut)]
    pub opponent: Signer<'info>,

    #[account(
        mut,
        seeds = [BET_SEED, bet.bet_id.as_ref()],
        bump = bet.bump,
    )]
    pub bet: Account<'info, Bet>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = opponent,
    )]
    pub opponent_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = bet,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_accept_bet(ctx: Context<AcceptBet>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let rule = RuleInput::for_bet(&ctx.accounts.bet, ctx.accounts.opponent.key(), now);
    require_allowed(&rule, Action::Accept)?;
    require_keys_eq!(ctx.accounts.bet.mint, ctx.accounts.mint.key(), ErrorCode::WrongMint);

    let bet = &mut ctx.accounts.bet;

    bet.opponent = Some(ctx.accounts.opponent.key());
    bet.state = BetState::Active;
    let stake_opponent = bet.stake_opponent;

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.opponent_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.opponent.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts);
    transfer_checked(cpi_ctx, stake_opponent, ctx.accounts.mint.decimals)?;

    Ok(())
}
