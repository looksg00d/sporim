# Devnet Escrow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `sporim.fun` with `NEXT_PUBLIC_CHAIN_MODE=devnet` moves real (devnet) tokens through the
`sporim` Anchor program for the whole Bet-format, mutual-decision lifecycle — and no bet can end
with money stuck in a vault.

**Architecture:** Rules first, money second. Phase A makes the program and the domain read one
file for their constants and one for "who may do what, when" — the same trick that already keeps
the money in parity (`test-vectors/settlement.v1.json`). Phase B closes the program's gaps
(an abandoned bet has no exit on-chain today). Phases C–E put a real `ChainAdapter` behind the
existing server actions: the server builds each transaction, the user's wallet signs it, the
server co-signs as fee payer, sends, confirms, and only then calls `applyTransition`. Phase F runs
the permissionless timeouts on a cron. Phase G turns it on for preview.

**Tech Stack:** Anchor (Rust, WSL2 toolchain), LiteSVM for program tests, `@solana/kit` 3,
Codama for the TS client, Privy Solana wallets, Next.js server actions, Vercel cron, vitest.

**Scope of this slice:** Bet format, mutual decision only. Out of scope until the decisions below
are made: referee on-chain (`referee_resolve`, `claim_referee_role`), the Commit format and its
beneficiary payout, `Config` PDA, mainnet.

---

## Decisions needed before Phase C (not before Phase A)

| #   | Question                                                                                   | Recommendation                                                                                                                                                                                       | Blocks           |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| D1  | How is the referee paid? (`STATUS.md` `[BLOCKED]`)                                         | Decide before any referee instruction. Until then the devnet wizard offers mutual only.                                                                                                              | referee on-chain |
| D2  | Who pays SOL — network fees and account rent? Privy embedded wallets hold USDC and no SOL. | Server keypair is **fee payer and rent payer** on every transaction; rent comes back to it when the bet closes (B4). Users need USDC only.                                                           | C, D, E          |
| D3  | Which mint on devnet?                                                                      | Our own 6-decimal test mint with a rate-limited faucet. The program is mint-agnostic (the mint is stored on the bet); Circle's devnet faucet is rate-limited per wallet and would gate every tester. | G                |

Everything in Phase A and B is needed whatever the answers are.

---

## How to run things

- **Domain / web tests (Windows shell):** `pnpm check` from the repo root. Integration tests only
  run with a local DB: see `STATUS.md` → "The test database is local, not the live one".
- **Program tests (WSL only — Anchor does not build on Windows):**
  ```bash
  wsl -e bash -lc 'cd /mnt/c/Users/4/Desktop/base/moneydeal/packages/program && CARGO_TARGET_DIR=$HOME/dev/.sporim-target cargo test'
  ```
  Expected today: `test result: ok. 2 passed`.
- **Regenerate a vector file after an intentional change:** `pnpm --filter @sporim/domain vectors`
  (extend the script in each task that adds a file).

---

## Phase A — one rulebook for two languages

Why first: the meta-pattern review (2026-09-23) found the program already disagrees with the
domain, and one disagreement strands money: the domain lets anyone `refundExpired` an `active`
bet nobody claimed within `CLAIM_GRACE_SECONDS` (14 days) after the deadline; the program has no
such exit and `submit_claim` accepts a claim at any later time. Vectors turn each such drift into
a failing test instead of a code review finding.

### Task A1: Constants vectors — the failing half

**Files:**

- Create: `packages/domain/src/rules/constants-vectors.ts`
- Create: `packages/domain/src/rules/constants-vectors.test.ts`
- Create (generated): `packages/domain/test-vectors/constants.v1.json`
- Modify: `packages/domain/package.json` (`vectors` script)

**Step 1: Write the generator**

