# 11 · Coming back: the "my bets" screen, identity before login, and who closes the loop

> Written 2026-09-03 against `docs/05`, `docs/06`, `docs/07`, `docs/09`, `DESIGN.md`,
> `packages/domain/src/state/machine.ts` and the shipped `apps/web/src/app/new/*` wizard.
>
> **The gap.** `docs/09` has no screen that lists a person's bets and no route that could.
> It also has no notification of any kind in Phase 0 — the Telegram bot is Phase 1 and push
> is an explicit non-goal (§1.3). So a creator who closes the tab has exactly one way back:
> the link they sent someone else. But the product's whole resolution timeline (`docs/05`)
> assumes both people return at the deadline to confirm an outcome. They do not return by
> accident. The loop does not close.
>
> **What this document decides.** A `/me` route and how it is grouped (§1). How a bet is
> tied to a person before and across logins (§2). Which return mechanism ships in Phase 0
> and which do not (§3). Who moves a bet to a terminal state when nobody opens the page
> (§4). The events that tell us whether any of it worked (§5). Tasks, in `docs/09` format,
> slotted into the existing milestones (§6). Changes the existing plan needs (§7).
>
> **One-line answer.** Ship an "Add to calendar" `.ics` button and a `/me` screen; derive
> expired states instead of running a job; send three transactional emails; build no push,
> no SMS, and no bot in Phase 0.

---

## 0. The constraint that decides most of this

Phase 0 is **devnet, test money**. Nobody comes back for test money. So the Phase 0 goal is
not "get them back to settle the bet" — it is:

1. **Never dead-end a person.** A created bet must always be findable from the app itself.
2. **Prove the return mechanism physically works**, on a real iPhone, before real money
   makes the failure expensive.
3. **Measure the return rate**, so Phase 1 knows whether to buy a Telegram bot.

That ranking is what makes a two-hour `.ics` file beat a two-day push stack. Judge every
option below on _reach per unit of build cost_, not on _engagement per notification_.

---

## 1. The "my bets" screen

### 1.1 Route

