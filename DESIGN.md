---
version: alpha
name: SPORIM design system
description: Design language for SPORIM — friend bets, commits and dares with USDC escrow on Solana. Direction "Acid Arena" (Option B on the canvas) — a near-black canvas, one acid-lime hazard accent, coral only when money leaves, monumental Unbounded display type over an IBM Plex Mono "contract" voice, 1px hairlines instead of shadows, pill actions, and a rotated NO BACKING OUT stamp. Built for a meme-native Gen Z audience that lives in group chats; nothing here should look like a white fintech app. Influences (from getdesign.md): The Verge (hazard accents, mono caps, flat 1px depth), Shopify dark track (single pill vocabulary, huge display, negative space).

colors:
  canvas: "#0f1014"
  surface: "#16181e"
  surface-raised: "#1d2027"
  hairline: "#2a2d36"
  hairline-strong: "#3a3e49"
  ink: "#f2f1ec"
  ink-muted: "#c6c6cc"
  ink-secondary: "#9a9aa3"
  ink-faint: "#6f6f78"
  accent: "#c9ff3f"
  accent-hover: "#e4ff8a"
  accent-dim: "#8fb82a"
  on-accent: "#0f1014"
  loss: "#ff5c4d"
  on-loss: "#0f1014"
  focus: "#7ee0ff"
  overlay: "#000000"

typography:
  display-xl:
    fontFamily: "Unbounded, 'Arial Black', Impact, sans-serif"
    fontSize: 92px
    fontWeight: 900
    lineHeight: 0.94
    letterSpacing: -4px
  display-lg:
    fontFamily: "Unbounded, 'Arial Black', Impact, sans-serif"
    fontSize: 56px
    fontWeight: 900
    lineHeight: 0.96
    letterSpacing: -2.5px
  display-md:
    fontFamily: "Unbounded, 'Arial Black', Impact, sans-serif"
    fontSize: 38px
    fontWeight: 900
    lineHeight: 1.0
    letterSpacing: -1.5px
  display-sm:
    fontFamily: "Unbounded, 'Arial Black', Impact, sans-serif"
    fontSize: 30px
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: -1px
  heading-lg:
    fontFamily: "Unbounded, 'Arial Black', Impact, sans-serif"
    fontSize: 26px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.5px
  heading-md:
    fontFamily: "Unbounded, 'Arial Black', Impact, sans-serif"
    fontSize: 19px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.4px
  wordmark:
    fontFamily: "Unbounded, 'Arial Black', Impact, sans-serif"
    fontSize: 22px
    fontWeight: 900
    lineHeight: 1.0
    letterSpacing: -0.4px
  body-lg:
    fontFamily: "'IBM Plex Mono', ui-monospace, 'Courier New', monospace"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0
  body:
    fontFamily: "'IBM Plex Mono', ui-monospace, 'Courier New', monospace"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0
  body-sm:
    fontFamily: "'IBM Plex Mono', ui-monospace, 'Courier New', monospace"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  value:
    fontFamily: "'IBM Plex Mono', ui-monospace, 'Courier New', monospace"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0
  button:
    fontFamily: "'IBM Plex Mono', ui-monospace, 'Courier New', monospace"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.0
    letterSpacing: 0
  label-caps:
    fontFamily: "'IBM Plex Mono', ui-monospace, 'Courier New', monospace"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 2.2px
  label-caps-sm:
    fontFamily: "'IBM Plex Mono', ui-monospace, 'Courier New', monospace"
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 1.8px
  micro:
    fontFamily: "'IBM Plex Mono', ui-monospace, 'Courier New', monospace"
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0

rounded:
  xs: 8px
  sm: 12px
  md: 14px
  lg: 18px
  xl: 20px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  xxl: 28px
  section: 48px
  huge: 56px