```ts
// packages/domain/src/rules/constants-vectors.ts
import {
  CLAIM_GRACE_SECONDS,
  CLAIM_WINDOW_SECONDS,
  FEE_BPS,
  MAX_DEADLINE_LEAD_SECONDS,
  MAX_STAKE,
  MIN_DEADLINE_LEAD_SECONDS,
  MIN_STAKE,
  REFEREE_TIMEOUT_SECONDS,
} from '../constants';

/**
 * Every number both the domain and the program must agree on, in one file both read.
 * Same contract as `settlement.v1.json`: TypeScript snapshots it, Rust `include_str!`s it.
 * `onChain: false` marks a value the program does not need yet — the contract for later.
 */
export const CONSTANTS_VECTORS_VERSION = 'sporim.constants.v1';

export interface ConstantVector {
  readonly name: string;
  /** A string for anything that can exceed 2^53 once scaled; seconds and bps fit a number. */
  readonly value: string | number;
  readonly onChain: boolean;
}

export function buildConstantsVectors() {
  const values: readonly ConstantVector[] = [
    { name: 'FEE_BPS', value: FEE_BPS, onChain: true },
    { name: 'MIN_STAKE', value: MIN_STAKE.toString(), onChain: true },
    { name: 'MAX_STAKE', value: MAX_STAKE.toString(), onChain: true },
    { name: 'MIN_DEADLINE_LEAD_SECONDS', value: MIN_DEADLINE_LEAD_SECONDS, onChain: true },
    { name: 'MAX_DEADLINE_LEAD_SECONDS', value: MAX_DEADLINE_LEAD_SECONDS, onChain: true },
    { name: 'CLAIM_WINDOW_SECONDS', value: CLAIM_WINDOW_SECONDS, onChain: true },
    { name: 'CLAIM_GRACE_SECONDS', value: CLAIM_GRACE_SECONDS, onChain: true },
    // No referee on-chain in this slice (decision D1).
    { name: 'REFEREE_TIMEOUT_SECONDS', value: REFEREE_TIMEOUT_SECONDS, onChain: false },
  ];
  return { version: CONSTANTS_VECTORS_VERSION, values };
}
```

**Step 2: Write the snapshot test**

```ts
// packages/domain/src/rules/constants-vectors.test.ts
import { describe, expect, it } from 'vitest';
import { buildConstantsVectors, CONSTANTS_VECTORS_VERSION } from './constants-vectors';

const PATH = '../../test-vectors/constants.v1.json';
const serialized = `${JSON.stringify(buildConstantsVectors(), null, 2)}\n`;

describe('constants vectors', () => {
  it('matches the committed file, byte for byte', async () => {
    // After an intentional change: pnpm --filter @sporim/domain vectors
    await expect(serialized).toMatchFileSnapshot(PATH);
  });

  it('names every value once', () => {
    const names = buildConstantsVectors().values.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
    expect(buildConstantsVectors().version).toBe(CONSTANTS_VECTORS_VERSION);
  });
});
```

**Step 3: Generate the file and extend the script**

In `packages/domain/package.json` change `vectors` to:
`"vectors": "vitest run -u src/money/vectors.test.ts src/rules/constants-vectors.test.ts"`

Run: `pnpm --filter @sporim/domain vectors`
Expected: `test-vectors/constants.v1.json` created, tests PASS.

**Step 4: Write the Rust reader — it must fail**

Create `packages/program/programs/sporim/tests/constants_parity.rs`:

```rust
//! Every constant the program shares with the domain, checked against the one file both read.
//! A constant the program lacks is a compile error here, not a silent default.

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
    assert!(entry["onChain"].as_bool().unwrap_or(false), "{name} is marked off-chain");
    match &entry["value"] {
        Value::String(s) => s.parse().expect("numeric string"),
        Value::Number(n) => n.as_i64().expect("integer") as i128,
        other => panic!("{name}: unexpected value {other}"),
    }
}

#[test]
fn every_on_chain_constant_matches_the_domain() {
    let doc: Value = serde_json::from_str(VECTORS).expect("valid JSON");
    assert_eq!(doc["version"], "sporim.constants.v1");

    assert_eq!(expected(&doc, "FEE_BPS"), c::FEE_BPS as i128);
    assert_eq!(expected(&doc, "MIN_STAKE"), c::MIN_STAKE as i128);
    assert_eq!(expected(&doc, "MAX_STAKE"), c::MAX_STAKE as i128);
    assert_eq!(expected(&doc, "MIN_DEADLINE_LEAD_SECONDS"), c::MIN_DEADLINE_LEAD_SECONDS as i128);
    assert_eq!(expected(&doc, "MAX_DEADLINE_LEAD_SECONDS"), c::MAX_DEADLINE_LEAD_SECONDS as i128);
    assert_eq!(expected(&doc, "CLAIM_WINDOW_SECONDS"), c::CLAIM_WINDOW_SECONDS as i128);
    assert_eq!(expected(&doc, "CLAIM_GRACE_SECONDS"), c::CLAIM_GRACE_SECONDS as i128);
}
```

