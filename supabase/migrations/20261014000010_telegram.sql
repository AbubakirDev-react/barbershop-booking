-- =====================================================================
-- Напоминания в Telegram (бесплатно и без своего домена).
-- Клиент получает одноразовый код, открывает бота по ссылке t.me/<bot>?start=<код>,
-- вебхук бота привязывает chat_id к профилю. Токен бота — только в секретах
-- Edge Functions; секрет вебхука генерируется и хранится в Vault.
-- =====================================================================

alter table public.profiles add column if not exists telegram_chat_id bigint unique;
alter table public.profiles add column if not exists telegram_link_code text unique;
alter table public.profiles add column if not exists telegram_link_expires timestamptz;

-- Username бота (публичный) и флаг email-напоминаний: без своего домена
-- Resend не доставит письма клиентам, поэтому email по умолчанию выключен.
alter table public.shop_settings add column if not exists telegram_bot_username text not null default '';
alter table public.shop_settings add column if not exists email_reminders_enabled boolean not null default false;

-- Код привязки и chat_id меняет только сервер
create or replace function public.profiles_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if coalesce(current_setting('app.role_guard_bypass', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.role := 'client';
    new.active := true;
    new.telegram_chat_id := null;
    new.telegram_link_code := null;
    new.telegram_link_expires := null;
    return new;
  end if;
  if (new.role is distinct from old.role or new.active is distinct from old.active) then
    raise exception 'Роль и доступ меняет только владелец' using errcode = '42501';
  end if;
  if new.id is distinct from old.id then
    raise exception 'Идентификатор пользователя менять нельзя' using errcode = '42501';
  end if;
  if new.telegram_chat_id is distinct from old.telegram_chat_id
     or new.telegram_link_code is distinct from old.telegram_link_code
     or new.telegram_link_expires is distinct from old.telegram_link_expires then
    raise exception 'Telegram подключается только через бота' using errcode = '42501';
  end if;
  return new;
end $$;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'telegram_webhook_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'telegram_webhook_secret');
  end if;
end $$;

-- Клиент: получить код для ссылки на бота (действует 15 минут)
create or replace function public.create_telegram_link()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid text := public.current_uid();
  v_code text := encode(extensions.gen_random_bytes(12), 'hex');
  v_rows integer;
begin
  if v_uid is null then
    raise exception 'Войдите в аккаунт' using errcode = 'P0001';
  end if;
  perform set_config('app.role_guard_bypass', 'on', true);
  update public.profiles
     set telegram_link_code = v_code, telegram_link_expires = now() + interval '15 minutes'
   where id = v_uid;
  get diagnostics v_rows = row_count;
  perform set_config('app.role_guard_bypass', 'off', true);
  if v_rows = 0 then
    raise exception 'Профиль не найден' using errcode = 'P0001';
  end if;
  return v_code;
end $$;

create or replace function public.unlink_telegram()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform set_config('app.role_guard_bypass', 'on', true);
  update public.profiles
     set telegram_chat_id = null, telegram_link_code = null, telegram_link_expires = null
   where id = public.current_uid();
  perform set_config('app.role_guard_bypass', 'off', true);
end $$;

-- Вебхук бота (service_role): привязать чат по коду. Возвращает имя клиента или null
create or replace function public.link_telegram(p_code text, p_chat_id bigint)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid text;
  v_name text;
  a record;
begin
  perform set_config('app.role_guard_bypass', 'on', true);
  select id, name into v_uid, v_name from public.profiles
   where telegram_link_code = p_code and telegram_link_expires > now()
   for update;
  if v_uid is null then
    perform set_config('app.role_guard_bypass', 'off', true);
    return null;
  end if;
  -- chat_id уникален: если чат был привязан к другому аккаунту — отвязываем
  update public.profiles set telegram_chat_id = null where telegram_chat_id = p_chat_id and id <> v_uid;
  update public.profiles
     set telegram_chat_id = p_chat_id, telegram_link_code = null, telegram_link_expires = null,
         channel = 'telegram', reminders = true
   where id = v_uid;
  perform set_config('app.role_guard_bypass', 'off', true);
  -- Пересоздаём напоминания по будущим записям уже с каналом Telegram
  for a in
    select id from public.appointments
     where client_user_id = v_uid and status in ('pending', 'confirmed') and starts_at > now()
  loop
    perform public._schedule_reminders(a.id);
  end loop;
  return coalesce(nullif(v_name, ''), 'клиент');
end $$;

create or replace function public.unlink_telegram_chat(p_chat_id bigint)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_rows integer;
begin
  perform set_config('app.role_guard_bypass', 'on', true);
  update public.profiles set telegram_chat_id = null where telegram_chat_id = p_chat_id;
  get diagnostics v_rows = row_count;
  perform set_config('app.role_guard_bypass', 'off', true);
  return v_rows > 0;
end $$;

create or replace function public.check_telegram_webhook_secret(p_secret text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(p_secret, '') <> ''
     and exists (select 1 from vault.decrypted_secrets where name = 'telegram_webhook_secret' and decrypted_secret = p_secret)
$$;

create or replace function public.get_telegram_webhook_secret()
returns text
language sql stable security definer set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'telegram_webhook_secret' $$;

-- Очередь: telegram-задачи отправляются, если чат привязан;
-- email — только если владелец включил email-напоминания (нужен свой домен)
drop function if exists public.claim_due_reminders(integer);
create function public.claim_due_reminders(p_limit integer default 50)
returns table (
  task_id uuid,
  kind text,
  channel public.notification_channel,
  attempts integer,
  appointment_number bigint,
  starts_at timestamptz,
  ends_at timestamptz,
  client_name text,
  email text,
  telegram_chat_id bigint,
  master_name text,
  services text,
  total numeric,
  shop_name text,
  shop_address text,
  shop_phone text,
  timezone text
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
           p.reminders, p.active, p.email as p_email, p.telegram_chat_id as p_chat
    from public.notification_tasks nt
    join public.appointments a on a.id = nt.appointment_id
    left join public.profiles p on p.id = a.client_user_id
    where nt.status = 'pending' and nt.send_at <= now()
    order by nt.send_at
    limit greatest(1, least(p_limit, 200))
    for update of nt skip locked
  loop
    if t.appt_status not in ('pending', 'confirmed') or t.appt_start <= now() then
      update public.notification_tasks set status = 'cancelled' where id = t.id;
    elsif t.reminders is distinct from true or t.active is distinct from true then
      update public.notification_tasks set status = 'cancelled', last_error = 'Клиент отключил напоминания' where id = t.id;
    elsif t.ch = 'telegram' and t.p_chat is null then
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
         p.email, p.telegram_chat_id, m.name,
         (select string_agg(i.service_name, ', ' order by i.position) from public.appointment_items i where i.appointment_id = a.id),
         a.total, s.name, s.address, s.phone, s.timezone
  from public.notification_tasks nt
  join public.appointments a on a.id = nt.appointment_id
  join public.profiles p on p.id = a.client_user_id
  join public.masters m on m.id = a.master_id
  cross join public.shop_settings s
  where nt.id = any (v_ids) and s.id = 1;
end $$;

revoke execute on function public.create_telegram_link() from public, anon;
revoke execute on function public.unlink_telegram() from public, anon;
grant execute on function public.create_telegram_link() to authenticated;
grant execute on function public.unlink_telegram() to authenticated;

revoke execute on function public.link_telegram(text, bigint) from public, anon, authenticated;
revoke execute on function public.unlink_telegram_chat(bigint) from public, anon, authenticated;
revoke execute on function public.check_telegram_webhook_secret(text) from public, anon, authenticated;
revoke execute on function public.get_telegram_webhook_secret() from public, anon, authenticated;
revoke execute on function public.claim_due_reminders(integer) from public, anon, authenticated;
grant execute on function public.link_telegram(text, bigint) to service_role;
grant execute on function public.unlink_telegram_chat(bigint) to service_role;
grant execute on function public.check_telegram_webhook_secret(text) to service_role;
grant execute on function public.get_telegram_webhook_secret() to service_role;
grant execute on function public.claim_due_reminders(integer) to service_role;
