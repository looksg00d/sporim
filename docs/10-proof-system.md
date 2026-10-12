# 10 · Proof system (proof / evidence)

> Written 2026-09-03 as an answer to the question "what can we honestly do with proofs **before** an AI referee".
> Inputs: `docs/05` (formats and resolution), `docs/06` (240 real comments, the main input),
> `docs/02` (Forfeit's 12 verification methods), `docs/09` §2 (architecture, RLS), the domain
> `packages/domain/src/state/{machine,viewer}.ts` and `money/settlement.ts`.
>
> Terminology: **evidence** = an artifact attached to a claim. **Claim** = `submitClaim` in the state machine.
>
> **Outdated since 2026-09-04:** there is no dispute bond anymore, `bondRouting` and
> `calculateDisputeBond` are removed, and referee silence returns the money in both branches. Everything
> below that relies on the "reduced bond for a claim with evidence" (`disputeBondFor`, T6.2,
> T6.10) and on the timeout branch in `bondRouting` (the Q3 section) has to be rethought: the economic
> lever "cheaper to dispute" is gone. The idea itself, requiring evidence for a claim in your own favour, is not cancelled
> and remains strong. See `docs/DECISIONS.md`, 2026-09-04.
> Code and code comments are English, as everywhere in the repository.
>
> **Status today:** there is no evidence mechanism at all. `docs/09` §1.3 moves evidence to 1.1,
> `docs/09` §2.3 leaves a stub in the form of a single column `claims.evidence_url`. This document argues
> that (a) the minimal useful layer costs ~2–3 days and should go into Phase 0, and (b) `evidence_url`
> as a single text column is a mistake that is cheaper to fix now than to migrate later.

---

## 1. What Phase 0 can honestly do without an AI referee

### 1.1 What actually happens today

Today a claim is an enum. One side presses "I won", the other has 48 hours, silence = payout.
**Lying costs nothing.** This is not a hypothesis: in `docs/06` cluster 4 ("Cheats") is exactly about this: "put your
breakfast beside your bed and make a photo while still laying in the bed" (105 likes), "you can also
just delete the app" (133). People arrive already expecting the system to be cheated.

Without an AI referee, evidence **verifies nothing**. It does two other things, and both are useful:

1. **Gives the friend-referee something to look at.** Persona P3 from `docs/09` §1.4 ("Anya") today arbitrates
   a dispute from 280 characters of text and two mutually exclusive statements. That is not a decision, it is a
   coin toss with a human face. A single screenshot turns her job from "whom do I believe more" into "here is what happened".
2. **Changes the price of lying.** Lying with words is free. Lying with an artifact means having to fabricate it and then
   stand behind it in front of a person who knows you personally and can open the same Strava. That is a social
   price, not a cryptographic one, and for a "dispute with a friend" product it is the main one.

### 1.2 The minimum that makes a claim credible

Four properties. Fewer does not work, more is Phase 1.1.

| #   | Property      | What exactly                                                                                                                                                                                   |
| --- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Attached**  | `submitClaim` carries a payload: a required text note + 0–3 artifacts, not just an `Outcome`                                                                                                   |
| 2   | **Visible**   | The other side sees the same bytes at the same address **immediately** when the dispute window opens; the referee, when `disputed`                                                             |
| 3   | **Frozen**    | At submit time a `sha256` of each artifact and a hash of the whole bundle are computed and a server timestamp is written. The bundle is append-only and does not change after the window opens |
| 4   | **Symmetric** | `disputeClaim` carries the same kind of bundle: counter-evidence. A referee who sees one side is not a referee                                                                                 |

Property 3 is the only genuinely technical one here, and it is cheaper than everything else put
together. It closes an attack that a **friend-referee cannot detect at all**: submit a blurry
photo, get a dispute, quietly swap the file for a better one and say "it was like that from the start". A hash plus
a time make that swap visible without a single line of ML.

### 1.3 What this does NOT prove: we say it plainly, in the UI too

This is the most important subsection of the document. Everything below must be written literally on the screen, not
only here, otherwise we sell cryptographic certainty where there is none.

- **Does not prove the person in the photo is the claim's author.** Not one pixel says so.
- **Does not prove the photo is fresh.** The server time records the moment of **upload**, so it gives an
  _upper_ bound on the file's age: "this file existed in this form no later than T". There is no lower
  bound and there cannot be. A photo taken last August and uploaded today gets today's timestamp.
  The wording in the UI: **"Uploaded Sep 3, 19:04 · the file has not changed since"**, and not a word about "taken".
- **Does not prove the photo is not someone else's.** A screenshot of someone else's Strava looks identical to your own.
- **Does not prove that what the terms describe happened.** A photo of sneakers is not a run.
- **Does not prove the file is not generated.** In 2026 that is the default assumption, not an edge case.
- **The hash is not an "on-chain proof"** until it is on chain. In Phase 0 the network is a mock (`docs/09` §2.8), and the hash lives
  in Postgres. We say "recorded by us", not "recorded on the blockchain". The place where this becomes
  true is Phase 1, `submit_claim(evidence_hash)`.
- **EXIF proves nothing.** See §4.2, where I disagree with `docs/06`.

One phrase worth fixing as a product rule: **in Phase 0, evidence is not
verification, it is fixation.** We do not verify; we make sure that what was said cannot be rewritten
after the fact, and we show that to both sides.

---

## 2. Evidence types: a ranking

Axes: **cost to us** (code + storage + legal risk), **how it breaks**, **friction to submit**.
The order is by descending ratio of "trust per day spent".

### 2.1 Note: text, 0–500 characters

- **Cost:** one column, one field. Practically zero.
- **How it breaks:** lying in text is easy.
- **Why it is still first:** it is the only thing the referee actually reads, and it is what turns
  a click on an enum into a statement someone answers for. "Ran, track in Strava, link below" is already
  checkable, because it contains a checkable promise. Also it is the only type with zero
  moderation surface.
- **Phase 0:** **yes, required** for a claim in your own favour (see §5.3).

### 2.2 Link to a third-party profile/activity (Strava, Duolingo, GitHub, Letterboxd, screen-time share)

- **Cost:** store a string and render `<a rel="noopener nofollow">`. No oEmbed, no
  scraping, no OAuth. Half a day at most.
- **How it breaks:** a link to someone else's profile; a private profile (the referee sees a 404); an activity
  entered into Strava by hand; editing/deleting after the referee has looked; link rot.
- **Why it ranks high:** it is the **only type that is really more expensive to fake than a screenshot in Phase 0**,
  because the data lives with a third party that has no stake in our dispute, and the referee opens it herself,
  live. The ratio of "trust / development cost" here is the best in the whole list, and this is, in my view, the
  most underrated item in the entire proof topic.
- **Phase 0:** **yes.** Validation: `https:` only, ≤ 2048 characters, no `javascript:`/`data:`.
  Copy next to the field: "The referee will open this link. If the profile is private, they won't see anything".

### 2.3 Screenshot

- **Cost:** the same upload path as a photo (see below), it needs no separate code, but it needs
  a separate **label**, because the label sets the referee's expectations.
- **How it breaks:** trivially. There are hundreds of fake Strava/bank/screen-time screenshot generators,
  and they are free.
- **Why we take it anyway:** it is the type that covers most real disputes from `docs/05`
  (steps, a run, "didn't smoke", a screen-time limit), and it is submitted in two taps. A fake is checked
  another way: a friend can open the same app. A screenshot is strong not on its own but paired
  with a link (§2.2).
- **Phase 0:** **yes**, as `kind: 'screenshot'` of the same upload.

### 2.4 Camera photo

- **Cost:** `<input type="file" accept="image/*" capture="environment">` + normalization + a private
  bucket + TTL + moderation risk. This is the most expensive part of the Phase 0 layer, ~1.5 days of ~3.
- **How it breaks:** a photo of a screen; an old photo from the gallery (`capture` is a hint to the browser, not
  a restriction: on desktop it is ignored entirely, and on iOS the user still gets to the library);
  someone else's photo from the internet; all of cluster 4 from `docs/06`.
- **Phase 0:** **yes**, but without a single "live" promise. We do not write "take a photo now", we write
  "attach a photo". The difference is that the first is a lie and the second is the truth.

### 2.5 Video

- **Cost:** high and nonlinear. Uploading a 30-second clip from a mobile 4G fails more often than it
  succeeds; it needs a resumable upload, transcoding or a player for iPhone's HEVC/H.265, 5–10 times more
  storage bytes, and watching it takes time the referee does not have.
- **How it breaks:** not much worse than a photo. The gain in trust is small, the gain in cost is large.
- **Phase 0:** **no.** Defer explicitly. Come back when there is at least one dispute that cannot be resolved
  without video.

### 2.6 Witness (a third person confirms)

- **Cost:** a new role, a new invite token, a new route, a new notification channel, a new branch in
  `resolveViewerRole` and in the state machine.
- **Structural objection:** **a witness is a referee.** We already have a mechanism for a trusted third person
  approved by both sides, with a timeout and a fail-closed refund. Building a witness
  means building a second, weaker copy of the referee (a witness has no authority, so their confirmation
  decides nothing, so why have them).
- **Phase 0:** **no, and not in 1.1 either.** Instead, a free move: let the referee see the bundle. We are already
  going to do that, and it captures 100% of the witness's value for 0% of the cost.

### 2.7 Summary table

| Type                           | Cost to us            | How it breaks                            | Submit friction | Phase 0                   |
| ------------------------------ | --------------------- | ---------------------------------------- | --------------- | ------------------------- |
| Note                           | ~0                    | lying in words                           | minimal         | ✅ required               |
| Link                           | 0.5 day               | someone else's/private profile, editing  | low             | ✅                        |
| Screenshot                     | shared upload         | trivially faked                          | 2 taps          | ✅                        |
| Photo                          | ~1.5 days             | old / someone else's / photo of a screen | 3 taps          | ✅ without a live promise |
| Video                          | high                  | like a photo                             | high            | ❌ defer                  |
| Witness                        | high                  | collusion                                | high            | ❌ that is the referee    |
| GPS / Health / Screen Time API | very high (`docs/02`) | —                                        | —               | ❌ not Phase 0/1.1        |

---

## 3. Who sees the evidence and when

The context that makes the question nontrivial: the dispute page is reachable **by link without authentication**
(`docs/09` §2.3, public access through the `bets_public` view, `docs/09` R7, the "link-secret model").
So the text of the terms is already visible to anyone the link was forwarded to. Evidence is a strictly more
sensitive thing: a photo may contain a face, an apartment, an app balance, a list of apps in
screen time.

**Rule: evidence bytes never get into `bets_public` and are never served at a public URL.**

| Role (`resolveViewerRole`)                 | What they see                                                                                                   | When                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `creator` / `opponent`, the claim's author | their own whole bundle                                                                                          | always after submit                        |
| `creator` / `opponent`, the other side     | the whole bundle (bytes via a signed link)                                                                      | **immediately** when the 48 h window opens |
| `referee`                                  | both whole bundles + both sides' notes                                                                          | only when `state = 'disputed'`             |
| `beneficiary`                              | like "the other side", if they are also the opponent side in Commit                                             | immediately                                |
| `observer` (by link)                       | **metadata only**: how many artifacts, of which types, the time of fixation, the first 8 characters of the hash | always                                     |

Three rationales, each a product decision, not a detail:

1. **The other side sees the bundle immediately, before deciding whether to dispute.** Otherwise we ask a person to
   pay a $1–25 bond for the right to find out what they are disputing. That reliably pushes everyone into
   "dispute just in case", clogs the referee and turns the bond into a tax on caution.
2. **The referee sees only when `disputed`.** She should not have to read anything in 95% of cases (`docs/09` §1.4).
   It also minimizes the circle of people the bytes go to at all.
3. **The observer sees the fact, not the content.** "2 photos · recorded Sep 3 19:04 · a3f19c…" on the public
   card is a trust signal that works in a chat and reveals nothing. It also honestly shows the opposite:
   **"No proof attached"**, which matters more to the other side than any photo.

---

## 4. The abuse surface

### 4.1 Reused / old photo (cluster 4 of `docs/06`)

Technically not solved in Phase 0. The cheap mitigation has two layers:

- **Freezing (§1.2 item 3)** stops improving the proof after it has been disputed.
- **The freshness requirement moves into the dispute text.** We do not decide what counts as fresh, the two
  friends do at creation: "a photo of a lock screen showing today's date", "a photo with today's
  newspaper", "a Strava screenshot with the date". That costs one template chip on screen S1 and works better than any
  heuristic of ours, because the specification ends up where the sides agree on it.
  A direct parallel with `docs/06` item 68: "the 'breakfast' proof is badly designed", the problem was in the
  wording of the task, not in the verification.
- **An exact repeat detector for free:** an index on `sha256`. If the same byte-for-byte file was already
  attached to another dispute, show that to the referee as a flag. It catches only the laziest cheat and nothing
  more, but costs one index. **Flag, don't block**: legitimate matches are possible, and a
  hard refusal at upload is bad UX for a rare case.

### 4.2 EXIF: here I disagree with `docs/06`

`docs/06` §4 proposes "Freshness: server time + **EXIF** + a double photo". **EXIF verification is
security theater, and it should not be built in Phase 0 or in 1.1.**

- EXIF is entirely controlled by the sender: `exiftool -DateTimeOriginal=...` sets any date in
  a second. Checking a field the attacker writes himself is pointless.
- EXIF is almost always **already missing**: any messenger and the system "Share" on iOS strip it.
  So "no EXIF" is indistinguishable from "a normal user", and a "no EXIF → reject" rule rejects
  honest people more often than dishonest ones.
- EXIF is a **privacy risk**, not an asset: it carries GPS. Cluster 8 of `docs/06` ("imagine selling that
  training data") is about exactly this fear.

**Decision: strip metadata on intake and say so.** A single re-encode operation turns the
attack surface into a privacy feature. We compute the hash **after** normalization, otherwise the fingerprint shown
will not match the file the referee downloads.

### 4.3 Someone else's screenshot / an image from the internet

Not solved in Phase 0 (reverse image search is an external vendor and money). Mitigation: the friend-referee is
the only tool that really works here, because she knows the context. Plus §4.1
(the exact hash match). Record it honestly as an accepted residual risk.

### 4.4 Collusion of the two sides against the referee

**This is not a problem, and it is important to record that, so we do not build a defence against it.** If both sides
agree, they get their own money back. There is no house, no shared bank, no insurance fund,
nobody to steal from. The only thing collusion gives is the chance to pay us the 3% fee.

The real risk is **collusion of one side with the referee**, and it is already partly closed (`docs/05`: the referee
is approved by both sides at creation, the referee cannot be the beneficiary). Evidence makes this risk
slightly worse if the bundle is private: a bribed referee rules against obvious proof and nobody
sees it. The cheap mitigation is **not to build a reputation but to leave a trail**: on a resolved dispute
show "Referee @anya ruled X · 2 proofs were on hand · referee's note: '…'". Zero new tables beyond
`resolutions` (§7), and a social cost appears for the referee.

### 4.5 The referee doesn't show up, and a hole that is already in the plan

The 7-day timeout → refund to both works and stays (fail-closed, `docs/09` R5). But adding
evidence exposes an existing problem in `bondRouting` (`packages/domain/src/money/settlement.ts`):

```ts
const bondGoesTo: PartySide =
  winner === null || winner === dispute.by ? dispute.by : otherSide(dispute.by);
```

On a referee timeout `outcome = 'refund'` → `winner === null` → **the bond is returned to the disputer**.
So: the losing side sees a flawlessly documented claim, disputes it in an obviously
hopeless way, knows (or hopes) the referee is inactive, waits 7 days, and turns a loss into a refund
**at zero cost**. Today this is barely noticeable, because claims have nothing to back them and a "flawless"
claim does not exist. As soon as proofs appear, this becomes the main way to avoid paying.

**Recommendation: on a referee timeout the bond goes to the other side, not back to the disputer.**
The stakes still go back to both: fail-closed is not broken, no money goes to the platform.
It is one branch in `bondRouting` (distinguish a `'refund'` from a referee timeout from a `'draw'`/ordinary refund).

**I am not sure here and say so plainly.** The counterargument is real: an honest person who disputed
honestly is punished because the mutual friend turned out to be inactive. Alternatives: (a) split the bond in half;
(b) leave it as is and accept the exploit; (c) return the bond but mark the dispute as "disputed and not
carried through" in `resolutions`, a reputational price rather than a monetary one. My bet is on the bond going to the
other side, because $1–25 against a free rollback is the only price that exists at all
in this branch. I am raising it as open question Q3.

### 4.6 Malicious upload (what is usually forgotten)

As soon as we store other people's images and serve links to them, we are a host. This is the most serious
legal exposure of the whole feature, and it appears in Phase 0, whose distribution is a viral reel.

The cheap minimum without which the feature must not ship:

- a private bucket, **not one public URL**, no CDN; reads only through a signed link
  valid for 60 seconds after a role check;
- images only (`jpeg|png|webp|heic`), ≤ 3 items, ≤ 8 MB before normalization, re-encode to webp,
  at most 2048px on the long side; SVG forbidden (it is an executable document);
- a rate limit on uploads (Upstash is already in the plan, T4.3);
- a "report" button → a row in the outbox + a documented takedown process (`docs/qa/evidence-takedown.md`);
- a hard TTL (§6).

A pleasant property the state machine gives us: an upload is reachable only by a party to the dispute, only in
the states `active` (after the deadline) and `claimed`, and `allowedActions` already guarantees that. A random
passer-by with the link physically has no action to attach a file to. The upload endpoint
must ask `canPerform(bet, role, 'submitClaim' | 'disputeClaim', now)` **before** accepting bytes,
not after.

---

## 5. How this ties into the state machine

Action names are from `packages/domain/src/state/machine.ts` (`BET_ACTIONS`).

### 5.1 Which transitions get a payload

| Action                                                           | Payload                                   | Rationale                                                                                                                 |
| ---------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `submitClaim`                                                    | **`EvidenceBundle`** (note + 0–3 items)   | the main case                                                                                                             |
| `disputeClaim`                                                   | **`EvidenceBundle`** (reason + 0–3 items) | a referee without the other side is not a referee; `disputes.reason` is already a stub for this                           |
| `refereeResolve`                                                 | **`rationale: string`**, no files         | the referee explains, not proves; this is a public log of verdicts, which Forfeit lacks (`docs/02` "opaque verification") |
| `confirmClaim`                                                   | none                                      | agreement needs no proof                                                                                                  |
| `settleUncontested`                                              | **none, and cannot be**                   | permissionless: the caller is not a party and holds nothing                                                               |
| `refundExpired`, `expireUnaccepted`, `cancel`, `accept`, `share` | none                                      | nobody wins money in the end / nothing to prove                                                                           |

### 5.2 Domain types (what exactly changes)

```ts
// packages/domain/src/types/evidence.ts  — pure, no node, no DOM (Expo-reuse rule)
export const EVIDENCE_KINDS = ['photo', 'screenshot', 'link'] as const;

export interface EvidenceRef {
  readonly bundleHash: HexHash; // sha256 over sorted item hashes || sha256(note)
  readonly itemCount: number; // 0..3
  readonly kinds: readonly EvidenceKind[];
  readonly frozenAtSeconds: number; // server time at submit
}
```

`Claim` and `Dispute` in `types/bet.ts` get `readonly evidence: EvidenceRef | null`.
**The domain holds the hash and counters, not storage paths and not URLs**, otherwise `packages/domain` starts knowing
about Supabase and violates the purity rule from `docs/09` §2.1.

### 5.3 Missing evidence: block or weaken?

**Weaken by default; block only where the dispute itself asked for it.** Three reasons:

1. A blanket block breaks the **Bet** format. "Who wins at FIFA" has no artifact and does not need one,
   the outcome is visible to both.
2. A blanket block breaks `settleUncontested`: it is permissionless, and the caller has no proof and cannot
   have one.
3. A hard requirement produces garbage: people upload anything just to pass the gate. An empty honest
   claim is better than a formally filled-in photo of a ceiling.

The rule I propose is two pure functions next to `successClaimantSide`:

```ts
// packages/domain/src/state/evidence-policy.ts
/** A claim that hands the money to the claimant's own side. */
export function isSelfFavouring(outcome: Outcome, by: PartySide): boolean;

/** Evidence is required only for a self-favouring claim on a bet that asked for it. */
export function evidenceRequired(bet: Bet, outcome: Outcome, by: PartySide): boolean;
```

Consequences I like:

- **A claim against yourself never requires proof.** "He won" is self-evidently credible.
- **`evidenceRequired` defaults to `false` for Bet and `true` for Commit.** This is not taste, it follows
  directly from `successClaimantSide`: in Commit only the **creator** can claim success, and silence
  pays out the claimant. The beneficiary, a friend or a charity, would receive the money "for nothing";
  a charity will never dispute, a friend may not notice. **In Commit the default outcome under inattention is the one
  that benefits the only person entitled to claim.** This is the one product configuration where the
  presumption of honesty structurally does not hold, and that is exactly where proof should be mandatory.

### 5.4 `allowedActions` does NOT change

A deliberate decision: `submitClaim` stays an allowed action, and missing proof is a **payload
validation** error, not an actor authorization one. Otherwise `allowedActions` starts answering two different
questions, and the "state × role × time" table from T0.8 (~90 cases) doubles for a reason unrelated to
who is entitled to act.

The gate lives in three places, in order of authority:

1. `evidenceRequired()` in `packages/domain` is the source of truth;
2. the server action `record-claim.ts` is the only place where a refusal is real;
3. the UI: the button is disabled with a human reason ("This dispute requires proof, add a note or a file").

In Phase 1 the same thing moves into the program: `evidence_required: bool` in the `Bet` account,
`evidence_hash: Option<[u8;32]>` in `submit_claim`/`dispute_claim`, the constraint
`evidence_required && self_favouring ⇒ hash.is_some()`. This does not touch money: `calculateSettlement`
does not change, the T5.11 parity test remains in force.

### 5.5 "Weakening" in practice: the cost of disputing depends on the proof

The cheapest form of a "weak claim" is not to have a machine evaluate the proof, but to **make disagreement cheaper when
there was nothing to show**:

- a claim in your own favour **without** a bundle → dispute bond = 0 (or `MIN_DISPUTE_BOND`);
- a claim in your own favour **with** a bundle → the bond as now, `calculateDisputeBond`.

This is one branch in the bond computation, zero ML, and it is exactly the asymmetry we want: a backed
statement is protected, a bare one is not.

A known workaround: attach a junk image to raise the price of disagreement for the other. I accept it:
junk goes to the friend-referee, and a friend who sees junk rules against it. Also the junk stays forever in
`resolutions`. I consider the trade acceptable but flag it as something to watch.

---

## 6. Storage and privacy

### 6.1 Where the bytes live

Supabase Storage, a **private** bucket `evidence`, path `bets/<bet_id>/<claim_id>/<evidence_id>.webp`.
No public URLs, no CDN. Reads only through a server action that does
`resolveViewerRole` → a check against the table in §3 → a signed link for 60 seconds. A forwarded link
expires before it arrives.

### 6.2 RLS: exactly per the `docs/09` §2.3 model

- a new table `evidence`: RLS enabled, **no** policies for `anon`/`authenticated` at all (deny-all);
  all writes and reads go through server actions with the service-role key after zod + authorization in the repository;
- `bets_public` gets **not a single column with content**; the public card gets only the aggregates
  `evidence_count`, `evidence_kinds`, `evidence_frozen_at`, `evidence_hash_prefix`;
- the ESLint ban on importing `server/db/client.ts` from client components extends to `server/media/*` too.

### 6.3 File intake (normalization)

One pass at the entrance: re-encode to webp, **all metadata stripped** (this also fixes EXIF orientation),
long side ≤ 2048px. `sha256` is computed **after** normalization, over the bytes that will actually
be served. We reject anything that is not an image, SVG included.

### 6.4 Retention

`docs/06` cluster 8 promises "the photo is deleted after the verdict (24 h TTL)". **24 hours is too aggressive.**
A dispute is resolved at 19:00, a friend opens the link in the morning and sees emptiness; in a dispute the referee
may need to look again.

**Proposal: bytes are deleted 7 days after the dispute enters a terminal state
(`resolved` / `refunded` / `cancelled`). The row and the hash stay forever.**

Wording for onboarding and the privacy page, literally: **"We delete the file. We keep the fingerprint,
so it can be proven the file did not change and so repeated proofs can be caught. We don't sell
or train on your photos"** (cluster 8: "imagine selling that training data").

Plus: deletion on user request at any time (`deleted_at` + a nightly job), with the consequence
"your claim will become a claim without proof", shown before confirmation.

### 6.5 Logs

Add to the Sentry scrubber (T4.10 already cleans terms/email/addresses): note texts, file names,
signed URLs. A note is free user text, it will contain anything.

---

## 7. The path to AI referee 1.1

The goal of this section is not to build the referee but to make sure that a month from now we don't have to migrate.

**7.1 Remove `claims.evidence_url` from migration `0006` before it ships.**
A single text column will not hold 3 artifacts with types, hashes, a freeze time and (in 1.1)
a per-item verdict. This is the only item in the document that is cheap **today** and expensive **later**:
M2 has not shipped yet. Instead, a table `evidence` (`id`, `bet_id`, `claim_id | dispute_id`, `kind`,
`storage_path | url`, `sha256`, `bytes`, `mime`, `width`, `height`, `frozen_at`, `deleted_at`,
`retention_policy`).

**7.2 Record `retention_policy` on the row from day one.** Later the policy will change (the model needs the
file at the moment of the verdict), and without this field we would have to backfill the whole history with unknown consent.

**7.3 Create `resolutions`: empty of AI, full of humans.**

```
resolutions: bet_id, author_kind ('counterparty'|'referee'|'timeout'|'ai'),
             author_id null, outcome, rationale text null,
             evidence_hashes text[], contested bool,
             confidence numeric null, model text null, signature text null,
             created_at
```

`confidence` / `model` / `signature` are always `null` in Phase 0. This is that same "verdict signature"
from `docs/05` (Roadmap 1.1): the shape is ready, the filler is not yet.

**7.4 This is also the only data source for evaluating the AI referee.** Every resolved dispute that had
proof and a human decision is one labeled example: `(terms, evidence, human_outcome, contested)`.
Without it Phase 1.1 starts with zero eval data, and the question "is the AI referee better than silence or worse?"
will have no answer, and it is the only question that matters there. **This is the most valuable
and almost free artifact of the entire Phase 0 layer.**

**7.5 Normalization at intake (§6.3) is part of the preparation for 1.1**, because the model must see exactly
what the human saw, otherwise the labeled examples do not match the input.

**7.6 What NOT to do now:** a prompt, a queue, a moderation vendor, confidence thresholds, scoring.
None of it affects the schema, so it can wait.

**7.7 The invariant that must not be violated in 1.1:** the AI referee sits **under** the human, not in place of them,
and an appeal to the friend-referee always remains. Cluster 5 of `docs/06` ("The camera is failed try again later",
"error: invalid grass color", ~65 likes) is the fear of a false rejection, and users have already put it into words
before we built anything.

---

## 8. Recommendation and tasks

### 8.1 What to build in Phase 0 (by descending value)

1. **The `evidence` + `resolutions` schema + hash + freezing.** Irreversible if done wrong;
   free if done now.
2. **A required note + up to 3 artifacts on `submitClaim`**, a private bucket, signed reads
   for three roles.
3. **A counter-bundle on `disputeClaim` + a rationale on `refereeResolve`.**
4. **`evidenceRequired` (on by default for Commit) + the rule "a claim against yourself needs no proof".**
5. **The public card shows the fact that proof exists, not the proof**, including the honest "No proof attached".
6. **`resolutions` is written on every terminal transition**: the dataset for 1.1.

### 8.2 What to defer

Video · the witness role · any EXIF/GPS checks · integrations with Strava/Health/Screen Time API ·
reverse image search · any machine evaluation of content · content moderation by a vendor.

### 8.3 The cheapest change that raises trust the most

**A required text note on every claim in your own favour, recorded with server time and
shown to the other side verbatim.**

Zero file storage, zero moderation surface, zero legal risk, one column and one field in the
UI, and "I won" becomes a statement a person answers for to someone who knows them.
That is roughly 5% of the cost of the whole evidence layer and, in my view, about half of its effect.
It fits inside the already planned T3.8.

### 8.4 Tasks: M6 · Evidence (2–3 days)

The format and rules are the same as in `docs/09` §3: a task ≤ 1 day, a test note is mandatory.
None of these tasks is marked `[REEL]`: the reel is shot on the create/accept flow, not on resolution.

| id        | Task                                                                                                                                                                                                           | Deps              | Test note                                                                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T6.1**  | `packages/domain/src/types/evidence.ts`: `EVIDENCE_KINDS`, `EvidenceItem`, `EvidenceBundle`, `EvidenceRef`, `EVIDENCE_LIMITS`. Add `evidence: EvidenceRef \| null` to `Claim` and `Dispute`.                   | T0.5              | `expectTypeOf` tests; purity lint passes (no `node:*`, no DOM); a 4-item bundle fails the type-level/schema guard                                                                           |
| **T6.2**  | `packages/domain/src/state/evidence-policy.ts`: `isSelfFavouring`, `evidenceRequired`, `disputeBondFor`.                                                                                                       | T6.1, T0.8, T0.6  | Table: 2 formats × 3 outcomes × 2 sides × {required on/off} — Commit defaults on, Bet off, self-adverse claim never requires evidence; `settleUncontested`/`refundExpired` never consult it |
| **T6.3**  | `packages/domain/src/evidence/hash.ts`: `hashEvidenceBundle(items, note)` → 32-byte hex, WebCrypto-compatible, item order irrelevant.                                                                          | T6.1              | Known-vector test; reordering items keeps the hash; changing one byte of the note flips it; runs in the `node`-env vitest project                                                           |
| **T6.4**  | `packages/domain/src/schemas/evidence.ts` (zod): note 0–500 trimmed, ≤ 3 items, mime allowlist, size cap, link `https:` only ≤ 2048 chars.                                                                     | T6.1              | Valid/invalid matrix incl. `javascript:` link, 501-char note, 4 items, `image/svg+xml`, 8.1 MB file                                                                                         |
| **T6.5**  | Migration `0014_evidence.sql`: tables `evidence` + `resolutions`; **drop `claims.evidence_url` from `0006` before it ships**; RLS deny-all; non-unique index on `sha256`; `bets_public` gains aggregates only. | T2.1              | **Security test**: anon and authenticated both get 0 rows from `evidence`; `bets_public` exposes no `storage_path`; a duplicate `sha256` inserts successfully and is flagged, not rejected  |
| **T6.6**  | Private Storage bucket `evidence` + `server/media/normalize.ts` (re-encode webp, strip all metadata, ≤ 2048px, hash after normalization).                                                                      | T6.5              | A JPEG carrying GPS EXIF comes back with no metadata; SVG and 12 MB uploads rejected with typed errors; stored bytes hash equals the recorded `sha256`                                      |
| **T6.7**  | Server action `record-claim.ts` extended: auth → `resolveViewerRole` → `canPerform` **before reading bytes** → zod → normalize → store → freeze. Append-only.                                                  | T6.6, T6.2, T2.2  | Non-participant → `NOT_AUTHORIZED` with zero rows and zero stored objects; a second attach after the window opens → `EVIDENCE_FROZEN`; idempotent on `evidence_id`                          |
| **T6.8**  | Server action `get-evidence-url.ts`: role check per §3 → 60 s signed URL; observers receive metadata only.                                                                                                     | T6.7              | Observer response contains no URL; referee gets a URL only when `state='disputed'`; an expired URL returns 403 from storage                                                                 |
| **T6.9**  | `/b/[id]` claim sheet: note field (required when `evidenceRequired`), up to 3 items, kind chips, "locked and shown to <other>" copy, freeze receipt (hash prefix + time).                                      | T6.7, T3.8, T0.11 | Self-favouring claim with an empty note → CTA disabled with a reason; happy path renders the hash prefix; Playwright at 390×844                                                             |
| **T6.10** | `/b/[id]` counterparty + referee panels: evidence view, explicit **"No proof attached"** state, dispute-cost line driven by `disputeBondFor`.                                                                  | T6.9, T6.8        | Evidence-free claim shows the reduced bond; the panel renders no bytes for an `observer`; referee panel is empty outside `disputed`                                                         |
| **T6.11** | Write a `resolutions` row on every terminal transition (`confirmClaim`, `settleUncontested`, `refereeResolve`, `refundExpired`) incl. `author_kind` and evidence hashes.                                       | T6.5, T3.8        | Four transitions → four rows with the right `author_kind`; **invariant: 100% of terminal bets have exactly one resolution row**                                                             |
| **T6.12** | Retention job + `/api/health` counter: delete bytes 7 d after terminal state, keep row + hash; user-requested hard delete.                                                                                     | T6.6              | A bet terminal 8 days ago has no object and still has its row and `sha256`; a non-terminal bet is untouched; hard delete clears bytes immediately                                           |
| **T6.13** | Abuse controls: upload rate limit (Upstash), report button → notifications outbox, `docs/qa/evidence-takedown.md`.                                                                                             | T4.3, T6.7        | 11th upload in an hour → `RATE_LIMITED` and no stored object; a report writes one row and never exposes the reporter to the parties                                                         |
| **T6.14** | Sentry scrubber extended: evidence notes, filenames, signed URLs.                                                                                                                                              | T4.10             | A fixture containing a note and a signed URL is fully redacted                                                                                                                              |
| **T6.15** | _(Phase 1, design only)_ Program: `evidence_required: bool` on `Bet`; `evidence_hash: Option<[u8;32]>` on `submit_claim` / `dispute_claim`; constraint `evidence_required && self_favouring ⇒ hash.is_some()`. | T5.3 (design)     | Constraint test lands in T5.5; **T5.11 settlement parity is unaffected — evidence never touches money** (unless Q3 is adopted)                                                              |

### 8.5 Edits to existing tasks

| Task  | Edit                                                                                                                   |
| ----- | ---------------------------------------------------------------------------------------------------------------------- |
| T2.1  | Remove `claims.evidence_url` from `0006`; align with `0014` (T6.5)                                                     |
| T3.8  | Claim/confirm on `/b/[id]` gets a note field: the minimal version of §8.3 even if T6.6+ don't make it                  |
| T4.10 | The scrubber is extended (T6.14)                                                                                       |
| T0.6  | Changes **only** if Q3 is adopted (the referee timeout branch in `bondRouting`), then the T5.11 table grows by 4 cases |

### 8.6 Open questions for the product owner

1. **Q1 · A required note for all claims in your own favour, or only for Commit?**
   I recommend **for all**: the cost is zero, and an exception would have to be explained in the UI.
2. **Q2 · A zero dispute bond for a bare claim (§5.5) or always `MIN_DISPUTE_BOND` = $1?**
   I recommend **always $1**: zero opens spam disputes, and a dollar is already a filter.
   I am unsure here: $1 against "free to say no when you were shown nothing" is a real trade-off.
3. **Q3 · Where does the bond go on a referee timeout (§4.5)?** (A) to the other side, which closes the free rollback;
   (B) split in half; (C) as now, back to the disputer. I recommend **A**, with an explicit admission that an honest
   disputer with an inactive referee pays for someone else's inaction.
4. **Q4 · Retention of 7 days after terminal or 24 hours, as promised in `docs/06`?**
   I recommend **7 days** + the direct wording "we delete the file, we keep the fingerprint".
5. **Q5 · Does M6 go into Phase 0 before the reel or right after?** I recommend **after the reel, before Phase 1**:
   the reel shoots create/accept, and resolution does not make it into the frame. The exception is §8.3 (the note),
   which is worth rolling out right away in T3.8.

---

## 9. Link to the pains from `docs/06`

| `docs/06` cluster                                                 | What here answers it                                                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **4 · Cheats ("photo from bed", "I'll delete the app")**          | Bundle freezing (§1.2), a freshness requirement in the dispute text (§4.1), an exact-hash repeat detector |
| **5 · Edge cases ("the camera didn't work", false AI rejection)** | Proof weakens rather than blocks (§5.3); the human referee always remains (§7.7)                          |
| **7 · Edge cases / battery**                                      | We don't touch timeouts; missing proof doesn't burn money                                                 |
| **8 · Privacy ("they'll sell the data for training")**            | Private bucket, metadata stripping, 7-day TTL, only the hash on chain (§6)                                |
| **1 · "Where does the money go"**                                 | `resolutions` as a public verdict log: something Forfeit doesn't have (`docs/02`)                         |
| **10 · Reputational consequences**                                | The referee's decision is visible on a resolved dispute (§4.4): reputation without a reputation system    |
