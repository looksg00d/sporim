# Status

One page: what is done, what is in progress, what is next, what is waiting on you.
Updated as we go. Why a given decision was made is in [`docs/DECISIONS.md`](DECISIONS.md).

**Starting a new session? Open** [`docs/NEXT-SESSION.md`](NEXT-SESSION.md).

**Full check:** `pnpm check` (typecheck + lint + unit) · `pnpm --filter @sporim/web test:e2e`
**Green right now:** 508 unit + 84 integration (September 22, against a local Postgres
in Docker) + 87 e2e (and 1 skipped, mobile only) · dev on `localhost:3000`

**The test database is local, not the live one.** `apps/web/vitest.config.ts` loads
`.env.local` by itself, so `pnpm test` without `DATABASE_URL` in the environment writes to the production database.
Spin up your own and run everything:

```bash
docker run -d --name sporim-test-db -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=sporim -p 55433:5432 postgres:16   # first time; after that docker start
export DATABASE_URL="postgres://postgres:postgres@127.0.0.1:55433/sporim"
pnpm --filter @sporim/web migrate                    # 11 migrations on a clean database
pnpm --filter @sporim/web exec vitest run
```

The migrations create the `sporim_app` role and the `citext` extension themselves, so a plain `postgres:16`
is enough. Unit tests only, with no database at all: add
`--exclude "**/*.integration.test.ts" --exclude "**/node_modules/**"`.

**Run e2e against it too:** the bet page reads the database, and the Xata branch goes to sleep and answers
`branch is hibernated`, so two tests fail through no fault of their own. Set the same `DATABASE_URL` in the environment
before `pnpm --filter @sporim/web test:e2e` (environment variables win over `.env.local`).

**Integration tests against the database** only wake up when `DATABASE_URL` is in the environment;
without it `pnpm check` skips them and reports a smaller number. That is not a regression.

**Live:** `sporim.fun` (Vercel, Root Directory `apps/web`, rebuild ~90 s after a push to
`main`). Private repository `github.com/looksg00d/sporim`.

---

## In progress right now

- Nothing. Next is the `[NEXT]` item below.
- `[DONE]` **September 23: the link leaves the tab and brings the person back.** Four things, all
  under test (+28 units, 87 e2e green on the local database):
  - **"Send the link"** on `/b/[code]` is the share sheet on a phone and the clipboard on desktop;
    the printed link stays for webviews where neither works (`features/bet/share.ts`).
  - **OG image** `/b/[code]/opengraph-image` is the same `BetCard`, always read anonymously:
    while the bet is `open` it shows the terms, afterwards a generic card. Fonts: static TTFs from Google Fonts
    in `apps/web/assets/og/` (Cyrillic is covered), wired in through `outputFileTracingIncludes`.
    Checked on a live dev server with a real row in the database. Also found along the way: a `<>` fragment
    inside `<svg>` in `Icon.tsx` crashed satori, replaced with `<g>`.
  - **"Add the deadline to your calendar"** is an `.ics` at `/b/[code]/calendar`, participants only,
    with a one-hour alarm and a stable UID (`features/bet/calendar.ts`).
  - **"Open in Phantom"** on the landing page and on `/b/[code]` for someone else's or an open bet, only on
    a phone without an injected wallet. The deep link format was checked against the live docs on September 23.
    Deliberately not placed on `/new/*`: the draft does not survive a browser switch.
    **The iPhone check from Instagram is still on you**, the test does not cover it.
- `[DONE]` **September 23, second pass:**
  - **Deadline in the person's time zone.** The browser puts its zone in a `tz` cookie, and the server renders
    `/b`, `/me`, `/r` in it (`server/time-zone.ts`); without the cookie it falls back to UTC with a "UTC" label.
    `formatDeadlineShort` prints the weekday only within the current week and a date beyond that, so a deadline
    a month away no longer looks like "Fri".
  - **`/how-it-works`** was a 404 from the landing page's second button. Every rule is taken from the domain's
    copy tables, and the first thing it says is that the escrow is simulated.
  - **"Rematch"** on a finished bet: format, amount and referee carry over; terms, deadline and
    signature do not. No "double up". A Commit can only be repeated by the one who made the promise.
  - **OG image after review:** `no-store` (by default Next caches it for a year, so the terms
    would stay on the CDN after the bet was taken), an expired invite no longer says "take it", a database error draws
    the generic card instead of a 500, truncation by characters rather than UTF-16.
  - The e2e "every internal landing link responds" immediately found a second dead link,
    "Terms" → `/legal`. The link is removed.
