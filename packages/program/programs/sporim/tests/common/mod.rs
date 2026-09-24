//! LiteSVM harness for instruction-level tests.
//!
//! Loads the SBF build of the program (`cargo build-sbf`, see
//! `docs/plans/2026-09-23-devnet-escrow.md`), a 6-decimal test mint, funded token accounts for
//! both sides and the treasury, and a clock the test moves by hand. Helpers return the raw
//! `TransactionResult`, so a test asserts on a refusal as easily as on a success.

#![allow(dead_code)]

use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use anchor_spl::associated_token::{
    get_associated_token_address,
    spl_associated_token_account::instruction::create_associated_token_account,
};
use anchor_spl::token::spl_token;
use litesvm::types::TransactionResult;
use litesvm::LiteSVM;
use solana_clock::Clock;
use solana_keypair::Keypair;
use solana_program_pack::Pack;
use solana_signer::Signer;
use solana_transaction::Transaction;

pub use anchor_lang::prelude::Pubkey;
pub use solana_instruction::Instruction;

pub const USDC: u64 = 1_000_000;
pub const STAKE: u64 = 20 * USDC;
pub const FUNDED: u64 = 100 * USDC;
pub const START: i64 = 1_800_000_000;
pub const DEADLINE: i64 = START + 5 * 86_400;
pub const ACCEPT_DEADLINE: i64 = START + 2 * 86_400;

/// Where the SBF build lands. Overridable, because the target dir is per machine.
fn program_path() -> Option<std::path::PathBuf> {
    let path: std::path::PathBuf = match std::env::var("SPORIM_SO") {
        Ok(path) => path.into(),
        Err(_) => {
            let home = std::env::var("HOME").unwrap_or_default();
            std::path::PathBuf::from(home).join("dev/.sporim-sbf/deploy/sporim.so")
        }
    };
    path.exists().then_some(path)
}

pub struct World {
    pub svm: LiteSVM,
    /// Pays fees and rent. In production this is the server's keypair (plan decision D2).
    pub payer: Keypair,
    pub creator: Keypair,
    pub opponent: Keypair,
    pub stranger: Keypair,
    pub mint: Pubkey,
    pub bet_id: [u8; 16],
}

/// `None` when the program has not been built: the test says why and passes vacuously, so
/// `cargo test` stays usable on a machine (and a CI leg) with no SBF toolchain.
pub fn world() -> Option<World> {
    let Some(path) = program_path() else {
        eprintln!("skipping: no SBF build of sporim (set SPORIM_SO or run cargo build-sbf)");
        return None;
    };

    let mut svm = LiteSVM::new();
    svm.add_program_from_file(sporim::ID, path).expect("program loads");

    let payer = Keypair::new();
    let creator = Keypair::new();
    let opponent = Keypair::new();
    let stranger = Keypair::new();
    for who in [&payer, &creator, &opponent, &stranger] {
        svm.airdrop(&who.pubkey(), 10_000_000_000).expect("airdrop");
    }

    let mint = Keypair::new();
    let rent = svm.minimum_balance_for_rent_exemption(spl_token::state::Mint::LEN);
    let create_mint = solana_system_interface::instruction::create_account(
        &payer.pubkey(),
        &mint.pubkey(),
        rent,
        spl_token::state::Mint::LEN as u64,
        &spl_token::ID,
    );
    let init_mint = spl_token::instruction::initialize_mint2(
        &spl_token::ID,
        &mint.pubkey(),
        &payer.pubkey(),
        None,
        6,
    )
    .expect("init mint ix");
    send(&mut svm, &payer, &[create_mint, init_mint], &[&mint]).expect("mint created");

    let mut world = World {
        svm,
        payer,
        creator,
        opponent,
        stranger,
        mint: mint.pubkey(),
        bet_id: *b"bet-0000-0000-01",
    };
    for owner in [
        world.creator.pubkey(),
        world.opponent.pubkey(),
        world.stranger.pubkey(),
        sporim::constants::treasury(),
    ] {
        world.create_ata(owner);
    }
    for owner in [world.creator.pubkey(), world.opponent.pubkey(), world.stranger.pubkey()] {
        world.mint_to(owner, FUNDED);
    }
    world.set_time(START);
    Some(world)
}

