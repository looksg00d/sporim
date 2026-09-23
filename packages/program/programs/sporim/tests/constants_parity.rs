//! Every constant the program shares with the domain, checked against the one file both read.
//!
//! Same contract as `parity.rs`: the file is generated from `packages/domain/src/constants.ts`
//! (`src/rules/constants-vectors.ts`), so neither side can move a number alone. A constant the
//! program lacks is a compile error here, not a silent default.

use serde_json::Value;
use sporim::constants as c;

const VECTORS: &str = include_str!("../../../../domain/test-vectors/constants.v1.json");

fn expected(doc: &Value, name: &str) -> i128 {
    let entry = doc["values"]
        .as_array()
        .expect("values is an array")
        .iter()
        .find(|v| v["name"] == name)
        .unwrap_or_else(|| panic!("{name} is not in constants.v1.json"));
    assert!(
        entry["onChain"].as_bool().unwrap_or(false),
        "{name} is marked off-chain; the program should not be asserting it yet"
    );
    match &entry["value"] {
        Value::String(s) => s.parse().unwrap_or_else(|_| panic!("{name} is not numeric")),
        Value::Number(n) => n.as_i64().unwrap_or_else(|| panic!("{name} is not an integer")) as i128,
        other => panic!("{name}: unexpected value {other}"),
    }
}

#[test]
fn every_on_chain_constant_matches_the_domain() {
    let doc: Value = serde_json::from_str(VECTORS).expect("vectors are valid JSON");
    assert_eq!(doc["version"], "sporim.constants.v1", "this test reads v1");

    assert_eq!(expected(&doc, "FEE_BPS"), c::FEE_BPS as i128, "FEE_BPS");
    assert_eq!(expected(&doc, "MIN_STAKE"), c::MIN_STAKE as i128, "MIN_STAKE");
    assert_eq!(expected(&doc, "MAX_STAKE"), c::MAX_STAKE as i128, "MAX_STAKE");
    assert_eq!(
        expected(&doc, "MIN_DEADLINE_LEAD_SECONDS"),
        c::MIN_DEADLINE_LEAD_SECONDS as i128,
        "MIN_DEADLINE_LEAD_SECONDS"
    );
    assert_eq!(
        expected(&doc, "MAX_DEADLINE_LEAD_SECONDS"),
        c::MAX_DEADLINE_LEAD_SECONDS as i128,
        "MAX_DEADLINE_LEAD_SECONDS"
    );
    assert_eq!(
        expected(&doc, "CLAIM_WINDOW_SECONDS"),
        c::CLAIM_WINDOW_SECONDS as i128,
        "CLAIM_WINDOW_SECONDS"
    );
    assert_eq!(
        expected(&doc, "CLAIM_GRACE_SECONDS"),
        c::CLAIM_GRACE_SECONDS as i128,
        "CLAIM_GRACE_SECONDS"
    );
}
