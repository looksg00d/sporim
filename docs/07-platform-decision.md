# 07 · Платформа: Solana + web-first (Next.js), нативное приложение позже

**Решение (2026-09-02, после пивота на «споры между друзьями»):** продукт живёт как **mobile-first web-приложение**.
Спор = ссылка `/b/<id>` с OG-превью, которая разворачивается в iMessage / WhatsApp / Telegram / Discord.
Нативное приложение (Expo) — Phase 3, когда есть юридическая база и ретеншн, который оправдает установку.

## Почему web, а не приложение

| Требование                                                  | Web (Next.js)                           | Нативное (Expo)                                                   |
| ----------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------- |
| **Второй участник принимает спор за 10 с, ничего не ставя** | ✅ ссылка → страница → Accept           | ❌ «скачай, зарегайся» — половина споров умрёт                    |
| Превью-карточка спора в чужом чате                          | ✅ OG-image                             | ❌ только если приложение уже стоит (universal links)             |
| App Store 5.3 (gambling) / 3.1.5 (crypto)                   | не применимо                            | 🔴 почти гарантированный reject для «спор о чём угодно на деньги» |
| Доступность в RU/CIS и везде                                | ✅ день 1                               | зависит от сторов                                                 |
| Кошелёк без сид-фразы                                       | ✅ Privy `react-auth` + Solana embedded | ✅ Privy Expo                                                     |
| Push «подтверди победителя»                                 | PWA push (iOS 16.4+) + **Telegram-бот** | ✅ нативный                                                       |
| Камера для доказательств (1.1)                              | ✅ `getUserMedia` / file input          | ✅                                                                |
| Будильник, который звонит                                   | ❌                                      | ✅ — но после пивота это не ядро                                  |

Единственное, что теряем без натива — системный будильник. После пивота будильник — один шаблон из многих, и его закрывает Telegram-бот/push + «пришли пруф до 7:05».

## Стек

| Слой             | Выбор                                                                                                           | Почему                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Web              | **Next.js 15** (App Router), TypeScript, Tailwind                                                               | OG-image routes, серверные страницы спора, Vercel                                          |
| Кошелёк          | **Privy** `@privy-io/react-auth` + `/solana`: email / Apple / Google → embedded Solana wallet (`createOnLogin`) | нормис не видит сид-фразу; `signAndSendTransaction` в браузере; funding-виджет для on-ramp |
| Chain client     | `@solana/kit` + `@coral-xyz/anchor`                                                                             | стандарт                                                                                   |
| Программа        | **Anchor** (Rust), USDC SPL, PDA-vault на спор                                                                  | см. `05`                                                                                   |
| Backend          | **Supabase** (Postgres + RLS + Edge Functions)                                                                  | как GetStaked / Stakely                                                                    |
| Уведомления      | **Telegram-бот** (grammY) + web push                                                                            | аудитория живёт в чатах; Stakely-паттерн «challenge alerts»                                |
| Оракул/AI (1.1)  | Claude / Gemini vision, подпись вердикта ed25519 → программа проверяет                                          | GetStaked-паттерн                                                                          |
| Хостинг          | Vercel + Helius/Triton RPC                                                                                      | —                                                                                          |
| Native (Phase 3) | Expo, переиспользуя TS-пакеты (program client, типы) из монорепо                                                | не переписывать логику                                                                     |

## Что взять у соседей

- **Betcha** — «bet in 10 seconds»: голос → спор; карточка в чат; скорборд и head-to-head с каждым другом.
- **MNEEBet** — судья выбирается при создании; выплата атомарно при резолюции; draw = refund.
- **ParkTheBus** — fail-closed: без консенсуса деньги не уходят; судья-участник не может голосовать.
- **bet2fun** — permissionless settle: если мы исчезнем, любой закроет спор.
- **Stakely** — Telegram-бот для вызовов и напоминаний.

## Рил — снимать на прототипе Phase 0

Тот же формат «bro rate my startup idea 💀🥀», 5 экранов: _What's the bet?_ → _Stake $20_ → _Deadline_ → _Who decides?_ → _Locked in on Solana ✅ → Share to chat_. Ссылка на waitlist в bio. Прототип на devnet, кошелёк настоящий (Privy), деньги тестовые.

## Открытое

| Пробел                                            | Серьёзность | Закрывает                                                        |
| ------------------------------------------------- | ----------- | ---------------------------------------------------------------- |
| Юридическая рамка (gambling / MSB)                | 🔴          | юрист до mainnet; обязательства-first; лимит $100/спор на старте |
| On-ramp для друга без крипты                      | 🔴          | Privy funding + «создатель платит за обоих»                      |
| Дизайн Anchor-программы (таймауты, судья, refund) | 🟠          | planner → architecture doc                                       |
| OG-карточки и deep-link в Telegram                | 🟡          | Phase 0                                                          |

## Источники

- [Apple App Review Guidelines — 3.1.5, 5.3](https://developer.apple.com/app-store/review/guidelines/)
- [Privy + Solana (React)](https://docs.privy.io/recipes/solana/getting-started-with-privy-and-solana) · [Automatic wallet creation](https://docs.privy.io/basics/react-native/advanced/automatic-wallet-creation)
- Prior art по спорам — `08-friend-bets-prior-art.md`