- `[TODO]` **Terms of use**: there is no page, I removed the link to it. The text is up to a lawyer.
- `[TODO]` From the September 23 reviews with the scale-game, inversion and meta-pattern skills:
  - nobody triggers the timeouts (`settleUncontested`, `refundExpired`, `expireUnaccepted`); we need a
    cron, otherwise bets hang;
  - `/me` loads everything with no `limit`;
  - a no-referee disagreement between strangers: the loser always benefits from pressing "no";
  - the Rust program diverges from TS on the claim rules (`submit_claim.rs`); we need transition
    vectors modelled on the money ones before devnet.
- `[DONE]` The live check passed on September 5 on `sporim.fun` with a real session: wizard →
  bet in the database → `/me` → bet page. Works end to end.
- `[DONE]` **September 22: TS ↔ Rust money parity.** 16 shared vectors, generated from
  `calculateSettlement` and read by a Rust test through `include_str!`. CI got a Rust leg.
  Verified by corrupting a vector: Rust fails. The program is built and tested from WSL, with the cache on the Linux side:
  `cd packages/program && CARGO_TARGET_DIR=$HOME/dev/.sporim-target cargo test`.
- `[DONE]` **September 22: one transition writer.** `applyTransition` with a `where state = $from` check
  replaced four places that wrote state unconditionally, and closed the race on the permissionless timeouts.
  The loser of a race for the opponent seat now gets `CONFLICT` rather than an exception from a unique key.
  Verified on the local database: 84 integration tests green, and the race test **fails if `where state = $from` is removed**.
  I verified this by removing the guard, because its first version passed even without it.