components:
  nav-bar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.body-sm}"
    padding: "{spacing.xxl} {spacing.huge}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 {spacing.lg}"
    minHeight: 56px
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.on-accent}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 {spacing.lg}"
    minHeight: 56px
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline-strong}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 {spacing.lg}"
    minHeight: 52px
  button-ghost:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 {spacing.lg}"
    minHeight: 48px
  button-nav-cta:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill}"
    padding: "{spacing.sm} {spacing.lg}"
    minHeight: 44px
  hero:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-xl}"
    padding: "{spacing.huge}"
  bet-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "0"
  bet-card-band:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label-caps-sm}"
    padding: "{spacing.sm} {spacing.md}"
  bet-card-body:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.heading-md}"
    padding: "{spacing.lg} {spacing.md}"
  receipt-rows:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline-strong}"
    typography: "{typography.body-sm}"
    padding: "{spacing.md} 0 0"
  side-cell:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.value}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  side-cell-active:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.accent}"
    borderColor: "{colors.accent}"
    typography: "{typography.value}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  stat-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  stamp:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.accent}"
    borderColor: "{colors.accent}"
    typography: "{typography.heading-md}"
    rounded: "{rounded.xs}"
    padding: "{spacing.xs} {spacing.md}"
  progress-dots:
    backgroundColor: "{colors.canvas}"
    activeColor: "{colors.accent}"
    inactiveColor: "{colors.hairline-strong}"
    height: 4px
    width: 22px
    gap: "{spacing.xs}"
  text-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline-strong}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
    minHeight: 52px
  wheel-picker:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    activeTypography: "{typography.display-md}"
    inactiveColor: "{colors.ink-faint}"
    padding: "{spacing.lg} 0"
  badge-caps:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label-caps-sm}"
    rounded: "{rounded.pill}"
    padding: "{spacing.xxs} {spacing.sm}"
  avatar-initial:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.heading-md}"
    rounded: "{rounded.full}"
    size: 40px
  footer-note:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-faint}"
    typography: "{typography.micro}"
    padding: "{spacing.xs} 0 0"
  footer:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.body-sm}"
    padding: "{spacing.huge}"
---

## Overview

SPORIM is a contract you can't weasel out of, dressed like hazard tape. The canvas is a cool near-black (`{colors.canvas}`), not an OLED void — enough warmth to read as a dark room, not a terminal. One accent does all the shouting: acid lime (`{colors.accent}`), used the way a road crew uses safety paint — on the single thing you must look at (the CTA, the "LOCKED IN" band, the pot amount, your side of the bet). Coral (`{colors.loss}`) appears in exactly one situation: money leaving your pocket. Everything else is ink, muted ink, and 1px hairlines.

Two voices carry the type. **Unbounded** at 700–900 is the display shout — wide, geometric, slightly absurd at 92px, and it also sets the bet's terms on every card because the terms _are_ the headline. **IBM Plex Mono** is everything else: body, buttons, labels, numbers, footnotes. Setting body copy in mono is the fingerprint — the whole product reads like a receipt or a contract, which is the point. Labels are always UPPERCASE with wide tracking; the wordmark is Unbounded 900.

Depth is flat. Cards are `{colors.surface}` with a 1px `{colors.hairline}` outline; the accent band at the top of a bet card and a dashed rule above the money rows do what shadows do elsewhere. One radial glow of accent at ~15% alpha is allowed per screen as atmosphere — it is not a gradient background, it is a spotlight behind the moment that matters (the lock-in check, the hero card). The signature detail is the **stamp**: a rotated, outlined, all-caps Unbounded block — NO BACKING OUT — sitting on the hero card and the confirmation screen like a rubber stamp on a contract.

**Key Characteristics:**

- Near-black canvas with a single acid-lime hazard accent; coral only when money leaves.
- Unbounded for display and bet terms; IBM Plex Mono for every other word, including body copy.
- UPPERCASE tracked mono labels (`{typography.label-caps}`) on every kicker, band, and cell heading.
- Flat depth: 1px hairlines, accent bands, dashed receipt rules — no drop shadows on cards (one exception: the rotated hero card).
- Pill-shaped actions only; cards at 14–20px radius; the stamp at 8px with a 3px accent stroke, rotated 8–12°.
- The bet card is the product: band → terms → sides → receipt rows. It is the share card, the OG image, and the confirmation screen.
- Copy is short, second person, dry: "No backing out." "Nah, I'm scared." "Nobody agrees? Both refunded."

