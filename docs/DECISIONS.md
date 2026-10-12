# Decision log

A chronological log: **what we decided, why, and what it changed**. It is appended top to bottom,
entries are never rewritten after the fact. If a decision is reversed, a new entry is added that
links to the old one.

Why a separate file: the spec (`05`) says how the product works **now**, the plan (`09`) says what
to do next, and this file answers the question "why this way and not another", which a month later
cannot be recovered from the code or from git.

Entry format: date · decision · why · what changed in the code.

---

## 2026-09-24

### The server pays for all SOL, the user only needs USDC (plan, decision D2)

**Decision (yours, "do it all" on the recommendation).** The network fee and the rent for the bet
accounts are paid by the server key. `create_bet` takes a separate `payer`, the address is written
into the bet as `rent_payer`, and every final transition closes the vault and the bet account back
to it.

**Why.** The built-in Privy wallet holds USDC and zero SOL: without this, a person could not
create a bet at all. And the scale-game review showed that the rent (~$0.4–0.5) was never
returned, against a fee of 3 cents on a 1 USDC stake. Now it is returned to the lamport, and
that is covered by a test on each of the six final paths.

**Cost.** The `Bet` account layout changed: the program no longer reads bets from the 12 September
deploy. Devnet, test tokens, agreed.

### A test token instead of devnet USDC (decision D3)

**Decision.** Our own 6-decimal mint `2SmKoxP42D8sj4rpiXwxQ1L6s2PswA7XuaLpVw74u6cc`, issued by
the admin. The address and parameters are in `packages/chain/devnet.json`. The Circle faucet is
limited per wallet and would stand between every tester and their first bet; the program does
not care about the mint, since it is stored in the bet.

### An exit from every on-chain state, and the deploy

**What was done.** `refund_expired` (an abandoned bet: anyone refunds both stakes after 14 days),
`dispute_claim` (no referee: both get an immediate refund), every instruction asks `rules.rs`,
and `rules.rs` is checked against the domain through `transitions.v1.json`. Along the way the
vectors found three mismatches: there was no `CLAIM_GRACE_SECONDS` and no exit for an abandoned
bet, a claim was accepted after 14 days, and a confirmation after the 48-hour window had ended.

**Deploy.** The same address `EkfT…`, slot 503447697, program extended to 320 KB (~0.35 SOL,
permanent). Verified with real transactions through the generated client
(`packages/chain/scripts/devnet-smoke.ts`): a creator with zero SOL creates a bet, a cancel closes
both accounts, and the admin spends only 0.00002 SOL in fees.

**Trap.** `anchor idl build` silently rewrote `declare_id!` and `Anchor.toml` to a random key
from the build directory. Caught before the commit; `packages/program/scripts/idl.sh` now saves
both files and restores them.

**Not done.** The referee on chain is waiting on a decision about how to pay them (D1). The site
does not see the program yet: that is phases D–E of the plan.

---

## 2026-09-17

### Disagreement without a referee means an immediate refund to both, no fee

**Decision (yours).** If there is no referee and the other side pressed "disagree", the bet goes
straight to `refunded`: each side gets their whole stake back, with no fee. There is nobody to
wait for, so there is no timeout either. Silence for 48 hours still leaves the claim standing. If a
referee is named, whether or not they confirmed the role, everything is as before: the dispute
goes to them.

