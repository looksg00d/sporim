use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::BET_SEED;
use crate::error::ErrorCode;
use crate::rules::{require_allowed, Action, RuleInput};
use crate::settlement::{refund_both, close_vault};
use crate::state::{Bet, BetState};

/// The side that did not claim says "no". With nobody named to decide — every bet in this
/// slice — that refunds both stakes on the spot, no fee (`docs/DECISIONS.md`, 2026-09-17).
///
/// This is also what takes the money motive out of a stranger grabbing an open bet by its link
/// and claiming a win: the creator disagrees and both walk away whole (DECISIONS, the entry
/// on not adding a server signature when a bet is accepted). A referee path, when it comes, branches here.
#[derive(Accounts)]
pub struct DisputeClaim<'info> {
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [BET_SEED, bet.bet_id.as_ref()],
        bump = bet.bump,
        close = rent_payer,
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

    /// Owner checked in the handler — same reason as in `refund_expired`.
    #[account(mut)]
    pub opponent_token_account: Account<'info, TokenAccount>,

    /// Receives the rent back as the bet and its vault close.
    /// CHECK: only ever credited lamports; its address is pinned to the one stored on the bet.
    #[account(mut, address = bet.rent_payer)]
    pub rent_payer: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_dispute_claim(ctx: Context<DisputeClaim>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let rule = RuleInput::for_bet(&ctx.accounts.bet, ctx.accounts.signer.key(), now);
    require_allowed(&rule, Action::DisputeClaim)?;
    require_keys_eq!(ctx.accounts.bet.mint, ctx.accounts.mint.key(), ErrorCode::WrongMint);

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

    let bet = &ctx.accounts.bet;
    let (bet_id, bump, stake_creator, stake_opponent) =
        (bet.bet_id, bet.bump, bet.stake_creator, bet.stake_opponent);
    let decimals = ctx.accounts.mint.decimals;
    let token_program = ctx.accounts.token_program.key();
    let mint_info = ctx.accounts.mint.to_account_info();
    let vault_info = ctx.accounts.vault.to_account_info();
    let bet_info = ctx.accounts.bet.to_account_info();
    let creator_ata = ctx.accounts.creator_token_account.to_account_info();
    let opponent_ata = ctx.accounts.opponent_token_account.to_account_info();

    ctx.accounts.bet.state = BetState::Refunded;

    refund_both(
        bet_id,
        bump,
        decimals,
        token_program,
        mint_info,
        vault_info,
        bet_info,
        creator_ata,
        opponent_ata,
        stake_creator,
        stake_opponent,
    )?;

    close_vault(
        ctx.accounts.bet.bet_id,
        ctx.accounts.bet.bump,
        ctx.accounts.mint.decimals,
        ctx.accounts.token_program.key(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.vault.to_account_info(),
        ctx.accounts.bet.to_account_info(),
        ctx.accounts.creator_token_account.to_account_info(),
        ctx.accounts.rent_payer.to_account_info(),
    )
}