**`/me`.** One route, no aliases. Short enough to type from memory, which is the point —
it is the fallback when every reminder fails. It is a client-navigable RSC page like
`/b/[id]`, `revalidate = 0`, `robots: { index: false }` (a list of someone's bets is
nobody's search result — same rule already applied to `/new` in `apps/web/src/app/new/layout.tsx`).

Entry points, in order of how people will actually arrive:

| Entry                                                                                                         | Where      |
| ------------------------------------------------------------------------------------------------------------- | ---------- |
| A deadline email or `.ics` event → `/b/[id]?src=…` → "All your bets" ghost link                               | §3         |
| Landing strip: "2 bets need you" above the hero, only when the session or device index is non-empty           | `/`        |
| Nav bar: the wordmark row already specified in `DESIGN.md` gains one `{typography.body-sm}` link, "Your bets" | every page |
| The Locked-in screen (`/b/[id]/share`), under the share buttons                                               | T2.7       |

The landing strip is the highest-value one and the cheapest: someone who remembers the
brand types the domain, not the path.

### 1.2 What it lists

Every bet where `resolveViewerRole(bet, viewer) !== 'observer'` — creator, opponent,
referee, beneficiary. Referees see the bets they judge; a beneficiary sees the Commit
they stand to receive. Ordered inside each group by **the next thing that happens**
ascending — the soonest deadline, claim-window close, or referee deadline first, not by
`created_at`. The screen's job is triage.

### 1.3 Grouping — derived, not invented

Three groups, always in this order: **Your move · Waiting on them · Done.**

The grouping must not be a second opinion about the state machine. It is a pure function
over `allowedActions`, living beside it in `packages/domain/src/state/`:

```ts
/** Actions that do not ask anything of the viewer — a creator can always share or bail. */
export const PASSIVE_ACTIONS = ['share', 'cancel'] as const satisfies readonly BetAction[];

export type BetBucket = 'needs-you' | 'waiting' | 'done';

export function betBucket(bet: Bet, role: ViewerRole, nowSeconds: number): BetBucket {
  if (isTerminal(bet.state)) return 'done';
  const actions = allowedActions(bet, role, nowSeconds);
  const demanding = actions.some((action) => !PASSIVE_ACTIONS.includes(action));
  return demanding ? 'needs-you' : 'waiting';
}
```

Two things to note, both deliberate.

**`done` reads the stored state, not the effective one.** A bet whose claim window closed
an hour ago is _logically_ resolved, but in Phase 1 the money is still in the vault until
somebody signs `settleUncontested`. That bet belongs in **Your move**, not in Done —
it is precisely the case this document exists to fix. The rule above puts it there for
free, because every timeout leaves a permissionless action in `allowedActions`:

| Stored state | Time                           | `allowedActions`        | Bucket    |
| ------------ | ------------------------------ | ----------------------- | --------- |
| `open`       | past `acceptDeadline`          | `['expireUnaccepted']`  | needs-you |
| `active`     | past `deadline` + grace        | `['refundExpired']`     | needs-you |
| `claimed`    | past `claim.windowEndsAt`      | `['settleUncontested']` | needs-you |
| `disputed`   | past `dispute.refereeDeadline` | `['refundExpired']`     | needs-you |

**`['share', 'cancel']` is passive.** An open bet nobody has accepted yet is _waiting on
them_, not on you — even though you may cancel it. Without `PASSIVE_ACTIONS` every open
bet would shout at its creator forever, which is the fastest way to make the screen
ignorable.

### 1.4 Reading a timed-out bet honestly

A companion pure function, same file, tells the row what to say:

```ts
export interface EffectiveState {
  readonly state: BetState; // what the bet already is, logically
  readonly outcome: Outcome | null;
  readonly pendingSettlement: boolean; // logically done, money not yet moved
}

export function effectiveState(bet: Bet, nowSeconds: number): EffectiveState;
```

Mapping (each row is exactly `nextState(action)` for the action the timeout permits):

| Stored        | Condition                                      | Effective   | Outcome         |
| ------------- | ---------------------------------------------- | ----------- | --------------- |
| `open`        | `now >= acceptDeadlineSeconds`                 | `cancelled` | `null`          |
| `active`      | `now >= deadlineSeconds + CLAIM_GRACE_SECONDS` | `refunded`  | `null`          |
| `claimed`     | `now >= claim.windowEndsAtSeconds`             | `resolved`  | `claim.outcome` |
| `disputed`    | `now >= dispute.refereeDeadlineSeconds`        | `refunded`  | `null`          |
| anything else | —                                              | `bet.state` | `bet.outcome`   |

**This is a read-time projection and is never persisted.** It returns a small object rather
than a patched `Bet` specifically so nobody can write it back to the row. Its value is
covered in §4: it removes the need for a scheduled job in Phase 0 entirely.

### 1.5 The row

`DESIGN.md` fixes the bet card anatomy as **band → terms → sides → receipt rows**, and it
also says one acid element per screen cluster. Eight rows with eight acid bands is drift.
So the list uses a compressed variant, `BetRow`, added to `packages/ui/src/patterns/`:

```
┌─────────────────────────────────────────────┐
│▌ BET #BXK4T9 · YOU'RE THE REFEREE           │  label-caps-sm, ink-secondary
│▌ Ты не пробежишь 10 км до воскресенья       │  Unbounded heading-md, 2-line clamp,
│▌                                            │  text-wrap: pretty
│▌ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │  1px dashed hairline-strong
│▌ 20 USDC              47h left to confirm   │  body-sm / value
└─────────────────────────────────────────────┘
   ▲ 3px accent rule, needs-you rows only
```

- Container: `{colors.surface}`, 1px `{colors.hairline}`, `{rounded.md}` (14px), ≥ 88px
  tall, the whole row is the tap target.
- **The band becomes a 3px left rule in `{colors.accent}`, and only on `needs-you` rows.**
  It keeps the band's language — state by color — without eight acid bars competing.
  Waiting rows have no rule; done rows get a 1px `{colors.hairline-strong}` rule.
- Caps line: `BET #<shortCode>` left; on the right the state word from `STATE_COPY`, or the
  viewer's role when it is not `creator` (`YOU'RE THE REFEREE`, `THEY CHALLENGED YOU`).
- Terms in Unbounded `{typography.heading-md}`, clamped to two lines. The terms _are_ the
  headline — `DESIGN.md` is explicit — so they are not demoted to mono here.
- Receipt line: stake left in `{typography.body-sm}` `{colors.ink-secondary}`; the clock
  right in `{typography.value}`.
- **Coral appears only when money is leaving this viewer.** Their 48 h to confirm running
  out, their last window to claim a win — those go `{colors.loss}`. A counterparty's
  window closing does not. This is the one place on the screen worth getting exactly
  right; it is also the most useful signal on it.
- No per-row buttons. The row opens `/b/[id]`, where `allowedActions` already drives the
  CTA (T2.4). One authorization path, not two.

Group headers: `{typography.label-caps}` in `{colors.ink-secondary}` with the count in
`{colors.ink-faint}`. **Your move** gets a leading 8px acid dot; the other two get nothing.
**Done** is collapsed behind a `button-ghost` "Show settled (N)" so the screen holds four
things, per the whitespace rule. One radial acid glow at 0.14 alpha sits behind the first
`needs-you` row and nowhere else. Motion: one `rise` on the first group, +150 ms on the
second; nothing else animates.

Copy for the headers, in voice: `YOUR MOVE` · `WAITING ON THEM` · `SETTLED`.

### 1.6 Empty state

```
No bets yet.
Make one and send it to a friend.
[ Make a bet ]                        ← button-primary → /new/terms
I have a bet code                     ← button-ghost → §1.8
```

Title `{typography.display-md}`, line `{typography.body}` in `{colors.ink-secondary}`.

**No stamp here.** `DESIGN.md` says stamp text is always a rule of the product —
NO BACKING OUT, REFUNDED, PAID. "Nothing on the line" is a mood, not a rule, and putting
it in the stamp would cheapen the one element that carries the brand's weight.

### 1.7 Logged out, but this device has bets

Renders from the device index (§2.3), with a `stat-panel` strip pinned above the list:

```
ON THIS DEVICE ONLY                            ← label-caps-sm, ink-secondary
Log in with your email so these survive a
cleared browser.                               ← body-sm, ink-secondary
[ Save my bets ]                               ← button-secondary → Privy email OTP
```

Rows render identically but carry no actions — tapping opens `/b/[id]`, which requires a
login for anything that touches money anyway, so there is no special case to write.

**A logged-in session always wins over the device index.** Two people share a phone in this
audience; the device list is never merged into a session's list on screen, only reconciled
server-side (§2.4).

### 1.8 "I have a bet code"

A one-field lookup, `button-ghost` on the empty state and at the bottom of a populated list.
The Done screen already prints `#<shortCode>` in acid at `{typography.displaySm}`
(`apps/web/src/app/new/done/DoneScreen.tsx`), so people will have screenshotted it.

Safe because the short code and the accept token are **separate columns** in the `docs/09`
schema (`short_code` vs `accept_token_hash`): resolving a code grants a _read_ of the
public projection (`bets_public`), never the right to accept. Rate-limit it through the
existing `ratelimit.ts` (T4.3) at 10/IP/hour and return one generic not-found for both
"wrong" and "does not exist" — the same non-leaking shape T2.11 already specifies for
`/r/[token]`.

---

## 2. Identity before login

### 2.1 The decision

**Privy DID is the only key of record. The device is a recovery hint with a short life and
no authority.**

`users.privy_did` is already `unique not null` in the `docs/09` schema and `bets.creator_id`
already points at `users`. For a logged-in viewer, `/me` is a plain indexed query. Nothing
new is needed for the happy path — the work is entirely in the seams around it.

### 2.2 Close the seam instead of bridging it

The largest source of orphaned bets is a design choice, not a browser limitation. S5 AC4 in
`docs/09` currently reads _"Not authenticated → Privy modal → embedded wallet created
silently → flow resumes on the same step."_ That permits four screens of work before any
identity exists.

**Recommendation: make login blocking, immediately before the press-and-hold, and require
the email path.** Then no bet row can exist without a `privy_did` and a verified email, and
§3 has an address for every creator. Cost: nothing — it is where the modal already appears.
Benefit: the device index stops being load-bearing and becomes a nicety.

The price of that is a real hazard: the OTP round-trip. On iOS a person leaves Safari for
Mail, and can return to a **new tab**. The draft lives in `sessionStorage`
(`apps/web/src/features/draft/storage.ts`), which is per-tab and per-sitting — the comment
in that file argues for it correctly on a shared-phone privacy basis, and it is exactly
wrong for this one moment.

**Mitigation, narrow on purpose:** mirror the draft to `localStorage` under
`sporim.draft.resume.v1` with a stored `expiresAt` 30 minutes out, written only when the
Privy flow starts, read only when `sessionStorage` is empty _and_ the return URL carries
`?resume=1`, and deleted on the first successful read. A shared phone leaks a draft for at
most half an hour, to a person who would have to guess the URL parameter.

### 2.3 The device index (the fallback)

Two halves, because they fail differently.

**Client half — `localStorage['sporim.mine.v1']`:** an array of
`{ betId, shortCode, role, createdAtSeconds }`. Written the moment `create-bet` or
`accept-bet` returns. No terms, no amounts, no names — just enough to fetch `bets_public`.
Capped at 50 entries, oldest evicted. Read/write wrapped in try/catch exactly as
`storage.ts` already does ("private-mode Safari and locked-down browsers throw on access").

**Server half — cookie `sporim_device`:** 128 random bits, `httpOnly`, `Secure`,
`SameSite=Lax`, long `Max-Age`, set in `middleware.ts` next to the attribution cookie it
already writes (T4.7). Persisted as `bets.device_id` and `participants.device_id`. This is
what lets the _server_ answer "what did this browser create" when `localStorage` is gone.

Why both: the client half renders `/me` instantly with no session and no round-trip; the
server half survives a `localStorage` clear and can be reconciled at login.

### 2.4 Reconciliation at login

On the first authenticated request after a login, the server takes the `sporim_device`
cookie, finds rows with that `device_id` and a null or non-matching `user_id`, and binds
them to the DID **only when the row has no bound user yet**. Never re-bind a bet that
already belongs to someone. Emit `device_bets_recovered` (§5) with the count and whether
it matched. Then clear the client index — the session is now the source of truth.

### 2.5 Failure modes, concretely

| #   | Failure                                                                                                                                    | Effect                                                                                                           | What we do                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **Two DIDs, one human.** Email OTP on the phone, Google on the laptop. Privy may mint separate accounts unless linking is configured.      | Silent. Two half-empty lists, no error anywhere. **The worst one on this list.**                                 | Keep email OTP the only prominent method (already the plan, §2.6 of `docs/09`); configure Privy account linking so a verified email matches an existing account; **verify against Privy's current docs at implementation time — do not guess**, same rule the plan already applies to its cookie helper. Detect it in the wild via `device_bets_recovered` with `outcome: 'orphaned'`. |
| F2  | **Storage cleared / different browser / no cookie.**                                                                                       | Logged-out `/me` is empty even though bets exist.                                                                | The code lookup (§1.8) and the email receipt (§3) are the two recoveries. This is the argument for shipping the receipt email even though nobody reads receipts.                                                                                                                                                                                                                       |
| F3  | **Shared phone.** B opens the app after A used it.                                                                                         | Device index would show A's bets to B.                                                                           | A session always overrides the device index; the index is cleared on logout and after reconciliation; index rows carry no terms or amounts, only ids.                                                                                                                                                                                                                                  |
| F4  | **Safari ITP.** WebKit expires script-writable storage (`localStorage`, `document.cookie`) after a period of no interaction with the site. | The device index quietly empties on the exact users who never come back — the population we are trying to reach. | Treat the device index as a bridge measured in days, never a store of record. This is the structural reason §2.2 forces login early rather than leaning on the device.                                                                                                                                                                                                                 |
| F5  | **Opponent accepts a Dare/Commit and stakes nothing.**                                                                                     | They still have a bet on the line reputationally and still must confirm an outcome.                              | `resolveViewerRole` already returns `opponent` for them regardless of stake; nothing to change. Listed only because it is easy to filter them out by accident when writing the query.                                                                                                                                                                                                  |
| F6  | **Cookie set but no bet ever created.**                                                                                                    | Harmless empty index.                                                                                            | No action; do not treat the cookie as a user record and do not write a `users` row for it.                                                                                                                                                                                                                                                                                             |

---

## 3. Getting them back at the deadline — with no push and no app

Six options, each judged on reach, build cost, and ongoing cost.

### 3.1 Email — **ship it**

We have the address for anyone who logged in with email OTP, which after §2.2 is every
creator and every opponent.

- **Reach:** the highest available. It is also the only channel that survives a lost device.
- **Build cost:** ~0.5 day for a sender integration (Resend or Postmark; one new env var,
  neither is in the `docs/09` env list yet) plus an idempotent `notifications` outbox table.
  The real cost is **calendar time, not effort**: SPF/DKIM/DMARC on the sending domain and a
  warm-up period before anyone trusts it.
- **Ongoing cost:** free at Phase 0 volumes on any of the usual senders' free tiers.
- **Real risk to name:** a Russian-speaking audience lands in mail.ru and yandex.ru, which
  are unforgiving toward new sending domains. Set up domain auth on day one of M4, not on
  the day of the reel. Send from a subdomain so a bad start does not poison the root.
- **Three messages, no more:**
  1. **At creation** — the receipt. Contains the link, the terms, the deadline, and the
     `.ics` attachment. _This message is the durable "my bets" screen for everyone who never
     opens the site again, which is why it ships even if nobody reads the other two._
  2. **On accept** — "Даня is in." The one email people actually want; it is also the proof
     the loop closed.
  3. **Deadline − 2 h** — "Who won?" with one link.

  Not a fourth. Every additional message trades reach on the three that matter.

### 3.2 Calendar invite / `.ics` at creation — **ship it, and ship it first**

A `GET /b/[id]/reminder.ics` returning a VCALENDAR with `DTSTART` at deadline − 2 h, the
terms in `SUMMARY`, the bet URL in `URL` and `DESCRIPTION`, and a `VALARM` at the event.
An "Add to calendar" `button-secondary` on `/b/[id]/share` and on `/b/[id]`.

- **Reach:** opt-in, one tap. Lower than email — but it fires **on the device the person
  actually looks at, through an app they already trust**, with no consent flow, no
  permission prompt, no sending reputation and no third party.
- **Build cost:** ~2–4 hours. A pure string function in `packages/domain` (no I/O, no React
  — it satisfies the purity rule) plus a route handler. Nothing to operate.
- **Ongoing cost:** zero.
- **Weaknesses, honestly:** we cannot observe whether the alarm fired, only that the file
  was fetched and that a visit later arrived with `?src=cal`. iOS Safari hands an `.ics`
  to Calendar cleanly; Android varies by which calendar app is default and some in-app
  browsers will do nothing at all. Escape the terms per RFC 5545 (commas, semicolons,
  newlines) or a bet containing a comma silently corrupts the event.
- **Why it ranks first on cost/benefit:** it is the only option in this list that
  _interrupts the person at the right moment_ while costing nothing to run.

### 3.3 Telegram deep link — **keep the contract, defer the bot**

This audience lives in Telegram; §2.9 of `docs/09` already designs the touchpoints. Per
notification it would beat everything above.

- **Build cost:** a milestone, not a task — bot registration, a signature-verified webhook,
  the outbox, and a linkage between a Telegram user id and a Privy DID that the person has
  to perform. That linkage step is its own funnel and it will leak.
- **Verdict for Phase 0: no bot.** But there is a one-line subset worth taking now: on the
  Locked-in screen, under the share buttons, **"Send it to yourself too — that's your way
  back."** The share sheet already exists; Saved Messages is a chat like any other; this
  costs a string and turns Telegram into a personal bookmark with zero infrastructure.

### 3.4 PWA install + web push — **defer; ship the manifest only**

- **Reach:** on iOS, web push requires Add to Home Screen first (16.4+). For an audience
  arriving from a link, that is a large ask placed at the worst moment. Android/Chrome is
  easier but is not where this audience is concentrated.
- **Build cost:** manifest, service worker, VAPID keys, a subscription table, a sender, a
  permission-request moment that does not poison the create flow, and a debugging surface
  that fails silently on exactly the devices you cannot reproduce. Multiple days.
- **Verdict:** not Phase 0 — and this agrees with the existing non-goal. **But add
  `manifest.webmanifest` and a maskable icon now** (~1 hour, no service worker). It costs
  almost nothing, it keeps Add to Home Screen looking deliberate rather than broken, and it
  removes the disqualifying work from Phase 1's critical path.

### 3.5 SMS — **no**

We do not have a phone number; Privy email OTP does not collect one; asking for one on
screen five of a five-screen flow is precisely the friction this product exists to remove.
Per-message cost is real, and RU/CIS delivery adds sender-ID registration on top. Wrong on
cost _and_ on friction, which is rare enough to be decisive.

### 3.6 Browser Notification API — **no, and it is the trap**

`Notification.requestPermission()` plus a timer only fires while a page is open. The
Notification Triggers API (`showTrigger`), which would have scheduled a local notification
for a future date, never shipped beyond a Chrome origin trial and is not available on iOS
at all. Without a service worker and a push service there is no way to wake a closed page.
It _looks_ free and is worth nothing at deadline distances. Spending an afternoon proving
this is the most likely way to lose a day in M4.

### 3.7 Ranking

| #   | Mechanism                           | Reach                          | Build cost                | Ongoing              | Phase 0                     |
| --- | ----------------------------------- | ------------------------------ | ------------------------- | -------------------- | --------------------------- |
| 1   | **`.ics` at creation**              | opt-in, one tap                | ~2–4 h                    | zero                 | **ship**                    |
| 2   | **Email (3 messages)**              | everyone with a login          | ~0.5 d + DNS lead time    | free at this volume  | **ship**                    |
| 3   | "Send it to yourself" copy on share | whoever reads it               | one string                | zero                 | **ship**                    |
| 4   | `/me` + landing strip               | anyone who remembers the brand | ~1.5–2 d                  | zero                 | **ship** (§1)               |
| 5   | Telegram bot                        | highest per notification       | a milestone               | a webhook to operate | Phase 1                     |
| 6   | PWA + web push                      | low on iOS                     | multiple days             | a push service       | Phase 1 (manifest only now) |
| 7   | SMS                                 | high, if we had a number       | integration + per-message | per message          | no                          |
| 8   | Notification API                    | zero at deadline distance      | a wasted afternoon        | —                    | no                          |

**What I would ship in Phase 0: 1, 2, 3, 4 — and nothing else.**

**If forced to one thing: the `.ics` button.** It is hours of work, has no infrastructure,
no deliverability risk and no consent flow, and it is the only item on the list that
reaches the person at the deadline without requiring them to remember we exist. `/me` is
the one that must exist regardless — it is where every other mechanism points — but it
only helps a person who has already decided to come looking.

---

## 4. What happens if nobody comes back

### 4.1 Phase 0: nobody needs to. Derive it.

In mock mode there is no vault and no transaction — a "timeout" is a row whose `state`
column has gone stale. The state machine already takes `now` as an input, so the read path
can simply be correct:

- `/b/[id]` and `/me` render through `effectiveState(bet, now)` (§1.4).
- `allowedActions` is unchanged and already time-aware.
- **No cron, no scheduled function, no keeper in Phase 0.**

Cost: one pure function and its test table. This is the cheapest correct mechanism
available and it should be built in M0 where the rest of the state machine lives.

The only thing left is a **reconciliation sweep** so the stored column eventually agrees
with the projection — needed because the OG image, the funnel queries and any future
export read the column, not the projection. That sweep is the same job as the email sender
(§4.3), so it costs nothing extra.

### 4.2 Phase 1: someone must sign

Once USDC sits in a PDA, a projection moves no money. The permissionless instructions
(`expireUnaccepted`, `settleUncontested`, `refundExpired`) are callable by anyone, which
means somebody has to actually call them.

**The primary path is not a keeper — it is self-interest.** Every one of those actions has
a party who profits from calling it:

| Action              | Who profits                            |
| ------------------- | -------------------------------------- |
| `expireUnaccepted`  | the creator — their stake comes back   |
| `settleUncontested` | the claimant — they get paid           |
| `refundExpired`     | both sides — both get their stake back |

So the mechanism that actually closes the loop is §3: bring the motivated party back and
let their tap send the transaction. **A keeper is a safety net for the unmotivated case,
not the main road.** Design it that way and its uptime stops being critical.

### 4.3 The keeper: one route, one cron, once a day

**Recommendation: a Vercel Cron entry in `vercel.json` hitting `GET /api/keeper`.**

- **Why a daily tick is enough:** every window in this product is coarse — 48 h accept,
  48 h claim, 7 d referee, 14 d grace (`packages/domain/src/constants.ts`). Nothing needs
  minute precision, so the cheapest scheduler available is sufficient. (Vercel Cron's
  minimum interval depends on plan tier — check yours before assuming minutes are free.)
- **What it does, in order:** find rows where `effectiveState(bet, now).state !== bet.state`;
  in Phase 0, update the column and stop; in Phase 1, additionally submit the one
  permissionless instruction that state permits, then update from the confirmed
  transaction. Then enqueue the deadline emails due in the next window.
- **Cost:** one serverless invocation a day. On-chain, the Solana base fee is 5 000 lamports
  per signature plus any priority fee — negligible at any Phase 1 volume. **The dominant
  cost is operational, not financial:** a hot keypair on a server that has to be funded,
  monitored and rotated.
- **Constraints, all of them load-bearing:**
  - The keypair holds **SOL for fees only** — never USDC, never any admin authority. Worst
    case if it leaks: someone settles bets that were going to settle anyway.
  - **Idempotent.** Keyed on `(bet_id, action)`; a second run in the same window is a no-op.
    Two overlapping invocations must not double-send.
  - **Capped per run** (e.g. 100 bets), so an RPC outage or a decoding bug cannot drain the
    float in one pass.
  - **Kill switch** via an env flag, and an alert when the SOL balance drops below a floor.
  - **Authenticated.** The route rejects any caller without the cron secret; it is an
    infra endpoint, which is exactly the category `docs/09` §2.2 reserves API routes for.
  - It calls **only** the three permissionless instructions. It never decides an outcome,
    never resolves a dispute, and never touches a bet a human could still act on.

### 4.4 Alternatives considered

| Option                                                                                                                    | Verdict                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase `pg_cron` + Edge Function                                                                                        | Works, and sits next to the data. Rejected only because it adds a second runtime to operate for a job that is one HTTP handler. Revisit if the app ever leaves Vercel.                                                             |
| A third-party Solana keeper network                                                                                       | No. The obvious candidate (Clockwork) shut down; making liveness of user funds depend on someone else's uptime contradicts the bet2fun principle `docs/08` cites — that anyone can close a bet if we disappear.                    |
| Client-side opportunistic settle: any visitor to `/b/[id]` whose wallet is connected is offered the permissionless action | **Do this too, it is free.** It already falls out of `allowedActions` returning `settleUncontested` to every role. Surface it as a `button-secondary` "Release the money" rather than hiding it because the viewer is not a party. |
| Nothing at all                                                                                                            | Acceptable in Phase 0 (test money), unacceptable the day mainnet opens. Which is why §4.1 and §4.3 are separate rows in §6.                                                                                                        |

---

## 5. The measurable version

### 5.1 What the current funnel cannot answer

`docs/09` §1.7 stops at `bet_accepted`. **The entire back half of the product — claim,
confirm, dispute, settle, refund — emits nothing**, so today there is no way to observe
whether anyone ever returns, or whether a single bet has ever reached a terminal state on
purpose rather than by timeout. The typed union in `apps/web/src/lib/analytics.ts` reflects
the same boundary: its last event is `bet_create_failed`.

(Separately worth flagging: the event names in `docs/09` §1.7 — `landing_view`,
`create_started`, `bet_created`, `bet_shared`, `bet_viewed` — do **not** match the shipped
union. The doc's table should be rewritten against `ANALYTICS_EVENT_NAMES`, not the other
way round.)

### 5.2 New events

Same rules as the existing file: a name union with a typed payload per event, **counts and
enums only, never terms, an email, a handle, an amount or an address**, and every name
added to `ANALYTICS_EVENT_NAMES` so the drift test in `analytics.test.ts` stays exhaustive.
Payload types are imported from `@sporim/domain` wherever one already exists — the file
already does this for `BetFormat`, `DecisionMode`, `WizardStep`.

```ts
import type {
  BetAction, BetBucket, BetFormat, DecisionMode, ViewerRole, WizardStep,
} from '@sporim/domain';

export type ReturnChannel = 'calendar' | 'email' | 'share_link' | 'direct';
export type ReturnAge = 'lt1h' | 'lt24h' | 'lt7d' | 'gte7d';
export type ReminderKind = 'created' | 'accepted' | 'deadline_soon';
export type MyBetsSource = 'nav' | 'landing' | 'email' | 'calendar' | 'share' | 'direct';

// …appended to the existing AnalyticsEvent union
  | { readonly name: 'my_bets_viewed'; readonly source: MyBetsSource;
      readonly needsYou: number; readonly waiting: number; readonly done: number }
  | { readonly name: 'my_bets_row_opened'; readonly bucket: BetBucket }
  | { readonly name: 'return_visit'; readonly via: ReturnChannel; readonly since: ReturnAge }
  | { readonly name: 'calendar_added'; readonly where: 'share' | 'bet_page' }
  | { readonly name: 'reminder_sent'; readonly kind: ReminderKind }
  | { readonly name: 'reminder_clicked'; readonly kind: ReminderKind }
  | { readonly name: 'device_bets_recovered'; readonly count: number;
      readonly outcome: 'matched' | 'orphaned' }
  | { readonly name: 'bet_action_taken'; readonly action: BetAction; readonly role: ViewerRole }
```

Notes on three of these:

- **`bet_action_taken`** is one event for the whole back half, typed off the existing
  `BET_ACTIONS` and `VIEWER_ROLES` unions. Eight separate event names would drift; one
  event with a domain-typed enum cannot.
- **`return_visit.since` is a bucket, not an hour count.** A raw elapsed time on a
  low-volume dataset is weakly identifying; four buckets answer the question and nothing else.
- **`my_bets_viewed` carries the three group counts**, which makes the empty state
  derivable — so there is no separate `my_bets_empty` event to keep in sync.

### 5.3 Joining a return to a creation

A return visit is by definition a new session, so `session_id` cannot join it to
`bet_create_succeeded`. Use PostHog `identify()` on login — with
**`sha256(privyDid + PEPPER)`, not the DID itself**, matching the `ip_hash` + pepper
convention `docs/09` already sets for the waitlist. That gives a stable join key without
handing the analytics store a directly linkable identifier.

`?src=` on every outbound link (`cal`, `email`, `share`) is what populates
`return_visit.via`; `middleware.ts` already reads and persists attribution parameters
(T4.7), so this is one more key in the same cookie, not a new mechanism.

### 5.4 Two rows for the §1.7 metrics table

| Step                                                      | Event                                                                     | Target (14 days after the reel) |
| --------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------- |
| Creator returns within 7 days                             | distinct identities with `return_visit` ÷ distinct `bet_create_succeeded` | **≥ 25%**                       |
| Accepted bets reaching a terminal state by a human action | `bet_action_taken` where action ∉ permissionless ÷ `bet_accepted`         | **≥ 50%**                       |

Both are stated as targets to falsify, not predictions. On devnet with test money the first
one is the number that matters: if it is near zero with a calendar reminder and an email in
place, the answer is not "build push" — it is that nothing brings people back to a bet that
does not cost them anything, and Phase 1's first real test is whether money changes that.

---

## 6. Task list

Format and conventions per `docs/09` §3: `[REEL]` marks a prerequisite for shooting the
reel, each task ≤ 1 day, test note mandatory.

### M0 — Scaffold & design system (additions)

| id               | Task                                                                                                                                                  | Deps | Test note                                                                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **T0.16** [REEL] | `state/effective.ts`: `effectiveState(bet, now)`, `betBucket(bet, role, now)`, `PASSIVE_ACTIONS`, `BetBucket`. Pure, exported from `packages/domain`. | T0.8 | Table over 8 states × 5 roles × 4 time buckets; property: any bet past every window buckets `needs-you` for both parties; `effectiveState` result is never assignable to a persisted `Bet` (type-level test) |
| **T0.17**        | `calendar/ics.ts`: `buildReminderIcs(bet, { url, leadSeconds })` → VCALENDAR string. Pure — no `node:*`, no DOM (purity rule from T0.2).              | T0.5 | RFC 5545 escaping of `,` `;` `\n` in terms; `DTSTART` in UTC at deadline − 2 h; 280-char emoji terms produce a parseable file; line folding at 75 octets                                                     |

### M2 — Bet page, OG card, accept (additions)

| id               | Task                                                                                                                                                                                   | Deps              | Test note                                                                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T2.12** [REEL] | `BetRow` in `packages/ui/src/patterns/` per §1.5: compressed card, 3px accent left rule on `needs-you` only, 2-line terms clamp, coral only for the viewer's own closing window.       | T0.11, T0.16      | Renders each bucket; exactly one accent element per row; a counterparty's closing window is never coral; row is ≥ 88px and a single tap target                                                    |
| **T2.13** [REEL] | `/me` route: RSC list for a logged-in viewer, three groups in order, `Done` collapsed, sorted by next-event ascending, empty state. `robots: noindex`.                                 | T2.12, T2.4, T2.2 | A bet in each of the 8 states lands in the documented group; referee and beneficiary see their bets; empty state renders the create CTA; ordering asserted against a fixture with mixed deadlines |
| **T2.14**        | Device index `sporim.mine.v1` (localStorage, ≤50 entries, ids only) written on create and accept; `/me` renders it when logged out with the "on this device only" strip.               | T2.13, T2.9       | Written on create; a throwing storage degrades to the login prompt without an error screen; a session overrides the index; index holds no terms or amounts                                        |
| **T2.15**        | `sporim_device` cookie in `middleware.ts` + `device_id` on `bets`/`participants` (migration `0014`) + reconciliation on first authenticated request, emitting `device_bets_recovered`. | T2.14, T4.7, T2.1 | Same browser before and after login → one list, no duplicates; a row already bound to another user is never re-bound; a second person's login clears the client index                             |
| **T2.16** [REEL] | `GET /b/[id]/reminder.ics` + "Add to calendar" `button-secondary` on `/b/[id]/share` and `/b/[id]`; URL in the event carries `?src=cal`.                                               | T0.17, T2.7       | `text/calendar` with a filename; unknown id → 404, never a 500; terminal bets serve no file; the `URL` field round-trips to the bet page                                                          |
| **T2.17** [REEL] | Entry points: "Your bets" link in the nav, "N bets need you" strip on `/` when the session or device index is non-empty, "All your bets" on `/b/[id]/share`.                           | T2.13             | Strip hidden with zero bets; the count equals the `needs-you` group size; no strip flash before hydration                                                                                         |
| **T2.18**        | Short-code lookup on `/me` (§1.8): read-only, rate-limited, generic not-found.                                                                                                         | T2.13, T4.3       | Unknown and malformed codes return the identical message; 11th lookup in an hour is rate-limited; the response exposes no accept token, salt or email                                             |
| **T2.19**        | Copy on `/b/[id]/share`: "Send it to yourself too — that's your way back."                                                                                                             | T2.7              | Present in the copy module and passing the banned-vocabulary lint (T0.9)                                                                                                                          |

### M3 — Privy + mock chain (additions and one change)

| id               | Task                                                                                                                                                                                                                         | Deps        | Test note                                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T3.11** [REEL] | **Change S5 AC4:** login becomes blocking before the press-and-hold, email OTP the primary path. No bet row may be created without a `privy_did`.                                                                            | T3.5, T1.7  | An unauthenticated hold opens Privy and never reaches `createBet`; `create-bet` rejects a request with no DID; the wizard renders no login-dependent UI before `ready === true` |
| **T3.12** [REEL] | Draft resume mirror `sporim.draft.resume.v1` (localStorage, 30-min `expiresAt`), written when the Privy flow starts, read only when `sessionStorage` is empty and the URL carries `?resume=1`, deleted on first read.        | T3.11, T1.1 | OTP round-trip in a _fresh tab_ restores the draft and the step; an expired mirror is ignored and removed; a mirror is never read while `sessionStorage` has a draft            |
| **T3.13**        | Configure and document Privy account linking so Google/Apple with a verified email resolve to the existing DID; record the verified behaviour in `docs/qa/identity.md`. **Pin against Privy's current docs — do not guess.** | T3.9        | Two login methods, one email → one `users` row; a mismatch is caught by a repo-level unique constraint rather than silently duplicating                                         |

### M4 — Waitlist, analytics, landing, deploy (additions)

| id               | Task                                                                                                                                                                                                                                                                     | Deps               | Test note                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T4.12** [REEL] | Extend the analytics union with the eight events in §5.2 + `ANALYTICS_EVENT_NAMES`; wire `my_bets_viewed`, `my_bets_row_opened`, `calendar_added`, `bet_action_taken`.                                                                                                   | T4.8, T0.16, T2.13 | The names test stays exhaustive; a type test asserts no event field can hold terms, email, handle or wallet; unknown names fail typecheck                                         |
| **T4.13**        | `identify(sha256(privyDid + pepper))` on login; `?src=` → `return_visit` via the existing attribution cookie.                                                                                                                                                            | T4.12, T4.7, T3.5  | Two sessions on one identity join in PostHog; the raw DID never appears in any payload; a visit with no `src` records `direct`                                                    |
| **T4.14**        | Transactional email: sender integration, sending subdomain with SPF/DKIM/DMARC, `notifications` outbox (migration `0015`), three templates in the `DESIGN.md` voice, unsubscribe on every message. **Start the DNS on day one of M4** — it is calendar time, not effort. | T4.9, T2.1         | Outbox idempotent per `(bet_id, kind)`; a send failure retries without double-sending; the `.ics` attaches to the creation receipt; templates render with 280-char Cyrillic terms |
| **T4.15**        | `GET /api/keeper` + daily `vercel.json` cron. **Phase 0: reconciliation and email enqueue only, zero transactions.** Cron secret required; per-run cap; kill-switch env flag.                                                                                            | T4.14, T0.16       | A stale row reconciles in one run; an unsigned caller gets 401 and no work happens; a second run in the same window is a no-op; the cap is respected                              |
| **T4.16**        | `manifest.webmanifest` + maskable icon. **No service worker, no push.**                                                                                                                                                                                                  | T4.5               | Installability check passes; no service worker is registered anywhere in the bundle                                                                                               |
| **T4.17**        | Rewrite `docs/09` §1.7 against `ANALYTICS_EVENT_NAMES` and add the two rows from §5.4; extend `docs/qa/funnel.md`.                                                                                                                                                       | T4.12              | Every name in the doc exists in the union and vice versa — asserted by a test that reads both                                                                                     |

### M5 — Devnet adapter (addition)

| id        | Task                                                                                                                                                                                      | Deps        | Test note                                                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T5.12** | Keeper Phase 1 half: `/api/keeper` submits `expireUnaccepted` / `settleUncontested` / `refundExpired` through `DevnetChainAdapter` with a fee-only keypair; SOL floor alert; per-run cap. | T4.15, T5.8 | A bet past each window reaches its terminal state within one run; the keypair holds no USDC and no authority; a mid-run RPC failure leaves no partial write; two concurrent runs settle each bet once |
| **T5.13** | "Release the money" `button-secondary` on `/b/[id]` for any connected viewer when a permissionless action is allowed.                                                                     | T5.12, T2.4 | Offered to a non-party viewer; hidden while a human action is still possible; the resulting payout matches `calculateSettlement`                                                                      |

**Cost summary:** M0 +0.5 d · M2 +2.5 d · M3 +1 d · M4 +2 d · M5 +1 d ≈ **7 days**, of which
the reel-gating subset (T0.16, T0.17, T2.12, T2.13, T2.16, T2.17, T3.11, T3.12, T4.12) is
about **4 days**.

---

## 7. Changes the existing plan needs

| Where                       | Change                                                                                                                                | Why                                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S5 AC4** (`docs/09` §1.6) | "Resumes on the same step after login" → **login is blocking before the hold**.                                                       | It is the only guarantee that every bet has a DID and an email. Without it, §3 has nobody to write to and the device index becomes load-bearing — which §2.5 F4 says it cannot be.            |
| **T4.7** (middleware)       | Move earlier, or at minimum split: the `sporim_device` cookie is needed by M2, and middleware currently lands in the final milestone. | Two features now depend on a task scheduled after both of them.                                                                                                                               |
| **§1.3 non-goals**          | "Native app, **push notifications**, i18n" → "native app, **native and web push**, i18n".                                             | As written it reads as "no notifications", which would forbid the email and the `.ics` that actually close the loop. Narrow it so the right thing is not blocked by a word.                   |
| **§1.7 metrics**            | Rewrite the event column against `ANALYTICS_EVENT_NAMES`; add the two rows from §5.4.                                                 | The doc's names (`bet_created`, `bet_shared`, …) do not exist in the shipped union. A funnel assembled from names nobody emits is worse than no funnel.                                       |
| **§2.7 env vars**           | Add the transactional-email sender key, `CRON_SECRET`, `KEEPER_KEYPAIR` (Phase 1), `ANALYTICS_ID_PEPPER`.                             | `lib/env.ts` throws at boot on anything unlisted, by design.                                                                                                                                  |
| **`storage.ts`**            | Keep `sessionStorage` as primary; add the narrow `localStorage` resume mirror (T3.12).                                                | The file's own reasoning — "the draft belongs to this tab and this sitting" — is right for a shared phone and wrong for an OTP round-trip, which is when iOS most often returns to a new tab. |
| **T2.7** (`/b/[id]/share`)  | Add the `.ics` button, the "send it to yourself" line, and an "All your bets" link.                                                   | That screen is the last moment we have someone's attention with a bet that is not yet resolved. It is the cheapest place to put every mechanism in §3.                                        |
| **`DoneScreen.tsx`**        | Once T2.7 lands, fold it into `/b/[id]/share` or point it there.                                                                      | It currently offers "Start another" and "Home" and no way back to the bet — correct while `/b/[id]` does not exist, and a dead end the moment it does.                                        |

---

## 8. What this does not solve

- **A person who never logs in and loses the device.** The code lookup and the creation
  receipt are the only recoveries, and both require them to have kept something. Accepted.
- **Two Privy DIDs for one human** (§2.5 F1). Mitigated by configuration, detectable in the
  funnel, not preventable by us.
- **A referee who never accepts the role.** Out of scope here — `docs/05` already answers
  it with the 7-day fail-closed refund. Worth noting that a referee now at least _has_ a
  screen to be reminded into.
- **Whether anyone cares.** Nothing in this document makes a person want to come back to a
  bet with fake money on it. It makes it possible, and it makes the failure visible. Phase 1
  is where the money answers the question.
