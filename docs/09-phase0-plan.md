# 09 · Implementation Plan: SPORIM — Phase 0 (devnet prototype + reel) & Phase 1 skeleton

> Produced by the planner agent 2026-09-02 from `README.md`, `docs/05`–`08`, `docs/01`, `reference/frames/*`.
>
> **Editorial notes (added after planning):**
>
> - **`docs/DESIGN.md` (originally at the repo root) supersedes §2.1 `packages/ui` tokens.** The planner assumed the reel's lavender palette; the chosen direction is "Acid Arena" (Option B on the design canvas). Build `packages/ui` strictly from `DESIGN.md`.
> - Open questions Q1–Q5 at the end are for the product owner; recommended answers are inline in _italics_.
> - **The dispute bond in this document no longer exists (2026-09-04).** Every mention of
>   `dispute_bond`, `bond_bps`, `calculateDisputeBond` or a vault holding
>   `stakes + dispute_bond` is superseded: disagreeing is free, the vault holds the stakes and
>   nothing else, and a silent referee refunds rather than upholding the claim (`settleUnrefereed`
>   is gone). Read `docs/DECISIONS.md` under 2026-09-04 before implementing §2.5, the instruction
>   table, or the invariants — the on-chain design in here still carries the old money rules.
>
> Read as: **§1 PRD** (what and why) → **§2 Architecture** (how it is built) → **§3 Task list** (what to do, in order) → **Risks** → **Open questions**.
>
> **Repo root for all paths below: `C:\Users\4\Desktop\moneydeal\`** — the existing research repo becomes the monorepo root (`docs/`, `data/`, `reference/`, `tools/` stay; `apps/` and `packages/` are added). `C:\Users\4\Desktop\inst` is the unrelated Instagram-scrape workspace and is **not** touched.
>
> Brand name "SPORIM" is replaceable: it lives in exactly one place, `packages/domain/src/brand.ts`, and is never hardcoded in components or copy files.

---

## 1. PRD

### 1.1 Problem & one-liner

Friends bet in a chat all the time ("already doing it on group chat" — `docs/06`), and the money never actually moves. The top two content signals from the 240-comment corpus are **"where does the money go?"** (~11.8k likes) and **"make it so your friends can bet against you, winner gets the money"** (~8.4k likes). Nobody has combined _anything-goes subject_ + _real money_ + _chat-native distribution_.

**SPORIM:** you make a bet/commit/dare in a chat → USDC goes into escrow on Solana → the winner takes the pot. A bet is a link `/b/<id>` with an OG preview card; the opponent accepts in the browser in ~10 seconds (Privy email/Apple/Google → embedded Solana wallet, no seed phrase).

### 1.2 Phase 0 goals

| #   | Goal                                                                                    | Why                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | A shootable 5-screen create flow that looks like a real product on a real phone browser | The reel is the distribution channel; `docs/01` proves the format works (50.7k likes)                                                                                                   |
| G2  | A shareable bet link with an OG card that unfurls in iMessage/WhatsApp/Telegram         | This _is_ the viral loop and the core differentiator vs. every prior-art project in `docs/08`                                                                                           |
| G3  | An accept flow a crypto-naive friend completes in ≤ 90 s, wallet included               | Answers "half the bets die at 'download the app'" (`docs/07`)                                                                                                                           |
| G4  | Waitlist capture with attribution back to the reel                                      | Phase 0 success metric is demand, not revenue                                                                                                                                           |
| G5  | On-chain layer behind `ChainAdapter`, mock first, devnet second                         | Unblocks the reel before the Anchor program exists; forces the seam we need for Expo later                                                                                              |
| G6  | Visibly answer the top-3 user pains in the UI                                           | "Where does the money go" (fee + destination shown before signing), "friends bet against you" (the product), "what if my phone dies" (timeouts → refund, shown on the Locked-in screen) |

### 1.3 Non-goals (Phase 0)

- ❌ Mainnet, real money, any custody of real value.
- ❌ Asymmetric stakes ($50 vs $10) — that is odds, i.e. a gambling profile (`docs/05`).
- ❌ Third parties betting on someone else's outcome (betting-license territory, `docs/06` §2).
- ❌ Group pools / N>2 participants, parimutuel.
- ❌ AI judge / evidence upload (Phase 1.1).
- ❌ Telegram bot implementation (Phase 1 — only the touchpoint contract is designed here).
- ❌ On-ramp (MoonPay/Coinbase) — devnet faucet button instead.
- ❌ Native app, push notifications, i18n beyond one locale.
- ❌ Referee reputation, leaderboards, head-to-head records.
- ❌ Legal review / ToS beyond a placeholder page (lawyer engaged before Phase 1 mainnet).

### 1.4 Personas

**P1 — Creator ("Max", 22, has $30 in a Phantom wallet or nothing at all).** Sees the reel, taps the bio link on an iPhone in Safari. Wants to make one bet against a friend in under a minute and drop the link into a group chat. Failure mode: any wallet/seed-phrase screen kills him. Success feeling: "Locked in." + a card that looks good in the chat.

**P2 — Opponent ("Dan", 24, zero crypto).** Receives a link in Telegram. Sees a card that already contains everything: terms, stake, deadline, who decides. Wants to tap Accept and go back to the chat. Failure modes: signup wall, "install Phantom", "buy USDC", ambiguous terms. Success feeling: "I'm in, he's cooked."

**P3 — Referee ("Anya", the mutual friend).** Named at creation, does nothing 95% of the time. Only appears when the two disagree. Wants a one-screen "who won?" with the terms and both claims side by side, and to not be liable for anything. Failure mode: she never opens the link → the money must still come back (fail-closed, `docs/08` ParkTheBus).

### 1.5 Product rules locked for Phase 0 (from `docs/05`)

| Rule                | Value                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Formats             | **Bet** (both stake), **Commit** (creator stakes; fail → beneficiary), **Dare** (challenger stakes; target risks nothing)    |
| Stakes              | Symmetric only in Bet. Presets 5 / 10 / 25 / custom USDC. Min $1, max $100 per bet (Phase 0/1 cap)                           |
| Decision            | "Both of us confirm" (default) or "Referee: @friend"                                                                         |
| One-sided formats   | The non-staking party can **never** be the sole judge → Commit and Dare **require** a referee (see Q4)                       |
| Claim window        | Claim allowed from `deadline`; other side has **48 h** to confirm or dispute; silence = payout to the claimant               |
| Dispute             | Costs a **10% bond**; goes to the referee; the loser of the dispute forfeits the bond                                        |
| Referee timeout     | **7 days** silent → refund both, fail-closed, bond returned to the disputer                                                  |
| Fee                 | **3%**, snapshotted on-chain at creation, never charged on a refund (see Q1 on base)                                         |
| Referee constraints | Referee ≠ creator ≠ opponent ≠ beneficiary                                                                                   |
| Language            | No "gamble/bookie/odds" in UI copy (`docs/06` §6). Verbs: _bet · commit · dare · stake · claim · confirm · dispute · refund_ |

### 1.6 User stories with acceptance criteria

Screen IDs map 1:1 to routes (§2.2). Every AC below is a Playwright or vitest assertion in §3.

#### S0 — Landing `/`

- [ ] AC1: Above the fold on 390×844: headline, one-sentence subhead, primary CTA **"Make a bet"** → `/new`, secondary **"Join waitlist"** → email sheet.
- [ ] AC2: A "Where the money goes" block reachable within 2 screens: escrow → winner, 3% fee, 0% on refunds, link to `/where-money-goes`.
- [ ] AC3: A visible **"Devnet — test money only"** banner whenever `NEXT_PUBLIC_CHAIN_MODE !== 'mainnet-beta'`. Non-dismissible.
- [ ] AC4: LCP ≤ 2.0 s on simulated Fast 3G; no layout shift when the banner mounts.
- [ ] AC5: `?ref=<code>` and `utm_*` captured into a first-party cookie `sporim_attr` (30 d) and attached to every analytics event and the waitlist row.
- [ ] AC6: Works with JS disabled to the extent of headline + waitlist form (server action).

#### S1 — "What's the bet?" `/new/terms`

- [ ] AC1: Single multiline field, autofocus, placeholder rotates through 3 examples.
- [ ] AC2: `betTermsSchema`: 10–280 chars after trim; counter amber at 240, red at 280; CTA disabled with an inline reason.
- [ ] AC3: 4 template chips (Habit / Deadline / Challenge / Custom) prefill; undoable.
- [ ] AC4: Progress dots 1/5. Back returns to `/`.
- [ ] AC5: Draft persists to `sessionStorage` (`sporim.draft.v1`, debounced 300 ms); reload restores step and text.
- [ ] AC6: Terms text never leaves the device before step 5 (on-chain stores only a hash).

#### S2 — "Format + Stake" `/new/format`

- [ ] AC1: Three format cards with _who stakes_ / _what happens on fail_; default **Bet**.
- [ ] AC2: Presets $5 / $10 / $25 / Custom; custom accepts 1–100 with 2 decimals, rejects `e`, `-`, `+`, >2 decimals.
- [ ] AC3: Live **payout preview** computed by `calculateSettlement` — no hand-written math in the component.
- [ ] AC4: **Commit** reveals a required "If you fail, $X goes to →" selector: `friend` / `charity` (1 placeholder) / `my vault` (disabled, "soon").
- [ ] AC5: **Dare** flips copy to "You stake, they risk nothing" and hides the opponent-stake row.
- [ ] AC6: Commit or Dare sets `decisionMode = 'referee'` with a locked hint.
- [ ] AC7: Progress dots 2/5.

#### S3 — "Deadline" `/new/deadline`

- [ ] AC1: Chips: Tonight 23:59 / Tomorrow / This Sunday / In 7 days / Custom.
- [ ] AC2: Custom = native `datetime-local` (iOS Safari renders the wheel).
- [ ] AC3: `deadline > now + 15 min` and `< now + 365 d`; stored UTC ISO, displayed with an explicit TZ label.
- [ ] AC4: Plain-language timeline: claim → 48 h → referee → 7 days silent → refund. The literal answer to "what if my phone dies".
- [ ] AC5: Progress dots 3/5.

#### S4 — "Who decides?" `/new/judge`

- [ ] AC1: Two options; mutual default for Bet, forced-off for Commit/Dare.
- [ ] AC2: Referee input takes handle/email/Telegram @; `refereeRefSchema`; referee needs no account yet — invite link `/r/<token>`.
- [ ] AC3: Guard: referee ≠ creator ≠ beneficiary; inline error.
- [ ] AC4: Explainer: "The referee only appears if you two disagree. They can't take the money — only pick a winner or a draw."
- [ ] AC5: Progress dots 4/5.

#### S5 — "Sign → Locked in" `/new/review` → `/b/[id]/share`

- [ ] AC1: One sentence from `renderContractSentence(draft)`, e.g. _"I bet **Dan** $20 that he won't run 10 km by **Sun 23:59**. **Anya** decides if we disagree. Winner takes **$38.80_* after a 3% fee."*
- [ ] AC2: Breakdown row: Your stake / Their stake / Pot / Fee / Winner receives — all from `calculateSettlement`.
- [ ] AC3: Signing ritual: full-width press-and-hold ("Hold to lock in", 800 ms).
- [ ] AC4: Not authenticated → Privy modal → embedded wallet created silently → flow **resumes on the same step** with the draft intact.
- [ ] AC5: Pending: _Signing → Sending → Locked in_ with elapsed time; typed user-safe error + **Retry** that never double-charges (idempotency key = `betId`).
- [ ] AC6: Success: check, **"Locked in."**, three facts, **Copy link**, **Share** (`navigator.share` with fallback), the OG card inline.
- [ ] AC7: Mock mode shows a **"Simulated — devnet coming"** chip and **no fake explorer link**; devnet mode shows a real Solscan devnet link.
- [ ] AC8: First keystroke → Locked-in, happy path, median ≤ 60 s.

#### S6 — Bet page `/b/[id]`

- [ ] AC1: Server-rendered (RSC) from Supabase; TTFB p75 < 500 ms.
- [ ] AC2: Renders contract sentence, format badge, stakes, pot, countdown, decision mode + referee, state chip, escrow/tx facts for `active`/`resolved`.
- [ ] AC3: State- and viewer-dependent CTA: `open` + not creator → **Accept**; `open` + creator → Share / Cancel; `active` + past deadline + participant → **Claim the win**; `claimed` + other party → **Confirm** / **Dispute**; `disputed` + referee → **Decide**; terminal → outcome + "where the money went".
- [ ] AC4: Unknown id → 404 with a "Make your own bet" CTA.
- [ ] AC5: Expired-but-unaccepted → "Expired — the stake went back to <creator>", never an actionable Accept.
- [ ] AC6: `revalidate = 0` for the page; OG image cached (S7).

#### S7 — OG card `/b/[id]/opengraph-image`

- [ ] AC1: 1200×630 PNG via `next/og` `ImageResponse`: format badge, terms (3-line clamp), stake in big type, deadline, "Decided by", wordmark + "Tap to accept".
- [ ] AC2: Deterministic; fonts loaded from `apps/web/src/assets/fonts/*.ttf` via `fs`.
- [ ] AC3: < 800 ms p75; `Cache-Control: public, max-age=0, s-maxage=86400, stale-while-revalidate`; `?v=<updated_at epoch>` cache-buster on `og:image`.
- [ ] AC4: Unknown/expired id → generic branded fallback image, never a 500.
- [ ] AC5: Verified manually in Telegram, WhatsApp, iMessage, Discord, X before the reel (T2.10).
- [ ] AC6: Terms text escaped; no user text can break layout or inject markup.

#### S8 — Accept flow `/b/[id]/accept`

- [ ] AC1: One screen: contract sentence → "You put in $20" (or "You risk nothing" for Dare) → **Accept**. No scrolling at 390×844.
- [ ] AC2: Logged out → Privy inline (email OTP default); wallet auto-created; button continues without reload.
- [ ] AC3: Balance check before the tx: insufficient USDC → **"Get $100 test USDC"** faucet (devnet) in place; mock grants instantly.
- [ ] AC4: Race: accepted/cancelled between load and tap → UI resolves to truth from `getBet()`, never a hung spinner.
- [ ] AC5: Self-accept blocked.
- [ ] AC6: Success → `/b/[id]` "You're in" + share back.
- [ ] AC7: Median link-tap → accepted ≤ 90 s including account creation; the Accept tap ≤ 10 s.

#### S9 — Waitlist

- [ ] AC1: Server action, zod, normalized email, stored with `source`, `ref`, `utm`, hashed IP, country.
- [ ] AC2: Duplicate → idempotent success (never leaks "already registered").
- [ ] AC3: Rate limit 5 / IP / hour → 429 friendly.
- [ ] AC4: Honeypot + min time-on-form 1.5 s; no CAPTCHA.
- [ ] AC5: Success shows "You're #142".
- [ ] AC6: Reachable from `/`, `/b/[id]` for non-participants, and `/waitlist`.

#### S10 — Referee view `/r/[token]` (Phase 0: read-only stub)

- [ ] AC1: Token → bet; "You've been named referee" + terms; **Accept role** stores referee user id + wallet (off-chain in Phase 0).
- [ ] AC2: If `disputed`: Creator won / Opponent won / Draw — **disabled in Phase 0** with "Referee decisions ship with the on-chain program".

### 1.7 Success metrics — Phase 0

Funnel `reel → link click → landing → create → share → accept → waitlist`. Event names in `packages/domain/src/analytics/events.ts`.

| Step                              | Event                              | Target (14 days after the reel) |
| --------------------------------- | ---------------------------------- | ------------------------------- |
| Reel views                        | (Instagram insights)               | ≥ 100k                          |
| Bio-link clicks                   | `landing_view` with `ref=reel`     | ≥ 2% of views (≥ 2 000)         |
| Landing → create started          | `create_started`                   | ≥ 35%                           |
| Create started → signed           | `bet_created`                      | ≥ 40%                           |
| Bet created → link shared         | `bet_shared`                       | ≥ 70%                           |
| Shared → opponent opened          | `bet_viewed` (viewer ≠ creator)    | ≥ 50% of created bets           |
| Opened → accepted                 | `bet_accepted`                     | ≥ 25%                           |
| Landing → waitlist                | `waitlist_submitted`               | ≥ 8%; **absolute 500 emails**   |
| Bets created on devnet            | `bet_created` where `chain=devnet` | **≥ 100**                       |
| Bets accepted (2-sided) on devnet | `bet_accepted`                     | **≥ 30**                        |

Guardrails: median time-to-create ≤ 60 s; time-to-accept ≤ 90 s; create-flow error rate < 3%; OG unfurl 5/5 chat apps; zero bets stuck with funds unreachable.

**Kill/continue rule:** < 150 waitlist emails and < 20 accepted bets after 14 days → re-cut the reel and the landing headline before writing the Anchor program.

---

## 2. Architecture

### 2.1 Monorepo layout (pnpm workspaces)

```
C:\Users\4\Desktop\moneydeal\
├─ package.json                  # root scripts only, "private": true, packageManager: pnpm
├─ pnpm-workspace.yaml           # apps/*, packages/*
├─ turbo.json                    # optional: build, lint, typecheck, test
├─ .npmrc                        # strict-peer-dependencies=false, node-linker=isolated
├─ .nvmrc                        # 22
├─ vitest.workspace.ts
├─ .env.example                  # names only, committed
├─ .env.local                    # gitignored
├─ DESIGN.md                     # ← the design system; packages/ui is built from it
├─ docs/
├─ apps/
│  └─ web/                       # Next.js 15, the only deployable in Phase 0
└─ packages/
   ├─ domain/                    # @sporim/domain — pure TS, ZERO React, ZERO node builtins
   ├─ chain/                     # @sporim/chain — ChainAdapter iface + mock + devnet
   ├─ ui/                        # @sporim/ui — React DOM + Tailwind components (web only)
   ├─ program/                   # @sporim/program — Anchor (Rust) + generated TS client (Phase 1)
   ├─ config/                    # @sporim/config — eslint, tsconfig, tailwind presets
   └─ testing/                   # @sporim/testing — vitest setup, factories, fixtures
```

**Expo-reuse rule (hard constraint):** `packages/domain` and `packages/chain` import nothing from `react`, `next`, `node:*`, or the DOM. Enforced by ESLint `no-restricted-imports` (`packages/config/eslint/pure-package.js`) and a `node`-env vitest run with no DOM globals. `packages/ui` is web-only; screens are thin, so re-implementing them for native is cheap while reducer/validation/settlement math is shared verbatim.

#### `packages/domain` (~1 800 lines, ~24 files, none > 200)

```
src/
├─ brand.ts                      # APP_NAME, TAGLINE — the one replaceable-name file
├─ constants.ts                  # USDC_DECIMALS, MIN_STAKE, MAX_STAKE, FEE_BPS, DISPUTE_BOND_BPS,
│                                # CLAIM_WINDOW_SECONDS=172800, REFEREE_TIMEOUT_SECONDS=604800,
│                                # ACCEPT_WINDOW_SECONDS, MIN_DEADLINE_LEAD_SECONDS
├─ types/{bet,ids,money}.ts      # Bet, BetFormat, BetState, DecisionMode, Outcome; branded ids; UsdcAmount (bigint)
├─ money/usdc.ts                 # parse/format/toBaseUnits/fromBaseUnits, no floats
├─ money/settlement.ts           # calculateSettlement(), calculateDisputeBond()  ← single source of truth
├─ schemas/{draft,referee,waitlist,bet-row}.ts
├─ state/machine.ts              # canTransition(), nextState(), allowedActions(state, viewerRole, now)
├─ state/viewer.ts               # resolveViewerRole(bet, wallet) → creator|opponent|referee|observer
├─ draft/{reducer,actions,selectors}.ts   # pure reducer, new objects only
├─ text/contract-sentence.ts     # renderContractSentence(draft|bet)
├─ text/copy.ts                  # UI copy keys (no "gamble/odds" — lint-checked, T0.9)
├─ hash/terms.ts                 # hashTerms(text, salt) → 32-byte hex (WebCrypto-compatible)
└─ analytics/events.ts           # AnalyticsEvent union + event name constants
```

#### `packages/chain`

```
src/
├─ types/{result,errors,adapter,wallet,io}.ts
├─ mock/{mock-adapter,mock-store,latency,failure-injection}.ts
├─ devnet/{devnet-adapter,pdas,decode,confirm}.ts + instructions/
├─ factory.ts                    # createChainAdapter(mode) — the only place mode is branched
└─ index.ts
```

#### `packages/ui`

Tokens, primitives and patterns come from **`DESIGN.md`** (canvas #0f1014, acid #c9ff3f, loss #ff5c4d, Unbounded + IBM Plex Mono, pill buttons, 1px hairlines, the bet card anatomy band → terms → sides → receipt rows, the stamp).

```
src/
├─ tokens.ts                     # exported from DESIGN.md values, also as CSS vars
├─ primitives/                   # Button, PillButton, HoldButton, Card, Sheet, Input, MoneyInput,
│                                # ProgressDots, Chip, Countdown, Skeleton, ErrorBanner, Toast, Stamp
├─ patterns/                     # WizardShell, ContractSentence, BetCard, PayoutBreakdown, StateChip,
│                                # ShareSheet, DevnetBanner, FormatCard
└─ index.ts
```

### 2.2 `apps/web` folder structure

```
apps/web/
├─ next.config.ts · tailwind.config.ts · playwright.config.ts · vitest.config.ts
├─ middleware.ts                 # attribution cookie + security headers only
└─ src/
   ├─ app/
   │  ├─ layout.tsx              # <PrivyProvider>, <AnalyticsProvider>, DevnetBanner
   │  ├─ page.tsx                # S0 landing
   │  ├─ opengraph-image.tsx     # default site card
   │  ├─ (marketing)/{how-it-works,where-money-goes,waitlist,legal/{terms,privacy}}/page.tsx
   │  ├─ new/{layout,page,terms/page,format/page,deadline/page,judge/page,review/page}.tsx
   │  ├─ b/[id]/{page,loading,not-found,opengraph-image,twitter-image,accept/page,share/page}.tsx
   │  ├─ r/[token]/page.tsx      # S10 referee invite
   │  └─ api/{health,webhooks/privy,webhooks/telegram}/route.ts
   ├─ server/
   │  ├─ actions/{create-bet,accept-bet,record-claim,join-waitlist,claim-referee-role,track-event}.ts
   │  ├─ auth/privy.ts
   │  ├─ db/{client,bets.repo,users.repo,waitlist.repo,events.repo}.ts
   │  ├─ ratelimit.ts
   │  └─ errors.ts               # ActionResult<T> { ok, data, error }
   ├─ components/{wizard,bet,auth,waitlist}/
   ├─ lib/{chain,analytics,env}.ts + og/{fonts,card}.tsx
   └─ assets/fonts/*.ttf
```

**Server actions vs API routes:** server actions for everything our UI triggers (create/accept/claim/waitlist/track) — zod at the boundary, return `ActionResult<T>`, never throw to the client. API routes only for third parties and infra (`webhooks/privy`, `webhooks/telegram`, `health`); verify signatures before parsing bodies. OG image is the file convention, not a route.

### 2.3 Data model (Supabase / Postgres)

Migrations `supabase/migrations/0001_extensions.sql` … `0013_triggers.sql` (extensions, enums, users, bets, participants, claims, disputes, waitlist, events, views, indexes, rls, triggers).

**`users`** — `id uuid pk` · `privy_did text unique not null` · `wallet_address text unique` · `handle citext unique` · `display_name` · `avatar_url` · `telegram_user_id bigint unique` · `email citext` · timestamps.

**`bets`** — row id **is** the on-chain `bet_id` (uuid → 16 bytes), so `/b/<uuid>` deterministically derives the PDA.
`id uuid pk` · `short_code text unique` (8-char base58) · `creator_id → users` · `format bet_format` · `terms text` · `terms_salt text` · `terms_hash text` · `stake_creator bigint` · `stake_opponent bigint default 0` · `decision_mode` · `referee_id → users null` · `referee_ref text null` · `referee_invite_token_hash` · `beneficiary_kind` · `beneficiary_id` · `opponent_id` · `opponent_ref` · `accept_token_hash` · `deadline timestamptz` · `accept_deadline` · `claim_window_ends_at` · `referee_deadline` · `state bet_state default 'draft'` · `outcome` · `fee_bps int` · `chain chain_network` · `bet_pda` · `vault_pda` · `create_tx` · `accept_tx` · `settle_tx` · timestamps.
Checks: stake between 1_000_000 and 100_000_000; `format='bet' or stake_opponent=0`; `format='bet' or decision_mode='referee'`; `deadline > created_at`; `referee_id is distinct from creator_id`.

**`participants`** — `bet_id`, `user_id`, `role`, `wallet_address`, `status`, `stake_amount`, `joined_at`, `unique (bet_id, role)`.
**`claims`** — `bet_id`, `claimant_id`, `outcome`, `note`, `evidence_url` (1.1), `tx`, `window_ends_at`, one live claim per bet.
**`disputes`** — `bet_id`, `claim_id`, `disputer_id`, `bond_amount`, `reason`, `state`, `resolver_id`, `resolution`, `resolved_at`, `tx`.
**`waitlist`** — `email citext unique`, `handle`, `position` (sequence), `source`, `ref_code`, `utm jsonb`, `country`, `ip_hash` (sha256 + pepper), `ua_hash`.
**`events`** — `name`, `session_id`, `user_id`, `bet_id`, `props jsonb`, `ref_code`, `created_at`; index `(name, created_at)`.

**RLS:** enabled everywhere. Privy is a third-party auth provider (JWKS) so `auth.jwt()->>'sub'` = Privy DID. `users`: select/update own row only; inserts server-side. `bets`: base table readable only by participants; public access via **`bets_public` view** (no emails, third-party wallets, tokens, salt); **all writes through server actions with the service-role key** after zod + authorization in `*.repo.ts`. `waitlist`/`events`: insert-only for anon, no select. Service-role key only under `src/server/`; ESLint bans importing `server/db/client.ts` from client components.

### 2.4 The `ChainAdapter` interface (`packages/chain/src/types/adapter.ts`)

```ts
export type ChainNetwork = 'mock' | 'devnet' | 'mainnet-beta';

export type Result<T, E = ChainError> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export type ChainErrorCode =
  | 'WALLET_NOT_CONNECTED'
  | 'USER_REJECTED'
  | 'INSUFFICIENT_USDC'
  | 'INSUFFICIENT_SOL'
  | 'NO_TOKEN_ACCOUNT'
  | 'BET_NOT_FOUND'
  | 'INVALID_STATE'
  | 'NOT_AUTHORIZED'
  | 'ALREADY_ACCEPTED'
  | 'DEADLINE_NOT_REACHED'
  | 'WINDOW_CLOSED'
  | 'VALIDATION_FAILED'
  | 'SIMULATION_FAILED'
  | 'RPC_UNAVAILABLE'
  | 'TX_TIMEOUT'
  | 'TX_DROPPED'
  | 'UNKNOWN';

export interface ChainError {
  readonly code: ChainErrorCode;
  readonly message: string; // user-safe
  readonly retriable: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown; // never surfaced to the UI
}

export interface WalletPort {
  // implemented by Privy (web) and Privy Expo later
  readonly address: WalletAddress | null;
  signAndSendTransaction(tx: UnsignedTransaction): Promise<Result<TxSignature>>;
  signMessage(message: Uint8Array): Promise<Result<Uint8Array>>;
}

export interface AdapterCapabilities {
  readonly permissionlessSettle: boolean;
  readonly disputeBond: boolean;
  readonly faucet: boolean;
  readonly explorer: boolean;
}

export interface ChainAdapter {
  readonly network: ChainNetwork;
  readonly capabilities: AdapterCapabilities;

  getUsdcBalance(owner: WalletAddress): Promise<Result<UsdcAmount>>;
  getBet(betId: BetId): Promise<Result<OnChainBet | null>>;
  getBets(betIds: readonly BetId[]): Promise<Result<readonly OnChainBet[]>>;
  watchBet(betId: BetId, onChange: (bet: OnChainBet) => void): Unsubscribe;
  quoteCreateBet(input: CreateBetInput): Promise<Result<BetQuote>>;
  explorerUrl(signature: TxSignature): string | null;

  createBet(input: CreateBetInput, wallet: WalletPort): Promise<Result<CreateBetReceipt>>;
  acceptBet(input: AcceptBetInput, wallet: WalletPort): Promise<Result<TxReceipt>>;
  cancelBet(input: CancelBetInput, wallet: WalletPort): Promise<Result<TxReceipt>>;

  submitClaim(input: SubmitClaimInput, wallet: WalletPort): Promise<Result<ClaimReceipt>>;
  confirmClaim(input: ConfirmClaimInput, wallet: WalletPort): Promise<Result<SettlementReceipt>>;
  disputeClaim(input: DisputeClaimInput, wallet: WalletPort): Promise<Result<TxReceipt>>;
  refereeResolve(
    input: RefereeResolveInput,
    wallet: WalletPort,
  ): Promise<Result<SettlementReceipt>>;

  // permissionless (anyone may call; bet2fun principle)
  settleUncontested(
    input: { readonly betId: BetId },
    wallet: WalletPort,
  ): Promise<Result<SettlementReceipt>>;
  refundExpired(
    input: { readonly betId: BetId },
    wallet: WalletPort,
  ): Promise<Result<SettlementReceipt>>;

  // devnet only
  requestTestUsdc?(owner: WalletAddress, amount: UsdcAmount): Promise<Result<TxReceipt>>;
}
```

Supporting shapes (`types/io.ts`, all `readonly`): `CreateBetInput { betId, format, termsHash, stakeCreator, stakeOpponent, deadlineUnix, acceptDeadlineUnix, opponent?, referee?, beneficiary?, inviteHash, refereeInviteHash? }` · `BetQuote { pot, feeBps, feeAmount, winnerReceives, networkFeeLamports, rentLamports, needsUsdcAccount }` · `CreateBetReceipt = TxReceipt & { betPda, vaultPda }` · `SettlementReceipt = TxReceipt & { outcome, winner, paidToWinner, feePaid, bondReturnedTo? }` · `TxReceipt { signature, slot?, confirmedAt, simulated: boolean }` — `simulated: true` in mock mode is what hides explorer links. `OnChainBet` is produced through a zod parse in both adapters.

**Contract tests:** `packages/chain/src/__tests__/adapter.contract.ts` — a suite parameterized by adapter factory; both `MockChainAdapter` and `DevnetChainAdapter` must pass (devnet opt-in via `CHAIN_E2E=1`).

### 2.5 Anchor program design (Phase 1 — design only)

Program `sporim`, Anchor, SPL Token USDC.

**`Config`** — PDA `[b"config"]`: `admin`, `treasury`, `usdc_mint`, `fee_bps: u16`, `dispute_bond_bps: u16`, `min_stake`, `max_stake`, `paused`, `bump`.

**`Bet`** — PDA `[b"bet", bet_id]`, `bet_id: [u8;16]` = client UUIDv4 = Supabase row id = URL slug.

```
bump, vault_bump
bet_id: [u8;16]
format: BetFormat            // Bet | Commit | Dare
state: BetState              // Open | Active | Claimed | Disputed | Resolved | Refunded | Cancelled
creator: Pubkey
opponent: Option<Pubkey>     // None = "whoever opens the link", gated by invite_hash
referee: Option<Pubkey>      // None allowed only for Bet with mutual decision
beneficiary: Option<Pubkey>  // Commit: where the stake goes on failure
mint: Pubkey
stake_creator: u64, stake_opponent: u64
terms_hash: [u8;32]
invite_hash: [u8;32]         // sha256(accept_secret)
referee_invite_hash: [u8;32] // sha256(referee_secret) — late referee binding
fee_bps: u16                 // SNAPSHOT at creation
treasury: Pubkey             // snapshot
created_at, accept_deadline, deadline: i64
claim: Option<Outcome>       // CreatorWins | OpponentWins | Draw
claim_by: Option<Pubkey>
claim_window_ends: i64       // claimed_at + 48h
referee_deadline: i64        // disputed_at + 7d
dispute_bond: u64
disputer: Option<Pubkey>
```

Fixed space (no `Vec`/`String`) → deterministic rent. **Vault** — SPL token account at PDA `[b"vault", bet_id]`, authority = `Bet` PDA.

#### Instructions

| #   | Instruction                  | Signer                                | Key constraints                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ---------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `initialize_config(...)`     | admin                                 | one-time; `fee_bps ≤ 1000` (hard cap — the community's stated ceiling)                                                                                                                                                                                                                                                                                                                  |
| 2   | `update_config(...)`         | admin                                 | cannot raise `fee_bps` above 1000; existing bets unaffected                                                                                                                                                                                                                                                                                                                             |
| 3   | `set_paused(bool)`           | admin                                 | pauses `create_bet`/`accept_bet` only — **never** refunds or settlements                                                                                                                                                                                                                                                                                                                |
| 4   | `create_bet(args)`           | creator                               | `!paused`; `mint == usdc`; `min ≤ stake_creator ≤ max`; `stake_opponent == stake_creator` for Bet, `== 0` otherwise; `deadline > now + 900` and `< now + 365d`; `accept_deadline ≤ deadline`; referee required for Commit/Dare; `referee ∉ {creator, opponent, beneficiary}`; `opponent != creator`; `beneficiary != creator` for Commit; transfers `stake_creator` → vault. → **Open** |
| 5   | `accept_bet(secret?)`        | opponent                              | `Open`; `now < accept_deadline`; pinned opponent or `sha256(secret) == invite_hash`; `signer != creator`; transfers `stake_opponent`. → **Active**                                                                                                                                                                                                                                      |
| 6   | `claim_referee_role(secret)` | referee-to-be                         | `sha256(secret) == referee_invite_hash`; `referee.is_none()`; signer ∉ participants; `Open` or `Active`                                                                                                                                                                                                                                                                                 |
| 7   | `cancel_bet()`               | creator                               | `Open`; refunds creator, no fee. → **Cancelled**                                                                                                                                                                                                                                                                                                                                        |
| 8   | `expire_unaccepted()`        | **anyone**                            | `Open`; `now ≥ accept_deadline`; refunds creator. → **Cancelled**                                                                                                                                                                                                                                                                                                                       |
| 9   | `submit_claim(outcome)`      | creator \| opponent \| (Dare: target) | `Active`; `now ≥ deadline`; for Commit/Dare only the staking party (Commit: creator; Dare: target) may claim success; `claim_window_ends = now + 48h`. → **Claimed**                                                                                                                                                                                                                    |
| 10  | `confirm_claim()`            | other party                           | `Claimed`; `signer != claim_by`; atomic payout. → **Resolved**                                                                                                                                                                                                                                                                                                                          |
| 11  | `dispute_claim()`            | other party                           | `Claimed`; `now < claim_window_ends`; `referee.is_some()`; transfers bond; `referee_deadline = now + 7d`. → **Disputed**                                                                                                                                                                                                                                                                |
| 12  | `settle_uncontested()`       | **anyone**                            | `Claimed`; `now ≥ claim_window_ends`; pays the claimed outcome. → **Resolved**                                                                                                                                                                                                                                                                                                          |
| 13  | `referee_resolve(outcome)`   | referee                               | `Disputed`; `now < referee_deadline`; `Draw` → refund both + bond back, **zero fee**; else payout + bond to the dispute winner. → **Resolved**                                                                                                                                                                                                                                          |
| 14  | `refund_expired()`           | **anyone**                            | (a) `Disputed` and `now ≥ referee_deadline` → refund both + bond to disputer; (b) `Active` and `now ≥ deadline + 14d` and no claim → refund both. **Zero fee.** → **Refunded**                                                                                                                                                                                                          |
| 15  | `close_bet()`                | creator                               | terminal; vault == 0; closes vault + bet, rent → creator                                                                                                                                                                                                                                                                                                                                |

#### Money rules

- `u128` arithmetic, `checked_*` everywhere, no `as` casts on balances.
- `pot = stake_creator + stake_opponent + dispute_bond`.
- **Fee only on net winnings** (recommended, see Q1): `net_won = payout_base − winner_own_stake`; `fee = floor(net_won × fee_bps / 10_000)`; `winner_receives = payout_base − fee`. $20/$20 Bet → fee $0.60, winner $39.40; successful Commit → fee $0; won Dare → target receives $19.40.
- `dispute_bond = clamp(pot × bond_bps / 10_000, 1 USDC, 25 USDC)`.
- Fee → `bet.treasury` (snapshot) via a checked treasury ATA.

#### State machine

```
create_bet → Open ──cancel_bet / expire_unaccepted──▶ Cancelled [creator refunded]
             Open ──accept_bet──▶ Active ──refund_expired (no claim by deadline+14d)──▶ Refunded
             Active ──submit_claim (now ≥ deadline)──▶ Claimed
             Claimed ──confirm_claim | settle_uncontested (claim+48h)──▶ Resolved [payout − fee]
             Claimed ──dispute_claim (bond, now < claim+48h)──▶ Disputed
             Disputed ──referee_resolve(winner)──▶ Resolved [bond → dispute winner]
             Disputed ──referee_resolve(Draw)──▶ Refunded [no fee]
             Disputed ──refund_expired (disputed+7d)──▶ Refunded [bond → disputer]
             terminal ──close_bet──▶ accounts closed, rent → creator
```

**Invariants:** from every non-terminal state at least one _permissionless_ path reaches a terminal state in bounded time; vault balance == `stake_creator + stake_opponent + dispute_bond` until a terminal transition and `0` after; outgoing transfers sum to the vault balance; `fee ≤ 10%` of net winnings; refunds never charge a fee.

#### Edge cases handled

1. Referee has no wallet at creation → `referee_invite_hash` + `claim_referee_role`.
2. Opponent has no wallet at creation → `opponent: None` + `invite_hash`; secret in the URL fragment; UI states "Anyone with this link can accept".
3. Both silent forever → `refund_expired` (anyone, incl. our cron).
4. Referee silent → 7-day timeout → refund both, bond returned. Never a payout to the platform.
5. Recipient has no USDC ATA → `init_if_needed`, payer = tx fee payer (~0.002 SOL, documented).
6. Frozen/delegated token accounts → transfer fails atomically; typed error.
7. Conflicting claims → first `submit_claim` wins the window; disagreement = `dispute_claim`.
8. Zero-stake party wants to dispute → needs `MIN_BOND` (Q2).
9. Self-dealing referee → constraint at creation and in `claim_referee_role`.
10. Clock → `Clock::get()?.unix_timestamp` only.
11. Rounding → fee floors; remainder to the user.
12. Config changes mid-bet → snapshotted `fee_bps`/`treasury`.
13. Duplicate `bet_id` → PDA `init` fails; client regenerates once.
14. `max_stake` ($100 Phase 1) enforced on-chain.
15. Paused → creation blocked, every exit path open.

### 2.6 Privy configuration notes

- `@privy-io/react-auth` + Solana extension; `PrivyProvider` mounted once in `layout.tsx` via `components/auth/Providers.tsx`.
- `loginMethods: ['email','google','apple']`, `embeddedWallets: { solana: { createOnLogin: 'users-without-wallets' } }`, `walletChainType: 'solana-only'`, `appearance` themed from `DESIGN.md`, `legal` URLs.
- **Email OTP is default and most prominent** (no OAuth screen on video; works everywhere).
- `useWallet.ts` wraps `signAndSendTransaction` into a `WalletPort`. **No Privy import anywhere in `packages/`.**
- Server: `@privy-io/server-auth`; `server/auth/privy.ts` verifies the identity token (pin cookie name/helper against Privy docs at implementation time — do not guess).
- User sync: `api/webhooks/privy` (signature-verified) + lazy upsert in create/accept actions.
- Gas sponsorship / funding widgets: Phase 1.
- Wizard renders login-dependent UI only after `ready === true` (no flash on the reel take).

### 2.7 Environment variables (names only; `.env.example` committed)

```
NEXT_PUBLIC_APP_URL · NEXT_PUBLIC_APP_ENV · NEXT_PUBLIC_CHAIN_MODE
NEXT_PUBLIC_PRIVY_APP_ID · NEXT_PUBLIC_PRIVY_CLIENT_ID · PRIVY_APP_SECRET · PRIVY_WEBHOOK_SIGNING_KEY
NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPABASE_ANON_KEY · SUPABASE_SERVICE_ROLE_KEY · SUPABASE_DB_URL · SUPABASE_JWT_ISSUER
NEXT_PUBLIC_SOLANA_CLUSTER · NEXT_PUBLIC_SOLANA_RPC_URL · SOLANA_RPC_URL · HELIUS_API_KEY
NEXT_PUBLIC_PROGRAM_ID · NEXT_PUBLIC_USDC_MINT · NEXT_PUBLIC_TREASURY_ADDRESS
NEXT_PUBLIC_FEE_BPS · NEXT_PUBLIC_DISPUTE_BOND_BPS · NEXT_PUBLIC_MAX_STAKE_USDC
FAUCET_KEYPAIR (devnet, server) · ADMIN_KEYPAIR_PATH (local only)
NEXT_PUBLIC_POSTHOG_KEY · NEXT_PUBLIC_POSTHOG_HOST · SENTRY_DSN · NEXT_PUBLIC_SENTRY_DSN
UPSTASH_REDIS_REST_URL · UPSTASH_REDIS_REST_TOKEN · IP_HASH_PEPPER · OG_IMAGE_SECRET
TELEGRAM_BOT_TOKEN · TELEGRAM_WEBHOOK_SECRET (Phase 1)
```

`src/lib/env.ts` parses with zod at module load and **throws at boot**; no `process.env.X!` elsewhere (ESLint rule).

### 2.8 What is mocked in Phase 0

| Concern                                                     | Phase 0                                                                        | Real in       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------- |
| Anchor program                                              | `MockChainAdapter`, in-memory + mirrored to `bets`                             | M5 / Phase 1  |
| USDC transfers & balances                                   | Simulated; $100 seeded per session                                             | M5            |
| Tx signatures                                               | `mock_<base58(sha256(betId+action))>`, `simulated: true`, **no explorer link** | M5            |
| Tx latency                                                  | Deterministic 900–1800 ms, seedable                                            | M5            |
| Failure modes                                               | `?mockFail=` injection                                                         | M5            |
| Referee resolution / dispute + bond / permissionless settle | UI present, actions disabled                                                   | Phase 1       |
| On-ramp                                                     | Devnet faucet button                                                           | Phase 1       |
| Telegram bot / AI judge                                     | Not built                                                                      | Phase 1 / 1.1 |
| Fee                                                         | Real `calculateSettlement` in every mode — the numbers on the reel are honest  | —             |

**Integrity rule for the reel:** any shot with a visible Solana explorer link must be recorded in **devnet mode** (M5). Mock mode always shows a "Simulated" chip.

### 2.9 Telegram bot touchpoints (Phase 1)

grammY webhook at `api/webhooks/telegram` (secret-token verified), driven by a `notifications` outbox table: `bet_created` → creator (share button) · link opened in a group → inline card + Accept deep link · `bet_accepted` → creator · `deadline − 2h` → both · `deadline` → "Who won?" with three inline buttons · `claim_submitted` → other party (48 h) · `claim_window − 6h` reminder · `dispute_opened` → referee · `referee_deadline − 24h` reminder · `resolved`/`refunded` → all with amounts + tx link.

---

## 3. Task list

**[REEL]** = prerequisite for shooting the reel. Each task ≤ 1 day. Test note mandatory.

### M0 — Scaffold & design system (3–4 days)

| id               | Task                                                                                                                                                                    | Deps        | Test note                                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T0.1** [REEL]  | Init pnpm workspace at repo root; `.gitignore` for `node_modules/.next/.env.local/target`; Windows: `git config core.longpaths true`, Node 22, pnpm.                    | —           | `pnpm -r install` succeeds; CI `bootstrap` job on `windows-latest`                                                                                             |
| **T0.2** [REEL]  | `packages/config`: tsconfig/eslint/tailwind/prettier presets incl. the `no-restricted-imports` purity rule.                                                             | T0.1        | A fixture importing `react` from `packages/domain` must fail `pnpm lint`                                                                                       |
| **T0.3** [REEL]  | `packages/testing`: vitest setup, Testing Library, `freezeTime`, factories `makeBetDraft/makeBet/makeUser`.                                                             | T0.2        | Factories produce schema-valid objects                                                                                                                         |
| **T0.4** [REEL]  | Root `vitest.workspace.ts` + coverage thresholds (domain 90%, chain 85%, web 60%, global 80%).                                                                          | T0.3        | Build fails on an intentionally uncovered fixture                                                                                                              |
| **T0.5** [REEL]  | `packages/domain`: `brand.ts`, `constants.ts`, `types/*`, branded id/money types.                                                                                       | T0.2        | Brand guards reject bad inputs; `UsdcAmount` rejects negatives/non-integers                                                                                    |
| **T0.6** [REEL]  | `money/usdc.ts` + `money/settlement.ts` (`calculateSettlement`, `calculateDisputeBond`).                                                                                | T0.5        | **Table-driven**: 3 formats × {creator wins, opponent wins, draw, refund} × {5,10,25,99.99}; fee never on refund; rounding favors the user; no float artifacts |
| **T0.7** [REEL]  | `schemas/{draft,referee,waitlist,bet-row}.ts`.                                                                                                                          | T0.5        | Valid/invalid matrix incl. 281/9-char terms, stake `0`/`100.001`/`1e2`, past deadlines                                                                         |
| **T0.8** [REEL]  | `state/machine.ts` + `state/viewer.ts`.                                                                                                                                 | T0.5        | Exhaustive state × role × time-bucket table (~90 cases); property: no state has an empty action set for every role                                             |
| **T0.9** [REEL]  | `draft/` reducer + selectors + `text/contract-sentence.ts` + `text/copy.ts`.                                                                                            | T0.7        | Reducer returns new refs; sentence snapshots for 9 draft shapes; **lint test: `copy.ts` contains none of `gamble                                               | odds | bookie | casino`** |
| **T0.10** [REEL] | `packages/ui` tokens from `DESIGN.md` + primitives (Button, PillButton, HoldButton, Card, Sheet, Input, MoneyInput, ProgressDots, Chip, Countdown, ErrorBanner, Stamp). | T0.2        | `HoldButton` fires only after 800 ms and cancels on pointerup; `MoneyInput` rejects `e/-/+/3 decimals`; a11y names                                             |
| **T0.11** [REEL] | `packages/ui` patterns: `WizardShell`, `ContractSentence`, `BetCard`, `PayoutBreakdown`, `StateChip`, `FormatCard`, `DevnetBanner`.                                     | T0.10, T0.9 | `PayoutBreakdown` renders exactly `calculateSettlement` output                                                                                                 |
| **T0.12** [REEL] | Scaffold `apps/web` (Next 15, TS strict, Tailwind), `lib/env.ts`, root layout, fonts (Unbounded, IBM Plex Mono).                                                        | T0.11       | `env.ts` throws on a missing var; `pnpm build` in CI                                                                                                           |
| **T0.13**        | CI: install → typecheck → lint → unit+coverage → build → Playwright; `windows-latest` install/typecheck leg.                                                            | T0.12       | A failing branch goes red                                                                                                                                      |
| **T0.14** [REEL] | Playwright config + fixtures (mock chain seeded, deterministic clock, `?mockFail=` helpers), mobile project 390×844.                                                    | T0.12       | Smoke spec: `/` shows the devnet banner                                                                                                                        |
| **T0.15**        | Supabase project (dev), CLI, migrations `0001`–`0003`, `seed.sql`.                                                                                                      | T0.1        | `supabase db reset` in CI; tables/enums exist                                                                                                                  |

### M1 — Create flow (3–4 days)

| id              | Task                                                                                       | Deps        | Test note                                                              |
| --------------- | ------------------------------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------- |
| **T1.1** [REEL] | `/new` layout: `WizardShell` + `DraftProvider` + `sessionStorage` + step guard.            | T0.12, T0.9 | Provider round-trips storage; deep-link redirect                       |
| **T1.2** [REEL] | **S1** terms screen.                                                                       | T1.1        | 9 chars → disabled + reason; 281 → blocked; reload preserves           |
| **T1.3** [REEL] | **S2** format cards + stake presets + custom + live `PayoutBreakdown`.                     | T1.2, T0.11 | Bet/$25 → values asserted against `calculateSettlement`, not literals  |
| **T1.4** [REEL] | **S2b** Commit beneficiary + Dare copy + "one-sided needs a referee" lock.                 | T1.3        | Commit without beneficiary blocked; `decisionMode` forced to `referee` |
| **T1.5** [REEL] | **S3** deadline chips + `datetime-local` + TZ label + timeline explainer.                  | T1.3        | `deadlineSchema` DST boundaries; "Tomorrow" > now                      |
| **T1.6** [REEL] | **S4** judge screen + self-referee guard.                                                  | T1.5        | Own handle as referee → inline error                                   |
| **T1.7** [REEL] | **S5** review: sentence, breakdown, `HoldButton`, pending/error (FakeWalletPort until M3). | T1.6, T0.11 | Hold 800 ms → pending → success; release at 400 ms does nothing        |
| **T1.8** [REEL] | Wizard analytics events.                                                                   | T1.7        | Typed event names only                                                 |
| **T1.9**        | Error boundary + `not-found` for `/new/*`; crash never loses the draft.                    | T1.1        | Forced render error → recovery keeps draft                             |

### M2 — Bet page, OG card, accept (3–4 days)

| id               | Task                                                                                                                                                   | Deps       | Test note                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| **T2.1** [REEL]  | Migrations `0004`–`0007` + `0011` + `0013`.                                                                                                            | T0.15      | Migration test + `bet-row.ts` parse of a real row                                                                       |
| **T2.2** [REEL]  | `server/db/{client,bets.repo,users.repo}.ts`.                                                                                                          | T2.1, T0.7 | Supabase test container: create → read → transition; invalid row → typed `RepoError`                                    |
| **T2.3** [REEL]  | Action `create-bet.ts` (zod → auth → hash+salt → insert → `{ betId, shortCode, acceptSecret }`), idempotent on `betId`.                                | T2.2       | Twice same `betId` → one row; unauthenticated → `UNAUTHENTICATED`                                                       |
| **T2.4** [REEL]  | **S6** `/b/[id]` RSC by uuid or short code, state-aware CTA via `allowedActions`.                                                                      | T2.2, T0.8 | 7 states render the right CTA; unknown id → 404 with create CTA                                                         |
| **T2.5** [REEL]  | `bets_public` view + RLS policies.                                                                                                                     | T2.1       | **Security test**: anon cannot select `bets`, can select `bets_public`, sees no salt/tokens/emails; cannot write `bets` |
| **T2.6** [REEL]  | `/b/[id]/opengraph-image.tsx` + `lib/og` — local fonts, 3-line clamp, badge, fallback. Card uses the `BetCard` anatomy from `DESIGN.md` (band on top). | T2.4       | 200 + `image/png` for seeded / unknown / 280-char emoji terms; snapshot                                                 |
| **T2.7** [REEL]  | `/b/[id]/share` "Locked in": check, facts, copy link, `navigator.share` fallback, inline OG preview.                                                   | T2.6, T1.7 | Clipboard gets the URL; share falls back                                                                                |
| **T2.8** [REEL]  | **S8** accept screen: guards, self-accept block, race resolution.                                                                                      | T2.4       | Second browser context flips to `active`; already-accepted → specific message                                           |
| **T2.9** [REEL]  | Action `accept-bet.ts` + participants + `bet_accepted` event.                                                                                          | T2.3       | Idempotent; creator accepting rejected                                                                                  |
| **T2.10** [REEL] | **Unfurl QA checklist** across Telegram, WhatsApp, iMessage, Discord, X; cache-busting documented (`docs/qa/unfurl-checklist.md`).                     | T2.6       | `og:image` URL carries `?v=<updated_at>`                                                                                |
| **T2.11**        | `/r/[token]` referee invite + `claim-referee-role.ts` (role binding only).                                                                             | T2.2       | Wrong token → `NOT_FOUND` without leaking existence                                                                     |

### M3 — Privy + mock chain (3 days)

| id              | Task                                                                                                                    | Deps             | Test note                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------- |
| **T3.1** [REEL] | `packages/chain` types.                                                                                                 | T0.6             | `expectTypeOf` tests                                                                     |
| **T3.2** [REEL] | `MockChainAdapter` + store + latency + failure injection; same state machine and settlement math as the program design. | T3.1, T0.8       | Full lifecycle; invalid transitions → `INVALID_STATE`; deterministic latency             |
| **T3.3** [REEL] | `adapter.contract.ts` shared suite, run against the mock.                                                               | T3.2             | ≥ 25 cases covering every method and error code                                          |
| **T3.4** [REEL] | `factory.ts` + `apps/web/src/lib/chain.ts` singleton.                                                                   | T3.2             | Unknown mode throws at boot                                                              |
| **T3.5** [REEL] | Privy provider + `useWallet.ts` → `WalletPort`; email-first UI themed from `DESIGN.md`.                                 | T0.12            | User rejection → `USER_REJECTED`; Playwright with stubbed provider                       |
| **T3.6** [REEL] | Wire **S5** to `createBet` + action; resume-after-login; retry with `betId` idempotency.                                | T3.5, T3.4, T2.3 | Login mid-flow → draft intact → created; `?mockFail=user_rejected` → typed error + retry |
| **T3.7** [REEL] | Wire **S8** to `acceptBet` + balance pre-check + mock faucet.                                                           | T3.6, T2.8       | `?mockFail=insufficient_usdc` → faucet → accept                                          |
| **T3.8**        | Claim/confirm on `/b/[id]` (dispute visible, disabled).                                                                 | T3.6, T0.8       | Post-deadline claim → confirm → `resolved` with correct amounts                          |
| **T3.9** [REEL] | `server/auth/privy.ts` + `api/webhooks/privy` (signature-verified upsert).                                              | T3.5, T2.2       | Invalid signature → 401, no write; valid → idempotent upsert                             |
| **T3.10**       | `ChainErrorCode` → user copy map, exhaustive `switch` (`never`).                                                        | T3.1             | Every code has copy                                                                      |

### M4 — Waitlist, analytics, landing, deploy (2–3 days)

| id               | Task                                                                                                                                       | Deps        | Test note                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------- |
| **T4.1** [REEL]  | Migrations `0008` waitlist + `0009` events + RLS (insert-only for anon).                                                                   | T0.15       | Anon select on `waitlist` → 0 rows / denied                                   |
| **T4.2** [REEL]  | `join-waitlist.ts`: zod, normalize, honeypot, min-time, IP hash + pepper, idempotent duplicate, position.                                  | T4.1        | Duplicate → same position; honeypot → silent success, no row                  |
| **T4.3** [REEL]  | `ratelimit.ts` (Upstash) on `join-waitlist` and `track-event`.                                                                             | T4.2        | 6th call/hour → `RATE_LIMITED`; never throws                                  |
| **T4.4** [REEL]  | `WaitlistForm` + `/waitlist` + embeds on `/` and `/b/[id]`.                                                                                | T4.2, T0.10 | Submit → "You're #N"; same email twice → same message                         |
| **T4.5** [REEL]  | **S0 landing** per `DESIGN.md` hero: kicker, display-xl, paragraph, two pills, three proof chips, rotated bet card + stamp, devnet banner. | T0.11       | CTA above the fold at 390×844; LCP ≤ 2.0 s informational gate                 |
| **T4.6** [REEL]  | `/where-money-goes` with live fee math + `/how-it-works` + legal placeholders.                                                             | T4.5, T0.6  | Page numbers equal `calculateSettlement` for 3 example bets                   |
| **T4.7** [REEL]  | `middleware.ts`: attribution cookie + security headers (CSP allowlist for Privy/PostHog/RPC, HSTS, XFO, Referrer-Policy).                  | T0.12       | `/?ref=reel` sets cookie; CSP violation fails assertion                       |
| **T4.8** [REEL]  | PostHog + `lib/analytics.ts` + `track-event.ts` mirror + `docs/qa/funnel.md`.                                                              | T4.7, T1.8  | Every event carries `session_id` + attribution; unknown names fail typecheck  |
| **T4.9** [REEL]  | Vercel project, domain, env per environment, preview deploys, `/api/health`.                                                               | T0.13       | Smoke e2e on preview: `/`, `/new/terms`, seeded `/b/[id]`, its OG image → 200 |
| **T4.10**        | Sentry with PII scrubbing (no terms text, emails, or full wallet addresses).                                                               | T4.9        | Scrubber redacts a fixture with an email and a 44-char address                |
| **T4.11** [REEL] | **Reel dry run** on a real iPhone/Safari/4G; timings; `docs/qa/reel-shotlist.md`.                                                          | T4.9, T3.7  | Playwright trace asserts the timing budget                                    |

> **Reel gate:** every `[REEL]` task green. M5 not required — but any shot with a real explorer link waits for M5.

### M5 — Devnet adapter (4–5 days, after the reel)

| id        | Task                                                                                                              | Deps       | Test note                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| **T5.1**  | `packages/program` Anchor scaffold + CI toolchain cache.                                                          | T0.1       | `anchor build` yields an IDL                                                                                       |
| **T5.2**  | `Config` + `initialize_config`/`update_config`/`set_paused`.                                                      | T5.1       | Non-admin rejected; `fee_bps > 1000` rejected                                                                      |
| **T5.3**  | `Bet` + `create_bet` + vault + constraints.                                                                       | T5.2       | 12 constraint violations → distinct error codes; exact stake in vault                                              |
| **T5.4**  | `accept_bet` (pinned + secret), `cancel_bet`, `expire_unaccepted`.                                                | T5.3       | Wrong secret / self-accept rejected; expire callable by a random keypair                                           |
| **T5.5**  | `submit_claim`, `confirm_claim` (atomic payout + fee), `settle_uncontested`.                                      | T5.4       | Amounts vs a Rust port of `calculateSettlement`; pre-deadline claim rejected                                       |
| **T5.6**  | `dispute_claim`, `referee_resolve`, `refund_expired`, `claim_referee_role`, `close_bet`.                          | T5.5       | Referee silent 7 d → anyone refunds, bond returns; draw → zero fee; **vault == 0 after every terminal transition** |
| **T5.7**  | Generate TS client (Codama/IDL).                                                                                  | T5.6       | PDA derivations match `pdas.ts` for 100 random ids                                                                 |
| **T5.8**  | `DevnetChainAdapter`: builders, ATA handling, send/confirm with backoff, zod decode.                              | T5.7, T3.3 | Shared contract suite against a local validator (`CHAIN_E2E=1`)                                                    |
| **T5.9**  | Devnet deploy + `Config` init + treasury + rate-limited faucet action.                                            | T5.8       | faucet → create → accept → claim → confirm with balance assertions                                                 |
| **T5.10** | `NEXT_PUBLIC_CHAIN_MODE=devnet` on preview; explorer links; on/off-chain reconciliation job at `/api/health`.     | T5.9       | Desynced row reconciled within one cycle                                                                           |
| **T5.11** | **Fee/settlement parity**: the same 40-case table against TS `calculateSettlement`, Rust (LiteSVM), and the mock. | T5.6, T3.2 | Three-way assertion — the single most important test in the repo                                                   |

**Schedule:** M0 3–4 d · M1 3–4 d · M2 3–4 d · M3 3 d · M4 2–3 d → **reel-ready in 12–16 working days**; M5 +4–5 d after the reel.

---

## Risks

| #      | Risk                                                                                | Sev | Mitigation                                                                                                                                                                                 |
| ------ | ----------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **R1** | OG unfurl fails or caches wrong in Telegram/WhatsApp — the viral loop dies silently | 🔴  | T2.10 checklist across 5 apps before the reel; `?v=` cache-buster; branded fallback so no id yields a 500; meta-tag assertion; plain flexbox in the card (satori has no grid)              |
| **R2** | Opponent bounces at the wallet step — accept conversion < 25%                       | 🔴  | Email OTP first; silent wallet creation; balance pre-check with in-place faucet; single screen; `accept_step_*` events; fallback experiment — Dare links where the opponent stakes nothing |
| **R3** | Gambling classification — a viral reel attracts attention                           | 🔴  | Phase 0 is **devnet only, test money** (say it on screen and in the caption); commitment-first framing; banned vocabulary lint (T0.9); $100 cap on-chain; lawyer before mainnet            |
| **R4** | Mock/real divergence — the reel showed something we can't ship                      | 🟠  | Shared contract suite (T3.3); three-way settlement parity (T5.11); state machine lives in `packages/domain` only                                                                           |
| **R5** | Funds stuck / no path to a terminal state                                           | 🟠  | Every non-terminal state has a permissionless exit; invariant test (T5.6); zero fee on refunds; timeline shown before signing                                                              |
| **R6** | M0 tooling burns the week on Windows                                                | 🟠  | Anchor deferred to M5 entirely; `core.longpaths`; `windows-latest` CI leg from day one; WSL2 fallback documented for M5                                                                    |
| **R7** | Link-secret model leaks a bet to the wrong person                                   | 🟡  | UI states it plainly; `accept_deadline` default 48 h; pinned-opponent mode when the wallet is known; creator can cancel while `Open`                                                       |

---

## Open questions for the product owner

1. **Fee base.** `docs/05` says "3% of the pot". Recommendation: **3% of net winnings** (the winner's own returned stake is never taxed): $20/$20 Bet → $0.60, successful Commit → $0, won Dare → $0.60. Snapshotted on-chain — hard to change later. _Recommended: yes, net winnings._
2. **Bond for a zero-stake disputer.** In Commit/Dare the non-staking party must hold ≥ $1 USDC to dispute. (A) require the $1; (B) one free dispute per user per month tracked off-chain; (C) creator pre-funds a bond escrow at creation. _Recommended: A — simplest and spam-proof; the amount is symbolic._
3. **Reel authenticity.** Shoot on the **mock** (~5 days earlier, "simulated" chip, no explorer link) or wait for **devnet** (~1 week later, real Solscan link)? _Recommended: v1 on the mock without any explorer shot; v2 re-cut on devnet with the tx link as the hook._
4. **Referee at creation for Commit/Dare.** Mandatory third friend adds friction to the two lowest-friction formats. Accept it, or allow no-referee where a disagreement simply refunds both after the timeout (fail-closed)? _Recommended: allow no-referee with refund-on-disagreement as the default; referee optional._
5. **Waitlist vs live devnet usage** as the go/no-go number for Phase 1. _Recommended: accepted devnet bets (strong signal); waitlist secondary._

---

### Files this plan proposes creating (top-level anchors)

- `pnpm-workspace.yaml`, `vitest.workspace.ts`, `.env.example` at the repo root
- `apps/web/` · `packages/domain/` · `packages/chain/` · `packages/ui/` · `packages/config/` · `packages/testing/` · `packages/program/` (Phase 1)
- `supabase/migrations/0001_extensions.sql` … `0013_triggers.sql`
- `docs/qa/unfurl-checklist.md`, `docs/qa/funnel.md`, `docs/qa/reel-shotlist.md`

The two load-bearing pieces are the `ChainAdapter` interface (§2.4) — the only thing that lets the reel be shot before the Anchor program exists and lets Expo reuse the logic later — and `calculateSettlement` in `packages/domain/src/money/settlement.ts`, the single source of truth for every number shown in the UI, emitted by the mock, and asserted in the Rust tests (T5.11).
