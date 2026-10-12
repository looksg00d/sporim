# 05 · Product spec (v1, after the 2026-09-02 pivot)

> **Pivot:** not an alarm clock/habits, but **disputes between friends with money in escrow on Solana**.
> The alarm clock and habits are one dispute template. Decisions made: Solana · commitments first ·
> mutual confirmation + a friend as referee · web-first · 1v1 in the MVP. History before the pivot is in `01`–`04`, `06`, `07`.

## One-liner

**You argue in the chat → both lock USDC in escrow → the winner claims the pot. No more "you owe me".**

## Why this works (and why the niche is empty)

| Player                             | Money?                  | About anything?                    | Outcome                                                            |
| ---------------------------------- | ----------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| WagerLab, Betcha                   | ❌ (units / scoreboard) | ✅                                 | legal everywhere, but the "owed" stays a verbal promise            |
| BettorEdge, BetOpenly              | ✅                      | ❌ sports only                     | state-by-state licenses, no "dispute with a friend about anything" |
| MNEEBet, Settld, Stakely, bet2fun… | ✅ (crypto)             | ✅                                 | all on devnet/hackathons, nobody has a chat-first product          |
| **Us**                             | ✅ USDC escrow          | ✅ (commitments → then everything) | a link in the chat + Solana + 10 seconds to accept                 |

Comments on the reel (`06`): "make it so your friends can bet against you, winner gets the money" (8.4k likes); "already doing it on group chat"; "who gets the money?" (11.8k). That is the brief.

## MVP flow

**Creator (5 screens, the reel format is preserved):**

1. **What's the bet?** Text ("You won't run 10 km by Sunday" / "I'll get up at 7 all week"). Later, by voice (Betcha pattern).
2. **Stake**: 5 / 10 / 25 / custom USDC. Caption: "Both of you put this in escrow. Winner takes 2×."
3. **Deadline**: date/time.
4. **Who decides?** "Both of us confirm" (default) or "Referee: @friend" (a third person, who must accept the role).
5. **Sign → Locked in**: a Solana tx, a link with a preview card → "Share to chat".

**Opponent:** opens the link → sees the terms/stake/referee → signs in (email / Apple / Google via Privy → wallet created) → tops up USDC → **Accept** → escrow holds 2× the stake. All in the browser, no install.

**Resolution after the deadline:**

- Both pick the same winner → payout **in the same transaction** (MNEEBet pattern).
- They disagree or one is silent for 48 h → the referee decides (creator / opponent / draw).
- No referee, or the referee is silent for 7 days → **refund to both** (fail-closed, ParkTheBus pattern). Money never gets stuck and never goes to the platform.
- Fee **3%** of the pot at payout (the community named "10% to the dev" as an acceptable maximum; BetOpenly takes 1%).

## Dispute templates (MVP → later)

| Phase | Type                             | Who decides                                                    | Example                                                                        |
| ----- | -------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| MVP   | **Commitment** (I/you will do X) | mutual / referee                                               | "I'll hand in my thesis by June 1", "You won't smoke a single one for a month" |
| 1.1   | Commitment + **proof**           | AI referee on photo/screenshot/link, disputed → friend referee | "I'll run 10 km" + a Strava screenshot                                         |
| 2     | **Pool vs pool** (team vs team)  | captain/majority, referee on dispute                           | 5 on 5 "our team will out-step yours this week"                                |
| 3     | **External events**              | oracle                                                         | sports (TxODDS), prices (Pyth), then everything else                           |

### Phase 2, clarification of 2026-09-03: this is **pool against pool**, not one against a pool

Earlier the spec said "group pools", and it read as _one person issues a challenge, N people chip in
against them_. What was meant is different: **two teams chip in against each other**. The difference
is fundamental: in the second case each side has a shared interest and a shared result, not a crowd
against a lone person.

What survives the transition unchanged: `stakeCreator` / `stakeOpponent` are already **side totals**,
not per-person, and `calculateSettlement` computes from the side totals. The fee (3% of the net win)
and the state machine do not change.

What will have to change: `Bet.creator` / `Bet.opponent` currently hold one `Party` per side and will become
lists of participants with shares, plus a payout split proportional to contribution.

Three questions are open, and we don't touch the domain until they are answered:

