# 02 · Forfeit — разбор продукта

**Сайт:** <https://www.forfeit.app/> · **iOS:** [Habit Contracts](https://apps.apple.com/us/app/forfeit-habit-contracts/id1633125787), [Habit Commitment](https://apps.apple.com/ca/app/forfeit-habit-commitment/id6760597781) · **Android:** [app.forfeit.forfeit](https://play.google.com/store/apps/details?id=app.forfeit.forfeit)
**Компания:** Forfeit, Inc (2023), YC-backed. Платформы: iOS, Android, Mac (блокировка), web (Overlord).

## Механика в одном абзаце

Пользователь задаёт **задачу + дедлайн + сумму**. Stripe делает **pre-authorization hold** на карте в момент
коммита. До дедлайна нужно прислать **пруф**; его проверяет AI, спорное — живой человек. Нет пруфа / пруф не
совпадает → hold **захватывается**, деньги ушли. 94 % задач выполняются (по данным Forfeit).

## Цифры (self-reported)

| Метрика            | Значение                   | Источник            |
| ------------------ | -------------------------- | ------------------- |
| Пользователи       | 20 000+                    | Google Play listing |
| Задач (forfeits)   | 75 000+                    | Google Play listing |
| Success rate       | 94 % (6 % провалов)        | Google Play / сайт  |
| «Forfeits set»     | $8.7M                      | forfeit.app         |
| Ошибки верификации | < 5 % провалов из-за пруфа | forfeit.app FAQ     |
| Апелляция          | человек отвечает ≤ 12 ч    | forfeit.app FAQ     |

## Методы верификации (полный список)

| Метод                                         | Кто проверяет                               | Примеры                                                 |
| --------------------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| Photo                                         | AI (сверяет с описанием), спорное → человек | зал, inbox zero, таблетки, «фото с крыльца» для подъёма |
| Video / Timelapse                             | человек                                     | медитация, уборка, работа 1 ч                           |
| Self-Verify                                   | никто                                       | не курить, не пить                                      |
| Friend-Verify                                 | друг-свидетель                              | что угодно                                              |
| GPS check-in / avoid                          | авто                                        | быть в зале / не быть в баре                            |
| Apple Health / Google Fit                     | авто                                        | шаги, тренировки, сон, вес                              |
| Screen Time / Web tracking                    | авто                                        | лимит на TikTok; отключение трекинга = провал           |
| RescueTime, Strava, Whoop, MyFitnessPal, Anki | авто                                        | интеграции                                              |
| Pomodoro-таймер                               | авто                                        | фокус-сессии                                            |
| Plaid (банковский фид)                        | авто                                        | штраф $64 за заказ DoorDash $32                         |

## Строгость и апелляции

- Режимы **Lenient / Normal / Hard**. Hard — апелляции запрещены, «no way out».
- Пользователь сам пишет инструкции для апелляций при создании задачи («принимать любые уважительные» vs «не принимать ничего»).
- Правило нельзя смягчить посреди недели — только при создании.

## Что происходит с деньгами

- **По умолчанию деньги остаются у Forfeit.** Сайт: «For now it is retained by Forfeit. We are building an option to send forfeited money to friends or your own savings.» Часть источников пишет, что уже можно направить в charity или группе друзей.
- Не-денежные последствия: смс/email другу, блокировка приложений, лок Mac.
- ⚠️ Это главный источник недоверия и отличие от stickK (там деньги идут выбранному получателю/anti-charity).

## Монетизация

| Что                 | Цена                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| Скачать             | бесплатно                                                            |
| Free tier           | до 3 активных контрактов                                             |
| Forfeit Premium     | ~$7.99/мес (unlimited contracts, analytics, templates, Apple Health) |
| Overlord (AI-агент) | ~$12.99/мес                                                          |
| Проигранные ставки  | остаются у компании (доход)                                          |

Reddit r/getdisciplined: «It's a lot of money per month so I'm looking for an alternative» — **цена подписки = причина №1 ухода**. Forfeit не публикует цены на своём сайте.

## Overlord — AI-надзиратель

Чат 24/7, звонит на подъём и перед дедлайном, пишет друзьям при провале, 3-слойная память («ловит на
повторных отмазках»), блокирует приложения/сайты, читает GPS/экран/траты/здоровье, сам списывает деньги.
Это их «moat» второго поколения: от «пруф по запросу» к «постоянный мониторинг».

## Сильные стороны → что забираем

1. Пруф-first (evidence вместо честного слова) — единственная защита от самообмана.
2. Stripe pre-auth hold — деньги «уже не твои» с момента коммита. В крипте это **escrow в смарт-контракте** — даже честнее.
3. Апелляции + leniency modes — снимают страх «телефон сел».
4. Onboarding = первый контракт за 5 экранов.

## Слабые стороны → где наш шанс

1. **Деньги уходят компании** → конфликт интересов («им выгодно, чтобы ты провалился»). Крипто: пул проигравших → победителям, прозрачно on-chain.
2. **Подписка $8–13/мес** поверх ставок → ноль подписки, только % с пула / yield.
3. **Страновые ограничения** карт/Stripe → кошелёк работает везде (RU/CIS, LATAM, Азия).
4. **Непрозрачная верификация** (человек с усталостью, по словам сооснователя на форуме Beeminder) → открытый оракул + публичный лог решений.
5. Нет социального слоя ставок «друг против друга» — только соло.

## Источники

- [forfeit.app](https://www.forfeit.app/) · [Google Play](https://play.google.com/store/apps/details?id=app.forfeit.forfeit)
- [Accountablo — Forfeit & Overlord Review (2026)](https://www.accountablo.com/blog/forfeit-overlord-review)
- [FineStreak — stickK vs Forfeit](https://finestreak.com/blog/stickk-vs-forfeit) · [Forfeit vs Beeminder](https://finestreak.com/blog/forfeit-vs-beeminder) · [Forfeit alternatives](https://finestreak.com/blog/forfeit-app-alternatives)
- [dailyhabits.xyz](https://www.dailyhabits.xyz/habit-tracker-app/forfeit) · [ToolMage](https://www.toolmage.com/en/tool/forfeit/) · [MOGE](https://moge.ai/product/forfeit)
