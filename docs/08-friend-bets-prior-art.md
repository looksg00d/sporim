# 08 · Prior art: disputes / bets between friends

## Web2

| Product                                                                                               | Money                  | Subject                                     | Who decides                           | Legal footing                               | What to take                                                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------- | ------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [WagerLab](https://wagerlab.app/) (2019, Houston)                                                     | ❌ virtual "units"     | sports + custom                             | the participants, "settle up outside" | "100% legal in all 50 states", no deposits  | Shows that without money the product turns into a scoreboard                                                                           |
| [Betcha: Dumb Bets with Friends](https://mwm.ai/apps/betcha-dumb-bets-with-friends/6762214471) (2026) | ❌ receipts/scoreboard | anything ("how late William's going to be") | participants                          | "NOT a sportsbook, NOT a prediction market" | **Voice → dispute in 10 s; a card in iMessage/WhatsApp with one-tap join; head-to-head records; "avenge your loss"**, the UX reference |
| [BettorEdge](https://www.bettoredge.com/)                                                             | ✅ real                | sports only                                 | match result                          | licenses, 45+ states                        | P2P exchange with no vig                                                                                                               |
| BetOpenly                                                                                             | ✅                     | sports                                      | result                                | licenses                                    | **1% fee**, the benchmark for the fee                                                                                                  |
| BroThrow                                                                                              | ✅ off-platform        | sports                                      | participants                          | "settle outside"                            | —                                                                                                                                      |

**Takeaway:** nobody in web2 has combined "about anything" + "real money". Whoever holds the money drifts into sports and licenses.

## Crypto

| Project                                                                 | Network                     | Format                             | Resolution                                                | Fee | Status                      | What to take                                                                                                                             |
| ----------------------------------------------------------------------- | --------------------------- | ---------------------------------- | --------------------------------------------------------- | --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [MNEEBet](https://github.com/NikhilRaikwar/MNEEBet)                     | Ethereum (Sepolia)          | 1v1, equal stakes, MNEE stablecoin | **referee chosen at creation**; creator / opponent / draw | 0%  | hackathon                   | `createBet(opponent, amount, terms, deadline, judge)` → `acceptBet` → `resolveWithJudge` with **atomic payout**; 30-day emergency refund |
| [Settld](https://settld.xyz/)                                           | N1                          | any dispute, P2P                   | **arbiters with an economic incentive**                   | ?   | landing page                | arbiter model for Phase 2+                                                                                                               |
| [OnChainBet](https://onchainbet.site/)                                  | Solana                      | room by link, N participants       | creator or referee                                        | —   | demo (in-memory)            | link → wallet → settle; they honestly write "production needs timeouts, voting"                                                          |
| [Stakely](https://github.com/geekman58748/Stakely)                      | Solana (Anchor, devnet)     | 1v1 on a match, USDC from $1       | TxLINE oracle (Merkle proof)                              | —   | devnet                      | **Telegram bot** for challenges; Anchor escrow `stakely-escrow`; Supabase + Express                                                      |
| [bet2fun](https://github.com/Quantum3-Labs/bet2fun-app)                 | Solana (Anchor, devnet)     | room, pari-mutuel                  | **permissionless settle** via Txoracle                    | 0   | hackathon                   | "if we disappear, anyone can close the pool", a mandatory principle                                                                      |
| [ParkTheBus](https://github.com/Shawnchee/ParkTheBus)                   | Solana (Anchor 1.0, devnet) | RFQ + market makers, custom events | **council with a vote threshold**, fail-closed            | 0   | hackathon, 26 LiteSVM tests | spam deposit 0.01 SOL; a referee who is a participant doesn't vote; **without consensus the money stays in escrow**                      |
| [FriendzCasino](https://github.com/iitianpushkar/FriendzCasinoOnSolana) | Solana                      | rooms, games of chance             | commit-reveal                                             | —   | hackathon                   | rooms and a room-leader as a pattern for pools                                                                                           |

**Takeaway:** all the mechanics (escrow, referee, atomic payout, permissionless settle, fail-closed) are already written and tested on devnet. Nobody has: chat-first distribution, a wallet without a seed phrase, an on-ramp for a friend without crypto, production.

## Resolution models, compared

| Model                         | Pros                                      | Cons                             | Where it fits for us               |
| ----------------------------- | ----------------------------------------- | -------------------------------- | ---------------------------------- |
| Mutual confirmation           | instant, zero trust in third parties      | deadlock on disagreement         | MVP, default                       |
| Friend-referee chosen upfront | flexible, works for "subjective" disputes | collusion, referee disappears    | MVP, fallback + timeout            |
| AI referee on evidence        | scales, viral                             | errors, disputed cases           | 1.1, with an appeal to the referee |
| Council / staked arbiters     | no collusion                              | complex, needs arbiter liquidity | Phase 2+                           |
| Oracle (sports, prices)       | objective, permissionless                 | only for external events         | Phase 3                            |

## Legal landscape (not legal advice)

- WagerLab/Betcha live without money, which is why they are "legal everywhere".
- Real money on **external** events = gambling almost everywhere → licenses/geo-blocking.
- Real money on **one's own** actions = a commitment device (Forfeit, Paywake, stickK have lived for years).
- 1v1 with no house and no multipliers is closer to a "private wager between friends", unregulated in some jurisdictions and regulated in others. A fee on the pot ≠ vig, but the platform still "facilitates".
- In practice: commitments first, a per-dispute limit, ToS worded with "commit / stake / claim", a lawyer before scaling.
