use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Stake must be between MIN_STAKE and MAX_STAKE")]
    InvalidStake,
    #[msg("Deadline must be far enough ahead and not absurdly far")]
    InvalidDeadline,
    #[msg("Accept deadline must fall on or before the settlement deadline")]
    InvalidAcceptDeadline,
    #[msg("The creator cannot accept their own bet")]
    CreatorCannotAccept,
    #[msg("This bet is not in the state this instruction requires")]
    InvalidState,
    #[msg("The accept window is still open")]
    AcceptWindowNotExpired,
    #[msg("The accept window has already closed")]
    AcceptWindowExpired,
    #[msg("The settlement deadline has not passed yet")]
    DeadlineNotReached,
    #[msg("Only the creator or the opponent may act here")]
    NotAParty,
    #[msg("The side that submitted the claim cannot confirm it")]
    ClaimantCannotConfirm,
    #[msg("The claim window is still open")]
    ClaimWindowNotExpired,
    #[msg("Only the bet's creator may cancel it")]
    OnlyCreatorCancels,
    #[msg("The token account does not belong to the expected owner")]
    WrongTokenOwner,
    #[msg("The token account is for the wrong mint")]
    WrongMint,
    #[msg("A checked arithmetic operation overflowed")]
    MathOverflow,
    #[msg("This bet has no claim to settle")]
    NoClaim,
}