Run the program tests (WSL command above).
Expected: **compile error** `cannot find value CLAIM_GRACE_SECONDS in module c`. That is the drift.

**Step 5: Add the constant**

In `packages/program/programs/sporim/src/constants.rs`, after `CLAIM_WINDOW_SECONDS`:

```rust
/// Mirrors the domain's `CLAIM_GRACE_SECONDS`: after `deadline + CLAIM_GRACE_SECONDS` with no
/// claim, the bet is abandoned — nobody may claim, anybody may refund (see `refund_expired`).
pub const CLAIM_GRACE_SECONDS: i64 = 14 * 86_400;
```

Run program tests. Expected: PASS (3 tests).

**Step 6: Commit**

```bash
git add packages/domain/src/rules packages/domain/test-vectors/constants.v1.json packages/domain/package.json packages/program/programs/sporim/tests/constants_parity.rs packages/program/programs/sporim/src/constants.rs
git commit -m "test: the constants are one file two languages read"
```

### Task A2: Transition vectors from the domain

**Files:**

- Create: `packages/domain/src/rules/transition-vectors.ts`
- Create: `packages/domain/src/rules/transition-vectors.test.ts`
- Create (generated): `packages/domain/test-vectors/transitions.v1.json`
- Modify: `packages/domain/package.json` (`vectors` script gains this test file)

**Step 1: Write the generator**

```ts
// packages/domain/src/rules/transition-vectors.ts
import { CLAIM_GRACE_SECONDS } from '../constants';
import { allowedActions, type BetAction } from '../state/machine';
import { makeBet, makeParty } from '../testing';
import type { Bet, ViewerRole } from '../types/bet';

/**
 * "Who may do what, when", sampled at every boundary the program checks, for the one
 * shape the program implements: Bet format, mutual decision. Each case is one call to
 * `allowedActions`; the program's `rules::allowed` must return the same set.
 *
 * `share` is dropped: it is a screen, not an instruction.
 */
export const TRANSITIONS_VECTORS_VERSION = 'sporim.transitions.v1';

type Actor = 'creator' | 'opponent' | 'stranger';
const ROLE: Record<Actor, ViewerRole> = {
  creator: 'creator',
  opponent: 'opponent',
  stranger: 'observer',
};

export interface TransitionCase {
  readonly name: string;
  readonly state: Bet['state'];
  readonly actor: Actor;
  readonly now: number;
  readonly acceptDeadline: number;
  readonly deadline: number;
  readonly claimBy: Actor | null;
  readonly claimWindowEnds: number;
  readonly expected: readonly BetAction[];
  readonly onChain: boolean;
}

function sample(name: string, bet: Bet, actor: Actor, now: number, onChain = true): TransitionCase {
  return {
    name: `${name} — ${actor}`,
    state: bet.state,
    actor,
    now,
    acceptDeadline: bet.acceptDeadlineSeconds,
    deadline: bet.deadlineSeconds,
    claimBy: bet.claim ? (bet.claim.by === 'creator' ? 'creator' : 'opponent') : null,
    claimWindowEnds: bet.claim?.windowEndsAtSeconds ?? 0,
    expected: allowedActions(bet, ROLE[actor], now)
      .filter((a) => a !== 'share')
      .slice()
      .sort(),
    onChain,
  };
}

export function buildTransitionVectors() {
  const open = makeBet({ state: 'open' });
  const active = makeBet({ state: 'active', opponent: makeParty({ displayName: 'Dima' }) });
  const claimAt = active.deadlineSeconds + 60;
  const claimed = makeBet({
    ...active,
    state: 'claimed',
    claim: {
      outcome: 'creator_wins',
      by: 'creator',
      atSeconds: claimAt,
      windowEndsAtSeconds: claimAt + 48 * 3600,
    },
  });
  const grace = active.deadlineSeconds + CLAIM_GRACE_SECONDS;
  const windowEnds = claimed.claim!.windowEndsAtSeconds;

  const points: readonly (readonly [string, Bet, readonly Actor[], number])[] = [
    ['open, accept window running', open, ['creator', 'stranger'], open.acceptDeadlineSeconds - 1],
    ['open, accept window closed', open, ['creator', 'stranger'], open.acceptDeadlineSeconds],
    [
      'active, before deadline',
      active,
      ['creator', 'opponent', 'stranger'],
      active.deadlineSeconds - 1,
    ],
    ['active, at deadline', active, ['creator', 'opponent', 'stranger'], active.deadlineSeconds],
    ['active, last second of grace', active, ['creator', 'opponent', 'stranger'], grace - 1],
    ['active, abandoned', active, ['creator', 'opponent', 'stranger'], grace],
    ['claimed, window open', claimed, ['creator', 'opponent', 'stranger'], windowEnds - 1],
    ['claimed, window closed', claimed, ['creator', 'opponent', 'stranger'], windowEnds],
  ];

  const cases = points.flatMap(([name, bet, actors, now]) =>
    actors.map((a) => sample(name, bet, a, now)),
  );
  return { version: TRANSITIONS_VECTORS_VERSION, cases };
}
```

