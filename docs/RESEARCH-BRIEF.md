# What to dig up before I write this

This is a brief for outside research, not a report. Each block is a question I
can't yet answer from a primary source, and that is cheaper to close with someone
else's code than with my own. Come back with any amount: links, code snippets,
screenshots, quotes from docs. I'll fold it into `docs/DECISIONS.md` and the code.

**What's not here:** product research. It's already done, in `docs/01`…`docs/11`
(Forfeit teardown, competitors, crypto analogues, pain points, proof system, return visits).
This covers only the **engineering** and **legal** layer: the "first find out who
already wrote this" step that my process prescribes but that didn't actually happen.

Priority: **1 → 2 → 7** block the money. The rest can run in parallel.

---

## 1. Escrow on Solana: the biggest thing we don't have

Right now the project runs with `chainMode=mock`: the domain computes money exactly,
but nothing exists on-chain. This is the biggest piece, and exactly the kind of task
where someone else's audited code beats my own.

**Questions:**

- Is there a ready-made "two deposits + referee + deadline + refund" program that
  can be forked instead of written? The keyword isn't "escrow" but **2-of-3 / arbiter /
  mediator**.
- Anchor or plain native/Pinocchio? Anchor costs more in compute units, but has an
  order of magnitude more audits and examples.
- How does a timeout refund work without a cron: who pays for the transaction if both
  sides stay silent? A permissionless crank that anyone can trigger and earn a cut from?
- Rent and account closing: who receives the rent when the escrow account is closed.
- Where the fee goes: a separate treasury account, or a split right in the instruction.

**Where to dig:**

- `coral-xyz/anchor`: examples in `tests/`, especially escrow.
- `solana-labs/solana-program-library`: token, associated-token-account.
- `anza-xyz/kit` (formerly `@solana/web3.js` v2): we're already on it, `@solana/kit@3`.
- `Squads-Protocol` v4: an audited multisig wallet; the "N members, threshold,
  timelock" model is interesting even if we only take the ideas.
- `gh search repos "solana escrow arbiter"`,
  `gh search code "arbiter" --language=rust`
- **Separately:** whether these programs have public audits (OtterSec, Neodyme,
  Sec3). A report on someone else's escrow takes an hour to read and saves a week.

**What to bring:** 2–3 candidates, each rated by "what percent of our task it
covers", and an answer to whether any of them has an audit.

---

## 2. USDC in practice

**Questions:**

- Who pays to create the ATA for a recipient who doesn't have one? That's a real
  amount, and our user may have no SOL at all.
- Does mainnet USDC have a freeze authority, and what does that mean for the escrow
  account? **Important question:** Circle can freeze.
- Token-2022 versus classic SPL Token: which one is USDC on, and would transfer hook
  logic break our settlement?
- Fee payer: can we pay the fee on the user's behalf (relayer / fee payer
  service), so a person without SOL can still stake?
- Does Privy have sponsored transactions, and on what terms?

**Where from:** Circle docs on USDC on Solana, Anza docs on Token-2022, Privy docs
(`docs.privy.io`) on Solana and gas sponsorship, Helius/Triton on fee payer.

**What to bring:** direct quotes from the docs, not paraphrases. Especially on freeze
authority and on who pays for the ATA.

---

## 3. Dispute resolution: other people's models

What we have now: a human referee, 1% out of our fee, and referee silence **leaves
the claim standing**. That decision came from reasoning, not from precedent. I want
to check it against other people's experience.

**Questions:**

- How an **optimistic oracle** works: claim → dispute window → bond →
  escalation. This is exactly our scheme, but theirs is proven with real money.
- What bond they take for a dispute relative to the stake, and why that size.
- What they do when the arbiter is silent. For us it's "claim stands". For them?
- Schemes with no third party at all: mutual confirmation, commit-reveal,
  "the loser confirms, otherwise they auto-lose on timeout".

**Where from:**

- **UMA Optimistic Oracle** (`UMAprotocol/protocol`) and how Polymarket uses it to
  resolve markets. The closest analogue.
- **Reality.eth / Realitio** (`RealityETH/monorepo`): question → answer with a bond →
  escalation to Kleros.
- **Kleros** (`kleros/kleros`): decentralized arbitration, juror courts.
- Augur is dead, but an analysis of _why_ is useful: dispute resolution was too
  expensive.

**What to bring:** a table of "who → how they take the bond → what happens when the
arbiter is silent → how much resolution costs". And separately, the **known ways to
break this** (griefing attacks on optimistic oracles): I want to test our scheme
against them.

---

## 4. Accepting via link: the one who isn't anyone yet

Technically the nastiest piece: the second participant opens the link, isn't yet a
party to the bet, but must get the right to accept it. We already solved this once,
the referee invite through a secret in `set_config`, migration `0004`, but I'd like to
know how others do it.

