use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

use crate::constants::{
    BET_SEED, MAX_DEADLINE_LEAD_SECONDS, MAX_STAKE, MIN_DEADLINE_LEAD_SECONDS, MIN_STAKE,
};
use crate::error::ErrorCode;
use crate::state::{Bet, BetState};

/// Opens a bet: the creator's stake moves into a vault owned by the `Bet` PDA itself, and the
/// account sits `Open` until someone accepts it or the accept window lapses. Mirrors
/// `create-bet.ts` + `createBet` off-chain: `stake_opponent` is derived here (equal to
/// `stake_creator` — the `Bet` format's only shape in this increment), never taken from the
/// caller, for the same reason the server never trusts a client-quoted fee.
#[derive(Accounts)]
#[instruction(bet_id: [u8; 16])]
pub struct CreateBet<'info> {
    pub creator: Signer<'info>,

    /// Pays the rent for the bet and its vault, and gets it back when the bet closes. The
    /// server's keypair in production (plan decision D2), so a person needs USDC, never SOL.
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + Bet::INIT_SPACE,
        seeds = [BET_SEED, bet_id.as_ref()],
        bump,
    )]
    pub bet: Account<'info, Bet>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = creator,
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = bet,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_bet(
    ctx: Context<CreateBet>,
    bet_id: [u8; 16],
    stake: u64,
    deadline: i64,
    accept_deadline: i64,
) -> Result<()> {
    require!(
        (MIN_STAKE..=MAX_STAKE).contains(&stake),
        ErrorCode::InvalidStake
    );

    let now = Clock::get()?.unix_timestamp;
    require!(
        deadline > now.saturating_add(MIN_DEADLINE_LEAD_SECONDS)
            && deadline < now.saturating_add(MAX_DEADLINE_LEAD_SECONDS),
        ErrorCode::InvalidDeadline
    );
    require!(
        accept_deadline > now && accept_deadline <= deadline,
        ErrorCode::InvalidAcceptDeadline
    );

    let bet = &mut ctx.accounts.bet;
    bet.bump = ctx.bumps.bet;
    bet.bet_id = bet_id;
    bet.state = BetState::Open;
    bet.creator = ctx.accounts.creator.key();
    bet.opponent = None;
    bet.mint = ctx.accounts.mint.key();
    bet.stake_creator = stake;
    bet.stake_opponent = stake; // Bet format: symmetric, never taken from the caller.
    bet.created_at = now;
    bet.accept_deadline = accept_deadline;
    bet.deadline = deadline;
    bet.claim_outcome = None;
    bet.claim_by = None;
    bet.claim_window_ends = 0;
    bet.rent_payer = ctx.accounts.payer.key();

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.creator_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.creator.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts);
    transfer_checked(cpi_ctx, stake, ctx.accounts.mint.decimals)?;

    Ok(())
}