1. Are stakes inside a team equal or free? Equal is simpler everywhere; free requires
   a proportional split and breeds "why did he put in $5 and I put in $50".
2. How does the pool close: a fixed size (5 on 5, wait until it fills) or open until the acceptance
   deadline? And what to do if the sides end up unequal in money.
3. Who confirms the result for a team: the captain, the majority, or everyone? What counts as disagreement.

1v1 remains the foundation: pool-vs-pool is a layer on top of it, not a replacement.

### Resolution: two clarifications of 2026-09-03

**1. A silent referee leaves the claim standing, rather than refunding.** Earlier, a dispute with
no referee decision led to a refund for both, and that made disputing a free option: the loser
hits "disagree", waits a week for the friend-referee to say nothing, and takes their stake back. Now silence
at any level means the same thing: the objection is not upheld. The claim goes through, and the disputer
loses their deposit. In the state machine this is a separate action, `settleUnrefereed` (permissionless),
not `refundExpired`, so the audit shows exactly what happened.

The reverse risk: the creator names a referee who surely won't show up and claims a false win.
This is held in check by two things: the referee is visible on the card **before** the second person locks money
(accepting = agreeing to the referee), and by point 2.

**2. The referee gets 1% of the net win, out of our fee, not on top of it.** No dispute
happened: all 3% is ours. The referee actually ruled: **2% to us, 1% to them**. The price to the user never
changes. It is paid only for a ruling made: a referee named on a bet that never went to dispute
did no work. This is the only reason they have any incentive to open the link at all.
On a draw and on a kept Commit the referee gets nothing, since the share comes from the win
and there is no win there.

## Bet formats: Bet / Commit (Dare parked 2026-09-03)

> **Dare was removed from the UI on 2026-09-03.** Three formats turned the first screen into a chore, and Dare
> was the one people couldn't fit in their heads. The escrow mechanics of Commit and Dare are
> identical (`calculateSettlement` does not tell them apart at all); they differed in one point,
> `successClaimantSide`: in Commit the author claims success, in Dare the target does. Bringing it back is a small,
> known change: a row in `BET_FORMATS`, an entry in `FORMAT_COPY` and one branch each in
> `successClaimantSide`, `contract-sentence` and `MoneyFlow`. The money code won't need to be touched.

One on-chain primitive: **two sides, two stakes (either can be 0), an outcome, a payout of `stake_a + stake_b` to the winner**. Three UI templates on top of it:

| Format     | Who stakes          | Did it                    | Failed                         | Example                                           | Legal profile                                |
| ---------- | ------------------- | ------------------------- | ------------------------------ | ------------------------------------------------- | -------------------------------------------- |
| **Bet**    | both                | winner claims 2×          | —                              | "You won't run 10 km" $20 vs $20                  | mutual bet (the riskiest)                    |
| **Commit** | only the author     | stake is refunded         | → friend / charity / own vault | "I'll hand in my thesis by June 1 or you get $50" | commitment device (Forfeit/stickK)           |
| **Dare**   | only the challenger | the target gets the stake | the challenger keeps it        | "$20 says you can't eat this in a minute"         | conditional reward; the target risks nothing |

Why: Commit and Dare need USDC from **only one** person (removes the on-ramp risk), are legally softer than Bet, Commit works without a friend (cold start), and Dare is the most viral format for a chat.

**Conflict of interest in one-sided formats.** The non-staking side benefits from a failure (Commit) or from "couldn't do it" (Dare), so:

- it **cannot be the sole referee**;
- the staker (Commit) / the target (Dare) submits "done" + proof → the other side has **48 h to dispute**, silence = payout in favor of the submitter;
- **disputing requires a deposit of 10% of the stake** (ParkTheBus spam deposit): the dispute goes to the friend-referee / AI referee, and the loser of the dispute loses the deposit;
- the assigned referee cannot be a beneficiary.

**Not doing in the MVP:** asymmetric stakes ($50 vs $10). These are price multipliers, i.e. bookmaker-style pricing, which gives a gambling profile.

## Architecture