**Questions:**

- "Unguessable link = capability" patterns: token length, lifetime,
  single use, what to do when a link leaks.
- How to stop a link-preview bot from "using up" a single-use link: Telegram,
  WhatsApp and Slack fetch the URL for previews, and it's a real problem.
- RLS patterns in Postgres for "authorization by a presented secret, not by
  session". We need other people's policies specifically.

**Where from:** Supabase docs on RLS (the best collection of policies, even if we
don't need Supabase itself), the Cal.com and Documenso source (signing invite
links), `gh search code "invite_token" --language=sql`.

**What to bring:** concrete SQL policies and a fix for the link-preview problem.

---

## 5. The share card: all growth rides on it

The link is pasted into a chat. An image unfurls. That is the only growth channel.

**Questions:**

- `vercel/satori`: how people handle variable fonts. Unbounded in
  `google/fonts` has **no static TTFs**, and satori takes a variable font at its default
  weight, so the headline comes out at the wrong weight. Instancing via `fonttools`
  is the known route, but I want to see someone else's working script.
- What the preview looks like in Telegram, WhatsApp, Instagram DM, iMessage: each has
  different size requirements and a different cache. Who handles invalidation, and how.
- Are there ready-made OG templates that draw the **signature as a `<path>`**? Ours is
  stored as points precisely for satori.

**What to bring:** a working script that instances a variable font and a table of
messenger requirements.

---

## 6. Return visits without push

The product side is covered in `docs/11-coming-back.md`. This is the technical side.

**Questions:**

- `.ics` on the web: what actually works on iOS Safari. Downloading a calendar
  file from a mobile browser has historically been a sore spot.
- Web Push on iOS: from which version, under what condition (is add-to-home-screen
  required), and what share actually gets delivered.
- How others do "reminder an hour before the deadline" without their own background worker.

---

## 7. Legal: blocks launch, not code

The block where I can help least by reasoning and where a mistake costs the most.

**Questions:**

- Is a bet between two private individuals with escrow held by a third party a
  **game of chance** or not? The answer differs by jurisdiction and by whether we
  take a fee. **We take 3%**, which is probably the key fact.
- Skill versus chance: "will you run 10 km" is a bet on an outcome or a commitment
  contract? StickK has run for years and takes money. On what basis?
- Money transmitter / MSB: holding other people's funds in escrow. Does non-custodial
  (an on-chain program, keys held by the user) remove the issue?
- What Forfeit and similar products say in their ToS, and which jurisdiction they're
  incorporated in.
- App Store and Google Play, if we ever need an app: their rules on
  real-money gaming are stricter than the law.

**Where from:** the ToS of the products themselves (StickK, Beeminder, Forfeit), FinCEN
guidance on MSBs, the UK Gambling Commission on betting between individuals, law-firm
write-ups on prediction markets after the Polymarket and Kalshi history.

**What to bring:** not a legal opinion, but a list of risks and how those already
operating phrase them. In particular, **exactly how the 3% fee changes the
picture** and whether there is a model where the fee is taken differently (subscription,
paid referee) to avoid it.

---

## 8. Privy and sign-in

**Questions:**

- What sign-in looks like from the **Instagram in-app browser**, which is our main
  traffic. Email works, but what about wallets: a deep link into Phantom loses the tab.
  Who fixes this, and how.
- Embedded wallet export: what a person can actually take with them.
- Privy's cost at volume, free-tier limits.
- Alternatives if we hit a wall: Dynamic, Turnkey, Web3Auth, compared on the same
  "Instagram webview" scenario.

---

## 9. Product analogues outside crypto

Not for the mechanics, but for the **wording**. Half our job is telling
a person the truth about their money so that it doesn't scare them.

- **StickK**: commitment contracts, a referee ("supporter"), money goes to an
  anti-charity. Their wording about the referee is exactly our case.
- **Beeminder**: "slip up → you pay". How they explain the money.
- **Forfeit**: covered in `docs/02`, but we haven't read their ToS or onboarding.

**What to bring:** screenshots of the screens that explain the money and the referee's role.

---

## How to hand over the results

Put them wherever is convenient: `docs/research/` or your own folder. Format doesn't
matter: raw dumps, link lists, code snippets. Most useful:

1. **A link plus one line on "what exactly is useful here".** That's enough, I'll
   read the rest myself.
2. **Direct quotes from documentation** where the question is factual: freeze
   authority, who pays for the ATA, iOS Web Push. A paraphrase is worse than a quote here.
3. **A negative result is also a result.** "Looked for an escrow with an arbiter on
   Solana, none audited" changes the plan: it means we write our own and budget time
   for an audit.
