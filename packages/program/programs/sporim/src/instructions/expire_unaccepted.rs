use anchor_lang::prelude::*;
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

use crate::constants::BET_SEED;
use crate::error::ErrorCode;
use crate::state::{Bet, BetState};

/// Permissionless: anyone may call this once the accept window has lapsed with nobody having
/// taken the other side — same `bet2fun` principle as `docs/09-phase0-plan.md` §2.5, "if we
/// disappear, the money still comes out". The caller pays the transaction fee and receives
/// nothing; the creator's stake goes back to the creator regardless of who submitted this.
#[derive(Accounts)]
pub struct ExpireUnaccepted<'info> {
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

    pub token_program: Program<'info, Token>,
}

pub fn handle_expire_unaccepted(ctx: Context<ExpireUnaccepted>) -> Result<()> {
    require!(ctx.accounts.bet.state == BetState::Open, ErrorCode::InvalidState);
    require_keys_eq!(ctx.accounts.bet.mint, ctx.accounts.mint.key(), ErrorCode::WrongMint);

    let now = Clock::get()?.unix_timestamp;
    require!(
        now >= ctx.accounts.bet.accept_deadline,
        ErrorCode::AcceptWindowNotExpired
    );

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

    Ok(())
}