```
Next.js (Vercel) ── dispute page /b/<id> with an OG card ── share to any chat
   │  Privy (email/Apple/Google → Solana embedded wallet, no seed phrase)
   │  @solana/kit + Anchor client
   ▼
Anchor program `dispute`                        Backend (Supabase)
   create_bet(terms_hash, stake_a, stake_b,       • profiles, dispute texts, notifications
              deadline, referee?, beneficiary?)   • Telegram bot: "you've been challenged",
              → Bet PDA + vault (stake_b=0 → Commit/Dare)   "deadline in 2 h", "confirm the winner"
   accept_bet()           → B deposits stake_b (or 0, takes the role)
   claim_done(evidence)   → 48 h dispute window
   dispute()              → 10% deposit → referee / AI
   cancel_bet()           → before accept, refund  • OG image generation for cards
   vote_outcome(winner)   → both sides             • (1.1) AI referee: evidence → verdict → signature
   referee_resolve(winner)→ referee only, after
                            the deadline and timeout
   refund_expired()       → permissionless, after
                            the referee timeout
   payout: atomic when the votes match, fee → treasury
```

States: `Open → Active → (Voting) → Resolved | Refunded | Cancelled`. Dispute terms are stored off-chain, only their hash on-chain (privacy + cheap).

## Key risks

| Risk                                | Severity        | Mitigation                                                                                                                                                                                                         |
| ----------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **On-ramp: the friend has no USDC** | 🔴 main UX risk | Privy funding (Coinbase Onramp / MoonPay) right on the Accept screen; "transfer from Phantom"; the creator can **cover both stakes** ("I stake for both of us, if you lose you pay me back", trusted friends only) |
| Gambling classification             | 🔴              | Commitments first (a participant controls the outcome), 1v1 with no house, fee not taken from multipliers, ToS; a lawyer before scaling; geo-block if needed                                                       |
| Referee colludes with one side      | 🟠              | Both sides approve the referee at creation; the referee cannot be a participant; on-chain referee reputation                                                                                                       |
| Both silent / can't agree           | 🟠              | Timeouts → referee → refund. Never gets stuck                                                                                                                                                                      |
| Cold start (needs two people)       | 🟡              | The product is viral by itself: every dispute is an invitation. Telegram bot + share card                                                                                                                          |
| Network fees                        | 🟢              | Solana < $0.001; Privy gas sponsorship for the first transactions                                                                                                                                                  |

## Monetization

1. **3% of the pot** at payout.
2. Later: premium (limits > $500, private rooms), fee on group pools, B2B (challenges in teams).

## Roadmap

| Phase                            | Timeline | What                                                                                                                                                           |
| -------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0 — Prototype + reel**         | 1–2 wk   | 5 screens in Next.js on devnet, share card, waitlist. Shoot the reel "bro rate my startup idea: I bet my friend $20 he won't…". Metric: click-through/waitlist |
| **1 — MVP: Bet + Commit + Dare** | 4–6 wk   | Anchor program (one primitive, either stake can be 0) + audit-lite, Privy, on-ramp, dispute deposit, Telegram bot, mainnet with a $100/dispute limit           |
| **1.1 — AI referee**             | +3 wk    | evidence flow, Claude/Gemini vision, signed verdict, appeal to the friend-referee                                                                              |
| **2 — Pools**                    | +4 wk    | rooms for N people, pari-mutuel, permissionless settle                                                                                                         |
| **3 — Oracles + native**         | —        | Pyth / TxODDS for sports and prices; an Expo app once the legal base exists                                                                                    |

## From the comments (`06`) → where it landed

| Pain point                        | Solution in the product                                                      |
| --------------------------------- | ---------------------------------------------------------------------------- |
| "Where does the money go" (11.8k) | Escrow in the program, fee of 3% shown publicly, tx hash on the dispute card |
| "Friends bet against you" (8.4k)  | That is the product                                                          |
| "I want to earn"                  | The winner claims 2×                                                         |
| Cheating / "deleted the app"      | The money is already in escrow; the referee; (1.1) proof                     |
| "My phone died"                   | Timeouts + refund, nothing burns automatically                               |
| Privacy                           | Terms off-chain, only the hash on-chain                                      |

## Next steps

1. `planner` → PRD + program architecture + task list for Phase 0.
2. Phase 0 in parallel: prototype (for the reel) and an Anchor skeleton.
3. A lawyer, before Phase 1 mainnet.
