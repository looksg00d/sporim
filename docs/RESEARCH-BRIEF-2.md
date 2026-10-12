# Second pass: what's left and what's new

The first brief (`docs/RESEARCH-BRIEF.md`) is done, with findings in `docs/DECISIONS.md` under
4 September. It closed three things cleanly: there is nothing to fork for escrow, USDC can be frozen
by two signatures out of four, and we don't need a dispute bond.

This brief covers what is still open **and** what appeared because of the decisions made.
Sections are ordered by risk, not by interest.

**The main change in priority.** In the first brief I counted escrow as the biggest
risk. After the answers, it isn't. Escrow is understandable engineering work where we know
what to do. Section 1 below is about what we don't know at all, and without which there
will be nobody to use the escrow.

---

## 1. How a person from Instagram gets $25 in USDC (downgraded in priority)

> **Updated 5 September.** The question turned out to have an answer that removes it entirely for
> the audience we are now targeting: **the person already has Phantom, with USDC in it.**
> Wallet sign-in became the main path (`docs/NEXT-SESSION.md`), and then no on-ramp is
> needed at all: connect, sign, done.
>
> The section stays as a fallback: it will be needed the day we want people without
> a wallet. But it is no longer where to start, and not a launch blocker. In its place the
> most expensive open question is section 3 (reconciling Rust and TypeScript) and the questions about the
> Phantom SDK in `NEXT-SESSION.md`.

A twenty-two-year-old saw a reel, opened the link in Instagram's in-app browser,
signed in with email, and got a Privy wallet. **They have zero dollars.**
A beer bet costs $25. What happens next?

If the answer is "download Phantom, buy SOL on an exchange, swap to USDC, transfer"
there is no product. No beer bet survives that.

**Questions:**

- Which **on-ramps straight into USDC on Solana** exist and what they require: Coinbase
  Onramp, MoonPay, Transak, Stripe Crypto, Ramp. For each: minimum amount,
  fee on $25 (not on $1000, on $25, where the fee can be half the amount),
  whether KYC is needed and from what threshold, which countries, whether it works inside a webview.
- Does **Privy have a built-in funding flow**, and who does it run through?
- **Apple Pay / Google Pay → USDC**: does a one-screen path exist?
- What competitors and neighbors do: how Polymarket, friend-to-friend payment apps,
  any product with small amounts and non-crypto users onboards the first money.
- **The way back.** You won $50: how do you withdraw it and what does that cost? A product you
  can't exit is not a product.
- Age limits and KYC: at what point the obligation to verify appears.

**What to bring:** a table of "provider → minimum → fee on $25 → KYC → countries →
number of screens". And an honest answer to the question: **does a path from zero to
$25 in USDC in under five minutes exist at all?** If not, that changes the whole product, and
better to know now.

---

## 2. The escrow program: not "what to fork", but how to write and verify it

There is no fork, we write it ourselves in Anchor. That's decided. The details are open, and especially how
such a thing is tested.

**Questions:**

- **What Solana programs are tested with in 2026:** LiteSVM, solana-bankrun,
  `solana-test-validator`, mollusk. What's faster, what's closer to reality, what
  works on Windows and in CI. We need a loop of seconds, not minutes, since the whole project
  is built on TDD.
- **How to fast-forward time in tests.** Half our logic is about deadlines:
  claim window, referee deadline, timeout refund. How to fake `Clock`.
- **Upgrade authority: keep or burn.** What live products do, how long until they
  burn it, how they ship fixes afterwards. This is not only security,
  it's also "who actually controls the money".
- **Arithmetic in Rust.** The fee is the floor of the net winnings, money is
  `u64`. Checked arithmetic, overflow, division: which typical bugs auditors caught in
  other people's programs.
- **How many compute units** an instruction with three or four token transfers
  (winner, treasury, referee) plus account closing eats. Do we fit in 200k per
  instruction?
- **Devnet USDC**: is there a canonical mint and faucet, or do we spin up our own?

**Where from:** `anza-xyz/kit`, `coral-xyz/anchor` (tests in the repo), LiteSVM,
`solana-program/token`, public audits (OtterSec, Neodyme, Sec3). Read the **findings
sections**, not the conclusions: typical bugs repeat.

**What to bring:** a recommended test stack with an example of "fast-forward 7 days
and check the refund", and a list of 10–15 typical bugs from audits that apply
to our shape (two-sided deposit, arbiter, deadline, fee).

---

## 3. How to guarantee Rust and TypeScript compute the same thing

Our most underrated risk. `calculateSettlement` is the single source of truth for
money, 50 tests, `bigint` in base units. The Solana program will compute
the same thing a second time, in Rust, in `u64`. **If they diverge by even one unit, the
transaction fails or, worse, pays out the wrong amount.**