- `[DONE]` **September 17: the wizard no longer names the opponent.** Whoever accepts the link is the
  opponent. The terms hash did not change (`opponent=null`), old drafts still load.
  Analogies and a product overview are in the [artifact](https://claude.ai/artifact/FWKV1XY5JsGM5YbLJCvtqr).
- `[DONE]` **September 17: a disagreement with no referee immediately refunds both stakes, no fee.**
  Before, you could not dispute without a referee, and a false claim won by timeout. Domain
  (`nextState(action, bet)`), repository, copy. No migration: with no referee no row is written to `disputes`,
  the trail is in `bet_events`. The dispute program does not know yet: `dispute_claim` goes first
  in the next slice. Server signature on acceptance was decided against. Both decisions are in
  `docs/DECISIONS.md`.
- `[DONE]` September 16: review by eight agents and the P0–P4 plan:
  [artifact](https://claude.ai/artifact/Hrgb4ju1GKS5PpU99g1M7z).

## Waiting on you, I can't do these for you

- `[BLOCKED]` **Rotate the secrets** that passed through chat: the database password in Xata and the
  app secret in Privy. **Urgent:** the `xata` role has `BYPASSRLS`, so the old password opens
  the whole database around the policies, and the site is live.
- `[BLOCKED]` **Decide how to pay the referee.** Right now 1% goes to the referee only if their decision
  produces a winner: in Commit only for a "fail", in Bet a draw and "can't decide" cost them money. That is a payment
  for a particular kind of verdict (review 10.1, 14.1, 17.4 in the
  [artifact](https://claude.ai/artifact/FWKV1XY5JsGM5YbLJCvtqr)). Options: the same pay for
  any decision, no pay, or the referee hands it to the winner. The money rule stays untouched
  until you answer.
- `[TODO]` **Run the new integration test** (`bets.repo.integration.test.ts`, "refunds
  both sides at once…"). It writes to the live database, so I did not run it without your "yes".
- `[BLOCKED]` **Flip the domain redirect.** Right now `sporim.fun` → `www.sporim.fun`.
  It needs to be the other way round: all of the product's growth is a link pasted into a chat, and the apex is shorter.
  Vercel → sporim.fun → Settings → Domains → make `sporim.fun` primary.
  The CLI does not manage this.
- `[BLOCKED]` **Pool vs pool**: three unanswered questions: whether stakes inside a team are equal or
  free, how the pool closes, who confirms for the team. I am not touching the domain until you answer.

## Next on the critical path to the reel

The order is strict, each item stands on the previous one.

- `[NEXT]` **Phantom browse deep link**: Instagram's webview does not inject a wallet, it has no
  extensions, so on the main traffic screen the "connect Phantom" button has nothing to connect.
  The way out is to open our site inside Phantom's browser. Check the exact link format in the live
  docs, and the return behavior by hand on a phone: the documentation does not describe it.
  Details in [`docs/NEXT-SESSION.md`](NEXT-SESSION.md).
  **First, 5 minutes on an iPhone:** the draft survives sign-in only through the same browser's `localStorage`
  (`features/draft/handoff.ts`), and Phantom's browser has its own storage. Send yourself the link
  `sporim.fun/new` in Instagram, get to the third step in it, then open from the same
  chat `https://phantom.app/ul/browse/https%3A%2F%2Fsporim.fun%2Fnew%2Freview?ref=https%3A%2F%2Fsporim.fun`.
  Empty draft → the jump into Phantom goes on the landing page, before the wizard.
- `[NEXT]` **Live check of two-person acceptance**, the one thing a test cannot cover:
  create a bet with one account, open the link in a second browser as another, sign, accept.
- `[TODO]` **OG image**, the thing that unfurls in a chat. The font story will resurface:
  there are no static TTFs for Unbounded, and satori takes variable fonts at the default weight.
- `[TODO]` **`.ics` "add to calendar"**, the cheapest thing that closes the loop. Hours of work, zero
  infrastructure, and it is the only thing that reaches a person at the moment of the deadline.

## Done

### Scaffolding and tooling

- `[DONE]` pnpm monorepo, shared tsconfig/eslint/prettier presets
- `[DONE]` CI: ubuntu + a separate windows leg + Playwright
- `[DONE]` Playwright: mobile 390×844 as a first-class target, deterministic locale and TZ
- `[DONE]` Self-hosted fonts (`tools/fetch-fonts.py`), otherwise inline styles fall back to the fallback font

### Domain: all the logic, framework-free, 266 tests

- `[DONE]` Money: bigint in base units, no floats
- `[DONE]` `calculateSettlement` is the single source of truth for the numbers
- `[DONE]` 3% fee on net winnings; getting your own stake back is not charged
- `[DONE]` Referee's share: 1% out of our 3%, only for a decision actually made
- `[DONE]` No dispute bond: disagreeing is free, a name deters, not money
- `[DONE]` A silent referee returns the money to both sides, the confirmed one too
- `[DONE]` State machine: `allowedActions` is one answer for the UI, the server and the future program
- `[DONE]` Signature: stroke points, satori-compatible, canonical form for the hash
- `[DONE]` Copy: a ban on gambling vocabulary and zero-risk promises, both under test

### Design system: 49 tests

- `[DONE]` Acid Arena tokens, inline styles for satori
- `[DONE]` `BetCard`, `MoneyFlow`, `PayoutBreakdown`, `SignaturePad`, `HoldButton`, stamp

### Bet creation: 5 screens, 150 tests, 33 e2e

- `[DONE]` Wizard with draft recovery from `sessionStorage` and a step guard
- `[DONE]` Bet and Commit formats (Dare is parked)
- `[DONE]` "Where the money goes", both branches, numbers from the domain
- `[DONE]` Finger signature plus typing a name as an equal alternative
- `[DONE]` Typed analytics: no event carries the bet text, a nickname or an amount
- `[DONE]` `FakeWalletPort` with `?mockFail=`: every error branch under e2e

### Referee confirmation: 2 migrations, 12 integration tests

- `[DONE]` `Referee.confirmedAtSeconds`: confirmed and unconfirmed are different things
- `[DONE]` Confirmation gives the right to **make a decision**, and only that: since September 4, silence
  returns the money in both branches
- `[DONE]` The check is made at the moment of the deadline: a referee can still arrive inside the bet
- `[DONE]` `createBet` zeroes the confirmation: consent comes from the referee, not from whoever named them
- `[DONE]` A separate secret in a separate table `referee_invites`, readable only by the creator
- `[DONE]` Both transitions are closed twice: a party does not judge, a referee does not take the bet
- `[DONE]` Confirmation is irreversible, by a trigger and not by agreement
- `[DONE]` `/r/[token]`: the terms, who is disputing, what the role means, 1% out of our fee
- `[DONE]` The card and review always say whether the person has accepted the role

### Database: Xata, live

- `[DONE]` Migrations as plain `.sql` with an idempotent runner and sha256
- `[DONE]` Schema: `users` · `bets` · `participants` · `claims` · `disputes` · `bet_events` · `waitlist`
- `[DONE]` RLS enabled and `FORCE`d on all tables, 18 policies, `DELETE` granted to no one
- `[DONE]` With no user context: zero rows (fail closed), checked by hand
- `[DONE]` Money across the boundary: `postgres.BigInt`, the schema rejects `number`
- `[DONE]` ESLint rule against importing `server/db/*` in client components

### Navigation and "my bets"

- `[DONE]` `/me` shows everything you take part in, including where you are the referee. Split into "your move" and
  the rest: a flat list is useless once there are more than three bets
- `[DONE]` "Your move" is computed from `allowedActions` through `needsYou`, 17 tests. Timeouts
  do not appear there: anyone can trigger them, so they are nobody's inbox
- `[DONE]` `AppHeader` on the landing page, `/b/*` and `/me`: server-rendered, reads the cookie.
  The link is either in the markup or it is not, with no flicker and no wallet SDK on the landing page
- `[DONE]` The "locked in" screen leads to the just-created bet and to the list. It was a dead end:
  you could create a bet, close the tab and have no way back from anywhere
- `[DONE]` A list read error does not look like an empty list: "you have no bets" to someone who
  has six is the worst thing this page can say
- `[NOTE]` For signed-in users the menu shows nothing except "my bets": sign out, settings and
  profile are not needed yet, and an extra menu item is an extra screen that does not exist

### Acceptance by link: migration `0011`, 19 integration tests

- `[DONE]` The short code became a capability: it opens exactly one bet, and **only while it is `open`**.
  That is the price of 46 bits: a guessed code gives the same as a leaked link, which the copy
  warns the creator about in plain words
- `[DONE]` There is no separate table, deliberately: the `0004` argument ("a token on a `bets` row
  would be readable by someone who must not read it") does not apply to the code, since it is already in `bets` and made for handing over.
  `0003` allowed exactly this path in advance
- `[DONE]` Two branches, INSERT and UPDATE: the opponent row exists only if the creator
  typed a name, and the unique key on `(bet_id, role)` does not let you combine them in one statement
- `[DONE]` The confirmation trigger grew a second arm instead of losing the first,
  exactly as the comments in `0005` and `0006` predicted
- `[DONE]` An anonymous visitor with a real code reads the terms before signing in; a nonexistent and a malformed code
  answer identically, so the page is not an oracle
- `[DONE]` The signature is required and symmetric with the creator's; it travels as JSON and is parsed on the server
  by the same schema as the restored draft
- `[DONE]` The transaction context is assembled in one function: three GUCs are always written, and in full, so
  a fourth capability cannot be applied halfway
- `[DONE]` Raw SQL probes: an outsider cannot seat themselves without the code, the code holder does not take
  the referee seat, confirmation is not revoked, and the code stops opening the bet after acceptance
- `[NOTE]` The opponent's signature is written but not yet read back: `participantRowSchema` does not
  parse it. Showing both signatures ships with the OG image, where they are needed

### Bet page: `/b/[code]`

- `[DONE]` Server rendering: the bet is read inside the request with the session, and no second copy of the
  state machine ships to the browser
- `[DONE]` Buttons are built from `allowedActions`, numbers from `calculateSettlement`. The screen cannot
  offer a move the server would reject, and cannot show an amount the server would not pay
- `[DONE]` Server actions: claim, agree, disagree, referee decision, three timeouts,
  cancel. Identity comes only from the session, permission is checked inside the transaction
- `[DONE]` Agreeing with a claim reads the outcome from the row, not from the form, otherwise one side
  would confirm something other than what it sees on screen
- `[DONE]` A non-participant and a nonexistent code answer identically: the code must not be an oracle
  for which bets exist. Under e2e
- `[DONE]` `whatHappensNext` is pulled out of the page and tested without a database: 9 tests, including
  "never announces a winner early" and "always warns that referee silence
  returns the money"
- `[FIXED]` The share link was a relative path, which cannot be pasted into a chat. Moved to
  `betUrl` and covered by tests: it is the product's only growth channel, so it deserves a test
- `[FIXED]` The page printed the code and state twice: in its own header and inside the card
- `[NOTE]` The "share" button prints the link rather than copying it: the clipboard needs a
  client component. `accept` is not drawn at all: drawing it would promise something
  the server rejects

### Sign-in and bet creation: Privy, 16 token tests

- `[DONE]` Phantom is the first button on the first screen: `walletList` plus `showWalletLoginFirst`.
  The second alone is not enough: it raises the section but not the button order inside it, and Privy's default
  is Ethereum. `'phantom'` was checked against the SDK types, not the docs

- `[DONE]` Keys checked against the live API, the app responds
- `[DONE]` An embedded Solana wallet is created for whoever arrives without one
- `[DONE]` Sign-in through Phantom is enabled (`solana_wallet_auth`)
- `[DONE]` Token verification by JWKS: `alg` pinned, `iss`, `exp`/`nbf` with no tolerance
- `[DONE]` **`aud` = our app id.** Privy signs the tokens of all apps at once; without this
  check any owner of a Privy app could mint themselves a session with us
- `[DONE]` `sub` → `app.user_id` → RLS. Identity comes only from here, and `create-bet`
  has no `did` argument and never will
- `[DONE]` The provider is mounted on `/new/*`, outside the draft: sign-in cannot unmount
  what the person is writing
- `[DONE]` The draft survives sign-in through `localStorage`: on iOS the email opens **in a new
  tab**, and `sessionStorage` is separate per tab
- `[DONE]` `create-bet` writes a real bet; a refusal comes back as data, and the text is taken from the copy table
  next to the code, so no server string reaches the person
- `[DONE]` An e2e session stub, locked to `appEnv === 'local'`: on preview and production
  the variable does nothing, and that is separately under test. It gives nothing anyway: the server
  trusts only a verified JWT
- `[NOTE]` e2e reaches the wallet through an explicit `?mock=ok`, not silently: you can only lock
  for real with a real session, and the test must not **look** as if it checked
  the server
- `[NOTE]` Email is shown first: traffic from the reel opens in Instagram's in-app browser,
  where there are no extensions and a wallet deep link loses the tab

### Escrow on Solana: first slice, live on devnet

- `[DONE]` `packages/program` is the Anchor program `sporim`, deployed to devnet
  (`EkfT8PTE7QShwtK6F7NEDgC2M3i4cGnLZhurULPVtDP2`). **Bet** format only: symmetric
  stakes, mutual confirmation, permissionless timeouts. No referee, no dispute, no
  `Commit`/beneficiary: that is the next slice. No separate `Config` account: the fee (300 bps)
  and the treasury are hardcoded constants, like `FEE_BPS` in `packages/domain/src/constants.ts`
- `[DONE]` The real cycle was verified with real devnet transactions, not a simulation:
  `create_bet` → `accept_bet` → `submit_claim` → `confirm_claim`. The on-chain settlement matched
  `calculateSettlement` bit for bit: pot 20, fee 0.3 (3% of the net winnings of 10), the winner
  got 19.7, the treasury 0.3, and the vault was emptied to zero
- `[DONE]` The vault is not a separate PDA but an ATA whose authority is the bet's own PDA: one entity
  fewer than in `docs/09` §2.5
- `[NOTE]` Tested on **my own** SPL token (6 decimals, mint authority is the admin), not on
  real devnet USDC: the escrow mechanics do not depend on which mint it is, and a public
  USDC faucet for devnet is a separate concern, not a blocker for checking the program
- `[NOTE]` The toolchain (Rust, Solana CLI, Anchor CLI) lives in WSL2 (Ubuntu-24.04), not on Windows
  itself: exactly risk R6 from `docs/09`, come true. Anchor CLI went in as a precompiled
  binary from `github.com/otter-sec/anchor` (the Anchor repository moved from `coral-xyz`);
  `sudo` was not needed at all. It would be needed only to build Anchor CLI
  from source through cargo
- `[TODO]` **`packages/chain` does not know about this program.** The `ChainAdapter` interface
  (see below) exists, but the `DevnetChainAdapter` that actually calls it does not. No server
  action (`create-bet.ts` and others) calls it: the live sporim.fun went to `chain:
'mock'` and still does. The program exists and is verified, but the product does not see it yet
- `[TODO]` The Commit format and referee/dispute on chain are the second slice. The referee token and the refund timeout
  for disputed are already designed on paper in `docs/09` §2.5, but need recomputing for the no-bond
  rules (September 4), as was done for this slice
- `[TODO]` LiteSVM tests (as in `docs/09` T5.11) are not written: correctness is confirmed
  by real devnet transactions with the numbers checked by hand, not by an automated test
  that stays in the repository

### `packages/chain`: interface, no implementation

- `[DONE]` The `ChainAdapter` types and interface (`types/{errors,wallet,io,adapter}.ts`), for the
  no-bond rules: `DisputeClaimInput` has no amount, the comments reference
  `docs/DECISIONS.md` 2026-09-04
- `[TODO]` Neither `MockChainAdapter` nor `DevnetChainAdapter` is implemented

### Research

- `[DONE]` 240 comments with likes collected and clustered
- `[DONE]` Forfeit, competitors, crypto analogues, the legal landscape
- `[DONE]` `docs/10-proof-system.md`: proof without an AI referee
- `[DONE]` `docs/11-coming-back.md`: how to bring people back without pushes

---

## Known loose ends

- `[TODO]` Static TTFs for Unbounded do not exist in google/fonts. For OG we need to
  instantiate the variable one through `fonttools`, otherwise the headings come out at the wrong weight.
- `[FIXED]` `accept` was inexpressible with `0003`, closed in `0011`. The answer turned out simpler than
  this note assumed: not a separate invites table, but the short code itself as a capability.
- `[FIXED]` **Two texts about money lied on the live site.** After the September 4 rule reversal,
  `TRUST_COPY.timeline` promised that referee silence leaves the claim standing, and
  `refereeUnconfirmed` that disputing costs a bond. The test was green because it checked
  for the presence of substrings, and they are present in the lie too. Rewritten to check meaning:
  a ban on the words deposit/bond across all the copy and the rule "the referee and 'claim stands' never in one sentence".
- `[TODO]` The funnel records nothing after `bet_create_failed`: the whole second half is unmeasured.
- `[FIXED]` The CI "Build" step was a dummy: the filters matched no project, `pnpm`
  exited with zero. Replaced with `pnpm -r build`.
- `[NOTE]` Locally `pnpm build` conflicts with a running `pnpm dev` over `.next` (EPERM).
  Solved for e2e with `NEXT_DIST_DIR=.next-e2e`; for a manual build, stop dev.
- `[FIXED]` **e2e broke on Saturdays, and had been broken like that from the start.** Five tests clicked the
  "Sunday" chip, and on Saturday it coincides in time with "Tomorrow" and gets dropped by deduplication,
  which is correct behavior and covered by its own unit test. Thirty specs failed on a timeout
  that said nothing about the cause. Replaced with `pickDeadline`. Three chips out of four can disappear:
  "Tonight" late in the evening, "Sunday" on Saturday, "In a week" on Sunday;
  the last one came out when the first attempt at a fix picked exactly it and a new test over all seven
  days of the week caught it at once. Only "Tomorrow" is unconditional.
- `[FIXED]` A side effect of two build directories: each has its own generated `routes.ts`, and
  TypeScript treated them as different types, so as soon as a route was added the e2e build failed on
  someone else's stale file. Both directories are now in `exclude` (`apps/web/tsconfig.json`).
  The price: `pnpm typecheck` no longer checks page props against the generated route union.
- `[NOTE]` You have `NODE_TLS_REJECT_UNAUTHORIZED=0` set globally: TLS certificate checking
  is off in all Node processes, including the database connection.

---

## Research

- `[NEXT for you]` [`docs/RESEARCH-BRIEF-2.md`](RESEARCH-BRIEF-2.md), the second pass.
  The main question in it is not about escrow: **how does a person from Instagram get $25 in USDC.**
  If there is no honest answer faster than five minutes, that changes the product more than everything
  else combined.

## First research: returned, sorted through

- `[DONE]` [`docs/RESEARCH-BRIEF.md`](RESEARCH-BRIEF.md) was worked through externally: 9 sections,
  100 facts with citations, 361 archived pages. The conclusions are in `docs/DECISIONS.md`.
- `[DONE]` **USDC freeze authority verified on mainnet**: it is not null, a 2-of-4 multisig,
  the mint is on classic SPL Token, `decimals: 6`. The research could not do this, closed by hand.
- `[FIXED]` The dispute bond is removed, referee silence returns the money (migrations `0009`,
  `0010`).
- `[TODO]` **Store the referee token as a digest**, not in plain text. The protection is not against guessing
  (the entropy is 187 bits) but against a database dump and a replica.
- `[TODO]` **`GET` does not spend the capability.** Telegram, WhatsApp and Slack hit the link for a preview
  before the person does. Acceptance by link: `GET` shows, `POST` spends.
- `[NOTE]` There is no escrow to fork: the best candidate covers ~40% and can be cancelled only by
  the initiator, and none has an audit. We write it on Anchor ourselves, with the timeout refund as
  a separate permissionless instruction.
- `[DONE]` The first slice is written and lives on devnet, see "Escrow on Solana" above.
