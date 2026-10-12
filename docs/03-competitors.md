# 03 · Competitors (Web2)

## Summary table

| Product              | On failure                                                               | Where the money goes                | Verification                                           | Price                      | Money at stake     |
| -------------------- | ------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------ | -------------------------- | ------------------ |
| **Forfeit**          | card charge / SMS to a friend / app blocking                             | the company (by default)            | photo AI, video human, GPS, Health, Screen Time, Plaid | free + $7.99 / $12.99 mo   | you choose         |
| **Paywake**          | "you don't get the bonus" (legally) / you lose the deposit (in practice) | **85% → winners, 15% Paywake**      | photo of a household object within 3 min               | 0, withdrawal fee          | $3–$99 / day       |
| **stickK**           | money goes to the recipient                                              | friend / charity / **anti-charity** | self-report + optional referee                         | $5 per contract with money | you choose         |
| **Beeminder**        | escalating pledge                                                        | the company                         | automatic data (integrations)                          | free; $8 / $16 / $81 mo    | $0→5→10→30→90→270  |
| **FineStreak**       | Stripe charge + agent call/SMS                                           | the company                         | photo, screenshot, location                            | 7 days free, $5–20 mo      | $0.10 – $50        |
| **Accountablo**      | you lose the stake                                                       | depends on config                   | AI check-in in Slack/WhatsApp                          | ?                          | $5 (up to $50 Pro) |
| **Go Fucking Do It** | charge at the deadline                                                   | the company                         | word of honor                                          | free                       | you choose         |
| **Habitica**         | damage to your character                                                 | —                                   | self-report                                            | free                       | none               |
| **Alarmy (Pay)**     | alarm missions                                                           | —                                   | photo/steps/math                                       | subscription               | none               |

## Paywake, closest to a "crypto version" in its economics

**Site:** <https://paywake.com/> · **iOS:** [App Store](https://apps.apple.com/us/app/paywake/id6447996352) · Company 7 AM, Inc. Founded in 2022 at USC by **Jack Mandelkorn and Kai Medina** (the very `kai_medina` from the reel comments).

- Deposit of **$3–$99**, wake-up time 5–10 AM. After the alarm there are **3 minutes** to photograph a household object (up to 10 objects: door handle, toothbrush, bucket...).
- Woke up → deposit back **+ a share of the losers' pool** (minimum +$0.01). Paywake keeps **15%**. Payouts at noon.
- Streak bonus up to **25%**, leaderboards (week/month/all-time), "2X wakeup" for those who have failed before.
- Real payouts are **tiny**: on a $99 deposit, $0.30–$3, usually ~$1 (App Store reviews). Complaints: "payout in cents", no notification arrived → lost the deposit.
- **ToS (February 2026)** rewritten as an "incentive program": the deposit is formally "not charged", you just "don't get the bonus". This is a **legal hedge against being classified as gambling**, an important signal for a crypto version.
- Money flows through **Stripe Connect** (each user has a connected account), withdrawal to a debit card / Venmo (fee max($0.25, 1.75%)).

**What to take:** the pool model "the lazy pay the disciplined", streak bonus, leaderboard, 3-minute photo window. **What to avoid:** penny payouts kill motivation, so we need yield or a bigger pool.

## stickK, the "anti-charity" model

Yale, behavioral economists. The loser's money goes to **an organization you hate**, which hurts more than a plain loss. Self-report, so it is easy to cheat. $5 per contract. Payout after the contract ends, minus fees; charity gets it once a year with no tax receipt.

## Beeminder, "derailing it is nailing it"

They openly say they live off the pledges of those who fail. Ladder $0→$5→$10→$30→$90→$270. Strong in automatic data (steps, words, hours). Weak in that you can't choose the amount up front.

## Key takeaways for positioning

1. The market splits along the axis **"who decides that you failed"**: self-report (stickK, GFDI) ↔ evidence (Forfeit, Paywake, FineStreak) ↔ data (Beeminder). Crypto adds a third option: **on-chain verifiable actions** (wallet, GitHub, Strava via an oracle).
2. Along the axis **"where the money goes"**: the company (Forfeit, Beeminder) ↔ a recipient (stickK) ↔ **the winners' pool (Paywake)**. Only the last one gives "you earn", and it is the only thing that answers the objection "why stake on an app that takes your money".
3. All Web2 players depend on **Stripe + US cards**, so they are unavailable in RU/CIS and many other countries. A wallet means global from day one.
4. Nobody offers **yield on escrow**. If the stake sits in a USDC vault at 4–8% APY, then "woke up → got your stake + yield + a share of the pool".

## Sources

- [Paywake ToS 2026-02-02](https://paywake.com/docs/terms.pdf) · [USC Annenberg Media on Paywake](https://www.uscannenbergmedia.com/2022/02/23/getting-paid-to-wake-up-all-you-need-to-know-about-the-student-run-startup-paywake/) · [Sleepopolis](https://sleepopolis.com/news/app-pays-to-wake-up/)
- [FineStreak — Forfeit alternatives](https://finestreak.com/blog/forfeit-app-alternatives) · [stickK vs Forfeit](https://finestreak.com/blog/stickk-vs-forfeit) · [Forfeit vs Beeminder](https://finestreak.com/blog/forfeit-vs-beeminder)
- [Accountablo review](https://www.accountablo.com/blog/forfeit-overlord-review)