**Questions:**

- How others do it: shared JSON fixture vectors that both sides run? Property-based
  tests with the same seed? Generating one implementation from the other?
- Are there tools that run one set of cases on both Rust and TS?
- Rounding: `bigint` in TS and `u64` in Rust behave the same on floor division,
  so where does it break at the edges (zero, max, odd fees)?
- How divergence is caught **before** deploy, not after.

**What to bring:** a concrete working technique with a code example. Even a simple one,
"a JSON with 200 vectors read by both tests", is fine if it's clear how it's built.

---

## 4. The funnel "reel → link → first bet"

Never researched, and it's the only growth channel. `docs/01` analyzed
comments under reels, which is about demand, not about the mechanics of the click-through.

**Questions:**

- Instagram and links in 2026: what's clickable in a reel, in stories, in a profile,
  in comments. Does external-link use cut reach?
- **Instagram's in-app browser**: what breaks in practice: cookies,
  localStorage, returning to the tab, "open in Safari". Collect a list of known
  pitfalls, not guesses.
- How to get from the webview into a normal browser without losing state.
- What actually works for products with the same shape: link → product → inviting a
  second person. Especially the **invite**: the second half of our funnel is when a
  person sends a link to a friend in a DM.
- Which metrics to measure from day one, and typical conversion rates, so we can tell
  whether ours are bad or normal.

**What to bring:** a list of known Instagram webview link problems with links to
primary sources, and a breakdown of two or three products growing through "send a link to a friend".

---

## 5. The chat card: finish what didn't close

From the first brief, message sizes and cache behavior remain unresolved for messengers. Plus a
new question appeared: how to test it.

**Questions:**

- Telegram, WhatsApp, Instagram DM, iMessage: size, weight, formats, cache lifetime,
  whether there's any way to invalidate. Last time we didn't find it, so try through
  bot developers and discussions, not only official docs.
- **How to test the OG image in CI.** We render via satori and want to catch
  regressions. Screenshot comparison? SVG path comparison? What do others do?
- Instancing Unbounded via `fonttools`: a working script and a check that the
  result has no `fvar` (last time we found the command, but not an end-to-end example
  with rendering).

---

## 6. Reminders: carried over, still open

From the first brief: `.ics` on iOS Safari with no guarantees, Web Push on iOS requires
add-to-home-screen, deliverability not established.

**Questions:**

- What actually works **without** a native app to reach a person at the moment of the
  deadline. Email is the baseline, but what's the open rate?
- Managed schedulers for one-off callbacks (EventBridge Scheduler, Cloud Tasks,
  QStash): price at our volumes, task cancellation, idempotency.
- How others solve "remind both people an hour before the deadline" when there are tens
  of thousands of users, not millions.

---

## 7. What to do when the first scandal arrives

Not researched at all, and it's what kills products about money between people.

**Questions:**

- What support load Forfeit, Beeminder and similar have: what people write, how
  often, what gets answered. From store reviews, Reddit, Twitter.
- **Wording for a loss.** "The referee ruled against you": how it's said so that the
  person doesn't go complain to their bank or the stores.
- Refunds and chargebacks: what they do when a person demands money back after
  losing. We use USDC, there's no chargeback, but the demand will come.
- What the interface says **before** a person deposits money, so there's something to
  point to afterwards. Not legal text, on-screen wording.
- Abuse: two people colluding against a third, a bet with yourself from two accounts, an
  accomplice referee. Who ran into this and what they did.

**What to bring:** real user complaints (screenshots, quotes from reviews) and how
the product answered them. That is worth more than any theory.

---

## 8. Small things that are cheaper to learn in advance

- **Storing secret links as a digest**: examples of real SQL policies, not
  recommendations. Last time we found no real implementation for our case.
- **`GET` reads, `POST` spends**: are there live examples where an invite is protected
  exactly this way, and what the intermediate confirmation screen looks like.
- **Rate limiting** on serverless without our own Redis: what people use on Vercel.
- **Analytics** that doesn't drag in personal data: we have typed events,
  none of which carries the bet text, a nickname or an amount. Where to put them so that
  this stays true.

---

## How to hand over results

Same as last time, and last time it worked great:

1. **A link plus a "what's useful here" line.** I'll read the rest myself.
2. **Direct quotes where the question is factual**: on-ramp fees, limits, iOS
   versions. A paraphrase is worse than a quote.
3. **Archive the failures.** Fourteen 403s from StickK in the last run were
   more useful than an invented summary would have been: I immediately saw what could be trusted.
4. **A negative result is a result.** "There is no on-ramp that delivers $25 in USDC
   on Solana without KYC" changes the product more than three found ones.
