# 07 · Platform: Solana + web-first (Next.js), native app later

**Decision (2026-09-02, after the pivot to "disputes between friends"):** the product lives as a **mobile-first web app**.
A dispute is a `/b/<id>` link with an OG preview that unfurls in iMessage / WhatsApp / Telegram / Discord.
The native app (Expo) is Phase 3, once there is a legal base and retention that justifies an install.

## Why web, not an app

| Requirement                                                                         | Web (Next.js)                           | Native (Expo)                                                            |
| ----------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| **The second participant accepts a dispute in 10 s without staking anything first** | ✅ link → page → Accept                 | ❌ "download, sign up" and half of the disputes die                      |
| Dispute preview card in someone else's chat                                         | ✅ OG-image                             | ❌ only if the app is already installed (universal links)                |
| App Store 5.3 (gambling) / 3.1.5 (crypto)                                           | not applicable                          | 🔴 an almost guaranteed reject for "a dispute about anything, for money" |
| Availability in RU/CIS and everywhere                                               | ✅ day 1                                | depends on the stores                                                    |
| Wallet without a seed phrase                                                        | ✅ Privy `react-auth` + Solana embedded | ✅ Privy Expo                                                            |
| Push "confirm the winner"                                                           | PWA push (iOS 16.4+) + **Telegram bot** | ✅ native                                                                |
| Camera for proof (1.1)                                                              | ✅ `getUserMedia` / file input          | ✅                                                                       |
| An alarm clock that actually rings                                                  | ❌                                      | ✅, but after the pivot it is not the core                               |

The only thing we lose without native is the system alarm clock. After the pivot the alarm is one template among many, and it is covered by the Telegram bot/push + "send proof by 7:05".

## Stack

| Layer            | Choice                                                                                                          | Why                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Web              | **Next.js 15** (App Router), TypeScript, Tailwind                                                               | OG-image routes, server-rendered dispute pages, Vercel                                                     |
| Wallet           | **Privy** `@privy-io/react-auth` + `/solana`: email / Apple / Google → embedded Solana wallet (`createOnLogin`) | a normie never sees a seed phrase; `signAndSendTransaction` in the browser; funding widget for the on-ramp |
| Chain client     | `@solana/kit` + `@coral-xyz/anchor`                                                                             | standard                                                                                                   |
| Program          | **Anchor** (Rust), USDC SPL, a PDA vault per dispute                                                            | see `05`                                                                                                   |
| Backend          | **Supabase** (Postgres + RLS + Edge Functions)                                                                  | as in GetStaked / Stakely                                                                                  |
| Notifications    | **Telegram bot** (grammY) + web push                                                                            | the audience lives in chats; Stakely's "challenge alerts" pattern                                          |
| Oracle/AI (1.1)  | Claude / Gemini vision, verdict signed with ed25519 → the program verifies                                      | GetStaked pattern                                                                                          |
| Hosting          | Vercel + Helius/Triton RPC                                                                                      | —                                                                                                          |
| Native (Phase 3) | Expo, reusing TS packages (program client, types) from the monorepo                                             | don't rewrite the logic                                                                                    |

## What to take from neighbors

- **Betcha**: "bet in 10 seconds": voice → dispute; a card in the chat; scoreboard and head-to-head with every friend.
- **MNEEBet**: the referee is chosen at creation; atomic payout at resolution; draw = refund.
- **ParkTheBus**: fail-closed: without consensus the money doesn't move; a referee who is a participant can't vote.
- **bet2fun**: permissionless settle: if we disappear, anyone can close the dispute.
- **Stakely**: a Telegram bot for challenges and reminders.

## The reel: shoot it on the Phase 0 prototype

The same "bro rate my startup idea 💀🥀" format, 5 screens: _What's the bet?_ → _Stake $20_ → _Deadline_ → _Who decides?_ → _Locked in on Solana ✅ → Share to chat_. Waitlist link in the bio. The prototype runs on devnet, the wallet is real (Privy), the money is test money.

## Open items

| Gap                                               | Severity | Closed by                                                                |
| ------------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| Legal framing (gambling / MSB)                    | 🔴       | a lawyer before mainnet; commitments first; $100/dispute limit at launch |
| On-ramp for a friend without crypto               | 🔴       | Privy funding + "the creator pays for both"                              |
| Anchor program design (timeouts, referee, refund) | 🟠       | planner → architecture doc                                               |
| OG cards and deep links in Telegram               | 🟡       | Phase 0                                                                  |

## Sources

- [Apple App Review Guidelines — 3.1.5, 5.3](https://developer.apple.com/app-store/review/guidelines/)
- [Privy + Solana (React)](https://docs.privy.io/recipes/solana/getting-started-with-privy-and-solana) · [Automatic wallet creation](https://docs.privy.io/basics/react-native/advanced/automatic-wallet-creation)
- Prior art on disputes: `08-friend-bets-prior-art.md`
