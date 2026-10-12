# 02 · Forfeit teardown

**Site:** <https://www.forfeit.app/> · **iOS:** [Habit Contracts](https://apps.apple.com/us/app/forfeit-habit-contracts/id1633125787), [Habit Commitment](https://apps.apple.com/ca/app/forfeit-habit-commitment/id6760597781) · **Android:** [app.forfeit.forfeit](https://play.google.com/store/apps/details?id=app.forfeit.forfeit)
**Company:** Forfeit, Inc (2023), YC-backed. Platforms: iOS, Android, Mac (blocking), web (Overlord).

## Mechanics in one paragraph

The user sets a **task + deadline + amount**. Stripe places a **pre-authorization hold** on the card at the moment
of commitment. Before the deadline the user must submit **proof**; AI checks it, and a live human handles disputed cases. No proof / proof
doesn't match → the hold is **captured** and the money is gone. 94% of tasks are completed (per Forfeit).

## Numbers (self-reported)

| Metric              | Value                         | Source              |
| ------------------- | ----------------------------- | ------------------- |
| Users               | 20,000+                       | Google Play listing |
| Tasks (forfeits)    | 75,000+                       | Google Play listing |
| Success rate        | 94% (6% failures)             | Google Play / site  |
| "Forfeits set"      | $8.7M                         | forfeit.app         |
| Verification errors | < 5% of failures due to proof | forfeit.app FAQ     |
| Appeal              | a human replies in ≤ 12 h     | forfeit.app FAQ     |

## Verification methods (full list)

| Method                                        | Who verifies                                           | Examples                                                     |
| --------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| Photo                                         | AI (matches against the description), disputed → human | gym, inbox zero, pills, "photo from the porch" for waking up |
| Video / Timelapse                             | human                                                  | meditation, cleaning, 1 h of work                            |
| Self-Verify                                   | nobody                                                 | no smoking, no drinking                                      |
| Friend-Verify                                 | friend as witness                                      | anything                                                     |
| GPS check-in / avoid                          | automatic                                              | be at the gym / stay out of the bar                          |
| Apple Health / Google Fit                     | automatic                                              | steps, workouts, sleep, weight                               |
| Screen Time / Web tracking                    | automatic                                              | TikTok limit; turning off tracking = failure                 |
| RescueTime, Strava, Whoop, MyFitnessPal, Anki | automatic                                              | integrations                                                 |
| Pomodoro timer                                | automatic                                              | focus sessions                                               |
| Plaid (bank feed)                             | automatic                                              | $64 penalty for a $32 DoorDash order                         |

## Strictness and appeals

- **Lenient / Normal / Hard** modes. Hard: appeals are forbidden, "no way out".
- The user writes their own appeal instructions when creating the task ("accept any valid excuse" vs "accept nothing").
- The rule can't be softened mid-week, only at creation.

## What happens to the money

- **By default the money stays with Forfeit.** The site says: "For now it is retained by Forfeit. We are building an option to send forfeited money to friends or your own savings." Some sources say it is already possible to send it to charity or to a group of friends.
- Non-monetary consequences: SMS/email to a friend, app blocking, Mac lock.
- ⚠️ This is the main source of distrust and the difference from stickK (where the money goes to a chosen recipient / anti-charity).

## Monetization

| What                | Price                                                               |
| ------------------- | ------------------------------------------------------------------- |
| Download            | free                                                                |
| Free tier           | up to 3 active contracts                                            |
| Forfeit Premium     | ~$7.99/mo (unlimited contracts, analytics, templates, Apple Health) |
| Overlord (AI agent) | ~$12.99/mo                                                          |
| Lost stakes         | stay with the company (revenue)                                     |

Reddit r/getdisciplined: "It's a lot of money per month so I'm looking for an alternative". **Subscription price is the #1 reason for leaving.** Forfeit doesn't publish prices on its site.

## Overlord, the AI overseer

24/7 chat, calls to wake you up and before the deadline, messages friends on failure, 3-layer memory ("catches repeated
excuses"), blocks apps/sites, reads GPS/screen/spending/health, and charges the money itself.
This is their second-generation moat: from "proof on request" to "constant monitoring".

## Strengths → what we take

1. Proof-first (evidence instead of a word of honor), the only defense against self-deception.
2. Stripe pre-auth hold: the money is "no longer yours" from the moment of commitment. In crypto this is an **escrow in a smart contract**, which is even more honest.
3. Appeals + leniency modes remove the "my phone died" fear.
4. Onboarding = first contract in 5 screens.

## Weaknesses → our opening

1. **The money goes to the company** → conflict of interest ("they profit when you fail"). Crypto: the losers' pool → winners, transparent on-chain.
2. **$8–13/mo subscription** on top of the stakes → zero subscription, only a % of the pool / yield.
3. **Country restrictions** on cards/Stripe → a wallet works everywhere (RU/CIS, LATAM, Asia).
4. **Opaque verification** (a human with fatigue, per a cofounder on the Beeminder forum) → open oracle + public decision log.
5. No social layer of friend-vs-friend bets, solo only.

## Sources

- [forfeit.app](https://www.forfeit.app/) · [Google Play](https://play.google.com/store/apps/details?id=app.forfeit.forfeit)
- [Accountablo — Forfeit & Overlord Review (2026)](https://www.accountablo.com/blog/forfeit-overlord-review)
- [FineStreak — stickK vs Forfeit](https://finestreak.com/blog/stickk-vs-forfeit) · [Forfeit vs Beeminder](https://finestreak.com/blog/forfeit-vs-beeminder) · [Forfeit alternatives](https://finestreak.com/blog/forfeit-app-alternatives)
- [dailyhabits.xyz](https://www.dailyhabits.xyz/habit-tracker-app/forfeit) · [ToolMage](https://www.toolmage.com/en/tool/forfeit/) · [MOGE](https://moge.ai/product/forfeit)
