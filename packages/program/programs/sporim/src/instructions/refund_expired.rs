use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::BET_SEED;
use crate::error::ErrorCode;
use crate::rules::{require_allowed, Action, RuleInput};
use crate::settlement::{refund_both, close_vault};
use crate::state::{Bet, BetState};

/// Permissionless: an `Active` bet nobody claimed within `CLAIM_GRACE_SECONDS` of its deadline
/// is abandoned, and anyone may return both stakes. Mirrors the domain's `refundExpired` on an
/// active bet. Without it the stakes of a bet both sides forgot would sit in the vault for good
/// — the one state in the first slice with no way out.
#[derive(Accounts)]
pub struct RefundExpired<'info> {
    pub caller: Signer<'info>,

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

    /// Owner checked in the handler: `bet.opponent` is an `Option`, and Anchor's
    /// `associated_token::authority` needs a plain `Pubkey`.
    #[account(mut)]
    pub opponent_token_account: Account<'info, TokenAccount>,

    /// Receives the rent back as the bet and its vault close.
    /// CHECK: only ever credited lamports; its address is pinned to the one stored on the bet.
    #[account(mut, address = bet.rent_payer)]
    pub rent_payer: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_refund_expired(ctx: Context<RefundExpired>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let rule = RuleInput::for_bet(&ctx.accounts.bet, ctx.accounts.caller.key(), now);
    require_allowed(&rule, Action::RefundExpired)?;
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