**Step 2: Snapshot test** — same shape as A1 Step 2, path
`'../../test-vectors/transitions.v1.json'`, plus:

```ts
it('covers every permissionless exit the program must have', () => {
  const all = new Set(buildTransitionVectors().cases.flatMap((c) => c.expected));
  for (const exit of ['expireUnaccepted', 'refundExpired', 'settleUncontested']) {
    expect(all.has(exit as never), exit).toBe(true);
  }
});
```

**Step 3:** Add the file to the `vectors` script; run `pnpm --filter @sporim/domain vectors`.
Expected: 22 cases in `transitions.v1.json`; PASS. Read the file: `active, abandoned` must list
`refundExpired` for all three actors and `active, last second of grace` must list `submitClaim`
for creator and opponent only.

**Step 4: Commit** — `test: who may do what, when, as a file`.

### Task A3: `rules.rs` — the program's copy of `allowedActions`

**Files:**

- Create: `packages/program/programs/sporim/src/rules.rs`
- Modify: `packages/program/programs/sporim/src/lib.rs` (`pub mod rules;`)
- Create: `packages/program/programs/sporim/tests/transitions_parity.rs`

**Step 1: Write the failing parity test**

```rust
use serde_json::Value;
use sporim::rules::{allowed, Action, Actor, RuleInput};
use sporim::state::BetState;

const VECTORS: &str = include_str!("../../../../domain/test-vectors/transitions.v1.json");

fn state(s: &str) -> BetState {
    match s {
        "open" => BetState::Open,
        "active" => BetState::Active,
        "claimed" => BetState::Claimed,
        other => panic!("no on-chain state {other}"),
    }
}
fn actor(s: &str) -> Actor {
    match s { "creator" => Actor::Creator, "opponent" => Actor::Opponent, _ => Actor::Stranger }
}
fn action_name(a: Action) -> &'static str {
    match a {
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

#[test]
fn allows_exactly_what_the_domain_allows() {
    let doc: Value = serde_json::from_str(VECTORS).expect("valid JSON");
    assert_eq!(doc["version"], "sporim.transitions.v1");
    let mut checked = 0;
    for case in doc["cases"].as_array().unwrap() {
        if !case["onChain"].as_bool().unwrap() { continue; }
        let input = RuleInput {
            state: state(case["state"].as_str().unwrap()),
            actor: actor(case["actor"].as_str().unwrap()),
            now: case["now"].as_i64().unwrap(),
            accept_deadline: case["acceptDeadline"].as_i64().unwrap(),
            deadline: case["deadline"].as_i64().unwrap(),
            claim_by: case["claimBy"].as_str().map(actor),
            claim_window_ends: case["claimWindowEnds"].as_i64().unwrap(),
        };
        let mut got: Vec<&str> = allowed(&input).into_iter().map(action_name).collect();
        got.sort();
        let want: Vec<&str> = case["expected"].as_array().unwrap().iter().map(|v| v.as_str().unwrap()).collect();
        assert_eq!(got, want, "{}", case["name"]);
        checked += 1;
    }
    assert!(checked >= 20, "only {checked} cases checked");
}
```

