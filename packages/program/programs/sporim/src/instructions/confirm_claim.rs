use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::{treasury, BET_SEED};
use crate::error::ErrorCode;
use crate::settlement::{calculate_settlement, distribute};
use crate::state::{Bet, BetState};

/// The side that did *not* submit the claim agrees with it. Mirrors `confirmClaim`: the outcome
/// paid out is the one already on the bet from `submit_claim`, read from the account, never
/// re-typed by whoever is confirming — the same reason `accept.repo.ts` reads the pending
/// outcome from the row instead of trusting a second form.
#[derive(Accounts)]
pub struct ConfirmClaim<'info> {
    pub signer: Signer<'info>,

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

    /// Owner checked in the handler, not in this constraint: `bet.opponent` is an `Option`,
    /// and Anchor's `associated_token::authority` needs a plain `Pubkey`.
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

pub fn handle_confirm_claim(ctx: Context<ConfirmClaim>) -> Result<()> {
    require!(ctx.accounts.bet.state == BetState::Claimed, ErrorCode::InvalidState);
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

    let claim_outcome = ctx.accounts.bet.claim_outcome.ok_or(ErrorCode::NoClaim)?;
    let claim_by = ctx.accounts.bet.claim_by.ok_or(ErrorCode::NoClaim)?;

    let signer_key = ctx.accounts.signer.key();
    let is_party = signer_key == ctx.accounts.bet.creator || signer_key == opponent;
    require!(is_party, ErrorCode::NotAParty);
    require_keys_neq!(signer_key, claim_by, ErrorCode::ClaimantCannotConfirm);

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
