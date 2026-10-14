-- =====================================================================
-- Схема данных барбершопа. Идентификатор пользователя — Clerk user id
-- (auth.jwt() ->> 'sub'), поэтому profiles.id имеет тип text.
-- Миграция повторно применима: всё через IF NOT EXISTS / ON CONFLICT.
-- =====================================================================

create extension if not exists btree_gist with schema extensions;

do $$ begin create type public.app_role as enum ('client', 'barber', 'owner');
exception when duplicate_object then null; end $$;

do $$ begin create type public.appointment_status as enum ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');
exception when duplicate_object then null; end $$;

do $$ begin create type public.appointment_source as enum ('online', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin create type public.review_status as enum ('pending', 'published', 'hidden');
exception when duplicate_object then null; end $$;

do $$ begin create type public.review_source as enum ('site', '2gis', 'yandex', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin create type public.notification_channel as enum ('email', 'telegram');
exception when duplicate_object then null; end $$;

-- ---------- Пользователи ----------
create table if not exists public.profiles (
  id text primary key default (auth.jwt() ->> 'sub'),
  name text not null default '' check (char_length(name) <= 60),
  surname text not null default '' check (char_length(surname) <= 60),
  phone text not null default '' check (char_length(phone) <= 32),
  email text not null default '' check (char_length(email) <= 254),
  role public.app_role not null default 'client',
  active boolean not null default true,
  reminders boolean not null default true,
  channel public.notification_channel not null default 'email',
  marketing boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists profiles_role_idx on public.profiles (role);

-- ---------- Настройки барбершопа (одна строка) ----------
create table if not exists public.shop_settings (
  id smallint primary key default 1 check (id = 1),
  name text not null default '' check (char_length(name) <= 60),
  description text not null default '' check (char_length(description) <= 300),
  address text not null default '' check (char_length(address) <= 200),
  phone text not null default '' check (char_length(phone) <= 32),
  hours_note text not null default '' check (char_length(hours_note) <= 500),
  hero_photo_path text,
  timezone text not null default 'Europe/Moscow',
  slot_step_minutes integer not null default 30 check (slot_step_minutes in (15, 20, 30, 60)),
  min_lead_minutes integer not null default 60 check (min_lead_minutes between 0 and 10080),
  horizon_days integer not null default 30 check (horizon_days between 1 and 365),
  cancel_before_hours integer not null default 2 check (cancel_before_hours between 0 and 168),
  reschedule_before_hours integer not null default 2 check (reschedule_before_hours between 0 and 168),
  link_2gis text not null default '',
  link_yandex_maps text not null default '',
  link_telegram text not null default '',
  link_instagram text not null default '',
  updated_at timestamptz not null default now()
);
-- Только технические значения по умолчанию; название/адрес задаёт владелец
insert into public.shop_settings (id) values (1) on conflict (id) do nothing;

-- ---------- Каталог ----------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 40),
  sort integer not null default 0
);
insert into public.categories (name, sort) values
  ('Стрижка', 0), ('Борода', 1), ('Комплексы', 2), ('Скидки', 3), ('Новинки', 4)
on conflict (name) do nothing;

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  category_id uuid references public.categories (id) on delete set null,
  price numeric(10, 2) not null check (price >= 0),
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  active boolean not null default true,
  sort integer not null default 0,
  photo_path text,
  created_at timestamptz not null default now()
);
create index if not exists services_category_idx on public.services (category_id);
create index if not exists services_active_sort_idx on public.services (active, sort);

