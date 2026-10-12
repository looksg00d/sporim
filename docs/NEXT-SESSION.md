# Where to start

Open this first in a new session. Then `docs/STATUS.md` (what's done and what's next) and
`docs/DECISIONS.md` (why it's this way). Both are in the repo and both outrank this file if
they disagree: this one was written on 5 September and will go stale.

---

## Decision: wallet first, Phantom right away

**Decided 5 September.** Sign-in through Phantom becomes the main path, email the fallback.
This reverses the 3 September decision, where email was shown first.

**Why.** The question "how does a person get $25 in USDC" was first in
`docs/RESEARCH-BRIEF-2.md` and was called the main risk. It has an answer that removes
the problem entirely: **the person already has Phantom, and it already has USDC.** Then no
on-ramp is needed: connect the wallet, sign, done. Seconds instead of five minutes, zero
KYC, zero provider fees.

This narrows the audience to those who have a wallet. Deliberately: better a working product for
a crypto audience than a broken one for everyone. The on-ramp stays in the brief as a fallback, but
stops being a launch blocker.

**Already done in code** (`apps/web/src/features/auth/AuthProvider.tsx`, 5 September):

```ts
loginMethods: ['wallet', 'email'],
appearance: {
  showWalletLoginFirst: true,
  walletList: ['phantom', 'detected_solana_wallets', 'solflare', 'backpack'],
},
```

Two fields, not one: `showWalletLoginFirst` raises the **wallet section**, while `walletList`
names the buttons inside it and their order. By default Privy shows an Ethereum set there: metamask,
coinbase, rainbow, wallet_connect. So this puts Phantom as the first button on the first screen.

`'phantom'` is a separate `WalletListEntry` value, checked against the installed SDK's types, not
against the docs. `detected_solana_wallets` is second on purpose: it's a catch for whichever
extension the person actually has installed, so an owner of Solflare or Backpack doesn't feel the
product is built for someone else's wallet.

There's also `loginMethodsAndOrder.primary`, which would put `'phantom'` literally above all
social sign-ins. **We don't use it:** Privy marks it `@deprecated` and warns that it
overrides their defaults. Two supported fields beat one deprecated one.

---

## One mechanical problem, and how it's solved

Traffic comes from a reel, and Instagram opens links **in its in-app browser**. There are no
extensions and no injected wallet there, so on the very screen most people will land on, the
"connect Phantom" button has nothing to connect to. That's not an opinion, it's how the
webview is built.

Phantom has an answer, confirmed by their docs (research archive, `docs.phantom.com`,
`status: 200`):

> "users can open web apps within Phantom’s in-app browser via the Browse deeplink"

That is: from the Instagram webview, a deep link opens **our own site inside Phantom's browser**,
where the wallet is already injected and everything works as on desktop with the extension.

The universal link format in the docs is:

```
https://phantom.app/ul/<version>/<method>
```

**The exact format of the Browse link itself didn't survive in the archive**, since the research
didn't capture that page. First thing, check it in the live docs; don't take my reconstruction on faith. It has to be checked on a phone:
how the jump from the Instagram webview behaves, whether the person comes back, what
someone without Phantom installed sees.

---

## Open question: do we still need Privy

While reading the Phantom docs I found something I didn't know: **Phantom has its own SDK with sign-in
through Google and Apple and an embedded wallet.** From `docs.phantom.com/llms.txt`:

> "Social Login (Google, Apple): Let users sign in with Google or Apple and automatically
> receive an embedded wallet"
> "Browser Extension Login: Connect to existing Phantom browser extension wallets with
> fallback handling"

That's exactly what we took Privy for. If the Phantom SDK covers both connecting an existing
wallet and creating an embedded one for those who don't have it, the whole setup gets simpler
by one third-party service, one secret and one line in the budget ($299/month at 500 MAU
on Privy).

**Don't rewrite right away.** Privy works, is proven on a live session, and has 16 tests on
token verification. First answer three questions:

1. How does the Phantom SDK prove identity to the server? With Privy it's a JWT verified against JWKS, and
   `sub` goes into `app.user_id` for RLS. If Phantom has no such thing and only offers a
   message signature from the wallet, that's a different session model, and it has to be built (nonce, signature,
   our own cookie), not just "swap the provider".
2. What happens to a person who has no Phantom at all, both on a phone and in the webview.
3. What it costs and what the limits are.

If the answers are good, the migration clears out a whole layer. If not, we keep Privy, which
already supports `solana_wallet_auth`, and only the order in the modal changes.

---

## Order of work

1. ~~Sign-in order in `AuthProvider.tsx`~~: **done 5 September**, see above.
2. **Browse deep link**: check the format in the docs, build the jump, **test on your own
   phone from Instagram.** This is the one part a test can't verify.
3. **Accepting via link**: `[NEXT]` in `STATUS.md` and the last gap in the loop. The link the
   page shows the creator doesn't open for the friend yet: they're not a participant, and
   `/b/[code]` honestly answers "not found". The shape of the solution is known and was already applied for
   the referee: migration `0004`, secret in `set_config`. It needs the same kind of invites table, its own
   policy, and the `accept` transition itself.
4. **Answer the Phantom SDK question**: before more code gets invested in Privy.

Items 1 and 2 can run in parallel with 3: they don't overlap.

---

## What to know so you don't step on a rake

- **Open the live page before saying "done".** On 5 September 523 green tests didn't
  notice that the product had no navigation at all; one look at the deployed page found
  two more defects. Tests can't see what's missing from the screen.
- **Don't change the money logic without reading** `docs/DECISIONS.md` for 3–4 September. The rules
  were reversed twice: the dispute bond was removed, referee silence returns the money.
  The reasons are written down but not obvious.
- **USDC can be frozen**: the freeze authority is non-null, a 2-of-4 multisig, verified on
  mainnet. Never promise that funds can't be frozen.
- Windows pins, fonts, two build directories: see `STATUS.md`, the "Known loose ends" section.
- Integration tests only wake up when `DATABASE_URL` is in the environment. Without it,
  `pnpm check` reports a smaller number, and that's not a regression.

## What's waiting for you, not me

- Reissue the secrets that passed through chat: the database password in Xata and the app secret in Privy.
- Flip the domain redirect: currently `sporim.fun` → `www.sporim.fun`, it needs to be the other way around.
  Vercel → Settings → Domains. The CLI doesn't manage this.
- Three questions about pool-vs-pool: are stakes inside a team equal or free, how a
  pool closes, who confirms for the team.
- Run `docs/RESEARCH-BRIEF-2.md`. Section 1 on the on-ramp is now **not first in
  importance**: instead, look at the Phantom SDK questions above and section 3 on reconciling Rust and
  TypeScript.
