# moneydeal — споры между друзьями с деньгами в эскроу на Solana

> **For Colosseum judges (English)**
>
> **SPORIM** — friendly bets between friends with the stakes held in a Solana escrow. Two friends agree on terms in a chat,
> both lock USDC into a program-owned vault, and the winner takes the pot. Every state has an exit: a disagreement refunds
> both sides, an abandoned bet refunds to anyone who calls it after the deadline.
>
> - **Live web app:** <https://sporim.fun> (Next.js 15; create a bet, share a link, the friend accepts)
> - **Anchor program (devnet):** [`EkfT8PTE7QShwtK6F7NEDgC2M3i4cGnLZhurULPVtDP2`](https://explorer.solana.com/address/EkfT8PTE7QShwtK6F7NEDgC2M3i4cGnLZhurULPVtDP2?cluster=devnet)
>   — `packages/program/programs/sporim/src`: `create_bet`, `accept_bet`, `cancel_bet`, `submit_claim`, `confirm_claim`,
>   `dispute_claim`, `settle_uncontested`, `expire_unaccepted`, `refund_expired`
> - **TS client:** `packages/chain` — generated from the IDL, with a real devnet round-trip test
> - **Domain logic:** `packages/domain` — money, fees, bet state machine, schemas (unit-tested, framework-free)
> - **Status:** the program and client run on devnet; the web app still settles through a mock wallet — wiring it to the
>   program is the next step. Single-mint (USDC), 1v1, no referee on-chain yet.
>
> Run: `pnpm install && pnpm check` · program: `bash packages/program/scripts/test.sh` (Linux/WSL)

**Поспорили в чате → оба положили USDC в эскроу → выигравший забрал банк.**

Началось с рила <https://www.instagram.com/reel/DcuCrIRxSOk/> (промо **Forfeit** — ставка на привычку),
2026-09-02 пивот на более широкий продукт: любой спор между друзьями. Будильник/привычки — один из шаблонов.
Актуальная спека — `docs/05`, платформа — `docs/07`, prior art по спорам — `docs/08`.

## Что внутри

| Путь                                                                                  | Что                                                                                                                             |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `docs/02-forfeit-teardown.md`                                                         | Как устроен Forfeit: механика, верификация, деньги, цифры                                                                       |
| `docs/03-competitors.md`                                                              | Paywake, stickK, Beeminder, FineStreak, Accountablo и др.                                                                       |
| `docs/04-crypto-prior-art.md`                                                         | Уже существующие крипто-аналоги (10 проектов) и что у них брать                                                                 |
| `docs/05-product-spec.md`                                                             | **Спека v1 (после пивота):** флоу, резолюция, Anchor-программа, риски, roadmap                                                  |
| `docs/07-platform-decision.md`                                                        | **Solana + web-first (Next.js)**, почему не натив, стек, что брать у соседей                                                    |
| `docs/08-friend-bets-prior-art.md`                                                    | WagerLab, Betcha, MNEEBet, Settld, Stakely, bet2fun, ParkTheBus — модели резолюции, юр-ландшафт                                 |
| `docs/09-phase0-plan.md`                                                              | **План реализации:** PRD с AC по экранам, монорепо, `ChainAdapter`, дизайн Anchor-программы, 60 задач M0–M5, риски, 5 вопросов  |
| `docs/11-coming-back.md`                                                              | **Возврат пользователя:** экран `/me`, личность до логина, `.ics` + письма вместо push, кто закрывает таймауты, события воронки |
| `docs/DESIGN.md`                                                                      | **Дизайн-система** (формат getdesign / Google DESIGN.md) — токены, типографика, компоненты, правила. Читать перед любым UI      |
| [Design canvas](https://claude.ai/code/artifact/f12d16ad-03f0-45eb-8de9-3b523a29efbc) | 3 направления стиля (A Receipt · **B Acid Arena** · C Trash Talk), лендинг + 2 экрана                                           |
| `tools/fetch-fonts.py`                                                                | Скачивает Unbounded / IBM Plex Mono в `apps/web/public/fonts` и генерит `fonts.css`                                             |
| `packages/domain`                                                                     | Логика без фреймворка: деньги, комиссия, стейт-машина, схемы, копирайт. 214 тестов                                              |
| `packages/ui`                                                                         | Дизайн-система по `docs/DESIGN.md` — инлайн-стили из токенов, чтобы те же компоненты рендерил satori                            |
| `apps/web`                                                                            | Next.js 15 App Router — единственная поверхность Phase 0                                                                        |

## Статус

- [x] Рил проанализирован, кадры и метаданные сняты
- [x] Forfeit / Paywake / конкуренты / крипто-аналоги исследованы
- [x] 240/242 комментов с лайками собраны и кластеризованы (`docs/06`)
- [x] Пивот на «споры между друзьями», решения приняты: Solana · обязательства-first · взаимно + судья · web-first · 1v1
- [x] Planner → PRD → архитектура программы → task list (Phase 0) — `docs/09`
- [x] **M0 каркас:** монорепо, `packages/domain` (214 тестов), `packages/ui` по `docs/DESIGN.md`,
      `apps/web` (Next 15 + self-hosted шрифты + `lib/env.ts`), CI, Playwright.
      `pnpm check` зелёный: 259 unit + 7 e2e
- [x] База: **Xata (обычный Postgres)** вместо Supabase — подключение проверено, схемы ещё нет
- [x] **M1 флоу создания:** 5 экранов + `/new/done`, `DraftProvider` с восстановлением из
      `sessionStorage`, step guard, `MoneyFlow` («куда уходят деньги» по каждому формату),
      типизированная аналитика, `FakeWalletPort` с `?mockFail=`, error boundary,
      **подпись пальцем** (точки штрихов → SVG path, сатори-совместимо; ввод имени как альтернатива).
      **395 unit + 65 e2e** зелёные
- [ ] M2: страница ставки, OG-картинка, приём по ссылке
- [ ] Phase 0: прототип на devnet + рил + waitlist
- [ ] Юрист до mainnet

### Команды

```bash
pnpm install
pnpm dev                    # http://localhost:3000
pnpm check                  # typecheck + lint + unit
pnpm --filter @sporim/web test:e2e
python tools/fetch-fonts.py # перегенерить шрифты
```

## License

[Business Source License 1.1](LICENSE) — source-available, **not** open source.

- ✅ Read, run locally, fork and modify for learning, review and non-production use.
- ❌ Any production use (running it as a service, a competing app, a commercial fork) without a separate
  license from the authors.
- 🔓 On **2030-10-12** this code converts to Apache 2.0.

Commercial licensing: open an issue or reach out via [github.com/looksg00d](https://github.com/looksg00d).

© 2026 SPORIM authors. All rights reserved except as granted in [LICENSE](LICENSE).
