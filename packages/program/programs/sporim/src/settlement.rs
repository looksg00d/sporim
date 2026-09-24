use crate::constants::{BET_SEED, BPS_DENOMINATOR, FEE_BPS};
use crate::error::ErrorCode;
use crate::state::Outcome;
use anchor_lang::prelude::*;
use anchor_spl::token::{close_account, transfer_checked, CloseAccount, TransferChecked};

/// Mirrors `calculateSettlement` in `packages/domain/src/money/settlement.ts` for the `Bet`
/// format with no referee (this increment has none — see `constants.rs`). Checked arithmetic
/// throughout: `docs/09-phase0-plan.md` §2.5's own invariant, "u128 arithmetic, checked_*
/// everywhere, no `as` casts on balances", still holds even though this slice does not yet
/// carry a `Config` or a dispute path.
pub struct Settlement {
    pub to_creator: u64,
    pub to_opponent: u64,
    pub to_treasury: u64,
}

pub fn calculate_settlement(
    stake_creator: u64,
    stake_opponent: u64,
    outcome: Outcome,
) -> Result<Settlement> {
    let pot = stake_creator
        .checked_add(stake_opponent)
        .ok_or(ErrorCode::MathOverflow)?;

    if outcome == Outcome::Draw {
        // No fee on a draw, same as a refund: nobody won anything to tax.
        return Ok(Settlement {
            to_creator: stake_creator,
            to_opponent: stake_opponent,
            to_treasury: 0,
        });
    }

    // Bet format: the winner's net gain is exactly the other side's stake (their own stake
    // just comes back to them inside the payout).
    let net = if outcome == Outcome::CreatorWins {
        stake_opponent
    } else {
        stake_creator
    };

    let fee = (net as u128)
        .checked_mul(FEE_BPS as u128)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR as u128))
        .and_then(|v| u64::try_from(v).ok())
        .ok_or(ErrorCode::MathOverflow)?;

    let payout = pot.checked_sub(fee).ok_or(ErrorCode::MathOverflow)?;

    Ok(if outcome == Outcome::CreatorWins {
        Settlement {
            to_creator: payout,
            to_opponent: 0,
            to_treasury: fee,
        }
    } else {
        Settlement {
            to_creator: 0,
            to_opponent: payout,
            to_treasury: fee,
        }
    })
}

/// The one place `confirm_claim` and `settle_uncontested` both hand off to, so a fix to the
/// payout mechanics never has to be made twice. Every transfer the vault can produce for one
/// bet, in one place, signed once by the `Bet` PDA. Skips a leg entirely when its amount is
/// zero, both because there is nothing to move and because a zero-amount transfer to an
/// account that was never asked for (a losing side's own ATA, say) would be a needless CPI.
#[allow(clippy::too_many_arguments)]
pub fn distribute<'info>(
    bet_id: [u8; 16],
    bump: u8,
    decimals: u8,
    token_program: Pubkey,
    mint: AccountInfo<'info>,
    vault: AccountInfo<'info>,
    bet: AccountInfo<'info>,
    creator_token_account: AccountInfo<'info>,
    opponent_token_account: AccountInfo<'info>,
    treasury_token_account: AccountInfo<'info>,
    settlement: Settlement,
) -> Result<()> {
    let seeds: &[&[u8]] = &[BET_SEED, &bet_id, &[bump]];
    let signer_seeds: &[&[&[u8]]] = &[seeds];

    let leg = |amount: u64, to: AccountInfo<'info>| -> Result<()> {
        if amount == 0 {
            return Ok(());
        }
        let cpi_accounts = TransferChecked {
            from: vault.clone(),
            mint: mint.clone(),
            to,
            authority: bet.clone(),
        };
        let cpi_ctx = CpiContext::new_with_signer(token_program, cpi_accounts, signer_seeds);
        transfer_checked(cpi_ctx, amount, decimals)
    };

    leg(settlement.to_creator, creator_token_account)?;
    leg(settlement.to_opponent, opponent_token_account)?;
    leg(settlement.to_treasury, treasury_token_account)?;

    Ok(())
}

/// Every stake back to whoever put it in, no fee — the domain's refund outcome. Shared by
/// `refund_expired` and a mutual `dispute_claim`, which differ in when, not in what moves.
#[allow(clippy::too_many_arguments)]
pub fn refund_both<'info>(
    bet_id: [u8; 16],
    bump: u8,
    decimals: u8,
    token_program: Pubkey,
    mint: AccountInfo<'info>,
    vault: AccountInfo<'info>,
    bet: AccountInfo<'info>,
    creator_token_account: AccountInfo<'info>,
    opponent_token_account: AccountInfo<'info>,
    stake_creator: u64,
    stake_opponent: u64,
) -> Result<()> {
    let seeds: &[&[u8]] = &[BET_SEED, &bet_id, &[bump]];
    let signer_seeds: &[&[&[u8]]] = &[seeds];

    for (amount, to) in [
        (stake_creator, creator_token_account),
        (stake_opponent, opponent_token_account),
    ] {
        if amount == 0 {
            continue;
        }
        let cpi_accounts = TransferChecked {
            from: vault.clone(),
            mint: mint.clone(),
            to,
            authority: bet.clone(),
        };
        let cpi_ctx = CpiContext::new_with_signer(token_program, cpi_accounts, signer_seeds);
        transfer_checked(cpi_ctx, amount, decimals)?;
    }
    Ok(())
}

/// Closes the emptied vault and returns its rent to `destination` — the bet's `rent_payer`.
///
/// Called last by every terminal instruction. The token program refuses to close an account
/// with a balance, so this doubles as the invariant: a terminal transition that left so much
/// as one base unit in the vault fails instead of stranding it.
pub fn close_vault<'info>(
    bet_id: [u8; 16],
    bump: u8,
    token_program: Pubkey,
    vault: AccountInfo<'info>,
    bet: AccountInfo<'info>,
    destination: AccountInfo<'info>,
) -> Result<()> {
    let seeds: &[&[u8]] = &[BET_SEED, &bet_id, &[bump]];
    let signer_seeds: &[&[&[u8]]] = &[seeds];
    let cpi_accounts = CloseAccount {
        account: vault,
        destination,
        authority: bet,
    };
    close_account(CpiContext::new_with_signer(token_program, cpi_accounts, signer_seeds))
}