pub fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    ixs: &[Instruction],
    extra: &[&Keypair],
) -> TransactionResult {
    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend_from_slice(extra);
    let tx = Transaction::new_signed_with_payer(
        ixs,
        Some(&payer.pubkey()),
        &signers,
        svm.latest_blockhash(),
    );
    let result = svm.send_transaction(tx);
    // Two identical transactions in one test would otherwise collide on the signature.
    svm.expire_blockhash();
    result
}

impl World {
    pub fn ata(&self, owner: Pubkey) -> Pubkey {
        get_associated_token_address(&owner, &self.mint)
    }

    fn create_ata(&mut self, owner: Pubkey) {
        let ix = create_associated_token_account(
            &self.payer.pubkey(),
            &owner,
            &self.mint,
            &spl_token::ID,
        );
        let payer = self.payer.insecure_clone();
        send(&mut self.svm, &payer, &[ix], &[]).expect("ata created");
    }

    fn mint_to(&mut self, owner: Pubkey, amount: u64) {
        let ix = spl_token::instruction::mint_to(
            &spl_token::ID,
            &self.mint,
            &self.ata(owner),
            &self.payer.pubkey(),
            &[],
            amount,
        )
        .expect("mint_to ix");
        let payer = self.payer.insecure_clone();
        send(&mut self.svm, &payer, &[ix], &[]).expect("minted");
    }

    pub fn set_time(&mut self, unix: i64) {
        let mut clock: Clock = self.svm.get_sysvar();
        clock.unix_timestamp = unix;
        self.svm.set_sysvar(&clock);
    }

    /// Token balance of `owner`'s ATA for the test mint.
    pub fn balance(&self, owner: Pubkey) -> u64 {
        self.token_balance(self.ata(owner))
    }

    pub fn token_balance(&self, account: Pubkey) -> u64 {
        match self.svm.get_account(&account) {
            Some(acc) if !acc.data.is_empty() => {
                spl_token::state::Account::unpack(&acc.data).expect("token account").amount
            }
            _ => 0,
        }
    }

    pub fn lamports(&self, address: Pubkey) -> u64 {
        self.svm.get_account(&address).map_or(0, |a| a.lamports)
    }

    pub fn bet(&self) -> Pubkey {
        Pubkey::find_program_address(&[sporim::constants::BET_SEED, &self.bet_id], &sporim::ID).0
    }

    pub fn vault(&self) -> Pubkey {
        get_associated_token_address(&self.bet(), &self.mint)
    }

    /// Closed accounts are garbage-collected to zero lamports.
    pub fn exists(&self, address: Pubkey) -> bool {
        self.lamports(address) > 0
    }

    pub fn state(&self) -> sporim::state::BetState {
        let acc = self.svm.get_account(&self.bet()).expect("bet exists");
        sporim::state::Bet::try_deserialize(&mut acc.data.as_slice())
            .expect("bet decodes")
            .state
    }

    pub fn run(&mut self, ix: Instruction, signer: &Keypair) -> TransactionResult {
        let payer = self.payer.insecure_clone();
        send(&mut self.svm, &payer, &[ix], &[signer])
    }

    // ── instruction builders ─────────────────────────────────────────────────────────────

