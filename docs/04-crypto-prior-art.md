# 04 · Crypto prior art

None of them has gone beyond a hackathon/testnet/small production. The niche is **open**, but the patterns are already proven. We don't invent the contract from scratch, we take proven mechanics.

| Project                                                             | Network           | Asset                     | Failure →                                          | Success →                          | Verification                                           | Status                    |
| ------------------------------------------------------------------- | ----------------- | ------------------------- | -------------------------------------------------- | ---------------------------------- | ------------------------------------------------------ | ------------------------- |
| [Streaks](https://www.streaks.buzz/)                                | EVM               | USDC / ETH                | "failure address" of your choice                   | stake back (−2.5% fee)             | check-in (self)                                        | production, small         |
| [CommitMint](https://commitment-parties.vercel.app/)                | ?                 | from $5                   | winners' pool                                      | stake + pool share **+ yield**     | AI (photo) / on-chain (HODL, DCA)                      | demo                      |
| [RepTrain](https://github.com/kyteolivertrainer/RepTrain)           | Arc testnet       | native USDC               | "comeback pool"                                    | stake + **50% bonus** (cap = pool) | self check-in 1/day                                    | testnet                   |
| [GetStaked](https://github.com/Naeem404/GetStaked)                  | Solana            | SOL                       | winners' pool                                      | pool share                         | **Gemini 2.0 Flash** photo + friend review of disputes | production (getstaked.ca) |
| [LockD](https://github.com/Lordsans-404/LockD)                      | Arbitrum Sepolia  | ETH                       | **freeze** → 3-day redemption (−20%) → liquidation | 100% back                          | self check-in, `block.timestamp`                       | testnet                   |
| [GoalForge / STICKIT](https://github.com/SamsShow/GoalForge)        | Base Sepolia      | ERC-20 GOAL               | **burn**                                           | +10% bonus + **NFT**               | GitHub API, Google Fit, GPT-4o-mini                    | thesis project            |
| [CommitLock](https://github.com/johng2023/gitAccountable)           | Sepolia           | ETH → **eETH (Ether.Fi)** | everything to the contract owner                   | eETH + staking rewards             | **Chainlink Functions** → GitHub                       | hackathon                 |
| [Gauntlet](https://www.productcool.com/product/gauntlet-2)          | Base              | USDC                      | lost P2P                                           | winner-take-all                    | **Strava API** (GPS)                                   | production                |
| [ChainedHabits](https://ethglobal.com/showcase/chainedhabits-vdpm6) | Sepolia + Cartesi | ETH                       | deposit is burned                                  | back + "compound interest"         | Cartesi VM + Gnosis automation                         | ETHGlobal                 |
| [StakeStep](https://github.com/aarjn/StakeStep)                     | ?                 | ?                         | —                                                  | —                                  | social                                                 | abandoned 2024            |

## Patterns worth taking

### 1. Pool economics (Paywake / RepTrain / GetStaked / CommitMint)

```
forfeited stakes → pool
winner.claim() = stake + min(bonus_cap, pool_share)
protocol fee = 2.5–15 %
```

RepTrain: bonus = 50% of the stake, but no more than what is in the pool, which protects against an empty pool. CommitMint: + yield for the period. **This is the answer to "why use an app that takes your money"**.

### 2. Yield on escrow (CommitLock, CommitMint, ChainedHabits)

The stake doesn't sit as dead weight: ETH → eETH (Ether.Fi), USDC → Aave/Morpho vault. The winner gets the stake + APY. The narrative: **"your money works while you sleep, if you wake up"**.

### 3. Open keeper (RepTrain `forfeit(address)`, LockD `liquidateAbandonedPledge()`)

An expired contract can be closed by **anyone**: the user, the opponent, a bot. No need for our own cron server to "decide" a failure; on-chain time (`block.timestamp`) + any call. On cheap L2s the keeper pays for itself in pennies.

### 4. Freeze → redemption instead of instant loss (LockD)

Missed → funds are **frozen**, 3 days to "redeem", 80% returned. A second failure means 100% liquidation. This is the on-chain analogue of Forfeit's appeals/leniency, and it reduces the "my phone died" fear.

### 5. Multi-level verification (GetStaked, GoalForge)

```
proof → AI vision (Gemini / Claude) → confidence
  ≥ 0.85  → approve
  0.5–0.85 → friend/peer review (2 of 3)
  < 0.5   → reject (appeal possible)
```

Plus on-chain verifiable checks where possible: GitHub commits via Chainlink Functions, Strava via an oracle, HODL/DCA straight from the wallet.

### 6. NFT achievements + on-chain reputation (GoalForge, RepTrain)

Best streak, pacts won / flaked: "the only Rep that counts", on the chain forever. Free for the social layer and the leaderboard.

## Ready-made stacks (for forking/reference)

| Piece                                     | From                                                    | Tech                                                                         |
| ----------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Solidity staking contract + pool + keeper | RepTrain `contracts/RepTrain.sol`                       | Solidity, native USDC                                                        |
| Freeze/redemption state machine           | LockD                                                   | Solidity ^0.8, OpenZeppelin ReentrancyGuard, wagmi/viem, Next.js             |
| ERC-20 + ERC-721 + burn + bonus           | GoalForge `contracts/GoalForge.sol`, `GoalForgeNFT.sol` | Hardhat, Chai, RainbowKit, Next 15                                           |
| GitHub oracle via Chainlink Functions     | CommitLock                                              | Chainlink Functions, Ether.Fi LiquidityPool                                  |
| Mobile + AI photo + pools with friends    | GetStaked                                               | Supabase (RLS, Edge Functions), Gemini 2.0 Flash, ElevenLabs, Phantom/Solana |

## What they lack (our gap)

- **The alarm clock as a product.** All of them are "habits in general". Nobody built Paywake-on-chain: the narrow case "wake up → photo → get paid". A narrow case means clear promo (see the reel) + a daily transaction.
- **Telegram distribution.** Not a single TON / Mini App. For the RU/CIS audience it is the only channel with a built-in wallet and no seed phrases.
- **Production-quality mobile UX.** All of them are Next.js dApps with MetaMask. The reel shows that what sells is 5 native screens.
- **Regulatory packaging.** Nobody has thought about "gambling vs commitment device" (see `05-product-spec.md`).
