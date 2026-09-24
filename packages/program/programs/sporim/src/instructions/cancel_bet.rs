use anchor_lang::prelude::*;
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

use crate::constants::BET_SEED;
use crate::error::ErrorCode;
use crate::rules::{require_allowed, Action, RuleInput};
use crate::settlement::close_vault;
use crate::state::{Bet, BetState};

/// The creator changes their mind before anyone accepts. No fee — cancelling costs nothing,
/// same as the database's `cancel` action.
#[derive(Accounts)]
pub struct CancelBet<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

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
        associated_token::authority = creator,
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    /// Receives the rent back as the bet and its vault close.
    /// CHECK: only ever credited lamports; its address is pinned to the one stored on the bet.
    #[account(mut, address = bet.rent_payer)]
    pub rent_payer: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_cancel_bet(ctx: Context<CancelBet>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let rule = RuleInput::for_bet(&ctx.accounts.bet, ctx.accounts.creator.key(), now);
    require_allowed(&rule, Action::Cancel)?;
    require_keys_eq!(ctx.accounts.bet.mint, ctx.accounts.mint.key(), ErrorCode::WrongMint);

    let stake_creator = ctx.accounts.bet.stake_creator;
    let bet_id = ctx.accounts.bet.bet_id;
    let bump = ctx.accounts.bet.bump;
    let decimals = ctx.accounts.mint.decimals;

    let bet_account_info = ctx.accounts.bet.to_account_info();
    let mint_account_info = ctx.accounts.mint.to_account_info();
    let vault_account_info = ctx.accounts.vault.to_account_info();
    let creator_token_account_info = ctx.accounts.creator_token_account.to_account_info();
    let token_program_id = ctx.accounts.token_program.key();

    ctx.accounts.bet.state = BetState::Cancelled;

    let seeds: &[&[u8]] = &[BET_SEED, &bet_id, &[bump]];
    let signer_seeds: &[&[&[u8]]] = &[seeds];
    let cpi_accounts = TransferChecked {
        from: vault_account_info,
        mint: mint_account_info,
        to: creator_token_account_info,
        authority: bet_account_info,
    };
    let cpi_ctx = CpiContext::new_with_signer(token_program_id, cpi_accounts, signer_seeds);
    transfer_checked(cpi_ctx, stake_creator, decimals)?;

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
