pub mod constants;
pub mod error;
pub mod instructions;
pub mod rules;
pub mod settlement;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("EkfT8PTE7QShwtK6F7NEDgC2M3i4cGnLZhurULPVtDP2");

/// SPORIM, first devnet slice: the `Bet` format only — symmetric stakes, mutual confirmation,
/// timeout settlement. No referee, no dispute, no `Commit`/beneficiary payout yet; see
/// `constants.rs` and `docs/DECISIONS.md` for what that increment adds and why this one stops
/// short of it on purpose.
#[program]
pub mod sporim {
    use super::*;

    pub fn create_bet(
        ctx: Context<CreateBet>,
        bet_id: [u8; 16],
        stake: u64,
        deadline: i64,
        accept_deadline: i64,
    ) -> Result<()> {
        instructions::create_bet::handle_create_bet(ctx, bet_id, stake, deadline, accept_deadline)
    }

    pub fn accept_bet(ctx: Context<AcceptBet>) -> Result<()> {
        instructions::accept_bet::handle_accept_bet(ctx)
    }

    pub fn cancel_bet(ctx: Context<CancelBet>) -> Result<()> {
        instructions::cancel_bet::handle_cancel_bet(ctx)
    }

    pub fn expire_unaccepted(ctx: Context<ExpireUnaccepted>) -> Result<()> {
        instructions::expire_unaccepted::handle_expire_unaccepted(ctx)
    }

    pub fn submit_claim(ctx: Context<SubmitClaim>, outcome: state::Outcome) -> Result<()> {
        instructions::submit_claim::handle_submit_claim(ctx, outcome)
    }

    pub fn confirm_claim(ctx: Context<ConfirmClaim>) -> Result<()> {
        instructions::confirm_claim::handle_confirm_claim(ctx)
    }

    pub fn settle_uncontested(ctx: Context<SettleUncontested>) -> Result<()> {
        instructions::settle_uncontested::handle_settle_uncontested(ctx)
    }
}