## Colors

> Source: canvas artboards `Main`, `LockedIn`, `Accept` (Option B). Alternates A (paper receipt) and C (chat-native) live on the same canvas and would replace this palette wholesale if chosen.

### Brand & Accent

- **Acid** (`{colors.accent}` — #c9ff3f): the only accent. Primary CTA fill, the LOCKED IN band, pot amount, your side of a bet, active progress dot, stamp stroke, check-mark disc. Never a background wash; never body text below 16px on the canvas (it vibrates).
- **Acid Hover** (`{colors.accent-hover}` — #e4ff8a): hover/pressed on primary pills and links.
- **Acid Dim** (`{colors.accent-dim}` — #8fb82a): disabled primary, accent on light surfaces if one ever appears.
- **Loss** (`{colors.loss}` — #ff5c4d): the opponent's side, "−20 USDC", failure states. Reserved for money-out and nothing decorative.
- **Focus** (`{colors.focus}` — #7ee0ff): keyboard focus rings only.

### Surface

- **Canvas** (`{colors.canvas}` — #0f1014): the page. There is no light mode.
- **Surface** (`{colors.surface}` — #16181e): cards, inputs, stat panels.
- **Surface Raised** (`{colors.surface-raised}` — #1d2027): the active side cell, hover on secondary surfaces.
- **Hairline** (`{colors.hairline}` — #2a2d36) and **Hairline Strong** (`{colors.hairline-strong}` — #3a3e49): the 1px lines that do all the separating. Dashed variants use the same colors.

### Text

- **Ink** (`{colors.ink}` — #f2f1ec): headlines, terms, values. Slightly warm off-white, never pure white.
- **Ink Muted** (`{colors.ink-muted}` — #c6c6cc): hero paragraph, lead copy.
- **Ink Secondary** (`{colors.ink-secondary}` — #9a9aa3): row labels, nav links, helper copy.
- **Ink Faint** (`{colors.ink-faint}` — #6f6f78): footnotes, timestamps, inactive picker values.
- **On Accent** (`{colors.on-accent}` — #0f1014): text on acid fills.

### Atmosphere

One `radial-gradient` of `{colors.accent}` at 0.14–0.18 alpha fading to transparent by ~62%, positioned behind the single most important element on the screen. Never more than one per screen; never a linear gradient; never behind text at body size.

## Typography

### Font Family

- **Unbounded** (Google Fonts; supports Cyrillic) — display and headings, weights 700 and 900. Fallback `'Arial Black', Impact` — both wider than Unbounded's metrics, so budget ~10% extra width for exports.
- **IBM Plex Mono** (Google Fonts) — body, UI, labels, numbers, weights 400/500/600. Fallback `ui-monospace, 'Courier New'`.

### Hierarchy

| Token                        | Size | Weight | Line Height | Letter Spacing | Use                                                      |
| ---------------------------- | ---- | ------ | ----------- | -------------- | -------------------------------------------------------- |
| `{typography.display-xl}`    | 92px | 900    | 0.94        | -4px           | Landing hero headline ("PUT MONEY ON IT.")               |
| `{typography.display-lg}`    | 56px | 900    | 0.96        | -2.5px         | Section headlines on desktop                             |
| `{typography.display-md}`    | 38px | 900    | 1.0         | -1.5px         | Mobile screen titles ("Locked in."), active picker value |
| `{typography.display-sm}`    | 30px | 900    | 1.1         | -1px           | Opponent's view of the terms on Accept                   |
| `{typography.heading-lg}`    | 26px | 700    | 1.2         | -0.5px         | Bet terms on the hero/share card                         |
| `{typography.heading-md}`    | 19px | 700    | 1.25        | -0.4px         | Bet terms on the phone card, stamp text, avatar initial  |
| `{typography.wordmark}`      | 22px | 900    | 1.0         | -0.4px         | SPORIM wordmark                                          |
| `{typography.body-lg}`       | 18px | 400    | 1.6         | 0              | Hero paragraph                                           |
| `{typography.body}`          | 15px | 400    | 1.55        | 0              | Default copy, secondary buttons                          |
| `{typography.body-sm}`       | 13px | 400    | 1.5         | 0              | Receipt rows, nav links, proof chips                     |
| `{typography.value}`         | 18px | 600    | 1.2         | 0              | Side values ("Won't." / "Will."), pot                    |
| `{typography.button}`        | 16px | 600    | 1.0         | 0              | Primary/secondary pill labels                            |
| `{typography.label-caps}`    | 12px | 600    | 1.2         | 2.2px          | UPPERCASE kickers, band text, "@DIMA CHALLENGED YOU"     |
| `{typography.label-caps-sm}` | 11px | 600    | 1.2         | 1.8px          | UPPERCASE cell headings, badges, "BET #0001"             |
| `{typography.micro}`         | 11px | 400    | 1.5         | 0              | Footnotes under buttons, timestamps                      |

### Principles

- **Unbounded is for shouting and for the terms.** Never below 19px, never for buttons, labels or body. The terms of a bet are set in Unbounded because they are the headline of that screen.
- **Mono is the voice.** Body copy, buttons, numbers, helper text — all IBM Plex Mono. This is what makes it read as a contract rather than a fintech app.
- **Caps are tracked, lowercase is not.** Every UPPERCASE label carries 1.8–2.2px tracking; display type is tracked negative; everything else sits at 0.
- **Numbers are values.** Money and counts use `{typography.value}` (600) — they must be scannable at a glance on a share card.
- **Cyrillic-safe.** Both faces ship Cyrillic; the same tokens serve a RU locale without a font swap.

## Layout

### Spacing System

- **Base unit**: 4px; rhythm on 8.
- **Tokens**: `{spacing.xxs}` 4 · `{spacing.xs}` 8 · `{spacing.sm}` 12 · `{spacing.md}` 16 · `{spacing.lg}` 20 · `{spacing.xl}` 24 · `{spacing.xxl}` 28 · `{spacing.section}` 48 · `{spacing.huge}` 56.
- **Mobile screen**: 390px frame, 20px side gutters, 64px top clearance (real status bar lives there — never draw a fake one), 28px bottom, 22–24px between stacked blocks, primary button pinned to the bottom with the body pushed up by a flexible spacer.
- **Desktop landing**: 1440px frame, 56px gutters, two-column hero (`repeat(2, minmax(0, 1fr))`, 48px gap), 92px display, hero card rotated -3° on the right.

### Grid & Container

- Landing container max ~1440px; content column for docs/rules ~720px.
- Cards are single-column stacks with 16–22px internal gaps; side-by-side sides use a 2-column grid with 10–12px gap.
- Every stack is `display: flex` + `gap`; never margin-spaced siblings.

### Whitespace Philosophy

Dark canvas plus one loud accent means whitespace is loud too: 24–28px of empty canvas between a card and a button reads as a pause before the signature. Screens hold four things at most: a title, one card, one or two actions, one footnote.

## Elevation & Depth

| Level | Treatment                                                          | Use                                                 |
| ----- | ------------------------------------------------------------------ | --------------------------------------------------- |
| 0     | Flat `{colors.canvas}`                                             | Page                                                |
| 1     | `1px solid {colors.hairline}` on `{colors.surface}`                | Cards, inputs, side cells, stat panels              |
| 2     | `1px solid {colors.hairline-strong}`                               | Secondary pill outline, stronger separators         |
| 3     | `1px dashed {colors.hairline-strong}` (top)                        | Receipt rows — the "tear here" line above money     |
| 4     | `1px solid {colors.accent}` + `{colors.surface-raised}` fill       | Active side cell (your side)                        |
| 5     | Solid `{colors.accent}` fill                                       | The band, CTA, check disc, pot — elevation by color |
| 6     | `3px solid {colors.accent}` outline, rotated 8–12°                 | The stamp                                           |
| 7     | `0 40px 80px rgba(0,0,0,0.55)` + `0 0 0 1px rgba(201,255,63,0.08)` | Hero card only — the one real shadow in the system  |
| 8     | Radial accent glow, 0.14–0.18 alpha, ≤ one per screen              | Atmosphere behind the key moment                    |

No hover lifts, no scale. Hover is a color change (`{colors.accent}` → `{colors.accent-hover}`, or `{colors.ink-secondary}` → `{colors.ink}`).

## Shapes

| Token            | Value  | Use                                 |
| ---------------- | ------ | ----------------------------------- |
| `{rounded.xs}`   | 8px    | Stamp, small chips                  |
| `{rounded.sm}`   | 12px   | Inputs, stat cells on the hero card |
| `{rounded.md}`   | 14px   | Side cells, stat panel on Accept    |
| `{rounded.lg}`   | 18px   | Bet card on mobile                  |
| `{rounded.xl}`   | 20px   | Hero/share card on desktop          |
| `{rounded.pill}` | 9999px | Every button, badge, progress dot   |
| `{rounded.full}` | 9999px | Avatars, the check disc             |

Pills are the only button shape. Cards never go below 14px. The stamp is the only element allowed to sit at an angle.

## Components

### Buttons

**`button-primary`** — acid pill, 56px tall on mobile, full width; label `{typography.button}` in `{colors.on-accent}`; optional leading 18px stroke icon at 2.4px, gap 10px. Hover `button-primary-hover`; pressed darkens to `{colors.accent-dim}`; focus adds a 2px `{colors.focus}` ring at 3px offset. On desktop nav it shrinks to `button-nav-cta` (44px, `{typography.body-sm}`).
**`button-secondary`** — transparent pill with a 1px `{colors.hairline-strong}` stroke, ink label, 52px tall. Hover lightens the stroke to `{colors.ink-secondary}`.
**`button-ghost`** — text-only, `{colors.ink-secondary}`, 48px tall; used for the decline ("Nah, I'm scared").

### The Bet Card (signature)

Four stacked parts, always in this order:

1. **`bet-card-band`** — acid band, `{typography.label-caps-sm}` on `{colors.on-accent}`: id on the left ("BET #0001"), state on the right with a 13px lock icon ("LOCKED IN").
2. **`bet-card-body`** — the terms in Unbounded (`{typography.heading-lg}` desktop / `{typography.heading-md}` mobile), `text-wrap: pretty`.
3. **Sides** — two `side-cell`s in a 2-column grid: caps heading (`@DIMA SAYS`) + `{typography.value}`. The viewer's own side is `side-cell-active`; an opponent's stance that costs the viewer money uses `{colors.loss}` for the value.
4. **`receipt-rows`** — dashed top rule, then label/value pairs in `{typography.body-sm}` with `justify-content: space-between`; the pot value is `{colors.accent}` 600.
   The same component renders the share card, the OG image (1200×630 with the band on top), and the confirmation screen.

### Stamp

`stamp` — Unbounded 700, UPPERCASE, `{colors.accent}` text and 3px stroke, 8px radius, rotated 8° (hero) or -12° (receipt variant), 0.9–0.95 opacity. Text is always a rule of the product: NO BACKING OUT, REFUNDED, PAID.

### Progress Dots

Five 22×4px pills, gap 8px, centered; inactive `{colors.hairline-strong}`, active `{colors.accent}`. Replaces a step counter on the 5-screen flow.

### Confirmation Moment

84px `{colors.accent}` disc with a 40px 3px-stroke check in `{colors.on-accent}`, a 10px `{colors.accent}` @ 12% halo ring, `pop` animation (600ms, overshoot 1.08). Title `{typography.display-md}` ("Locked in."), subtitle `{typography.body}` in `{colors.ink-secondary}`.

### Inputs & Pickers

`text-input` — surface fill, 1px strong hairline, 12px radius, 52px min height, mono 15px; focus swaps the stroke to `{colors.accent}` (no glow). Amount and time selection use `wheel-picker`: the active value in `{typography.display-md}` ink, neighbours in `{colors.ink-faint}` at 24–28px, no chrome around the wheel.

### Proof Chips

Rows of a 14–16px acid stroke icon + `{typography.body-sm}` in `{colors.ink-secondary}`, `align-items: flex-start`, gap 8px. Used for the three trust facts on the landing and the two rule lines on Accept.

### Avatars

`avatar-initial` — 40px acid disc with the first letter in Unbounded 900 15px `{colors.on-accent}`. No photos in v1.

### Navigation

`nav-bar` — wordmark left, two `{typography.body-sm}` links in `{colors.ink-secondary}` and one `button-nav-cta` on the right, 28px vertical padding, a 1px `{colors.hairline}` rule under it. Collapses to wordmark + CTA below 768px.

## Motion

- **`rise`** — one orchestrated reveal per screen: `opacity 0→1`, `translateY(18px→0)`, 700ms `cubic-bezier(.2,.8,.2,1)`; a second element may follow at +150ms. Nothing else animates on load.
- **`pop`** — the confirmation disc only.
- Buttons and links transition color in 150–180ms. No hover lifts, no parallax, no marquee.
- Respect `prefers-reduced-motion`: drop `rise`/`pop` to instant.

## Copy Voice

Second person, declarative, dry. Sentences under ten words. Product rules are stated as facts on the screen where they matter ("Nobody agrees? Both refunded."). Vocabulary: **stake, commit, dare, lock, claim, settle, refund**. Never: bet slip, odds, win big, gamble, casino, jackpot. Humor lives in secondary actions and footnotes, never in the primary button.

## Do's and Don'ts

### Do

- Keep `{colors.canvas}` as the only page background; cards on `{colors.surface}` with 1px hairlines.
- Use acid for exactly one thing per screen cluster: the action, the state band, the money you'd gain.
- Set bet terms in Unbounded; set every other word in IBM Plex Mono.
- Track all caps labels 1.8–2.2px; keep them at 11–12px.
- Pin the primary action to the bottom on mobile; keep touch targets ≥ 44px (56px for primary).
- Draw icons as 16–24px stroke SVGs at 2.2–2.4px, `stroke-linecap: round`. Icons: check, lock, arrow-up-right, link.
- Use the stamp for rules, the band for state, the dashed rule for money.
- Leave the top 64px of a phone screen empty for the real status bar.

### Don't

- Don't add a light mode, a second accent, or a linear gradient anywhere.
- Don't use emoji in UI chrome (the brand's meme energy comes from copy and the stamp, not from 💀).
- Don't put `{colors.accent}` text under 16px on the canvas, or use it as a background wash.
- Don't use `{colors.loss}` for anything except money leaving or a failed state.
- Don't drop-shadow cards; the hero card is the single exception.
- Don't use Unbounded below 19px or for buttons and labels; don't use Inter, Roboto or Arial anywhere.
- Don't square off buttons; don't round cards below 14px.
- Don't draw a fake iOS status bar or keyboard in mockups.
- Don't write "bet slip", "odds", "win", "gamble" in product copy.

## Responsive Behavior

### Breakpoints

| Name    | Width       | Key Changes                                                                                              |
| ------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| Mobile  | < 768px     | Single column; nav is wordmark + CTA; display-xl → 44–52px; hero card un-rotates and sits under the copy |
| Tablet  | 768–1023px  | Two-column hero returns at 64px display; cards cap at 480px wide                                         |
| Desktop | 1024–1439px | Full hero at 80px; 48px gutters                                                                          |
| Wide    | ≥ 1440px    | Frame caps at 1440; 92px display; 56px gutters                                                           |

### Collapsing Strategy

Display sizes stair down 92 → 80 → 64 → 48px. Bet card keeps its four-part anatomy at every width; the sides grid stays two columns down to 320px. Primary buttons go full-width below 768px. Mono labels never shrink below 11px.

### Touch Targets

Primary 56px, secondary 52px, ghost 48px, nav CTA 44px. Side cells and picker rows are ≥ 48px tall.

## Agent Prompt Guide

### Quick Color Reference

- **Primary CTA**: Acid (`{colors.accent}`) with `{colors.on-accent}` text
- **Canvas**: `{colors.canvas}` · **Card**: `{colors.surface}` + 1px `{colors.hairline}`
- **Heading / terms**: `{colors.ink}` in Unbounded
- **Body**: `{colors.ink-muted}` (lead) or `{colors.ink-secondary}` (helper) in IBM Plex Mono
- **Money in**: `{colors.accent}` · **Money out**: `{colors.loss}`

### Example Component Prompts

1. _"Build the bet card: `{colors.surface}` container, 1px `{colors.hairline}`, `{rounded.lg}`; an acid band (`{colors.accent}`, `{typography.label-caps-sm}`, `{colors.on-accent}`) with 'BET #0001' left and a lock icon + 'LOCKED IN' right; terms in `{typography.heading-md}`; two side cells in a 2-col grid; dashed `{colors.hairline-strong}` rule; four label/value rows in `{typography.body-sm}` with the pot in `{colors.accent}` 600."_
2. _"Primary pill: `{colors.accent}` fill, `{colors.on-accent}` `{typography.button}`, 56px tall, full width, leading 18px arrow-up-right stroke icon, hover to `{colors.accent-hover}` in 180ms."_
3. _"Confirmation screen: five progress pills with the last in `{colors.accent}`; 84px acid disc with a 40px check and a 12% acid halo, `pop` 600ms; 'Locked in.' in `{typography.display-md}`; a `{typography.body}` subtitle in `{colors.ink-secondary}`; the bet card; a flexible spacer; Share to chat (primary) and Copy link (secondary); a `{typography.micro}` footnote 'Nobody agrees by the deadline? Both get refunded.'"_
4. _"Landing hero at 1440: two columns; left — acid dot + `{typography.label-caps}` kicker, `{typography.display-xl}` 'PUT MONEY ON IT.', `{typography.body-lg}` paragraph in `{colors.ink-muted}`, primary + secondary pills, three proof chips; right — the bet card at 480px rotated -3° with the Level 7 shadow and a NO BACKING OUT stamp rotated 8°; one radial acid glow at 76%/44%."_
5. _"Accept screen: 40px acid avatar disc, `{typography.label-caps}` '@DIMA CHALLENGED YOU', terms in `{typography.display-sm}`, sides grid with the opponent's value in `{colors.loss}` and mine in `side-cell-active`, a stat panel with 'If you win +18.80 USDC' in acid and 'If you lose −20 USDC' in coral, two proof chips, then 'Accept — lock 20 USDC' primary with a lock icon and a ghost 'Nah, I'm scared'."_

### Iteration Guide

1. **Audit accent count.** More than one acid element competing on a screen cluster → demote the rest to ink.
2. **Audit type roles.** Unbounded only ≥ 19px and only for display/terms; everything else mono. Caps tracked 1.8–2.2px.
3. **Audit depth.** Any `box-shadow` outside the hero card is drift; replace with a 1px hairline or an acid band.
4. **Audit coral.** If `{colors.loss}` appears anywhere money isn't leaving, remove it.
5. **Audit copy.** Any gambling vocabulary → rewrite with stake / commit / dare / claim / refund.
6. **Audit the card.** Band → terms → sides → receipt rows, in that order, everywhere the bet appears (screen, share card, OG image).
7. Run `npx @google/design.md lint DESIGN.md` after edits.