Run program tests. Expected: FAIL — `unresolved import sporim::rules`.

**Step 2: Implement `rules.rs`**

```rust
//! The program's copy of the domain's `allowedActions`, for the Bet format with mutual
//! decision. Pure: no accounts, no clock — instructions pass both in. Checked against
//! `transitions.v1.json`, so it cannot drift from the domain without a red test.

use crate::constants::CLAIM_GRACE_SECONDS;
use crate::state::BetState;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Actor { Creator, Opponent, Stranger }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Action {
    Accept, Cancel, ExpireUnaccepted, SubmitClaim, ConfirmClaim,
    DisputeClaim, SettleUncontested, RefundExpired,
}

pub struct RuleInput {
    pub state: BetState,
    pub actor: Actor,
    pub now: i64,
    pub accept_deadline: i64,
    pub deadline: i64,
    pub claim_by: Option<Actor>,
    pub claim_window_ends: i64,
}

pub fn allowed(i: &RuleInput) -> Vec<Action> {
    let party = matches!(i.actor, Actor::Creator | Actor::Opponent);
    match i.state {
        BetState::Open => {
            if i.now >= i.accept_deadline { return vec![Action::ExpireUnaccepted]; }
            match i.actor {
                Actor::Creator => vec![Action::Cancel],
                _ => vec![Action::Accept],
            }
        }
        BetState::Active => {
            if i.now >= i.deadline.saturating_add(CLAIM_GRACE_SECONDS) {
                return vec![Action::RefundExpired];
            }
            if i.now >= i.deadline && party { vec![Action::SubmitClaim] } else { vec![] }
        }
        BetState::Claimed => {
            if i.now >= i.claim_window_ends { return vec![Action::SettleUncontested]; }
            if party && i.claim_by != Some(i.actor) {
                vec![Action::ConfirmClaim, Action::DisputeClaim]
            } else { vec![] }
        }
        _ => vec![],
    }
}

/// For instructions: fail with `InvalidState` unless `action` is allowed right now.
pub fn require_allowed(i: &RuleInput, action: Action) -> anchor_lang::Result<()> {
    anchor_lang::require!(allowed(i).contains(&action), crate::error::ErrorCode::InvalidState);
    Ok(())
}
```

Add `pub mod rules;` to `lib.rs`. Run program tests. Expected: PASS.

