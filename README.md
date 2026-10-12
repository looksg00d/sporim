# SPORIM

[![License: BUSL 1.1](https://img.shields.io/badge/license-BUSL%201.1-lightgrey)](LICENSE)
[![Solana devnet](https://img.shields.io/badge/solana-devnet-9945FF)](https://explorer.solana.com/address/EkfT8PTE7QShwtK6F7NEDgC2M3i4cGnLZhurULPVtDP2?cluster=devnet)
[![Live](https://img.shields.io/badge/live-sporim.fun-C9FF3F)](https://sporim.fun)

Friend bets, made official.

Write any bet you can think of, name a friend as referee, sign it, and both stakes are held
in a USDC escrow on Solana until it's settled.

[sporim.fun](https://sporim.fun) | [How it works](https://sporim.fun/how-it-works) | [Program on devnet](https://explorer.solana.com/address/EkfT8PTE7QShwtK6F7NEDgC2M3i4cGnLZhurULPVtDP2?cluster=devnet)

## Highlights

- Any terms, written by you. The bets no other app would ever list.
- A friend as referee, a drawn signature, a share link your friend accepts in one tap.
- Stakes held in a per-bet vault owned by the program, not by us.
- Every state has a way out: unaccepted, disputed and forgotten bets all refund.
- Your friend needs zero SOL to accept. We pay rent and fees.
- 3% fee on the winnings only. Refunds are free.

## Why

Every group chat has a bet in it. "You won't run 10 km by Sunday." "Bet." It's the best part
of the chat, and it lasts about five minutes: no terms, no deadline, nobody keeping score.
SPORIM turns that message into a deal between friends that feels real.

## Status

The Anchor program is live on devnet with nine instructions, tested end to end. A real round
trip, [`create_bet`](https://explorer.solana.com/tx/48dQNk4e4uetXt5FDQcHqnJdHveyr4MYNkjWVR42HAo9jni6cP5JhxQ2TYPVMedShmzXQ9f6Teo4Jof9eLC6uZm2?cluster=devnet)
then [`cancel_bet`](https://explorer.solana.com/tx/2UiPMucG5RR4sQgh2skqiY46wffaV7WxJSMdEft2U1W1Q2h9KK7XuPHdHczYvyGNcznHaTDvLMwWmPNyJp9MiJD6?cluster=devnet),
was signed by a creator holding 0 SOL.

The web app at [sporim.fun](https://sporim.fun) runs the full flow on test money through a mock
wallet. Wiring it to the program is the next milestone. Today: one mint (USDC), 1v1, referee
off-chain.

## The program

Program ID `EkfT8PTE7QShwtK6F7NEDgC2M3i4cGnLZhurULPVtDP2`, source in
[`packages/program/programs/sporim/src`](packages/program/programs/sporim/src).

| Instruction          | Caller      | Effect                                                                  |
| -------------------- | ----------- | ----------------------------------------------------------------------- |
| `create_bet`         | creator     | Opens the bet, moves the stake into a per-bet vault (PDA token account) |
| `accept_bet`         | opponent    | Moves the matching stake into the vault                                 |
| `cancel_bet`         | creator     | Before acceptance: returns the stake, closes the accounts               |
| `submit_claim`       | either side | After the deadline: claims the result, opens a 48h window               |
| `confirm_claim`      | other side  | Agrees, the winner is paid                                              |
| `dispute_claim`      | other side  | Disagrees, both are refunded with no fee                                |
| `expire_unaccepted`  | anyone      | Refunds a bet nobody accepted in time                                   |
| `settle_uncontested` | anyone      | Pays out a claim left unanswered for 48h                                |
| `refund_expired`     | anyone      | Refunds both sides of a bet nobody claimed                              |

The three permissionless instructions mean the money still comes out if we disappear. Only
one mint is allowed, so nobody can open a bet in a fake token. The fee is set in basis points
and checked against the TypeScript domain package by a parity test.

## Repository

```
apps/web           Next.js 15 app: wizard, bet page, share links, OG images, Postgres with RLS
packages/program   Anchor program (Rust) and lifecycle tests
packages/chain     TypeScript client generated from the IDL with Codama, on @solana/kit
packages/domain    Framework-free logic: money, fees, bet state machine, schemas, copy
packages/ui        Design system components, rendered by both React and satori
docs/              Product spec, research, decisions, design system, status
```

Good places to start: [product spec](docs/05-product-spec.md),
[platform decision](docs/07-platform-decision.md), [build plan](docs/09-phase0-plan.md),
[decision log](docs/DECISIONS.md), [design system](docs/DESIGN.md).

## Development

```bash
pnpm install
pnpm dev                              # http://localhost:3000
pnpm check                            # typecheck, lint, unit tests
pnpm --filter @sporim/web test:e2e    # Playwright
bash packages/program/scripts/test.sh # Anchor tests (Linux or WSL)
```

## Roadmap

- [x] Escrow program on devnet
- [x] Web app: create, sign, share, accept, settle on test money
- [ ] Phantom wallet, wired to the program
- [ ] Referee on-chain
- [ ] Photo proof
- [ ] Group pots
- [ ] Legal review, then mainnet

## License

SPORIM is source-available under the [Business Source License 1.1](LICENSE), not open source.
You may read, run, fork and modify it for learning, review and other non-production use.
Production use, including running it as a service or shipping a competing or commercial fork,
needs a separate license from the authors. On 2030-10-12 the code converts to Apache 2.0.

For commercial licensing, open an issue or reach out via [github.com/looksg00d](https://github.com/looksg00d).
