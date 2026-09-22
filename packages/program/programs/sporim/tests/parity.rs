//! The TS↔Rust parity test `docs/09-phase0-plan.md` (T5.11) calls the most important test in
//! the repository, and which did not exist until now.
//!
//! The numbers were compared once, by hand, on one devnet run in September. That is a
//! measurement, not a test: it says the two implementations agreed on 20 USDC that afternoon,
//! and nothing about the next edit to either of them. The file read below is generated from
//! `calculateSettlement` itself (`packages/domain/src/money/vectors.ts`), so the two languages
//! can only move together — TypeScript fails when the file no longer matches its code, and this
//! fails when the program no longer matches the file.
//!
//! Cases the first slice does not implement — the `Commit` format, a referee's share, the
//! explicit refund outcome — are carried in the file with `onChain: false` and skipped here.
//! They are the contract the next slice has to meet, written down before it is written.

use serde_json::Value;
use sporim::settlement::calculate_settlement;
use sporim::state::Outcome;

const VECTORS: &str = include_str!("../../../../domain/test-vectors/settlement.v1.json");

fn amount(value: &Value, field: &str) -> u64 {
    value[field]
        .as_str()
        .unwrap_or_else(|| panic!("{field} is missing or not a string"))
        .parse()
        .unwrap_or_else(|_| panic!("{field} is not a u64"))
}

fn outcome(name: &str) -> Outcome {
    match name {
        "creator_wins" => Outcome::CreatorWins,
        "opponent_wins" => Outcome::OpponentWins,
        "draw" => Outcome::Draw,
        other => panic!("the program has no outcome called {other}"),
    }
}

#[test]
fn settles_every_on_chain_vector_exactly_as_the_domain_does() {
    let doc: Value = serde_json::from_str(VECTORS).expect("vectors are valid JSON");
    assert_eq!(
        doc["version"].as_str(),
        Some("sporim.settlement.v1"),
        "the vector file changed shape; this test reads v1"
    );
    // The fee is a constant on both sides, so a change to one of them has to break something.
    assert_eq!(
        doc["feeBps"].as_u64(),
        Some(sporim::constants::FEE_BPS as u64),
        "the vectors were generated under a different fee"
    );

    let cases = doc["cases"].as_array().expect("cases is an array");
    let mut checked = 0;

    for case in cases {
        if !case["onChain"].as_bool().unwrap_or(false) {
            continue;
        }
        let name = case["name"].as_str().unwrap_or("unnamed");
        let input = &case["input"];
        let expected = &case["expected"];

        let settlement = calculate_settlement(
            amount(input, "stakeCreator"),
            amount(input, "stakeOpponent"),
            outcome(input["outcome"].as_str().expect("outcome is a string")),
        )
        .unwrap_or_else(|error| panic!("{name}: the program refused a case the domain settles: {error:?}"));

        assert_eq!(settlement.to_creator, amount(expected, "toCreator"), "{name}: to creator");
        assert_eq!(settlement.to_opponent, amount(expected, "toOpponent"), "{name}: to opponent");
        assert_eq!(settlement.to_treasury, amount(expected, "toTreasury"), "{name}: to treasury");

        // The invariant behind the three numbers: a settlement moves the pot and nothing else.
        let paid = settlement.to_creator + settlement.to_opponent + settlement.to_treasury;
        assert_eq!(paid, amount(expected, "pot"), "{name}: the pot did not balance");

        checked += 1;
    }

    // A skip that swallowed every case would otherwise pass in silence — the failure mode this
    // repository has already been bitten by twice.
    assert!(checked >= 6, "only {checked} on-chain vectors ran; the file or the filter is wrong");
}

#[test]
fn refuses_a_pot_that_does_not_fit_in_u64() {
    // Not a vector: the domain has no u64 to overflow, so this boundary exists only here. It
    // is the reason the program returns `Result` rather than a number.
    assert!(calculate_settlement(u64::MAX, u64::MAX, Outcome::CreatorWins).is_err());
}