**Step 3: Break it on purpose** (the repo's rule — a parity test is only trusted after it fails):
change `CLAIM_GRACE_SECONDS` in `rules.rs` usage to `0`, run, expect `active, last second of
grace` to fail by name; revert.

**Step 4: Commit** — `feat(program): rules.rs mirrors allowedActions, checked by the vectors`.

---

## Phase B — the program has an exit from every state

Each task: write a LiteSVM test in `packages/program/programs/sporim/tests/` first (pattern: the
existing test in `src/instructions/settle_uncontested.rs`), run it red, implement, run green,
commit. Every instruction's handler starts with `rules::require_allowed(...)` instead of its own
hand-written state/time checks.

### Task B1: `refund_expired` for an abandoned `active` bet

- Test: create → accept → warp clock to `deadline + CLAIM_GRACE_SECONDS` → a **random keypair**
  calls `refund_expired` → creator and opponent each get their stake back, treasury gets 0,
  vault balance 0, state `Refunded`.
- Test: same at `deadline + CLAIM_GRACE_SECONDS - 1` → `InvalidState`.
- Implement `instructions/refund_expired.rs`; register in `lib.rs`.

### Task B2: `submit_claim` respects the grace bound

- Test: claim at `deadline + CLAIM_GRACE_SECONDS` → `InvalidState` (fails today).
- Replace its checks with `require_allowed(&input, Action::SubmitClaim)`.

### Task B3: `dispute_claim` (mutual) refunds both at once

- Domain rule (DECISIONS 2026-09-17): with no referee, disagreeing refunds both, zero fee.
- Test: claimed by creator → opponent disputes → both refunded in full, treasury 0, `Refunded`.
- Test: the claimant disputing their own claim → `InvalidState`.

### Task B4: close the accounts on every terminal transition

- Scale-game finding: rent for the bet account and the vault ATA (~$0.4–0.5 of SOL) is never
  returned. Add `rent_payer: Pubkey` to `Bet` (decision D2: the server keypair), and close the
  vault ATA and the bet account to `rent_payer` in `confirm_claim`, `settle_uncontested`,
  `cancel_bet`, `expire_unaccepted`, `refund_expired`, `dispute_claim`.
- Invariant test (docs/09 T5.6): for each terminal path, after the instruction the vault account
  does not exist and `rent_payer`'s lamports rose by the rent paid at create.
- Note: this changes the account layout — bets created by the 2026-09-12 deployment become
  unreadable. Devnet only, no real value; say so in the commit.

### Task B5: point the remaining instructions at `rules.rs`

- `accept_bet`, `cancel_bet`, `expire_unaccepted`, `confirm_claim`, `settle_uncontested`: replace
  hand-written state/time checks with `require_allowed`. Existing tests must stay green.

### Task B6: redeploy to devnet (manual — needs the admin keypair in WSL)

```bash
wsl -e bash -lc 'cd /mnt/c/Users/4/Desktop/base/moneydeal/packages/program && anchor build && anchor deploy --provider.cluster devnet'
```

Then one scripted happy path and one `refund_expired` path against devnet; record signatures in
`docs/DECISIONS.md`.

---

## Phase C — a TS client that cannot disagree with the IDL

### Task C1: generate the client with Codama

- Add `@codama/nodes-from-anchor` + `@codama/renderers-js` as dev deps of `packages/chain`;
  script `pnpm --filter @sporim/chain generate` reads `packages/program/programs/sporim/idl.json`,
  writes `packages/chain/src/devnet/generated/` (committed, prettier-ignored).
- Test: `pdas.test.ts` — `findBetPda(betId)` equals `getProgramDerivedAddress` with seeds
  `["bet", betId]` for 100 random 16-byte ids (docs/09 T5.7).

### Task C2: `betIdBytes(BetId)` ↔ uuid

- The database id is a uuid; the program wants `[u8; 16]`. One pure function each way, tested
  round-trip, used by both the adapter and the reconciliation job.

---

## Carried into D–G from the 2026-09-24 review and collision round

Already fixed in the program: a token donated to the vault locked the bet (critical) — the
leftover is now swept to the creator before closing; any mint was accepted (high) — pinned to
`allowed_mint()`. Still open, and owned by the tasks below:

- **`rent_payer` is whatever the creator's transaction named (review, medium).** A creator who
  pays with a key K, drains it and deploys a program at K makes K executable; crediting rent to
  an executable account fails, so the bet could never close. Our server never builds such a
  bet, but `accept_bet` is open to anyone. → D1: the adapter refuses to build _any_ instruction
  for a bet whose `rent_payer` is not the server key. Before mainnet, pin it in the program.
- **A closed bet's PDA can be reused (review, medium).** Reconciliation (G3) must compare by
  `create_tx` signature, never by "the account exists".
- **ATAs may be missing (review, low).** D1 prepends `createAssociatedTokenIdempotent` for
  creator, opponent and treasury before every terminal instruction.
- **Dust goes to the creator (collision #5).** Keeps the account list unchanged, but a creator's
  payout can exceed the settlement vector by what strangers sent. G3 must allow for it.
- **One hot key does everything (collision #1).** Before G2 puts a key on Vercel: split `admin`
  (upgrade authority, cold), `fee-payer` (Vercel) and `faucet` (mint authority via
  `spl-token authorize`). `rent_payer` is stored per bet — keep the old key until its bets close.
- **An upgrade changes the rules of open bets (collision #3).** Happened twice this slice
  (B4 layout, B5 confirm window). Acceptable on devnet; before mainnet add `rules_version` to
  `Bet` and branch `rules.rs` on it.
- **A blockhash lives ~1 minute (collision #4).** E1's intent must store the _meaning_ of the
  move (bet, action, outcome) and rebuild the transaction if the blockhash expired while a person
  hopped Instagram → Phantom — not the message bytes.

## Phase D — `DevnetChainAdapter`

Lives in `packages/chain/src/devnet/`. The server holds the fee-payer keypair (env
`SOLANA_FEE_PAYER_SECRET`, base58, validated at startup in `lib/env.ts`, never exposed to the
client).

### Task D1: transaction builders (pure)

- `buildCreateBet`, `buildAcceptBet`, `buildSubmitClaim`, `buildConfirmClaim`,
  `buildDisputeClaim`, `buildCancel`, and the three permissionless ones — each returns an
  unsigned transaction message with fee payer = server key and the user as the required signer.
- Tests: decode each built message and assert program id, accounts, and instruction data.

### Task D2: send and confirm

- `submit(signedByUser)`: verify the message is byte-identical to one this server built (keep the
  built message hash in the pending intent — see E1), add the fee-payer signature, send, confirm
  with backoff, map errors into `ChainError`.
- Contract suite (`CHAIN_E2E=1`) against `solana-test-validator` in WSL with the program loaded.

### Task D3: reads

- `getBet` decodes the account with the generated codec; `null` for a closed account.

---

## Phase E — the web app uses it

### Task E1: two-step server actions

- `prepare<Action>(code)` → authorizes exactly as today (`applyTransition`'s checks, no write),
  builds the transaction, stores a pending intent `{bet_id, action, message_hash, expires_at}`,
  returns the base64 message.
- `commit<Action>(intentId, signedTx)` → loads the intent, `submit`s, and **only on confirmed**
  calls `applyTransition` and stores the signature (`create_tx` / `accept_tx` / `settle_tx`).
- Migration `0012_pending_intents.sql` (RLS like `bets`; rows expire).
- `chainMode === 'mock'` keeps today's one-step path untouched — e2e stays green.

### Task E2: the wallet signs

- `features/wallet/privy-solana.ts`: `signTransaction` via Privy's Solana wallet (embedded or
  Phantom). `WalletPort` stays the seam the review screen and bet page already use.

### Task E3: devnet wizard offers what the program implements

- On devnet: format Bet only, decision mutual only. The review copy stops saying "Simulated" and
  links the explorer (`explorerUrl`).

---

## Phase F — the timeouts actually fire (useful in mock mode too)

### Task F1: `/api/cron/timeouts`

- Vercel cron every 10 min, guarded by `CRON_SECRET`.
- Query bets with a due permissionless action (`expireUnaccepted`, `settleUncontested`,
  `refundExpired`) — decided by `allowedActions` with role `observer`, not by a second SQL copy of
  the rules; paginate.
- For each: mock → `applyTransition`; devnet → adapter call with the fee payer as signer, then
  `applyTransition`.
- Integration test against the local DB: a claimed bet past its window becomes `resolved`.

Can be done before Phase C: it fixes "timeouts nobody triggers" on the live mock site today.

---

## Phase G — turn it on

### Task G1: test mint + faucet (decision D3)

- Script creates the mint once; server action `requestTestUsdc` mints 50 to the signed-in user's
  wallet, rate-limited to once per 24 h per user.

### Task G2: preview on devnet

- Vercel preview env: `NEXT_PUBLIC_CHAIN_MODE=devnet`, `SOLANA_FEE_PAYER_SECRET`, `CRON_SECRET`.
- Live check with two accounts: faucet → create → accept → claim → confirm, balances asserted by
  hand against `calculateSettlement`; then an abandoned bet refunded by the cron.

### Task G3: reconciliation

- `/api/health` compares on-chain state with the row for bets touched in the last 24 h and
  reports mismatches; a desynced row is repaired within one cron cycle (docs/09 T5.10).

---

## Definition of done for the slice

- Program tests: constants, transitions and settlement parity all green; every terminal path
  leaves no vault and returns rent.
- `pnpm check` and e2e green with `mock`; contract suite green with `CHAIN_E2E=1`.
- Preview on devnet completes the two-account happy path and the abandoned-bet refund.
- `STATUS.md` and `docs/DECISIONS.md` updated; D1–D3 answered in `DECISIONS.md`.
