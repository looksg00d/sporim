//! The program's rules against the domain's, case by case.
//!
//! `transitions.v1.json` is generated from `allowedActions` (`packages/domain/src/rules/
//! transition-vectors.ts`). `rules::allowed` must return the same set for every case marked
//! `onChain`, so the program cannot allow — or refuse — a move the product shows differently.

use serde_json::Value;
use sporim::rules::{allowed, Action, Actor, RuleInput};
use sporim::state::BetState;

const VECTORS: &str = include_str!("../../../../domain/test-vectors/transitions.v1.json");

fn state(name: &str) -> BetState {
    match name {
        "open" => BetState::Open,
        "active" => BetState::Active,
        "claimed" => BetState::Claimed,
        other => panic!("the program has no state called {other}"),
    }
}

fn actor(name: &str) -> Actor {
    match name {
        "creator" => Actor::Creator,
        "opponent" => Actor::Opponent,
        "stranger" => Actor::Stranger,
        other => panic!("no actor called {other}"),
    }
}

fn action_name(action: Action) -> &'static str {
    match action {
        Action::Accept => "accept",
        Action::Cancel => "cancel",
        Action::ExpireUnaccepted => "expireUnaccepted",
        Action::SubmitClaim => "submitClaim",
        Action::ConfirmClaim => "confirmClaim",
        Action::DisputeClaim => "disputeClaim",
        Action::SettleUncontested => "settleUncontested",
        Action::RefundExpired => "refundExpired",
    }
}

fn int(case: &Value, field: &str) -> i64 {
    case[field].as_i64().unwrap_or_else(|| panic!("{field} is not an integer"))
}

#[test]
fn allows_exactly_what_the_domain_allows() {
    let doc: Value = serde_json::from_str(VECTORS).expect("vectors are valid JSON");
    assert_eq!(doc["version"], "sporim.transitions.v1", "this test reads v1");

    let mut checked = 0;
    for case in doc["cases"].as_array().expect("cases is an array") {
        if !case["onChain"].as_bool().unwrap_or(false) {
            continue;
        }
        let name = case["name"].as_str().unwrap_or("unnamed");
        let input = RuleInput {
            state: state(case["state"].as_str().expect("state")),
            actor: actor(case["actor"].as_str().expect("actor")),
            now: int(case, "now"),
            accept_deadline: int(case, "acceptDeadline"),
            deadline: int(case, "deadline"),
            claim_by: case["claimBy"].as_str().map(actor),
            claim_window_ends: int(case, "claimWindowEnds"),
        };

        let mut got: Vec<&str> = allowed(&input).into_iter().map(action_name).collect();
        got.sort_unstable();
        let want: Vec<&str> = case["expected"]
            .as_array()
            .expect("expected is an array")
            .iter()
            .map(|v| v.as_str().expect("action name"))
            .collect();

        assert_eq!(got, want, "{name}");
        checked += 1;
    }

    // A file that silently lost its cases would pass the loop above.
    assert!(checked >= 20, "only {checked} cases were checked");
}
