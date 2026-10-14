# PROGRESS — Barbershop

Последнее обновление: 2026-10-14.

## Как запустить

```
cd E:\Projects\Booking\Barbershop
npm run dev      # http://localhost:5173
npm test         # 18 unit-тестов (слоты, статусы, аналитика)
npm run lint
npm run build
```

Ключи лежат в `.env` (публичные: Clerk publishable, Supabase URL + publishable). Шаблон — `.env.example`.

## Бэкенд (Supabase проект BookingService, ref `ihpqnoobjlcpozusxomd`)

Миграции в `supabase/migrations/` (применены):
1. `..._schema.sql` — таблицы из плана: profiles, shop_settings, categories, services, masters, master_services, schedules, breaks, time_off,
   appointments (+ exclusion constraint против пересечений), appointment_items (снимок цены), status_history, notifications,
   notification_tasks (уникальность против дублей напоминаний), reviews, audit_log
2. `..._rls.sql` — RLS на всех таблицах; роль только из profiles; триггер не даёт пользователю менять свою роль
3. `..._rpc.sql` — create_appointment, change_appointment_status, reschedule_appointment (все проверки на сервере, в часовом поясе магазина),
   get_busy_intervals (занятость без персональных данных), ensure_profile, claim_first_owner, set_user_role/active, add_site_review, remove_service
4. `..._storage.sql` — бакет `photos` (JPG/PNG/WebP до 5 МБ, загружает только владелец)
5. `..._split_write_policies.sql` — оптимизация политик
6. `..._save_master.sql` — атомарное сохранение мастера с услугами и расписанием
7. `..._master_user.sql` — привязка аккаунта барбера к мастеру (set_master_user)
8. `..._reminders.sql` — очередь напоминаний: claim_due_reminders / complete_reminder (только service_role), секрет cron в Vault
9. `..._reminders_cron.sql` — pg_cron каждые 5 минут вызывает Edge Function `send-reminders`

Edge Function: `supabase/functions/send-reminders` (Resend; Idempotency-Key против дублей; до 3 попыток; проверка статуса записи перед отправкой).

Проверка правил на живой базе: `supabase/tests/rpc_smoke.sql` (все проверки прошли, данные откатываются).

## Сделано

- Фронтенд (см. историю): публичный сайт, запись в 4 шага, профиль, панель барбера/владельца, дизайн-система, SEO
- Фронтенд переведён с localStorage на Supabase: `src/data/store.ts` (RPC + таблицы под RLS), `src/data/mappers.ts`, `src/data/supabase.ts`
- Clerk: вход/регистрация (`/login`, `/register`, русский язык, Google), выход, удаление аккаунта; `src/app/AuthSync.tsx` создаёт профиль в Supabase
- В Clerk (dev) добавлен claim `role: authenticated` в токен сессии — нужен Supabase
- Фото загружаются в Supabase Storage
- Демо-режим и локальный вход удалены
- Проверено: tsc, eslint, vitest, build; в браузере — публичные страницы читают данные из Supabase, форма входа Clerk открывается

## Сделано 2026-10-14 (вторая часть)

- Вход Clerk -> Supabase проверен владельцем: профиль, роль владельца, услуга, мастер, запись создаются
- Привязка барбера к мастеру: Панель -> Мастера -> «Аккаунт в панели» (барбер видит только свои записи)
- Часовой пояс: слоты, даты и время на сайте считаются в поясе барбершопа (`src/domain/tz.ts`), тесты на разные пояса
- Git: репозиторий инициализирован, первый коммит; `vercel.json` для SPA-маршрутов

## Деплой

- GitHub (приватный): https://github.com/AbubakirDev-react/barbershop-booking
- Vercel: https://barbershop-booking-xi.vercel.app (автодеплой при push в main)

## Требует тебя

1. (сделано) Third-Party Auth Clerk в Supabase, роль владельца
2. Проверить часовой пояс в Панели -> Настройки (сейчас Europe/Moscow; устройство владельца — UTC+5)
3. Для деплоя: в терминале `gh auth login` и `npx vercel login`, затем сказать мне
4. Supabase -> Edge Functions -> Secrets: добавить RESEND_API_KEY (ключ Resend). Без него функция отвечает 503 и задачи ждут.
5. Для писем клиентам — подтвердить свой домен в Resend и добавить секрет RESEND_FROM (например `Барбершоп <noreply@домен.ru>`).
   Пока домена нет, Resend доставляет письма только на email владельца аккаунта Resend.

## НЕ сделано

- Telegram-канал напоминаний (задачи помечаются «не подключён»)
- Аналитика считается в браузере по записям за последний год (нет серверной агрегации)
- Интеграция отзывов с 2GIS/Яндекс — только ручное добавление со ссылкой
- E2E Playwright, production-инстанс Clerk (сейчас dev-ключи — на сайте плашка Development mode), свой домен
- В Clerk dev пароль минимум 15 символов (настройка Clerk по умолчанию) — можно смягчить в Clerk

## Решения

- Название/адрес/телефон не выдуманы: пустые -> пустые состояния; отзывы никогда не генерируются
- Услуги — прайс-листом; красный цвет только для «Записаться»
- Скидки не рассчитываются: правила скидок не заданы
- Записи меняются только через RPC; прямой INSERT/UPDATE в appointments запрещён RLS
