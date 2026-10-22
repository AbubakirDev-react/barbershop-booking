-- =====================================================================
-- Клиенты без регистрации. Клиент вводит имя и телефон при записи:
-- номер уже есть -> вход (имя должно совпасть), нет -> создаётся клиент.
-- Браузер получает токен сессии; в базе хранится только его sha256.
-- Все действия клиента — через функции client_* (anon), напрямую таблицы
-- клиентам недоступны. Сотрудники входят через Supabase Auth.
-- =====================================================================

-- ---------- Телефон: нормализация до 7XXXXXXXXXX ----------
create or replace function public._normalize_phone(p text)
returns text language plpgsql immutable set search_path = ''
as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if length(d) = 11 and left(d, 1) = '8' then d := '7' || substr(d, 2); end if;
  if length(d) = 10 then d := '7' || d; end if;
  if d !~ '^7[0-9]{10}$' then return null; end if;
  return d;
end $$;

create or replace function public._format_phone(d text)
returns text language sql immutable set search_path = ''
as $$ select '+7 ' || substr(d, 2, 3) || ' ' || substr(d, 5, 3) || '-' || substr(d, 8, 2) || '-' || substr(d, 10, 2) $$;

-- ---------- Таблицы ----------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone ~ '^7[0-9]{10}$'),
  name text not null check (char_length(name) between 1 and 60),
  reminders boolean not null default true,
  telegram_chat_id bigint unique,
  telegram_link_code text unique,
  telegram_link_expires timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.client_sessions (
  token_hash text primary key,
  client_id uuid not null references public.clients (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists client_sessions_client_idx on public.client_sessions (client_id);

alter table public.clients enable row level security;
alter table public.client_sessions enable row level security;
-- Сотрудники видят клиентов; клиенты работают только через функции
drop policy if exists clients_staff_select on public.clients;
create policy clients_staff_select on public.clients for select to authenticated using ((select public.is_staff()));

alter table public.appointments add column if not exists client_id uuid references public.clients (id) on delete set null;
create index if not exists appointments_client_id_idx on public.appointments (client_id, starts_at);
alter table public.reviews add column if not exists client_id uuid references public.clients (id) on delete set null;
create index if not exists reviews_client_idx on public.reviews (client_id);

-- ---------- Перенос существующих записей на клиентов по телефону ----------
insert into public.clients (phone, name)
select distinct on (n) n, left(client_name, 60)
from (select public._normalize_phone(client_phone) as n, client_name, created_at from public.appointments) x
where n is not null
order by n, created_at desc
on conflict (phone) do nothing;

update public.appointments a
   set client_id = c.id
  from public.clients c
 where a.client_id is null and c.phone = public._normalize_phone(a.client_phone);

-- Telegram, привязанный раньше к аккаунту Clerk, переносим на клиента
update public.clients c
   set telegram_chat_id = src.chat
  from (
    select distinct on (a.client_id) a.client_id, p.telegram_chat_id as chat
    from public.appointments a
    join public.profiles p on p.id = a.client_user_id
    where p.telegram_chat_id is not null and a.client_id is not null
    order by a.client_id, a.created_at desc
  ) src
 where c.id = src.client_id and c.telegram_chat_id is null
   and not exists (select 1 from public.clients c2 where c2.telegram_chat_id = src.chat);

-- ---------- Сессия клиента ----------
create or replace function public._token_hash(p_token text)
returns text language sql immutable set search_path = ''
as $$ select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') $$;

create or replace function public._client_json(c public.clients)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'phone', public._format_phone(c.phone),
    'reminders', c.reminders, 'telegramLinked', c.telegram_chat_id is not null
  )
$$;

create or replace function public._client_session(p_token text)
returns public.clients
language plpgsql security definer set search_path = ''
as $$
declare
  c public.clients;
  v_hash text := public._token_hash(p_token);
begin
  if coalesce(p_token, '') = '' then
    raise exception 'Укажите имя и телефон' using errcode = 'P0001';
  end if;
  select cl.* into c
  from public.client_sessions s join public.clients cl on cl.id = s.client_id
  where s.token_hash = v_hash;
  if not found then
    raise exception 'Сессия истекла. Укажите имя и телефон ещё раз' using errcode = 'P0001';
  end if;
  update public.client_sessions set last_seen_at = now() where token_hash = v_hash;
  return c;
end $$;

-- Вход или регистрация по телефону и имени
create or replace function public.client_login(p_phone text, p_name text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_phone text := public._normalize_phone(p_phone);
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  c public.clients;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if v_phone is null then
    raise exception 'Номер в формате +7 900 123-45-67' using errcode = 'P0001';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'Укажите имя' using errcode = 'P0001';
  end if;
  select * into c from public.clients where phone = v_phone for update;
  if found then
    -- Простая страховка от опечатки в чужом номере: имя должно совпасть
    if lower(replace(c.name, ' ', '')) <> lower(replace(v_name, ' ', '')) then
      raise exception 'Этот номер уже записан на другое имя. Укажите имя, которое вводили при первой записи' using errcode = 'P0001';
    end if;
    update public.clients set last_seen_at = now() where id = c.id;
  else
    insert into public.clients (phone, name) values (v_phone, v_name) returning * into c;
  end if;
  insert into public.client_sessions (token_hash, client_id) values (public._token_hash(v_token), c.id);
  return jsonb_build_object('token', v_token, 'client', public._client_json(c));
end $$;

create or replace function public.client_me(p_token text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  return public._client_json(public._client_session(p_token));
end $$;

create or replace function public.client_logout(p_token text)
returns void
language sql security definer set search_path = ''
as $$ delete from public.client_sessions where token_hash = public._token_hash(p_token) $$;

-- ---------- Напоминания: клиенты без аккаунта получают их в Telegram ----------
create or replace function public._schedule_reminders(p_appt uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  a public.appointments;
  cl public.clients;
  p public.profiles;
  v_channel public.notification_channel;
  k record;
begin
  perform public._cancel_reminders(p_appt);
  select * into a from public.appointments where id = p_appt;
  if not found or a.status not in ('pending', 'confirmed') then return; end if;

  if a.client_id is not null then
    select * into cl from public.clients where id = a.client_id;
    if not cl.reminders or cl.telegram_chat_id is null then return; end if;
    v_channel := 'telegram';
  elsif a.client_user_id is not null then
    select * into p from public.profiles where id = a.client_user_id;
    if not found or not p.reminders or not p.active then return; end if;
    v_channel := p.channel;
  else
    return;
  end if;

  for k in select * from (values ('reminder_24h', interval '24 hours'), ('reminder_2h', interval '2 hours')) v(kind, before) loop
    if a.starts_at - k.before > now() then
      insert into public.notification_tasks (appointment_id, kind, channel, send_at, status, attempts, last_error, sent_at)
      values (a.id, k.kind, v_channel, a.starts_at - k.before, 'pending', 0, null, null)
      on conflict (appointment_id, kind) do update
        set channel = excluded.channel, send_at = excluded.send_at, status = 'pending',
            attempts = 0, last_error = null, sent_at = null;
    end if;
  end loop;
end $$;

drop function if exists public.claim_due_reminders(integer);
create function public.claim_due_reminders(p_limit integer default 50)
returns table (
  task_id uuid, kind text, channel public.notification_channel, attempts integer,
  appointment_number bigint, starts_at timestamptz, ends_at timestamptz, client_name text,
  email text, telegram_chat_id bigint, master_name text, services text, total numeric,
  shop_name text, shop_address text, shop_phone text, timezone text
)
language plpgsql security definer set search_path = ''
as $$
declare
  t record;
  v_ids uuid[] := array[]::uuid[];
  v_email_on boolean := (select s.email_reminders_enabled from public.shop_settings s where s.id = 1);
begin
  update public.notification_tasks
     set status = 'pending', claimed_at = null
   where status = 'processing' and claimed_at < now() - interval '10 minutes';

  for t in
    select nt.id, nt.channel as ch, a.status as appt_status, a.starts_at as appt_start,
           coalesce(cl.reminders, p.reminders) as rem,
           coalesce(p.active, true) as act,
           p.email as p_email,
           coalesce(cl.telegram_chat_id, p.telegram_chat_id) as chat
    from public.notification_tasks nt
    join public.appointments a on a.id = nt.appointment_id
    left join public.clients cl on cl.id = a.client_id
    left join public.profiles p on p.id = a.client_user_id
    where nt.status = 'pending' and nt.send_at <= now()
    order by nt.send_at
    limit greatest(1, least(p_limit, 200))
    for update of nt skip locked
  loop
    if t.appt_status not in ('pending', 'confirmed') or t.appt_start <= now() then
      update public.notification_tasks set status = 'cancelled' where id = t.id;
    elsif t.rem is distinct from true or t.act is distinct from true then
      update public.notification_tasks set status = 'cancelled', last_error = 'Клиент отключил напоминания' where id = t.id;
    elsif t.ch = 'telegram' and t.chat is null then
      update public.notification_tasks set status = 'failed', last_error = 'Клиент не подключил Telegram' where id = t.id;
    elsif t.ch = 'email' and not coalesce(v_email_on, false) then
      update public.notification_tasks set status = 'failed', last_error = 'Email-напоминания выключены владельцем' where id = t.id;
    elsif t.ch = 'email' and coalesce(t.p_email, '') = '' then
      update public.notification_tasks set status = 'failed', last_error = 'У клиента не указан email' where id = t.id;
    else
      update public.notification_tasks
         set status = 'processing', claimed_at = now(), attempts = notification_tasks.attempts + 1
       where id = t.id;
      v_ids := v_ids || t.id;
    end if;
  end loop;

  return query
  select nt.id, nt.kind, nt.channel, nt.attempts, a.number, a.starts_at, a.ends_at, a.client_name,
         p.email, coalesce(cl.telegram_chat_id, p.telegram_chat_id), m.name,
         (select string_agg(i.service_name, ', ' order by i.position) from public.appointment_items i where i.appointment_id = a.id),
         a.total, s.name, s.address, s.phone, s.timezone
  from public.notification_tasks nt
  join public.appointments a on a.id = nt.appointment_id
  left join public.clients cl on cl.id = a.client_id
  left join public.profiles p on p.id = a.client_user_id
  join public.masters m on m.id = a.master_id
  cross join public.shop_settings s
  where nt.id = any (v_ids) and s.id = 1;
end $$;

-- ---------- Ядро бронирования: одно место для всех правил ----------
create or replace function public._book(
  p_request_id uuid, p_master_id uuid, p_service_ids uuid[], p_starts_at timestamptz,
  p_client_name text, p_client_phone text, p_note text, p_source public.appointment_source,
  p_actor_id text, p_actor_role text, p_actor_name text, p_client_id uuid, p_client_user_id text
) returns public.appointments
language plpgsql security definer set search_path = ''
as $$
declare
  v_existing public.appointments;
  v_appt public.appointments;
  v_sid uuid;
  v_svc public.services;
  v_total numeric(10, 2) := 0;
  v_duration integer := 0;
  v_count integer := coalesce(array_length(p_service_ids, 1), 0);
  v_status public.appointment_status;
  v_name text := trim(coalesce(p_client_name, ''));
  v_phone text := trim(coalesce(p_client_phone, ''));
begin
  -- Идемпотентность: повтор того же запроса тем же клиентом/сотрудником
  select * into v_existing from public.appointments where request_id = p_request_id;
  if found then
    if (p_client_id is not null and v_existing.client_id = p_client_id)
       or (p_actor_id is not null and v_existing.created_by = p_actor_id) then
      return v_existing;
    end if;
    raise exception 'Некорректный ключ запроса' using errcode = 'P0001';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 100 then
    raise exception 'Укажите имя клиента' using errcode = 'P0001';
  end if;
  if v_phone !~ '^\+?[0-9 ()-]{10,20}$' then
    raise exception 'Укажите корректный телефон' using errcode = 'P0001';
  end if;
  if v_count < 1 then
    raise exception 'Выберите хотя бы одну услугу' using errcode = 'P0001';
  end if;
  if v_count > 3 then
    raise exception 'В одной записи можно выбрать не больше 3 услуг' using errcode = 'P0001';
  end if;
  if (select count(distinct x) from unnest(p_service_ids) x) <> v_count then
    raise exception 'Услуга выбрана дважды' using errcode = 'P0001';
  end if;

  -- Блокировка мастера сериализует одновременные записи; exclusion constraint — вторая линия
  perform 1 from public.masters where id = p_master_id and active for update;
  if not found then
    raise exception 'Мастер недоступен' using errcode = 'P0001';
  end if;

  foreach v_sid in array p_service_ids loop
    select * into v_svc from public.services where id = v_sid and active;
    if not found then
      raise exception 'Одна из услуг больше недоступна' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.master_services where master_id = p_master_id and service_id = v_sid) then
      raise exception 'Мастер не выполняет услугу «%»', v_svc.name using errcode = 'P0001';
    end if;
    v_total := v_total + v_svc.price;
    v_duration := v_duration + v_svc.duration_minutes;
  end loop;

  perform public._assert_slot_available(
    p_master_id, p_starts_at, p_starts_at + make_interval(mins => v_duration), null, p_source = 'manual'
  );

  v_status := case when p_source = 'manual' then 'confirmed' else 'pending' end;

  begin
    insert into public.appointments (
      request_id, created_by, client_user_id, client_id, client_name, client_phone, master_id,
      starts_at, ends_at, status, source, note, total, duration_minutes
    ) values (
      p_request_id, p_actor_id, p_client_user_id, p_client_id, v_name, v_phone, p_master_id,
      p_starts_at, p_starts_at + make_interval(mins => v_duration), v_status, p_source,
      left(trim(coalesce(p_note, '')), 500), v_total, v_duration
    ) returning * into v_appt;
  exception
    when exclusion_violation then
      raise exception 'Это время уже занято. Выберите другое' using errcode = 'P0001';
    when unique_violation then
      select * into v_existing from public.appointments where request_id = p_request_id;
      if found and ((p_client_id is not null and v_existing.client_id = p_client_id)
                    or (p_actor_id is not null and v_existing.created_by = p_actor_id)) then
        return v_existing;
      end if;
      raise;
  end;

  insert into public.appointment_items (appointment_id, service_id, service_name, price, duration_minutes, position)
  select v_appt.id, s.id, s.name, s.price, s.duration_minutes, u.ord
  from unnest(p_service_ids) with ordinality as u(sid, ord)
  join public.services s on s.id = u.sid;

  insert into public.status_history (appointment_id, from_status, to_status, actor_id, actor_role, actor_name)
  values (v_appt.id, null, v_status, p_actor_id, p_actor_role, coalesce(p_actor_name, ''));

  if p_source = 'online' then
    insert into public.notifications (scope, type, title, body, appointment_id)
    values ('staff', 'appointment_created', 'Новая запись №' || v_appt.number,
            v_name || '. Требуется подтверждение', v_appt.id);
  end if;

  perform public._schedule_reminders(v_appt.id);
  return v_appt;
end $$;

-- Запись сотрудником (ручная). Клиент заводится/находится по телефону
create or replace function public.create_appointment(
  p_request_id uuid, p_master_id uuid, p_service_ids uuid[], p_starts_at timestamptz,
  p_client_name text, p_client_phone text, p_note text default '',
  p_source public.appointment_source default 'online'
) returns public.appointments
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid text := public.current_uid();
  v_role public.app_role := public.current_app_role();
  v_own_master uuid := public.own_master_id();
  v_phone text := public._normalize_phone(p_client_phone);
  v_client uuid;
begin
  if v_uid is null or v_role is null then
    raise exception 'Войдите в аккаунт сотрудника' using errcode = 'P0001';
  end if;
  if v_role not in ('barber', 'owner') then
    raise exception 'Онлайн-запись клиентов идёт через client_book' using errcode = 'P0001';
  end if;
  if v_role = 'barber' and v_own_master is not null and v_own_master <> p_master_id then
    raise exception 'Барбер может записывать клиентов только к себе' using errcode = 'P0001';
  end if;
  if v_phone is not null then
    insert into public.clients (phone, name) values (v_phone, left(trim(p_client_name), 60)) on conflict (phone) do nothing;
    select id into v_client from public.clients where phone = v_phone;
  end if;
  return public._book(
    p_request_id, p_master_id, p_service_ids, p_starts_at, p_client_name,
    coalesce(public._format_phone(v_phone), p_client_phone), p_note, 'manual',
    v_uid, v_role::text, public._actor_name(v_uid), v_client, null
  );
end $$;

-- Онлайн-запись клиентом по токену сессии
create or replace function public.client_book(
  p_token text, p_request_id uuid, p_master_id uuid, p_service_ids uuid[], p_starts_at timestamptz, p_note text default ''
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c public.clients := public._client_session(p_token);
  a public.appointments;
begin
  a := public._book(
    p_request_id, p_master_id, p_service_ids, p_starts_at, c.name, public._format_phone(c.phone), p_note, 'online',
    null, 'client', c.name, c.id, null
  );
  return jsonb_build_object('id', a.id, 'number', a.number, 'status', a.status, 'starts_at', a.starts_at);
end $$;

create or replace function public.client_appointments(p_token text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c public.clients := public._client_session(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'number', a.number, 'request_id', a.request_id, 'client_user_id', null,
      'client_name', a.client_name, 'client_phone', a.client_phone, 'master_id', a.master_id,
      'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', a.status, 'source', a.source,
      'note', a.note, 'total', a.total, 'duration_minutes', a.duration_minutes, 'created_at', a.created_at,
      'appointment_items', (
        select coalesce(jsonb_agg(jsonb_build_object('service_id', i.service_id, 'service_name', i.service_name,
          'price', i.price, 'duration_minutes', i.duration_minutes, 'position', i.position)), '[]'::jsonb)
        from public.appointment_items i where i.appointment_id = a.id),
      'status_history', (
        select coalesce(jsonb_agg(jsonb_build_object('at', h.at, 'from_status', h.from_status, 'to_status', h.to_status,
          'actor_role', h.actor_role, 'actor_name', h.actor_name, 'reason', h.reason, 'note', h.note)), '[]'::jsonb)
        from public.status_history h where h.appointment_id = a.id),
      'has_review', exists (select 1 from public.reviews r where r.appointment_id = a.id)
    ) order by a.starts_at desc)
    from public.appointments a where a.client_id = c.id
  ), '[]'::jsonb);
end $$;

create or replace function public.client_cancel(p_token text, p_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  c public.clients := public._client_session(p_token);
  a public.appointments;
  s public.shop_settings;
begin
  select * into a from public.appointments where id = p_id and client_id = c.id for update;
  if not found then
    raise exception 'Запись не найдена' using errcode = 'P0001';
  end if;
  if a.status not in ('pending', 'confirmed') then
    raise exception 'Эту запись уже нельзя отменить онлайн' using errcode = 'P0001';
  end if;
  select * into s from public.shop_settings where id = 1;
  if a.starts_at - now() < make_interval(hours => s.cancel_before_hours) then
    raise exception 'Отменить онлайн можно не позднее чем за % ч до начала. Позвоните в барбершоп', s.cancel_before_hours
      using errcode = 'P0001';
  end if;
  update public.appointments set status = 'cancelled' where id = p_id;
  insert into public.status_history (appointment_id, from_status, to_status, actor_role, actor_name, reason)
  values (p_id, a.status, 'cancelled', 'client', c.name, nullif(left(trim(coalesce(p_reason, '')), 300), ''));
  perform public._cancel_reminders(p_id);
  insert into public.notifications (scope, type, title, body, appointment_id)
  values ('staff', 'appointment_cancelled', 'Запись №' || a.number || ' отменена клиентом', a.client_name, p_id);
end $$;

create or replace function public.client_reschedule(p_token text, p_id uuid, p_starts_at timestamptz)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  c public.clients := public._client_session(p_token);
  a public.appointments;
  s public.shop_settings;
  v_old timestamptz;
begin
  select * into a from public.appointments where id = p_id and client_id = c.id for update;
  if not found then
    raise exception 'Запись не найдена' using errcode = 'P0001';
  end if;
  if a.status not in ('pending', 'confirmed') then
    raise exception 'Перенести можно только ожидающую или подтверждённую запись' using errcode = 'P0001';
  end if;
  select * into s from public.shop_settings where id = 1;
  if a.starts_at - now() < make_interval(hours => s.reschedule_before_hours) then
    raise exception 'Перенести онлайн можно не позднее чем за % ч до начала', s.reschedule_before_hours using errcode = 'P0001';
  end if;
  perform 1 from public.masters where id = a.master_id and active for update;
  if not found then
    raise exception 'Мастер недоступен' using errcode = 'P0001';
  end if;
  perform public._assert_slot_available(a.master_id, p_starts_at, p_starts_at + make_interval(mins => a.duration_minutes), a.id, false);
  v_old := a.starts_at;
  begin
    update public.appointments
       set starts_at = p_starts_at, ends_at = p_starts_at + make_interval(mins => a.duration_minutes)
     where id = p_id;
  exception when exclusion_violation then
    raise exception 'Это время уже занято. Выберите другое' using errcode = 'P0001';
  end;
  insert into public.status_history (appointment_id, from_status, to_status, actor_role, actor_name, note)
  values (p_id, a.status, a.status, 'client', c.name, 'Перенос с ' || v_old::text);
  perform public._schedule_reminders(p_id);
  insert into public.notifications (scope, type, title, body, appointment_id)
  values ('staff', 'appointment_rescheduled', 'Запись №' || a.number || ' перенесена клиентом', a.client_name, p_id);
end $$;

create or replace function public.client_set_reminders(p_token text, p_on boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c public.clients := public._client_session(p_token);
  a record;
begin
  update public.clients set reminders = coalesce(p_on, true) where id = c.id returning * into c;
  for a in select id from public.appointments where client_id = c.id and status in ('pending', 'confirmed') and starts_at > now() loop
    perform public._schedule_reminders(a.id);
  end loop;
  return public._client_json(c);
end $$;

create or replace function public.client_telegram_link(p_token text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  c public.clients := public._client_session(p_token);
  v_code text := encode(extensions.gen_random_bytes(12), 'hex');
begin
  update public.clients set telegram_link_code = v_code, telegram_link_expires = now() + interval '15 minutes' where id = c.id;
  return v_code;
end $$;

create or replace function public.client_unlink_telegram(p_token text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c public.clients := public._client_session(p_token);
begin
  update public.clients set telegram_chat_id = null, telegram_link_code = null, telegram_link_expires = null
   where id = c.id returning * into c;
  return public._client_json(c);
end $$;

create or replace function public.client_add_review(p_token text, p_appointment_id uuid, p_rating smallint, p_text text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  c public.clients := public._client_session(p_token);
  a public.appointments;
  v_text text := trim(coalesce(p_text, ''));
begin
  select * into a from public.appointments where id = p_appointment_id and client_id = c.id;
  if not found or a.status <> 'completed' then
    raise exception 'Отзыв можно оставить после завершённой записи' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.reviews where appointment_id = p_appointment_id) then
    raise exception 'Вы уже оставили отзыв по этой записи' using errcode = 'P0001';
  end if;
  if p_rating not between 1 and 5 then
    raise exception 'Поставьте оценку от 1 до 5' using errcode = 'P0001';
  end if;
  if char_length(v_text) < 10 or char_length(v_text) > 1000 then
    raise exception 'Отзыв — от 10 до 1000 символов' using errcode = 'P0001';
  end if;
  insert into public.reviews (client_id, author_name, rating, text, source, status, appointment_id)
  values (c.id, c.name, p_rating, v_text, 'site', 'pending', p_appointment_id);
end $$;

-- ---------- Telegram-вебхук: сначала клиенты, затем аккаунты сотрудников ----------
create or replace function public.link_telegram(p_code text, p_chat_id bigint)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_cid uuid;
  v_uid text;
  v_name text;
  a record;
begin
  select id, name into v_cid, v_name from public.clients
   where telegram_link_code = p_code and telegram_link_expires > now() for update;
  if v_cid is not null then
    update public.clients set telegram_chat_id = null where telegram_chat_id = p_chat_id and id <> v_cid;
    update public.clients
       set telegram_chat_id = p_chat_id, telegram_link_code = null, telegram_link_expires = null, reminders = true
     where id = v_cid;
    for a in select id from public.appointments where client_id = v_cid and status in ('pending', 'confirmed') and starts_at > now() loop
      perform public._schedule_reminders(a.id);
    end loop;
    return coalesce(nullif(v_name, ''), 'клиент');
  end if;

  perform set_config('app.role_guard_bypass', 'on', true);
  select id, name into v_uid, v_name from public.profiles
   where telegram_link_code = p_code and telegram_link_expires > now() for update;
  if v_uid is null then
    perform set_config('app.role_guard_bypass', 'off', true);
    return null;
  end if;
  update public.profiles set telegram_chat_id = null where telegram_chat_id = p_chat_id and id <> v_uid;
  update public.profiles
     set telegram_chat_id = p_chat_id, telegram_link_code = null, telegram_link_expires = null, channel = 'telegram', reminders = true
   where id = v_uid;
  perform set_config('app.role_guard_bypass', 'off', true);
  return coalesce(nullif(v_name, ''), 'сотрудник');
end $$;

create or replace function public.unlink_telegram_chat(p_chat_id bigint)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v1 integer;
  v2 integer;
begin
  update public.clients set telegram_chat_id = null where telegram_chat_id = p_chat_id;
  get diagnostics v1 = row_count;
  perform set_config('app.role_guard_bypass', 'on', true);
  update public.profiles set telegram_chat_id = null where telegram_chat_id = p_chat_id;
  get diagnostics v2 = row_count;
  perform set_config('app.role_guard_bypass', 'off', true);
  return v1 + v2 > 0;
end $$;

-- ---------- Права ----------
revoke execute on function public._normalize_phone(text) from public, anon, authenticated;
revoke execute on function public._format_phone(text) from public, anon, authenticated;
revoke execute on function public._token_hash(text) from public, anon, authenticated;
revoke execute on function public._client_json(public.clients) from public, anon, authenticated;
revoke execute on function public._client_session(text) from public, anon, authenticated;
revoke execute on function public._schedule_reminders(uuid) from public, anon, authenticated;
revoke execute on function public._book(uuid, uuid, uuid[], timestamptz, text, text, text, public.appointment_source, text, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.claim_due_reminders(integer) from public, anon, authenticated;
revoke execute on function public.link_telegram(text, bigint) from public, anon, authenticated;
revoke execute on function public.unlink_telegram_chat(bigint) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(integer) to service_role;
grant execute on function public.link_telegram(text, bigint) to service_role;
grant execute on function public.unlink_telegram_chat(bigint) to service_role;

revoke execute on function public.create_appointment(uuid, uuid, uuid[], timestamptz, text, text, text, public.appointment_source) from public, anon;
grant execute on function public.create_appointment(uuid, uuid, uuid[], timestamptz, text, text, text, public.appointment_source) to authenticated;

grant execute on function public.client_login(text, text) to anon, authenticated;
grant execute on function public.client_me(text) to anon, authenticated;
grant execute on function public.client_logout(text) to anon, authenticated;
grant execute on function public.client_book(text, uuid, uuid, uuid[], timestamptz, text) to anon, authenticated;
grant execute on function public.client_appointments(text) to anon, authenticated;
grant execute on function public.client_cancel(text, uuid, text) to anon, authenticated;
grant execute on function public.client_reschedule(text, uuid, timestamptz) to anon, authenticated;
grant execute on function public.client_set_reminders(text, boolean) to anon, authenticated;
grant execute on function public.client_telegram_link(text) to anon, authenticated;
grant execute on function public.client_unlink_telegram(text) to anon, authenticated;
grant execute on function public.client_add_review(text, uuid, smallint, text) to anon, authenticated;
