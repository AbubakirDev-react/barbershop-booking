-- =====================================================================
-- Отправка напоминаний. Очередь — notification_tasks. Раз в 5 минут
-- pg_cron вызывает Edge Function send-reminders, которая забирает задачи
-- через claim_due_reminders и отчитывается через complete_reminder.
-- Функции доступны только service_role (Edge Function), не клиентам.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Статус 'processing' — задача взята в работу; защищает от двойной отправки
alter table public.notification_tasks drop constraint if exists notification_tasks_status_check;
alter table public.notification_tasks add constraint notification_tasks_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled'));
alter table public.notification_tasks add column if not exists claimed_at timestamptz;

-- Секрет, которым cron подписывает вызов функции. Генерируется в базе
-- и хранится в Vault — в коде и в чате его нет.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'reminders_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'reminders_cron_secret');
  end if;
end $$;

create or replace function public.check_cron_secret(p_secret text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(p_secret, '') <> ''
     and exists (select 1 from vault.decrypted_secrets where name = 'reminders_cron_secret' and decrypted_secret = p_secret)
$$;

create or replace function public.claim_due_reminders(p_limit integer default 50)
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
begin
  -- Задачи, «зависшие» в обработке (функция упала), возвращаем в очередь
  update public.notification_tasks
     set status = 'pending', claimed_at = null
   where status = 'processing' and claimed_at < now() - interval '10 minutes';

  for t in
    select nt.id, nt.channel, a.status as appt_status, a.starts_at as appt_start,
           p.reminders, p.active, p.email as p_email
    from public.notification_tasks nt
    join public.appointments a on a.id = nt.appointment_id
    left join public.profiles p on p.id = a.client_user_id
    where nt.status = 'pending' and nt.send_at <= now()
    order by nt.send_at
    limit greatest(1, least(p_limit, 200))
    for update of nt skip locked
  loop
    -- Проверка перед отправкой: запись могли отменить или перенести
    if t.appt_status not in ('pending', 'confirmed') or t.appt_start <= now() then
      update public.notification_tasks set status = 'cancelled' where id = t.id;
    elsif t.reminders is distinct from true or t.active is distinct from true then
      update public.notification_tasks set status = 'cancelled', last_error = 'Клиент отключил напоминания' where id = t.id;
    elsif t.channel = 'telegram' then
      update public.notification_tasks set status = 'failed', last_error = 'Канал Telegram ещё не подключён' where id = t.id;
    elsif coalesce(t.p_email, '') = '' then
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
         p.email, m.name,
         (select string_agg(i.service_name, ', ' order by i.position) from public.appointment_items i where i.appointment_id = a.id),
         a.total, s.name, s.address, s.phone, s.timezone
  from public.notification_tasks nt
  join public.appointments a on a.id = nt.appointment_id
  join public.profiles p on p.id = a.client_user_id
  join public.masters m on m.id = a.master_id
  cross join public.shop_settings s
  -- Только задачи, взятые этим вызовом: параллельный запуск их не увидит
  where nt.id = any (v_ids) and s.id = 1;
end $$;

-- Итог отправки. Временная ошибка — повтор через 5/10 минут, после 3 попыток — failed.
create or replace function public.complete_reminder(p_task uuid, p_ok boolean, p_error text default null, p_final boolean default false)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_attempts integer;
begin
  select attempts into v_attempts from public.notification_tasks where id = p_task and status = 'processing' for update;
  if not found then return; end if;
  if p_ok then
    update public.notification_tasks set status = 'sent', sent_at = now(), last_error = null, claimed_at = null where id = p_task;
  elsif p_final or v_attempts >= 3 then
    update public.notification_tasks set status = 'failed', last_error = left(p_error, 500), claimed_at = null where id = p_task;
  else
    update public.notification_tasks
       set status = 'pending', last_error = left(p_error, 500), claimed_at = null,
           send_at = now() + make_interval(mins => 5 * v_attempts)
     where id = p_task;
  end if;
end $$;

revoke execute on function public.check_cron_secret(text) from public, anon, authenticated;
revoke execute on function public.claim_due_reminders(integer) from public, anon, authenticated;
revoke execute on function public.complete_reminder(uuid, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.check_cron_secret(text) to service_role;
grant execute on function public.claim_due_reminders(integer) to service_role;
grant execute on function public.complete_reminder(uuid, boolean, text, boolean) to service_role;
