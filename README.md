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
| `docs/01-reel-analysis.md`                                                            | Разбор рила: хук, флоу экранов, метрики, комменты                                                                               |
| `docs/02-forfeit-teardown.md`                                                         | Как устроен Forfeit: механика, верификация, деньги, цифры                                                                       |
| `docs/03-competitors.md`                                                              | Paywake, stickK, Beeminder, FineStreak, Accountablo и др.                                                                       |
| `docs/04-crypto-prior-art.md`                                                         | Уже существующие крипто-аналоги (10 проектов) и что у них брать                                                                 |
| `docs/05-product-spec.md`                                                             | **Спека v1 (после пивота):** флоу, резолюция, Anchor-программа, риски, roadmap                                                  |
| `data/reel_DcuCrIRxSOk.summary.json`                                                  | Метаданные рила + 9 превью-комментов (yt-dlp)                                                                                   |
| `data/reel_DcuCrIRxSOk.ytdlp.info.json`                                               | Полный дамп yt-dlp                                                                                                              |
| `data/reel_DcuCrIRxSOk.comments.json`                                                 | **Все 240/242 комментов с лайками и ветками ответов** (138 top-level + 102 reply)                                               |
| `docs/06-user-pains.md`                                                               | Кластеризация болей / предложений / возражений из комментов, по лайкам                                                          |
| `docs/07-platform-decision.md`                                                        | **Solana + web-first (Next.js)**, почему не натив, стек, что брать у соседей                                                    |
| `docs/08-friend-bets-prior-art.md`                                                    | WagerLab, Betcha, MNEEBet, Settld, Stakely, bet2fun, ParkTheBus — модели резолюции, юр-ландшафт                                 |
| `docs/09-phase0-plan.md`                                                              | **План реализации:** PRD с AC по экранам, монорепо, `ChainAdapter`, дизайн Anchor-программы, 60 задач M0–M5, риски, 5 вопросов  |
| `docs/11-coming-back.md`                                                              | **Возврат пользователя:** экран `/me`, личность до логина, `.ics` + письма вместо push, кто закрывает таймауты, события воронки |
| `DESIGN.md`                                                                           | **Дизайн-система** (формат getdesign / Google DESIGN.md) — токены, типографика, компоненты, правила. Читать перед любым UI      |
| [Design canvas](https://claude.ai/code/artifact/f12d16ad-03f0-45eb-8de9-3b523a29efbc) | 3 направления стиля (A Receipt · **B Acid Arena** · C Trash Talk), лендинг + 2 экрана                                           |
| `reference/reel_DcuCrIRxSOk.mp4`                                                      | Сам ролик (21.6 с)                                                                                                              |
| `reference/frames/*.jpg`                                                              | 5 экранов флоу + хук-кадр — референс UI                                                                                         |
| `tools/fetch_reel.py`                                                                 | yt-dlp + cookies → метаданные и превью-комменты                                                                                 |
| `tools/fetch_comments.py`                                                             | Пагинация всех комментов через web API + cookies                                                                                |
| `tools/fetch-fonts.py`                                                                | Скачивает Unbounded / IBM Plex Mono в `apps/web/public/fonts` и генерит `fonts.css`                                             |
| `packages/domain`                                                                     | Логика без фреймворка: деньги, комиссия, стейт-машина, схемы, копирайт. 214 тестов                                              |
| `packages/ui`                                                                         | Дизайн-система по `DESIGN.md` — инлайн-стили из токенов, чтобы те же компоненты рендерил satori                                 |
| `apps/web`                                                                            | Next.js 15 App Router — единственная поверхность Phase 0                                                                        |

## Статус

- [x] Рил проанализирован, кадры и метаданные сняты
- [x] Forfeit / Paywake / конкуренты / крипто-аналоги исследованы
- [x] 240/242 комментов с лайками собраны и кластеризованы (`docs/06`)
- [x] Пивот на «споры между друзьями», решения приняты: Solana · обязательства-first · взаимно + судья · web-first · 1v1
- [x] Planner → PRD → архитектура программы → task list (Phase 0) — `docs/09`
- [x] **M0 каркас:** монорепо, `packages/domain` (214 тестов), `packages/ui` по `DESIGN.md`,
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

## Парсинг комментов через куки — рабочий рецепт

```powershell
# VPN включён системно; cookies.txt — экспорт с HttpOnly (есть строка sessionid)
python tools/fetch_comments.py DcuCrIRxSOk --cookies "C:\Users\4\Downloads\cookies (1).txt" --out data
```

Три грабли, на которые наступили (все обойдены в скрипте):

1. **Нет `sessionid`** в старом `inst/extracted_links/cookies.txt` → login wall / таймаут. Нужен экспорт
   с HttpOnly-куками (расширение _Get cookies.txt LOCALLY_); рабочий файл — `Downloads/cookies (1).txt`.
2. **Python `requests` режется по TLS-отпечатку** (curl → 200, requests → timeout / SSL EOF) →
   скрипт использует `curl_cffi` с `impersonate="chrome"` (то же, что делает yt-dlp).
3. **Ветки ответов** отдаются «хвостом» (9 новых); старые лежат в «голове» → пагинация в обе стороны
   (`min_id` ← `next_min_child_cursor`, `max_id` ← `next_max_child_cursor`).

Дубликаты кук (`.instagram.com` vs `www.instagram.com`) схлопываются в `dedupe_cookies()`.
Instagram заблокирован на уровне сети — VPN должен быть включён **системно** (не только в браузере).