    pub fn create_ix(&self) -> Instruction {
        Instruction {
            program_id: sporim::ID,
            accounts: sporim::accounts::CreateBet {
                creator: self.creator.pubkey(),
                payer: self.payer.pubkey(),
                bet: self.bet(),
                mint: self.mint,
                creator_token_account: self.ata(self.creator.pubkey()),
                vault: self.vault(),
                token_program: spl_token::ID,
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: sporim::instruction::CreateBet {
                bet_id: self.bet_id,
                stake: STAKE,
                deadline: DEADLINE,
                accept_deadline: ACCEPT_DEADLINE,
            }
            .data(),
        }
    }

    pub fn accept_ix(&self, taker: &Keypair) -> Instruction {
        Instruction {
            program_id: sporim::ID,
            accounts: sporim::accounts::AcceptBet {
                opponent: taker.pubkey(),
                bet: self.bet(),
                mint: self.mint,
                opponent_token_account: self.ata(taker.pubkey()),
                vault: self.vault(),
                token_program: spl_token::ID,
            }
            .to_account_metas(None),
            data: sporim::instruction::AcceptBet {}.data(),
        }
    }

    pub fn claim_ix(&self, who: &Keypair, outcome: sporim::state::Outcome) -> Instruction {
        Instruction {
            program_id: sporim::ID,
            accounts: sporim::accounts::SubmitClaim {
                signer: who.pubkey(),
                bet: self.bet(),
            }
            .to_account_metas(None),
            data: sporim::instruction::SubmitClaim { outcome }.data(),
        }
    }

    pub fn confirm_ix(&self, who: &Keypair) -> Instruction {
        Instruction {
            program_id: sporim::ID,
            accounts: sporim::accounts::ConfirmClaim {
                signer: who.pubkey(),
                bet: self.bet(),
                mint: self.mint,
                vault: self.vault(),
                creator_token_account: self.ata(self.creator.pubkey()),
                opponent_token_account: self.ata(self.opponent.pubkey()),
                treasury_token_account: self.ata(sporim::constants::treasury()),
                rent_payer: self.payer.pubkey(),
                token_program: spl_token::ID,
            }
            .to_account_metas(None),
            data: sporim::instruction::ConfirmClaim {}.data(),
        }
    }

    /// Anyone may send it; `caller` only signs.
    pub fn refund_expired_ix(&self, caller: &Keypair) -> Instruction {
        Instruction {
            program_id: sporim::ID,
            accounts: sporim::accounts::RefundExpired {
                caller: caller.pubkey(),
                bet: self.bet(),
                mint: self.mint,
                vault: self.vault(),
                creator_token_account: self.ata(self.creator.pubkey()),
                opponent_token_account: self.ata(self.opponent.pubkey()),
                rent_payer: self.payer.pubkey(),
                token_program: spl_token::ID,
            }
            .to_account_metas(None),
            data: sporim::instruction::RefundExpired {}.data(),
        }
    }

    pub fn dispute_ix(&self, who: &Keypair) -> Instruction {
        Instruction {
            program_id: sporim::ID,
            accounts: sporim::accounts::DisputeClaim {
                signer: who.pubkey(),
                bet: self.bet(),
                mint: self.mint,
                vault: self.vault(),
                creator_token_account: self.ata(self.creator.pubkey()),
                opponent_token_account: self.ata(self.opponent.pubkey()),
                rent_payer: self.payer.pubkey(),
                token_program: spl_token::ID,
            }
            .to_account_metas(None),
            data: sporim::instruction::DisputeClaim {}.data(),
        }
    }

    pub fn settle_ix(&self, caller: &Keypair) -> Instruction {
        Instruction {
            program_id: sporim::ID,
            accounts: sporim::accounts::SettleUncontested {
                caller: caller.pubkey(),
                bet: self.bet(),
                mint: self.mint,
                vault: self.vault(),
                creator_token_account: self.ata(self.creator.pubkey()),
                opponent_token_account: self.ata(self.opponent.pubkey()),
                treasury_token_account: self.ata(sporim::constants::treasury()),
                rent_payer: self.payer.pubkey(),
                token_program: spl_token::ID,
            }
            .to_account_metas(None),
            data: sporim::instruction::SettleUncontested {}.data(),
        }
    }

    pub fn cancel_ix(&self) -> Instruction {
        Instruction {
            program_id: sporim::ID,
            accounts: sporim::accounts::CancelBet {
                creator: self.creator.pubkey(),
                bet: self.bet(),
                mint: self.mint,
                vault: self.vault(),
                creator_token_account: self.ata(self.creator.pubkey()),
                rent_payer: self.payer.pubkey(),
                token_program: spl_token::ID,
            }
            .to_account_metas(None),
            data: sporim::instruction::CancelBet {}.data(),
        }
    }

    pub fn expire_ix(&self, caller: &Keypair) -> Instruction {
        Instruction {
            program_id: sporim::ID,
            accounts: sporim::accounts::ExpireUnaccepted {
                caller: caller.pubkey(),
                bet: self.bet(),
                mint: self.mint,
                vault: self.vault(),
                creator_token_account: self.ata(self.creator.pubkey()),
                rent_payer: self.payer.pubkey(),
                token_program: spl_token::ID,
            }
            .to_account_metas(None),
            data: sporim::instruction::ExpireUnaccepted {}.data(),
        }
    }

    pub fn create(&mut self) {
        let creator = self.creator.insecure_clone();
        let create = self.create_ix();
        self.run(create, &creator).expect("created");
    }

    /// create → accept by `opponent` → clock at the deadline. Where most stories start.
    pub fn active_at_deadline(&mut self) {
        let opponent = self.opponent.insecure_clone();
        self.create();
        let accept = self.accept_ix(&opponent);
        self.run(accept, &opponent).expect("accepted");
        self.set_time(DEADLINE);
    }
}
