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

Проверка правил на живой базе: `supabase/tests/rpc_smoke.sql` (все проверки прошли, данные откатываются).

## Сделано

- Фронтенд (см. историю): публичный сайт, запись в 4 шага, профиль, панель барбера/владельца, дизайн-система, SEO
- Фронтенд переведён с localStorage на Supabase: `src/data/store.ts` (RPC + таблицы под RLS), `src/data/mappers.ts`, `src/data/supabase.ts`
- Clerk: вход/регистрация (`/login`, `/register`, русский язык, Google), выход, удаление аккаунта; `src/app/AuthSync.tsx` создаёт профиль в Supabase
- В Clerk (dev) добавлен claim `role: authenticated` в токен сессии — нужен Supabase
- Фото загружаются в Supabase Storage
- Демо-режим и локальный вход удалены
- Проверено: tsc, eslint, vitest, build; в браузере — публичные страницы читают данные из Supabase, форма входа Clerk открывается

## Требует тебя

1. Supabase → Authentication → Sign In / Providers → Third-Party Auth → Add provider → Clerk →
   домен `https://innocent-arachnid-4668.clerk.accounts.dev` → Save. БЕЗ ЭТОГО вход не дойдёт до базы.
2. Зарегистрироваться на сайте → Профиль → Настройки → «Стать владельцем» (срабатывает один раз). Сделать это первым.
3. В панели заполнить: название, адрес, телефон, фото, услуги, мастеров с расписанием.
4. Сообщить, что работает/нет — вход не проверен мной (создавать аккаунты в чужих сервисах я не могу).

## НЕ сделано

- Отправка напоминаний (email/Telegram): задачи создаются в `notification_tasks`, но нет Edge Function + Cron для отправки — нужен сервис/бот и ключи
- Часовой пояс во фронтенде: слоты в браузере считаются во времени устройства; сервер проверяет в поясе магазина и отклонит несовпадение
- Привязка барбера к профилю мастера (masters.user_id) — пока нет UI, можно назначить роль «Барбер» в «Пользователи»
- Аналитика считается в браузере по записям за последний год (нет серверной агрегации)
- Интеграция отзывов с 2GIS/Яндекс — только ручное добавление со ссылкой
- E2E Playwright, деплой на Vercel, GitHub-репозиторий, production-инстанс Clerk
- В Clerk dev пароль минимум 15 символов (настройка Clerk по умолчанию) — можно смягчить в Clerk

## Решения

- Название/адрес/телефон не выдуманы: пустые -> пустые состояния; отзывы никогда не генерируются
- Услуги — прайс-листом; красный цвет только для «Записаться»
- Скидки не рассчитываются: правила скидок не заданы
- Записи меняются только через RPC; прямой INSERT/UPDATE в appointments запрещён RLS