**Why.** Until now `claimedActions` offered a dispute only when there was a referee ("without a
referee the timeout does the work"). The side that received a false claim could agree or wait,
and waiting handed the pot to whoever claimed first. The spec (`docs/05`, "No referee … → refund
to both") already promised this, and the code lagged behind. The 16 September review called it
critical: together with the open `accept_bet` on chain it amounted to "a bot takes someone else's
bet, claims the win first, and collects the pot".

**What we pay for it.** Without a referee, the loser can always say "disagree" for free and get
their stake back. Such a bet can only be won if the loser confirms the result themselves, so a
bet without a referee becomes a bet on honesty, and the referee selection screen says so
plainly. If the funnel shows too many of these refunds, that is a reason to push people toward
a referee, not to take the stake back.

**What changed in the code.**

- `nextState(action, bet)` now takes the bet: `disputeClaim` leads to `disputed` when a referee
  is named and to `refunded` when not.
- `claimedActions` always offers `disputeClaim`.
- `openDispute` without a referee does not write a row to `disputes`: `referee_deadline_at` is
  required there, and there is nobody to decide. The trail stays in `bet_events`:
  `disputeClaim`, `claimed → refunded`, and who objected. No migration was needed.
- Copy: `TRUST_COPY.disputingMutual`, `timeline`, the "We both confirm" hint on the referee
  screen, `whatHappensNext`.
- The program (`packages/program`) does not know about disputes at all yet. `dispute_claim` in
  the next slice must repeat this rule: no referee means a refund, no fee.

### Money parity: shared vectors that both languages read

**Decision.** The settlement numbers are described once, in
`packages/domain/src/money/vectors.ts`, and generated from `calculateSettlement` itself into
`packages/domain/test-vectors/settlement.v1.json`. TypeScript keeps the file as a snapshot
(`pnpm --filter @sporim/domain vectors` regenerates it), Rust reads the same file through
`include_str!` and checks its own arithmetic against it. Neither side can move the numbers alone.

**Why.** `docs/09` (T5.11) called this test the most important one in the repository, and it did
not exist. The on-chain match with the domain had been measured once by hand, on one run in
September: that is a fact about that day, not a property of the code. Two implementations of one
rule drift apart exactly when someone fixes one of them, and the drift is invisible, since both
keep passing their own tests.

**What is in the vectors.** 16 cases: both sides of a Bet, a draw, a refund, the MIN and MAX
boundaries, and above all rounding: 33 and 34 base units on either side of the first whole unit
of fee, 3333 and 3334 for the hundredth. An implementation that rounds the other way passes any
"20 USDC" test and fails on these. Cases the first slice cannot do (Commit, the referee share, an
explicit refund) are marked `onChain: false` and skipped by the Rust test. That is a contract for
the next slice, written down before it is built.

**Verified on both sides.** I corrupted one number in the file and Rust failed on the right case;
I restored it and it passed. Otherwise this would be a test that reads a file and does nothing
with it.

**Rust arrives in CI too.** A separate leg, `cargo test --test parity`, with no Solana toolchain,
on plain stable. Instruction-level tests (LiteSVM) need the built program and come next.

**Cost.** The file has to be regenerated on every deliberate change to the money rules, or the TS
test fails. That is the mechanism: a change to the rules can no longer be made silently in one
language.

### One writer of transitions: `applyTransition` with a state check

**Decision.** A bet's state changes in exactly one place, `applyTransition` in `bets.repo.ts`. It
runs `update bets set … where id = $1 and state = $from`, and if the row did not match, it throws
`TransitionConflict`. An exception, not a `Result`: by that point child rows may already have
been written (a claim, a dispute, a participant), and they are only valid if the transition
happened. An `err` would have committed them, because `inContext` calmly reaches COMMIT. The throw
rolls the whole transaction back, and `asConflict` outside turns it into a plain `CONFLICT`
refusal.

**Why.** The same move was written by four functions: `recordAction`, `submitClaim`,
`openDispute` and `acceptBet`. Each did the same three things (check the right, write the state,
write the event), and none checked that the state was still the one it had read in `authorize`.
Two people pressing the permissionless timeout at the same time both passed the check, both
wrote, and the log got two rows for one transition. While the chain is a stub, that is a spare
audit row; with the chain connected it is two transactions.

**What this gives besides fixing the race.** The chain fields (signature, slot, send status) get
added in one place instead of four. The differential "domain versus program" test gets a single
entry point. And the rule "every move = check, transition, event" can no longer be broken by
accident in a new function: there is nowhere to write one from.

**Also.** The loser of the race for the opponent's seat used to get an exception from the unique
key `participants_one_row_per_role` rather than a refusal. Now `asConflict` translates that too
into the same `CONFLICT`: both cases say the same thing, "someone got there first".

**What this decision does not do.** The other cascades from the same review are untouched: a
table "state → deadline and default outcome" (which would also close the `refund_expired` hole
structurally), a participant as a row instead of four fields, and one context wrapper instead of
four. I do not plan to touch the RLS policies: `0004` deliberately separated the capabilities,
and one shared function would put them in a single bucket.

### The opponent is no longer named at creation

**Decision (yours).** The "Who are you betting? (optional)" field is removed from the wizard.
Whoever accepts the link is the opponent, under their own name: a text signature at acceptance or
the name from their profile.

**Why.** The name was not tied to anything: anyone with the link could accept the bet, while the
card gave the impression that only "Dan" could. We were naming a person before they showed up.
The analysis of analogies and the product survey are in the
[artifact](https://claude.ai/artifact/FWKV1XY5JsGM5YbLJCvtqr). No product relies on a name typed in
without binding; the closest to us are Telegram Wallet and Crypto Bot checks, where the link
delivers and the recipient claims.

**What changed in the code.**

- `opponentRef` is gone from `BetDraft`, the schemas, the draft storage, the submit form and
  `create-bet`; the bet is created with `opponent: null`.
- Terms hash: the `opponent` line stays and is always `null`. The `sporim.commitment.v1` format
  does not change, old hashes verify as before; a name from an old client is dropped by the schema.
- A draft saved by an older version still reads: the extra key is dropped.
- The check "the referee is not the named opponent" went away with the field. The real protection
  is at the account level: the holder of one link cannot take another role (`0004`, `0011`).
- On the referee screen the field is marked optional in "We both confirm" mode, with a note below
  it on what happens if no referee is named.

**What next.** The acceptor's name exists only if they signed with text or their profile has a
name, hence a nickname at first sign-in. Then "who you have bet with before" and addressed bets,
and a greeting like "Misha, want to bet?" in the message text on the send screen. The
`participants.handle` column stays.

### Server signature on accepting a bet: not doing it

**Decision (yours).** `accept_bet` on chain stays open: any wallet can accept a bet while it is
`Open`. We are not introducing the server attestor signature gate proposed by the 16 September
review: the simpler, the better.

**Why this is not a hole in the money.** The rule above removes the money motive for a bot. A bot
that takes someone else's bet puts up its own money. If it claims "I won", the creator presses
"disagree" and both take their stakes back; with a referee the bot loses its stake. What remains
is not theft but junk: a stranger can take the seat the creator was keeping for a friend.

**What remains open.**

- A creator who does not look at the bet for 48 hours loses the pot to a false claim, exactly
  as with a lying friend. That is closed by `.ics` and reminders, not by a signature.
- Until the program can do `dispute_claim`, the scenario with a bot on chain still works. That is
  why `dispute_claim` is the first thing the next program slice does.
- There is no money on devnet. Before mainnet, return to the question if seat grabbing becomes
  noticeable; the cheapest option then is a server signature, since the server already builds the
  transactions.

---

## 2026-09-12

### First escrow slice on Anchor: only the Bet format, live on devnet

**Decision.** `packages/program` is the `sporim` program, seven instructions:
`create_bet`/`accept_bet`/`cancel_bet`/`expire_unaccepted`/`submit_claim`/`confirm_claim`/
`settle_uncontested`. Only the **Bet** format: symmetric stakes, mutual confirmation,
permissionless timeouts. No referee, no dispute, and no `Commit`/beneficiary on chain yet.
Deployed to devnet (`EkfT8PTE7QShwtK6F7NEDgC2M3i4cGnLZhurULPVtDP2`) and run through with real
transactions: `create_bet` → `accept_bet` → `submit_claim` → `confirm_claim`. The result matched
`calculateSettlement` bit for bit: pot 20, fee 0.3 (3% of the net win of 10), winner 19.7,
treasury 0.3, vault empty.

**Why no `Config` account.** `docs/09` §2.5 designed a `Config` with `admin`/`treasury`/
`fee_bps`/`paused` from day one. Deferred: we have no reason yet to **change** the fee or the
treasury without upgrading the program, and `packages/domain/src/constants.ts` already treats
`FEE_BPS` as a literal, not a table row. The fee (300 bps) and the treasury address are hard-coded
as constants in `constants.rs`, the same way the domain avoided mutable configuration. `Config` is
the first thing the next slice adds, when there is a real reason.

**Why the vault is not a separate PDA.** `docs/09` kept `bet_pda` and `vault_pda` apart. Here the
vault is a plain ATA whose `authority` is the bet account itself: one PDA fewer, and the same
`invoke_signed` with the bet's seeds can sign the transfers. No reason to add a second PDA was
found.

**Why no Rust tests (LiteSVM).** `docs/09` T5.11 calls the three-way parity test (TS/Rust/mock)
"the most important test in the repository". It is not here: correctness was checked by hand with
real devnet transactions, comparing the numbers line by line, rather than by a test that stays
and rechecks it on every push. This is debt, not forgetfulness: the next slice either writes
LiteSVM tests for the seven instructions already built, or explicitly postpones it again.

**Tested on our own token, not devnet USDC.** The escrow mechanics (transfers, PDAs, ATAs) do not
depend on which SPL mint it is: `mint` is stored in the bet itself, not hard-coded in the
program. Running the real devnet USDC faucet just to check this would have been a separate task,
unrelated to whether the escrow works.

**The toolchain is in WSL2, not on bare Windows.** `docs/09` R6 predicted exactly this: Anchor
does not build on Windows. Rust, the Solana CLI and the Anchor CLI live in Ubuntu-24.04 under
WSL2. The Anchor CLI came as a precompiled binary from `github.com/otter-sec/anchor` (the Anchor
repository moved there from `coral-xyz`), so `cargo install`, and with it `sudo` for the system
build packages, was not needed at all. The Solana CLI also came as a ready binary, from
`release.anza.xyz`. Files are edited from the Windows side through UNC (`\\wsl.localhost\...`),
which is faster than building on `/mnt/c` (WSL2 is slow on mounted NTFS), while deploys and tests
run from WSL, where the toolchain lives.

**What this entry does not change.** `packages/chain` is only the `ChainAdapter` interface, with
no implementation. No server action of the product knows about this program: `create-bet.ts`
still writes only to the database, and every bet's `chain` stays `'mock'`. The program exists and
is verified, but `sporim.fun` does not see it. That is a separate task, not this one.

---

## 2026-09-05

### Accepting by link: the code itself became the key, no separate table

**Decision.** A bet's short code is a capability. Migration `0011` gives it three functions
modelled on `app_referee_token*` and four extending policies. No new invitations table appeared.

**Why no table.** The argument in `0004` was specific: a token sitting on a `bets` row can be
read by anyone who can read that row, including the opponent, who could buy themselves a referee.
That does not apply to the short code: it is **already** a column in `bets`, already read by every
participant, printed on the card and spoken aloud. There is no one to hide it from. `0003:14-18`
left both doors open in advance, "a policy keyed on the short code, **or** a narrow SECURITY
DEFINER join", and the first was taken.

**What we pay for 46 bits.** The third condition of `app_may_accept_bet`: the code opens a bet
**only while it is `open`**. A guessed code buys exactly the same as a leaked link, the chance to
take a side of a bet that nobody has taken yet, and `TRUST_COPY.linkWarning` warns the creator
about this in plain words. After acceptance the code stops being an entrance, and membership
carries the person. A separate test checks exactly this: `app_may_accept_bet` returns false on an
accepted bet.

**Two branches, not one.** `confirmReferee` only updates, because the referee row is written when
the bet is created. The opponent row exists only if the creator typed a name on the fourth screen,
so an INSERT is needed too. They cannot be combined through `on conflict do update`: that would
require both policies to pass at once, and for a non-participant neither of the old ones passes.

**The trigger grew a second arm.** `0006` raised an exception on any write of `confirmed_at` not
blessed by `app_may_claim_referee`, and would have rejected every acceptance. The comments in
`0005:48-49` and `0006:33-34` predicted the fix verbatim: "grows a second arm rather than losing
this one". The referee condition is untouched: each seat is opened by its own capability, and
neither opens the other's.

**The transaction context is built in one function.** The property that makes the connection
pool safe, that _every_ variable is written on _every_ entry, including the cleared ones, rested
on four wrappers agreeing with each other. The third capability finished that off: a wrapper that
forgot the new variable would not have failed, it would have silently inherited whatever the
previous request left behind. Now the set is named once and written in full, so a fourth
capability cannot be applied halfway.

---

### Tests again held the shape instead of the fact, twice in one day

**What happened.** Two raw-SQL probes failed, and both because I recorded the **mechanism** of a
refusal, not the refusal itself. An INSERT is rejected through WITH CHECK and throws; an UPDATE is
filtered out through USING, writes zero rows and throws nothing. Both refusals are correct. An
assertion on a throw would call the quiet one a failure, and one on zero rows would call the loud
one a failure.

**How it was fixed.** The probes check the outcome: the seat did not change owner, read by the
owner's connection, which no policy can dress up.

**Why this deserves an entry.** This is the third case in a day of the same shape. The first was
Saturday: a test clicked a chip by the name of the weekday. The second was copy: a test checked
for the substrings "took the role" and "refunds you both", and both were present inside two
sentences that became false after the rules reversal on 4 September. `TRUST_COPY.timeline`
promised that the referee's silence leaves the claim standing, `refereeUnconfirmed` that
disputing costs the bond; both were shown on the live site while the test was green.

Now copy is checked by meaning: the words deposit and bond are banned across all copy, and the
referee and "the claim stands" cannot appear in one sentence. It is a rule on sentences, not on a
string, because "say nothing and the claim stands" about the 48-hour window remains true. Checked
that the old wording is caught by this rule.

---

### Wallet first, Phantom right away

**Decision (yours).** Sign-in through Phantom becomes the main path, email the fallback. This
reverses the 3 September entry "email by default, wallet when there really is one".

**Why.** The question "how does a person get $25 in USDC" stood first in `RESEARCH-BRIEF-2` and
was named the main risk. The answer that removes it entirely: **the person already has Phantom,
and it already has USDC.** Then no on-ramp is needed at all: connect, sign, done. Seconds instead
of five minutes, zero KYC, zero provider fee on an amount where that fee could be half the stake.

**What we pay.** The audience narrows to people who already have a wallet. This is a deliberate
trade: a working product for a crypto audience beats a broken one for everyone. The on-ramp stays
in the brief as a fallback for the day we need the rest.

**What is not reversed.** The 3 September argument was not about convenience but about mechanics:
the Instagram webview does not inject a wallet, there are no extensions there. That is still true.
The difference is that we now work around it instead of yielding to it: Phantom has a Browse
deeplink that opens our site **inside the Phantom browser**, where the wallet is available.
Confirmed by their docs in the research archive (`docs.phantom.com/phantom-deeplinks`,
`status: 200`):

> "users can open web apps within Phantom's in-app browser via the Browse deeplink"

The exact format of the Browse link itself did not make it into the archive. Check it in the live
docs and always on a phone, not against the documentation: the return behaviour from the webview
is not described by the documentation.

**Done the same day.** Privy can put a specific wallet as the first button: `'phantom'` is a
separate `WalletListEntry` value, not just `wallet_connect`. Checked against the types of the
installed SDK (`@privy-io/react-auth@3.40`), not against the documentation:

```ts
loginMethods: ['wallet', 'email'],
appearance: {
  showWalletLoginFirst: true,
  walletList: ['phantom', 'detected_solana_wallets', 'solflare', 'backpack'],
},
```

Both fields are needed. `showWalletLoginFirst` lifts the wallets **section** but does not touch
the order of buttons inside it, and Privy's default is Ethereum-flavoured:
`['detected_wallets', 'metamask', 'coinbase_wallet', 'rainbow', 'wallet_connect']`.
`detected_solana_wallets` is second on purpose: it is a trap for whichever extension the person
actually has installed, so that a Solflare or Backpack owner does not feel the product was built
for someone else's wallet.

`loginMethodsAndOrder.primary` would put `'phantom'` even more literally, above all the social
logins. We do not use it: the SDK marks it `@deprecated` and warns that it overrides their
defaults. Two supported fields are better than one deprecated one.

**Open.** Phantom turned out to have its own SDK with Google and Apple sign-in and a built-in
wallet, exactly what Privy was chosen for. Before migrating, we need to understand how it proves
identity to the server: with Privy it is a JWT over JWKS and `sub` → `app.user_id` for RLS. If
Phantom has only a message signature, that is a different session model, not a provider swap.
Details and the order of work are in `docs/NEXT-SESSION.md`.

---

## 2026-09-04

### External research arrived, and some conclusions had to be accepted against ourselves

**What.** A run against `docs/RESEARCH-BRIEF.md`: 9 sections, 100 facts with citations, 361
archived pages. It lives outside the repository, in `deepresearch/out/moneydeal`.

**Checked before believing.** StickK is marked as a negative result: `sources/` holds 14
stickk.com files, and all are `status: 403`. The Gambling Act s.13 quote was checked against the
`legislation.gov.uk` archive, `status: 200`, and matches word for word. The research archives its
failures instead of filling them with invention, so we can rely on it from here.

---

### USDC can be frozen, and two signatures out of four are enough

**Decision.** The program binds to the canonical mint and to the **classic** SPL Token Program by
id; an arbitrary mint is not accepted.

**Why: verified on mainnet, not read somewhere.** The research honestly wrote that it could not
decode the mint and left that as a release check. Two `getAccountInfo` calls:

```
EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
  freezeAuthority: 7dGbd2QZcCKcTndnHcTL8q7SMVXAkp688NTQYwrRCrar   ← not null
  owner:           TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA    ← classic SPL
  decimals:        6

7dGbd2QZcCKcTndnHcTL8q7SMVXAkp688NTQYwrRCrar
  type: multisig · numRequiredSigners: 2 · numValidSigners: 4
```

**What this means.** A freeze applies to the **token account**, not to the wallet: a frozen escrow
can be neither emptied nor topped up, and neither the program, nor the owner, nor a delegate
overrides it. We cannot promise that funds cannot be seized, and we will not.

Also settled: USDC is not Token-2022, so transfer fees and transfer hooks do not break
settlement; and `decimals: 6` matches `USDC_DECIMALS`.

---

### The legal frame is decided not to be a blocker

**Decision (yours, 4 September).** We build both formats and handle legal questions as they
arrive. Bet is not parked.

**What is known meanwhile**, so that in six months this does not look like an oversight. Under
the Gambling Act 2005 s.13 a "betting intermediary" is someone who makes arrangements for the
conclusion of bets _between others_, and the private exemption (s.296) does not cover one who does
this in the course of a business; s.36 ties applicability to the equipment and the users, not to
the place of registration. There is no threshold for 3%; the problem is qualitative: a percentage
of the stakes is an argument for "carries on a business of betting". Google Play explicitly bans
apps that accept bets or escrow for a cash prize, so the mobile path is closed in advance and the
web is not. The documented form that has worked for years (Forfeit, Beeminder) is a commitment to
yourself with no pool and no winner, which is our Commit.

---

### The dispute bond is gone

**Decision.** `Dispute.bond`, `calculateDisputeBond`, `DISPUTE_BOND_BPS` and the
`disputes.bond_amount` column are removed (migration `0009`). Disagreeing is now free.

**Why.** The bond solves one problem: keeping the loser from objecting to everything for free. In
an anonymous market it is the only lever, which is why UMA and Reality.eth have it. With us both
sides and the referee know each other, the objection is signed with a name, and being the friend
who disputes an obviously lost bet costs something that a bond does not price. We were charging
money for a deterrent we already had, and turning disagreement into filing a lawsuit.

**What changed beyond the code.** `calculateSettlement` no longer knows about disputes at all:
`SettlementInput.dispute` and `Settlement.bond` are gone. The numbers depend only on the stakes,
the fee and who won. Whether anyone objected along the way changes no figure on any screen.

---

### The referee's silence after a dispute returns the money, always

**Decision.** `settleUnrefereed` is removed from the domain and from the `bet_action` type
(migration `0010`). Whether or not the referee is confirmed, if they did not answer by the
deadline, the dispute goes to `refundExpired`. This reverses the 3 September entry, where the
silence of a **confirmed** referee left the claim standing.

**Why.** `§03` of the research: silence is taken as consent only **while no one has objected**.
That is how UMA and Polymarket do it, and there is no other precedent. After an objection the
disagreement is known as a fact, and resolving it by whether a third person opened a link means
deciding by attendance, not on the merits: the right side loses the pot because of someone
else's silence.

And the second half: the old rule earned its keep by making the loser's objection useless. That
made sense while the alternative was a refund. With no bond, the deterrent became social, and it
is the same in both branches. There is nothing left to protect.

**What we pay, in plain words.** The loser can object for free and, if the referee later
disappears, take their stake back. The bet is that among friends doing so is embarrassing. If the
funnel says otherwise, we come back, and then with numbers rather than hypotheses.

**What the referee's confirmation means now.** Only the right to **issue a ruling**: an
unconfirmed name cannot judge. That is enough for the card to tell the other side honestly
whether there is a referee at all, before they put money in. That is what 0004 was written for;
it no longer distinguishes silence.

---

### What from the research is still not done

- **The referee token is stored in plain text** (`referee_invites.token`). The `§04`
  recommendation is to store `sha256` and look up by digest. The entropy is more than enough
  (187 bits against the recommended 128); we are defending not against guessing but against a
  database dump and a replica.
- **`GET` must not spend anything.** Telegram, WhatsApp and Slack hit the link for a preview
  before the person does, and detecting them by `User-Agent` is not possible, since it is not a
  security boundary. Accepting by link: `GET` shows, `POST` spends.
- **We write the escrow ourselves.** There is nothing to fork: `ironaddicteddog/anchor-escrow`
  covers ~40% and can be canceled only by the initiator, and Squads v4 is not an escrow. Anchor,
  not Pinocchio. None of the candidates has an audit.
- **A refund on timeout is a separate permissionless instruction**, because a deadline by itself
  triggers nothing: someone has to submit the transaction, and they need SOL.
- **Fonts:** `fonttools varLib.instancer "$IN" "wght=$W" --static`, then check that the result has
  no `fvar` table. A valid TTF is not yet proof: satori parses with its own `opentype.js`, so a
  render test on our version is needed.
- **Privy:** $0 up to 499 MAU, $299 for 500–2499, $499 for 2500–9999; 50k signatures and $1M of
  monthly volume included.

---

### The sign-in provider lives on `/new/*`, not in the root layout

**Decision.** `AuthProvider` is mounted in `apps/web/src/app/new/layout.tsx`, outside
`DraftProvider`. The landing page and `/r/[token]` do not load it.

**Why.** Traffic comes from a reel, on a phone, over mobile data, and the first screen is a
landing page that has nothing to authenticate. Loading a wallet SDK for it means charging for
something the person does not need. Outside `DraftProvider`, not inside, for a different reason:
the draft must survive a trip to the mailbox, and sign-in must not be able to unmount what the
person is writing.

**What changed.** Before this the provider was not mounted **anywhere**: the file existed, and
`/new/review` crashed on prerender with `useAuth must be used inside <AuthProvider>`.

---

### The session stub for e2e, and why it can stay in the bundle

**Decision.** `NEXT_PUBLIC_AUTH_MODE=stub` replaces the provider with a "ready and signed in"
state. The flag is **rejected unless `appEnv` is `local`**: on preview and in production the
variable does nothing. That guarantee is covered by a separate test, `it.each(['preview',
'production'])`.

**Why this and not "just don't build it into prod".** Two independent layers, and the second is
more important than the first. Even if the flag were turned on, it grants nothing: it is the
client's belief and nothing more. There is no token under it, and `create-bet` trusts only a JWT
verified over JWKS, so a request from under the stub is rejected exactly like an anonymous one.
The first layer (`appEnv`) is there in case someone breaks the second.

**Why it was needed at all.** e2e must run the same for me and on CI, which has no `.env.local`
and no Privy app. Without the stub CI got `configured: false`, the "I'm committed" button was
disabled, and a dozen tests failed for a reason unrelated to the product.

---

### e2e reach the wallet through an explicit `?mock=ok`

**Decision.** `?mock=ok` was added next to `?mockFail=CODE`. Both mean the same thing: talk to
the fake wallet, not to the server. The two tests that go through the "lock" button now write
this in the URL.

**Why.** A real lock needs a real session, which a headless browser cannot get. Before, the
happy-path test clicked the button and **looked** as if it had checked the server path. Now it
says it checks the screen, not the server. The temptation was to do the opposite and give the stub
a server half as well; that would have turned a green test into a lie about what is covered.

**What stays uncovered and how it is closed.** The live path "signed in → created → row in the
database" is checked by hand on `sporim.fun`, and it is recorded in `STATUS.md` as a remainder.

---

### Research that did not exist: the engineering layer

**Decision.** `docs/RESEARCH-BRIEF.md` is 9 blocks of questions for the outside, prioritised
"escrow → USDC → legal".

**Why.** `development-workflow.md` puts "find who already wrote it" first (`gh search repos`/
`code`, package registries, a fork instead of our own code). The product research is done:
`docs/01`…`docs/11`. The engineering research was never done, and that has already cost us: an
hour and a half on a monorepo in Vercel instead of reading their docs, and one confident claim
about Xata that turned out to be wrong.

**Where this rule does not work.** Three money defects (the dispute bond as a free option, the
referee's silence, a self-confirmed referee through INSERT) were found by reasoning and by poking
the live database. Someone else's code would not have shown them: another product has another
economy. That is why the brief asks for **facts and precedents** (who pays for the ATA, what
people do when an arbiter is silent, how optimistic oracles get broken), not "how it should be
done".

---

## 2026-09-03

### A referee is confirmed or not, and for them silence means different things

**Decision.** The referee gained a state: they either opened their link and took the role, or
they are just a name the creator typed on the fourth screen. The silence of a **confirmed**
referee leaves the claim standing (`settleUnrefereed`, as before). The silence of an
**unconfirmed** one returns the money to both (`refundExpired`).

**Why.** The previous decision ("the referee's silence leaves the claim standing") rested on the
referee being visible on the card before the second side puts money in. But nobody had the
referee's consent there: the person learned of the role only from a dispute, weeks later, by a
cold link. To hand the outcome to the silence of someone nobody asked is to punish the disputer
for the creator's unilateral choice. A bet with an unconfirmed referee is more honestly called a
bet on someone's word.

**Not a free option in either branch.** The bond goes to the other side on a refund too
(`bondRouting`), so "dispute and wait" costs money. And the check uses the referee's state **at
the deadline**, not at the moment the dispute opened: a real friend who got the link still has
time to come and rule; there is a test for that.

**What changed.** `Referee extends Party` with `confirmedAtSeconds` and `isRefereeConfirmed()`;
branching in `disputedActions`; `createBet` forcibly zeroes the confirmation, since consent is
given by the referee, not by whoever named them. The "Who decides" line on the card now always
says whether the person accepted the role; the review screen warns about it before signing.

### Two links, two secrets, two tables

**Decision.** Accepting a bet and the referee role are different capabilities and different
secrets. `bets.short_code` (8 base58) stays the "accept the bet" link, `/r/<token>` (32 base58)
the "judge it" link. The lengths are mutually exclusive, so `isShortCode` and `isRefereeToken` do
not overlap, and a token pasted into the wrong route is turned away by the guard before SQL.

**Why not one token.** Whoever opened the link first would pick their own role, and pick the one
that suits them.

**Why a separate `referee_invites` table, not a column in `bets`.** RLS is per row: a policy that
lets the opponent read their own bet lets them read **all of its columns**. A token on the bet
row would be visible to exactly the person who must not see it; they would pass it to an
accomplice and buy themselves a referee. A separate table has its own policy, and it names only
the creator.

**How someone who is not yet a participant is authorised.** Through `set_config('app.referee_token',
…, true)`, the same way as the DID: the secret goes into the transaction as a parameter and the
policies compare it themselves. The client reports nothing about its role. This is the answer to
the question left open in `0003`; accepting a bet is closed by the same form.

**Both transitions are forbidden twice.** A side cannot become the referee (`app_may_claim_referee`
plus a check in the repository), and the referee cannot take a side (`openActions` does not offer
`accept` to the `referee` role). Confirmation is irreversible: a trigger allows neither removing
it nor transferring it.

### A hole found by the test for our own migration

**Found.** A test expected a raw `UPDATE` by the creator on the referee's row to be rejected, and
saw that it goes through. `participants_update_on_my_bets` from `0002` lets a participant write any
row of their bet: the right rule for the whole row and the wrong one for a single column.
`confirmed_at` is a record of **another person's** consent.

**Why not by policy or by grant.** A policy is per row, and the row legitimately belongs to this
caller. A column grant is issued to a role, not to a policy: revoking `update (confirmed_at)` would
close the one path that must work too.

**Fixed** with the trigger `participants_confirmation_guard` (`0005`): the confirmation can only be
set by a transaction that carries an invitation. It also holds the irreversibility: both rules are
about one column, and the fact that they were read separately was the reason the gap was found.

### The database layer is built, and how it differs from the plan

**What exists.** Migrations as plain `.sql` with an idempotent runner
(`pnpm --filter @sporim/web migrate`, registry `_sporim_migrations` with sha256 and an advisory
lock). Tables `users` · `bets` · `participants` · `claims` · `disputes` · `bet_events` ·
`waitlist`. The domain enums are duplicated as Postgres enums, and a test compares `enum_range`
with the `as const` arrays, so a mismatch fails instead of smouldering.

**Money.** `bigint` in base units, the driver set to `postgres.BigInt`, and the row's zod schema
accepts a bigint or a digit string and **rejects `number`**. Loss of precision is a parse error,
not a quiet underpayment. Checked by hand: 100 USDC and a value beyond `Number.MAX_SAFE_INTEGER`
round-trip without distortion.

**RLS.** Enabled and `FORCE`d on all seven tables, 18 policies, `DELETE` granted to no one.
Without a user context, zero rows. Verified separately from the agent's tests.

**Three places where the domain and a sensible schema diverged:**

1. `Bet` has no signature, but a participant must. Signatures are passed as a separate argument
   and dropped on the way back; `Bet.signature` was not invented.
2. `users` is readable only about oneself, so the opponent's name cannot be reached through a
   join. `participants` carries `display_name` and `wallet_address` itself.
3. **`accept` is not expressible yet.** The acceptor is by definition not yet a participant, so
   both the gate and the policies reject them. That is right: their authority is possession of the
   link, and the model has no such capability yet. A separate function and policy are needed along
   with the acceptance flow.

**A hole the agent found in its own migration `0002`, closed in `0003`:** an insert into
`participants` let anyone who knows a bet's id take a vacant role and grant themselves read
access. Narrowed to "the creator adds themselves to their own bet".

---

### CI was building nothing

**Found.** The root `build` script used the filters `--filter './packages/**' --filter
'./apps/**'`, which matched no project. `pnpm` printed "No projects matched the filters" and
exited with code 0, so the "Build" step in CI had been decorative since it first appeared. The
production build could be broken for as long as it liked and the branch stayed green.

**Fixed** to `pnpm -r build`: `-r` already means "in every workspace package that has such a
script". Verified, it now really builds `apps/web`.

**Side note:** locally `pnpm build` conflicts with a running `pnpm dev` over `.next` (EPERM on
Windows). For e2e this is already solved through `NEXT_DIST_DIR=.next-e2e`; for a manual build it
is enough to stop the dev server.

---

### Xata instead of Supabase, and RLS exists after all

**Decision.** The database is Xata (plain Postgres over `DATABASE_URL`), not Supabase. We
**enable** row-level security, through a separate role without `BYPASSRLS`.

**What Xata is today.** Checked against the docs on 2026-09-03: it is a Postgres platform with
copy-on-write branches, production clones with PII stripped, schema migrations, and PGStream. It
has no app authentication, no browser SDK and no auto-API; `lite.xata.io` (the old product with its
own data API) redirects to the new docs. Their OAuth is access to the Xata account, not to the
app's data.

**What we lose compared to Supabase, and what we do not.** We lose only the automatic wiring of
"JWT → DB session": `auth.jwt()` does not exist, and there is nothing to feed a token to a policy.
RLS itself is a Postgres feature, not a Supabase one, and it is fully available to us. We supply
the user context ourselves, about twenty lines.

**How it works and why exactly so.** The connection role `xata` has `BYPASSRLS`, so policies simply
do not see it. I checked: the first probe "worked" and in fact showed other people's rows. So:

1. A separate role `sporim_app`, `NOLOGIN NOBYPASSRLS`, granted to the role `xata`.
2. On the tables, `ENABLE` **and** `FORCE ROW LEVEL SECURITY`; without `FORCE` the table owner
   bypasses the policies.
3. Every transaction begins with `SET LOCAL ROLE sporim_app` and
   `set_config('app.user_id', <privy did>, true)`.
4. The policies read `current_setting('app.user_id', true)`.

**Verified end to end on a live database:** with the context, one row of one's own is visible;
without it, zero rows. `current_setting(..., true)` returns NULL when the variable is absent, the
condition gives NULL, and the policy does not let the row through. **A forgotten `SET LOCAL` does
not open the data, it closes it**: fail closed, not a leak.

**Security summary.** Authorisation lives in the repositories against the Privy session, and RLS
remains the second line: a hole in server code does not automatically become a leak of other
people's bets. Plus an ESLint rule forbidding the connection module from being pulled into client
components.

To formalise the role and policies in migration `0001` (the role is currently created by hand
during the check).

Reverses: T0.15 and part of T2.1/T2.5 in `docs/09` in their current form.

---

### Sign-in: email by default, wallet when there really is one

**Decision.** Both methods are enabled. What to show first depends on the environment, and is not
chosen once and for all. The built-in wallet is created only for those who arrived without one
(`create_on_login: "users-without-wallets"`).

**Why not wallet first, even though it is faster.** Traffic comes from a reel, so the first open
happens in the **Instagram in-app browser**: there are no extensions there, and a deeplink into
the Phantom app and back loses the tab and the place in the flow. Email always works in this
environment. Plus a person needs at least two on-chain actions: with a built-in wallet they are
signed on the page, with an external one each means switching to the app and back.

**Why a wallet is still needed.** For someone who already has Phantom installed, an email code is
an extra round. And they, unlike a fresh built-in wallet, **already have USDC**, which on mainnet
decides it.

| Environment               | First                | Why                        |
| ------------------------- | -------------------- | -------------------------- |
| Instagram in-app browser  | email                | no wallet, deeplink breaks |
| Mobile browser            | email, wallet nearby | the same deeplink          |
| Desktop with an extension | wallet               | one click versus an email  |

**No effect on architecture.** Privy issues its own DID for any sign-in method, and that DID is
what goes into `app.user_id` for RLS. The decision is reversible and changes on data, not on a
guess.

**Done 2026-09-03:** `solana_wallet_auth` is enabled, sign-in through Phantom works.
`show_wallet_login_first` is left `false`: email first, for the reasons above.

**About the Privy API, for the future.** App settings are changed by **`POST`** to
`/api/v1/apps/<id>`; `PATCH` returns 405 there, and `/settings` and `/config` return 404. I did not
find it in the documentation; determined by trial. After writing, always read the config back: the
response code does not prove that the field you sent is the one that changed.

---

### Referee fee: 1% out of our 3%

**Decision.** A referee who **actually issued a ruling** gets 1% of the net win. The user's fee
never changes: no dispute means 3% to us; a referee ruled means 2% to us, 1% to them. On a draw
and on a kept Commit the referee gets zero.

**Why.** The referee had no reason to open the link at all. The creator chooses them on screen 4,
before the second side agrees, and they learn of their role only if a dispute happened, that is,
weeks later. We were asking for free work from a person who had not signed up for it.

We pay only for an issued ruling: a referee named in a bet where no dispute occurred did no work.
Otherwise we would be taxing every bet for a service almost nobody uses.

Out of the fee, not on top of it; otherwise "3% and nothing else" stops being true.

**Side effect.** A paid referee is an incentive for collusion, "referee plus one side, split
fifty-fifty". At 1% of the net win that is $0.20 on a $20 bet, and no one will conspire for that.
On larger amounts, recompute.

**Code.** `REFEREE_FEE_SHARE_BPS` in `constants.ts`; `Settlement.toReferee` and
`SettlementInput.ruledByReferee` in `money/settlement.ts`. The invariant `toTreasury + toReferee ===
fee` is covered by a test.

---

### The referee's silence leaves the claim standing

**Decision.** A dispute that the referee has not ruled on within 7 days ends **in favour of the
claimant**, not with a refund to both. The disputer loses the bond.

**Why.** A refund made a dispute a free option: the losing side presses "disagree", waits for the
friend-referee to drop the ball, and takes their stake back. The temptation is greatest exactly
when referees are unreliable. Now silence means one thing everywhere in the product: the objection
is not upheld.

**The reverse risk.** The creator names a referee who surely will not come and makes a false claim
of victory. It rests on two things: the referee is visible on the card **before** the second side
puts money in (accepted means agreed to the referee), and on the previous decision: the referee is
now paid, so they have a reason to come.

**Code.** A separate action `settleUnrefereed` (permissionless) instead of `refundExpired` in
`state/machine.ts`. The outcome is the same, `resolved`, but the audit shows what exactly
happened: nobody objected, or they objected and the referee did not come. For the on-chain program
these will be different instructions.

---

### The dispute bond is not returned without a ruling

**Decision.** The bond is returned to the disputer only if the referee **issued a ruling** and it
is not against them (a win for their side, or a draw). Without a ruling it goes to the other side.

**Why.** `bondRouting` treated `winner === null` as "the dispute was justified" and returned the
bond. But `winner === null` covered two different cases: a draw declared by the referee and a
refund without a ruling. In the second the bond must not be returned, or a dispute costs nothing.

Found by a subagent while reviewing the evidence system, verified against the code by hand.

**Caveat.** A disputer with a genuine complaint and a vanished referee loses $1–25. There is no
symmetric alternative: returning the bond makes the dispute free.

**Code.** `bondRouting` takes `outcome`, not just `winner`, in `money/settlement.ts`.

---

### Dare removed from the UI

**Decision.** There are two formats: **Bet** and **Commit**. Dare is parked.

**Why.** Three formats turned the first screen into a task, and Dare was the one people could not
place in their heads.

**What matters.** The escrow mechanics of Commit and Dare are the same: `calculateSettlement` did
not distinguish them at all. They differed in one point, `successClaimantSide`: in Commit the author
claims success, in Dare the target does. Restoring it: a row in `BET_FORMATS`, an entry in
`FORMAT_COPY` and one branch each in `successClaimantSide`, `contract-sentence`, `MoneyFlow`. The
money does not need touching.

---

### "They risk nothing" removed as a false statement

**Decision.** The copy describes **what each side puts in**, not their full exposure to risk.

**Why.** A side with no stake can still lose money: the dispute bond goes to the opposite side if
the referee did not agree with the disputer. "Risks nothing" is not a slip but a wrong statement
about the product.

**Code.** A regression test in `text/copy.test.ts` walks through every copy line and fails on
`/risks? nothing/i` and `/nothing (at stake|to lose)/i`. `TRUST_COPY.disputeBond` was added and
shown on the referee screen.

---

### A signature instead of press-and-hold

**Decision.** The bet is signed with a finger. Hold-to-lock is removed from the creation screen.

**Why.** Both are deliberate friction, but only one leaves an artifact. The scribble goes onto the
card and into the OG image, and that is the entire growth loop. `HoldButton` was not thrown away:
it is the right control for irreversible actions in M2/M3: claim a win, open a dispute, refund.

**How it is stored.** As stroke points, not as an image: satori draws `<path>` but cannot embed a
canvas blob; a couple of hundred integers against tens of kilobytes of PNG; it does not blur
anywhere. `signatureCanonicalString()` gives a stable form so that in M3 the signature can be
sewn into `termsHash`.

**Limits.** It is not an electronic signature and has no legal force: a test fails on `legally
binding` and `e-signature`. Typing a name on the keyboard is an equal path, or the gate cuts off
everyone who cannot use a pointer.

---

### Pool against pool, not one against a pool (phase 2)

**Decision.** The group mode is **team against team**. A clarification: earlier the spec said
"group pools", which read as "one person throws down a challenge, N others chip in against them".

**What survives the transition.** `stakeCreator`/`stakeOpponent` are already amounts of a **side**,
not of a person, and `calculateSettlement` counts by the outcomes of sides. The fee and the state
machine do not change. What has to change is `Bet.creator`/`Bet.opponent`: now one `Party` each,
they will become lists with shares.

**Open; the domain is not touched until answered.** Equal stakes within a team or free ones; how
the pool closes; who confirms the result for a team.

---

### Fonts: self-hosted, not `next/font`

**Decision.** `tools/fetch-fonts.py` downloads Unbounded and IBM Plex Mono into `public/fonts`.

**Why.** `tokens.ts` holds **literal** family names. `next/font` renames them to hashed ones
(`__Unbounded_a1b2c3`), and every inline style in `@sporim/ui` would quietly fall back. The
literal names are needed for satori too.

---

## 2026-09-02

| Decision                                                                     | Why                                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Pivot:** not an alarm clock, but any disputes between friends              | An alarm clock is one template, not a product                      |
| **Solana**                                                                   | More pleasant to work with; other chains later                     |
| **Commitments first**, external events through oracles later                 | A participant controls the outcome, so it is not a bet on an event |
| **Resolution:** mutual confirmation + a friend as referee; AI referee in 1.1 | Cheapest, and matches how people argue                             |
| **Web-first Next.js**, not native and not a mini-app                         | A link opens everywhere, nothing to install                        |
| **1v1 in the MVP**, group next                                               | Smaller surface                                                    |
| **Fee 3% of the net win**, never of a refund                                 | A kept Commit costs $0, or the product punishes success            |
| **Design: option B "Acid Arena"**                                            | Out of three directions on the canvas                              |
| **Inline styles in `@sporim/ui`** instead of CSS classes                     | The same components are rendered by satori for the OG image        |
