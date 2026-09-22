use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::{treasury, BET_SEED};
use crate::error::ErrorCode;
use crate::settlement::{calculate_settlement, distribute};
use crate::state::{Bet, BetState};

/// Permissionless: once the 48h claim window has passed with nobody confirming or disputing,
/// anyone may settle the bet on the terms the claimant already stated. Mirrors
/// `settleUncontested` — silence past the window is not agreement in the sense of a ruling, it
/// is simply the point at which the unconfirmed claim stops needing anyone's permission to pay
/// out, same `bet2fun` reasoning as `expire_unaccepted`.
#[derive(Accounts)]
pub struct SettleUncontested<'info> {
    pub caller: Signer<'info>,

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
        associated_token::authority = bet,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = bet.creator,
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    /// Owner checked in the handler — same reason as in `confirm_claim`.
    #[account(mut)]
    pub opponent_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = treasury(),
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_settle_uncontested(ctx: Context<SettleUncontested>) -> Result<()> {
    require!(ctx.accounts.bet.state == BetState::Claimed, ErrorCode::InvalidState);
    require_keys_eq!(ctx.accounts.bet.mint, ctx.accounts.mint.key(), ErrorCode::WrongMint);

    let now = Clock::get()?.unix_timestamp;
    require!(
        now >= ctx.accounts.bet.claim_window_ends,
        ErrorCode::ClaimWindowNotExpired
    );

    let opponent = ctx.accounts.bet.opponent.ok_or(ErrorCode::InvalidState)?;
    require_keys_eq!(
        ctx.accounts.opponent_token_account.owner,
        opponent,
        ErrorCode::WrongTokenOwner
    );
    require_keys_eq!(
        ctx.accounts.opponent_token_account.mint,
        ctx.accounts.mint.key(),
        ErrorCode::WrongMint
    );

    let claim_outcome = ctx.accounts.bet.claim_outcome.ok_or(ErrorCode::NoClaim)?;

    let settlement = calculate_settlement(
        ctx.accounts.bet.stake_creator,
        ctx.accounts.bet.stake_opponent,
        claim_outcome,
    )?;

    let bet_id = ctx.accounts.bet.bet_id;
    let bump = ctx.accounts.bet.bump;
    let decimals = ctx.accounts.mint.decimals;

    let token_program = ctx.accounts.token_program.key();
    let mint_info = ctx.accounts.mint.to_account_info();
    let vault_info = ctx.accounts.vault.to_account_info();
    let bet_info = ctx.accounts.bet.to_account_info();
    let creator_ata = ctx.accounts.creator_token_account.to_account_info();
    let opponent_ata = ctx.accounts.opponent_token_account.to_account_info();
    let treasury_ata = ctx.accounts.treasury_token_account.to_account_info();

    ctx.accounts.bet.state = BetState::Resolved;

    distribute(
        bet_id,
        bump,
        decimals,
        token_program,
        mint_info,
        vault_info,
        bet_info,
        creator_ata,
        opponent_ata,
        treasury_ata,
        settlement,
    )
}