create table if not exists public.masters (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  specialization text not null default '' check (char_length(specialization) <= 60),
  bio text not null default '' check (char_length(bio) <= 400),
  photo_path text,
  active boolean not null default true,
  user_id text unique references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.master_services (
  master_id uuid not null references public.masters (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  primary key (master_id, service_id)
);
create index if not exists master_services_service_idx on public.master_services (service_id);

-- weekday как в JS getDay(): 0 — воскресенье
create table if not exists public.schedules (
  master_id uuid not null references public.masters (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  primary key (master_id, weekday),
  check (end_time > start_time)
);

create table if not exists public.breaks (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references public.masters (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index if not exists breaks_master_day_idx on public.breaks (master_id, weekday);

-- master_id null — выходной всего барбершопа
create table if not exists public.time_off (
  id uuid primary key default gen_random_uuid(),
  master_id uuid references public.masters (id) on delete cascade,
  date_from date not null,
  date_to date not null,
  reason text not null default '' check (char_length(reason) <= 80),
  created_at timestamptz not null default now(),
  check (date_to >= date_from)
);
create index if not exists time_off_master_dates_idx on public.time_off (master_id, date_from, date_to);

-- ---------- Записи ----------
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  -- ключ идемпотентности: повторная отправка возвращает ту же запись
  request_id uuid not null unique,
  created_by text references public.profiles (id) on delete set null,
  client_user_id text references public.profiles (id) on delete set null,
  client_name text not null check (char_length(client_name) between 1 and 100),
  client_phone text not null check (char_length(client_phone) between 1 and 32),
  master_id uuid not null references public.masters (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'pending',
  source public.appointment_source not null,
  note text not null default '' check (char_length(note) <= 500),
  total numeric(10, 2) not null check (total >= 0),
  duration_minutes integer not null check (duration_minutes > 0),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Главная защита от двойного бронирования: PostgreSQL не даст сохранить
  -- две активные записи одного мастера с пересекающимся временем,
  -- даже если два запроса пришли одновременно.
  constraint appointments_no_overlap exclude using gist (
    master_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed', 'in_progress'))
);
create index if not exists appointments_master_start_idx on public.appointments (master_id, starts_at);
create index if not exists appointments_client_start_idx on public.appointments (client_user_id, starts_at);
create index if not exists appointments_status_start_idx on public.appointments (status, starts_at);

-- Снимок услуги на момент записи: изменения каталога не меняют историю
create table if not exists public.appointment_items (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  service_id uuid references public.services (id) on delete set null,
  service_name text not null,
  price numeric(10, 2) not null check (price >= 0),
  duration_minutes integer not null check (duration_minutes > 0),
  position smallint not null default 0
);
create index if not exists appointment_items_appt_idx on public.appointment_items (appointment_id);
create index if not exists appointment_items_service_idx on public.appointment_items (service_id);

create table if not exists public.status_history (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  at timestamptz not null default now(),
  from_status public.appointment_status,
  to_status public.appointment_status not null,
  actor_id text,
  actor_role text not null,
  actor_name text not null default '',
  reason text,
  note text
);
create index if not exists status_history_appt_idx on public.status_history (appointment_id, at);

-- ---------- Уведомления ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  -- 'staff' — для всей панели, иначе id пользователя
  scope text not null,
  type text not null check (type in ('appointment_created', 'appointment_confirmed', 'appointment_cancelled', 'appointment_rescheduled', 'needs_attention')),
  title text not null,
  body text not null default '',
  appointment_id uuid references public.appointments (id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_scope_idx on public.notifications (scope, created_at desc);

-- Задачи внешней отправки. unique(appointment_id, kind) — защита от дублей
create table if not exists public.notification_tasks (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  kind text not null check (kind in ('reminder_24h', 'reminder_2h')),
  channel public.notification_channel not null,
  send_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (appointment_id, kind)
);
create index if not exists notification_tasks_due_idx on public.notification_tasks (status, send_at);

-- ---------- Отзывы ----------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  author_id text references public.profiles (id) on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 80),
  rating smallint not null check (rating between 1 and 5),
  text text not null check (char_length(text) between 1 and 2000),
  source public.review_source not null,
  source_url text not null default '',
  status public.review_status not null default 'pending',
  appointment_id uuid unique references public.appointments (id) on delete set null,
  created_at timestamptz not null default now(),
  -- отзыв из внешнего источника обязан иметь ссылку на оригинал
  check (source = 'site' or char_length(source_url) > 0)
);
create index if not exists reviews_status_idx on public.reviews (status, created_at desc);

-- ---------- Журнал административных действий ----------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id text,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);

-- Индексы для внешних ключей (рекомендация линтера Supabase)
create index if not exists notifications_appt_idx on public.notifications (appointment_id);
create index if not exists reviews_author_idx on public.reviews (author_id);
create index if not exists appointments_created_by_idx on public.appointments (created_by);
