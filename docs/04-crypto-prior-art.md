# 04 · Крипто-аналоги (prior art)

Никто из них не вышел за пределы хакатона/тестнета/маленького прода — ниша **открыта**, но паттерны уже отработаны. Не изобретаем контракт с нуля — берём проверенные механики.

| Проект                                                              | Сеть              | Актив                     | Провал →                                           | Победа →                            | Верификация                                       | Статус              |
| ------------------------------------------------------------------- | ----------------- | ------------------------- | -------------------------------------------------- | ----------------------------------- | ------------------------------------------------- | ------------------- |
| [Streaks](https://www.streaks.buzz/)                                | EVM               | USDC / ETH                | «failure address» по выбору                        | ставка назад (−2.5 % fee)           | check-in (self)                                   | прод, мелкий        |
| [CommitMint](https://commitment-parties.vercel.app/)                | ?                 | от $5                     | пул победителей                                    | ставка + доля пула **+ yield**      | AI (фото) / on-chain (HODL, DCA)                  | демо                |
| [RepTrain](https://github.com/kyteolivertrainer/RepTrain)           | Arc testnet       | native USDC               | «comeback pool»                                    | ставка + **50 % бонус** (cap = пул) | self check-in 1/день                              | тестнет             |
| [GetStaked](https://github.com/Naeem404/GetStaked)                  | Solana            | SOL                       | пул победителей                                    | доля пула                           | **Gemini 2.0 Flash** фото + friend-review спорных | прод (getstaked.ca) |
| [LockD](https://github.com/Lordsans-404/LockD)                      | Arbitrum Sepolia  | ETH                       | **freeze** → 3-дн redemption (−20 %) → liquidation | 100 % назад                         | self check-in, `block.timestamp`                  | тестнет             |
| [GoalForge / STICKIT](https://github.com/SamsShow/GoalForge)        | Base Sepolia      | ERC-20 GOAL               | **burn**                                           | +10 % бонус + **NFT**               | GitHub API, Google Fit, GPT-4o-mini               | дипломный           |
| [CommitLock](https://github.com/johng2023/gitAccountable)           | Sepolia           | ETH → **eETH (Ether.Fi)** | всё владельцу контракта                            | eETH + staking-rewards              | **Chainlink Functions** → GitHub                  | хакатон             |
| [Gauntlet](https://www.productcool.com/product/gauntlet-2)          | Base              | USDC                      | проиграл P2P                                       | winner-take-all                     | **Strava API** (GPS)                              | прод                |
| [ChainedHabits](https://ethglobal.com/showcase/chainedhabits-vdpm6) | Sepolia + Cartesi | ETH                       | депозит сгорает                                    | назад + «compound interest»         | Cartesi VM + Gnosis automation                    | ETHGlobal           |
| [StakeStep](https://github.com/aarjn/StakeStep)                     | ?                 | ?                         | —                                                  | —                                   | social                                            | заброшен 2024       |

## Паттерны, которые стоит взять

### 1. Экономика пула (Paywake / RepTrain / GetStaked / CommitMint)

```
forfeited stakes → pool
winner.claim() = stake + min(bonus_cap, pool_share)
protocol fee = 2.5–15 %
```

RepTrain: бонус = 50 % ставки, но не больше, чем есть в пуле — защита от пустого пула. CommitMint: + yield за период. **Это и есть ответ на «зачем приложение, которое отбирает деньги»**.

### 2. Yield на escrow (CommitLock, CommitMint, ChainedHabits)

Ставка не лежит мёртвым грузом: ETH → eETH (Ether.Fi), USDC → Aave/Morpho vault. Победитель получает ставку + APY. Нарратив: **«твои деньги работают, пока ты спишь — если проснёшься»**.

### 3. Открытый keeper (RepTrain `forfeit(address)`, LockD `liquidateAbandonedPledge()`)

Просроченный контракт может закрыть **кто угодно** — пользователь, соперник, бот. Не нужен свой cron-сервер, который «решает» провал; on-chain-время (`block.timestamp`) + любой вызов. На дешёвых L2 keeper окупается копейками.

### 4. Freeze → redemption вместо мгновенной потери (LockD)

Пропустил → средства **заморожены**, 3 дня на «искупление», возвращают 80 %. Второй провал — 100 % ликвидация. Это on-chain-аналог апелляций/leniency Forfeit — снижает страх «телефон сел».

### 5. Многоуровневая верификация (GetStaked, GoalForge)

```
proof → AI vision (Gemini / Claude) → confidence
  ≥ 0.85  → approve
  0.5–0.85 → friend/peer review (2 из 3)
  < 0.5   → reject (appeal возможен)
```

Плюс on-chain-верифицируемое там, где возможно: GitHub commits через Chainlink Functions, Strava через оракул, HODL/DCA по кошельку напрямую.

### 6. NFT-achievements + on-chain-репутация (GoalForge, RepTrain)

Лучший стрик, pacts won / flaked — «единственный Rep, который считается» — навсегда в цепочке. Для соц-слоя и лидерборда бесплатно.

## Готовые стеки (для форка/референса)

| Кусок                                      | Откуда                                                  | Технологии                                                                   |
| ------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Solidity-контракт стейкинга + пул + keeper | RepTrain `contracts/RepTrain.sol`                       | Solidity, native USDC                                                        |
| Freeze/redemption state machine            | LockD                                                   | Solidity ^0.8, OpenZeppelin ReentrancyGuard, wagmi/viem, Next.js             |
| ERC-20 + ERC-721 + burn + бонус            | GoalForge `contracts/GoalForge.sol`, `GoalForgeNFT.sol` | Hardhat, Chai, RainbowKit, Next 15                                           |
| Оракул GitHub через Chainlink Functions    | CommitLock                                              | Chainlink Functions, Ether.Fi LiquidityPool                                  |
| Mobile + AI-фото + пулы с друзьями         | GetStaked                                               | Supabase (RLS, Edge Functions), Gemini 2.0 Flash, ElevenLabs, Phantom/Solana |

## Чего у них нет (наш gap)

- **Будильник как продукт.** Все — «привычки вообще». Никто не сделал Paywake-on-chain: узкий кейс «проснись → фото → получи». Узкий кейс = понятное промо (см. рил) + ежедневная транзакция.
- **Telegram-дистрибуция.** Ни одного TON / Mini App. Для RU/CIS-аудитории это единственный канал с встроенным кошельком без сид-фраз.
- **Прод-качество mobile UX.** Все — Next.js-dApp с MetaMask. Рил показывает, что продают 5 нативных экранов.
- **Регуляторная упаковка.** Никто не думал про «gambling vs commitment device» (см. `05-product-spec.md`).
