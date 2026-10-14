-- =====================================================================
-- RPC-функции: единственный способ создать или изменить запись.
-- Все проверки (права, слот, цена, длительность, переходы статусов)
-- выполняются здесь, на сервере. Клиенту доверяется только выбор:
-- мастер, услуги, время начала.
-- =====================================================================

-- Ошибки бизнес-правил поднимаются с кодом P0001 и русским текстом —
-- фронтенд показывает message как есть.

create or replace function public._actor_name(p_uid text)
returns text language sql stable security definer set search_path = ''
as $$ select coalesce(nullif(trim(p.name || ' ' || p.surname), ''), 'Пользователь') from public.profiles p where p.id = p_uid $$;

-- ---------- Проверка слота ----------
create or replace function public._assert_slot_available(
  p_master uuid, p_start timestamptz, p_end timestamptz, p_ignore uuid, p_staff boolean
) returns void language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.shop_settings;
  v_local_start timestamp;
  v_local_end timestamp;
  v_wd smallint;
  v_sch public.schedules;
begin
  select * into s from public.shop_settings where id = 1;
  -- Все правила расписания считаются в часовом поясе барбершопа
  v_local_start := p_start at time zone s.timezone;
  v_local_end := p_end at time zone s.timezone;
  v_wd := extract(dow from v_local_start)::smallint;

  if v_local_end::date <> v_local_start::date then
    raise exception 'Запись не может переходить на следующий день' using errcode = 'P0001';
  end if;

  select * into v_sch from public.schedules where master_id = p_master and weekday = v_wd;
  if not found then
    raise exception 'Мастер в этот день не работает' using errcode = 'P0001';
  end if;
  if v_local_start::time < v_sch.start_time or v_local_end::time > v_sch.end_time then
    raise exception 'Время выходит за рабочие часы мастера' using errcode = 'P0001';
  end if;
  if (extract(epoch from (v_local_start::time - v_sch.start_time))::integer / 60) % s.slot_step_minutes <> 0 then
    raise exception 'Некорректное время начала записи' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.breaks b
    where b.master_id = p_master and b.weekday = v_wd
      and b.start_time < v_local_end::time and v_local_start::time < b.end_time
  ) then
    raise exception 'Это время попадает на перерыв мастера' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.time_off t
    where (t.master_id is null or t.master_id = p_master)
      and v_local_start::date between t.date_from and t.date_to
  ) then
    raise exception 'Мастер в этот день не работает' using errcode = 'P0001';
  end if;

  if p_staff then
    if p_start < now() then
      raise exception 'Это время уже прошло' using errcode = 'P0001';
    end if;
  elsif p_start < now() + make_interval(mins => s.min_lead_minutes) then
    raise exception 'Слишком близкое время — выберите более позднее' using errcode = 'P0001';
  end if;

  if v_local_start::date > (now() at time zone s.timezone)::date + s.horizon_days then
    raise exception 'Запись так далеко вперёд недоступна' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.appointments a
    where a.master_id = p_master
      and a.status in ('pending', 'confirmed', 'in_progress')
      and a.id is distinct from p_ignore
      and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(p_start, p_end, '[)')
  ) then
    raise exception 'Это время уже занято. Выберите другое' using errcode = 'P0001';
  end if;
end $$;

-- ---------- Напоминания ----------
create or replace function public._cancel_reminders(p_appt uuid)
returns void language sql security definer set search_path = ''
as $$ update public.notification_tasks set status = 'cancelled' where appointment_id = p_appt and status = 'pending' $$;

-- Создаёт или пересоздаёт напоминания за 24 и 2 часа — только если клиент
-- зарегистрирован и сам включил напоминания. Ручная запись барбером без
-- аккаунта клиента уведомлений не порождает.
create or replace function public._schedule_reminders(p_appt uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  a public.appointments;
  p public.profiles;
  k record;
begin
  perform public._cancel_reminders(p_appt);
  select * into a from public.appointments where id = p_appt;
  if a.client_user_id is null or a.status not in ('pending', 'confirmed') then return; end if;
  select * into p from public.profiles where id = a.client_user_id;
  if not found or not p.reminders or not p.active then return; end if;

  for k in select * from (values ('reminder_24h', interval '24 hours'), ('reminder_2h', interval '2 hours')) v(kind, before) loop
    if a.starts_at - k.before > now() then
      insert into public.notification_tasks (appointment_id, kind, channel, send_at, status, attempts, last_error, sent_at)
      values (a.id, k.kind, p.channel, a.starts_at - k.before, 'pending', 0, null, null)
      on conflict (appointment_id, kind) do update
        set channel = excluded.channel, send_at = excluded.send_at, status = 'pending',
            attempts = 0, last_error = null, sent_at = null;
    end if;
  end loop;
end $$;

-- ---------- Создание записи ----------
create or replace function public.create_appointment(
  p_request_id uuid,
  p_master_id uuid,
  p_service_ids uuid[],
  p_starts_at timestamptz,
  p_client_name text,
  p_client_phone text,
  p_note text default '',
  p_source public.appointment_source default 'online'
) returns public.appointments
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid text := public.current_uid();
  v_role public.app_role := public.current_app_role();
  v_own_master uuid := public.own_master_id();
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
  if v_uid is null or v_role is null then
    raise exception 'Войдите в аккаунт, чтобы записаться' using errcode = 'P0001';
  end if;

  -- Идемпотентность: повтор того же запроса возвращает уже созданную запись
  select * into v_existing from public.appointments where request_id = p_request_id;
  if found then
    if v_existing.created_by is distinct from v_uid then
      raise exception 'Некорректный ключ запроса' using errcode = 'P0001';
    end if;
    return v_existing;
  end if;

  if p_source = 'manual' then
    if v_role not in ('barber', 'owner') then
      raise exception 'Недостаточно прав' using errcode = 'P0001';
    end if;
    if v_role = 'barber' and v_own_master is not null and v_own_master <> p_master_id then
      raise exception 'Барбер может записывать клиентов только к себе' using errcode = 'P0001';
    end if;
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

  -- Блокировка строки мастера сериализует одновременные записи к одному мастеру.
  -- Exclusion constraint ниже — вторая, окончательная линия защиты.
  perform 1 from public.masters where id = p_master_id and active for update;
  if not found then
    raise exception 'Мастер недоступен' using errcode = 'P0001';
  end if;

  -- Цена и длительность берутся из каталога, а не из запроса
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
      request_id, created_by, client_user_id, client_name, client_phone, master_id,
      starts_at, ends_at, status, source, note, total, duration_minutes
    ) values (
      p_request_id, v_uid, case when p_source = 'online' then v_uid end, v_name, v_phone, p_master_id,
      p_starts_at, p_starts_at + make_interval(mins => v_duration), v_status, p_source,
      left(trim(coalesce(p_note, '')), 500), v_total, v_duration
    ) returning * into v_appt;
  exception
    when exclusion_violation then
      raise exception 'Это время уже занято. Выберите другое' using errcode = 'P0001';
    when unique_violation then
      -- Параллельный дубль того же запроса
      select * into v_existing from public.appointments where request_id = p_request_id;
      if found and v_existing.created_by = v_uid then return v_existing; end if;
      raise;
  end;

  insert into public.appointment_items (appointment_id, service_id, service_name, price, duration_minutes, position)
  select v_appt.id, s.id, s.name, s.price, s.duration_minutes, u.ord
  from unnest(p_service_ids) with ordinality as u(sid, ord)
  join public.services s on s.id = u.sid;

  insert into public.status_history (appointment_id, from_status, to_status, actor_id, actor_role, actor_name)
  values (v_appt.id, null, v_status, v_uid, v_role::text, public._actor_name(v_uid));

  if p_source = 'online' then
    insert into public.notifications (scope, type, title, body, appointment_id)
    values ('staff', 'appointment_created', 'Новая запись №' || v_appt.number,
            v_name || '. Требуется подтверждение', v_appt.id);
  end if;

  perform public._schedule_reminders(v_appt.id);
  return v_appt;
end $$;

-- ---------- Смена статуса ----------
create or replace function public.change_appointment_status(
  p_id uuid, p_to public.appointment_status, p_reason text default null
) returns public.appointments
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid text := public.current_uid();
  v_role public.app_role := public.current_app_role();
  v_own_master uuid := public.own_master_id();
  v_settings public.shop_settings;
  a public.appointments;
  v_allowed public.appointment_status[];
  v_is_staff boolean;
  v_from public.appointment_status;
begin
  if v_uid is null or v_role is null then
    raise exception 'Войдите в аккаунт' using errcode = 'P0001';
  end if;
  select * into a from public.appointments where id = p_id for update;
  if not found then
    raise exception 'Запись не найдена' using errcode = 'P0001';
  end if;

  v_is_staff := v_role in ('barber', 'owner');
  if not v_is_staff and a.client_user_id is distinct from v_uid then
    raise exception 'Запись не найдена' using errcode = 'P0001';
  end if;
  if v_role = 'barber' and v_own_master is not null and v_own_master <> a.master_id then
    raise exception 'Это запись другого мастера' using errcode = 'P0001';
  end if;

  v_allowed := case a.status
    when 'pending' then array['confirmed', 'cancelled']::public.appointment_status[]
    when 'confirmed' then array['in_progress', 'cancelled', 'no_show']::public.appointment_status[]
    when 'in_progress' then array['completed', 'cancelled']::public.appointment_status[]
    else array[]::public.appointment_status[]
  end;
  if not (p_to = any (v_allowed)) then
    raise exception 'Из текущего статуса этот переход недоступен' using errcode = 'P0001';
  end if;

  if not v_is_staff then
    if p_to <> 'cancelled' then
      raise exception 'Клиент может только отменить запись' using errcode = 'P0001';
    end if;
    if a.status = 'in_progress' then
      raise exception 'Запись уже начата — отмена возможна через барбершоп' using errcode = 'P0001';
    end if;
    select * into v_settings from public.shop_settings where id = 1;
    if a.starts_at - now() < make_interval(hours => v_settings.cancel_before_hours) then
      raise exception 'Отменить онлайн можно не позднее чем за % ч до начала. Позвоните в барбершоп', v_settings.cancel_before_hours
        using errcode = 'P0001';
    end if;
  end if;

  v_from := a.status;
  update public.appointments set status = p_to where id = p_id returning * into a;

  insert into public.status_history (appointment_id, from_status, to_status, actor_id, actor_role, actor_name, reason)
  values (p_id, v_from, p_to, v_uid, v_role::text, public._actor_name(v_uid), nullif(left(trim(coalesce(p_reason, '')), 300), ''));

  if p_to in ('cancelled', 'no_show', 'completed', 'in_progress') then
    perform public._cancel_reminders(p_id);
  end if;

  if p_to = 'cancelled' and not v_is_staff then
    insert into public.notifications (scope, type, title, body, appointment_id)
    values ('staff', 'appointment_cancelled', 'Запись №' || a.number || ' отменена клиентом', a.client_name, p_id);
  elsif p_to = 'cancelled' and a.client_user_id is not null then
    insert into public.notifications (scope, type, title, body, appointment_id)
    values (a.client_user_id, 'appointment_cancelled', 'Запись отменена', 'Запись №' || a.number || ' отменена барбершопом', p_id);
  elsif p_to = 'confirmed' and a.client_user_id is not null then
    insert into public.notifications (scope, type, title, body, appointment_id)
    values (a.client_user_id, 'appointment_confirmed', 'Запись подтверждена', 'Запись №' || a.number || ' подтверждена барбером', p_id);
  end if;

  return a;
end $$;

-- ---------- Перенос ----------
create or replace function public.reschedule_appointment(p_id uuid, p_starts_at timestamptz)
returns public.appointments
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid text := public.current_uid();
  v_role public.app_role := public.current_app_role();
  v_own_master uuid := public.own_master_id();
  v_settings public.shop_settings;
  a public.appointments;
  v_old timestamptz;
  v_is_staff boolean;
begin
  if v_uid is null or v_role is null then
    raise exception 'Войдите в аккаунт' using errcode = 'P0001';
  end if;
  select * into a from public.appointments where id = p_id for update;
  if not found then
    raise exception 'Запись не найдена' using errcode = 'P0001';
  end if;
  v_is_staff := v_role in ('barber', 'owner');
  if not v_is_staff and a.client_user_id is distinct from v_uid then
    raise exception 'Запись не найдена' using errcode = 'P0001';
  end if;
  if v_role = 'barber' and v_own_master is not null and v_own_master <> a.master_id then
    raise exception 'Это запись другого мастера' using errcode = 'P0001';
  end if;
  if a.status not in ('pending', 'confirmed') then
    raise exception 'Перенести можно только ожидающую или подтверждённую запись' using errcode = 'P0001';
  end if;
  if not v_is_staff then
    select * into v_settings from public.shop_settings where id = 1;
    if a.starts_at - now() < make_interval(hours => v_settings.reschedule_before_hours) then
      raise exception 'Перенести онлайн можно не позднее чем за % ч до начала', v_settings.reschedule_before_hours
        using errcode = 'P0001';
    end if;
  end if;

  perform 1 from public.masters where id = a.master_id and active for update;
  if not found then
    raise exception 'Мастер недоступен' using errcode = 'P0001';
  end if;

  -- Длительность берётся из снимка записи: каталог мог измениться
  perform public._assert_slot_available(
    a.master_id, p_starts_at, p_starts_at + make_interval(mins => a.duration_minutes), a.id, v_is_staff
  );

  v_old := a.starts_at;
  begin
    update public.appointments
       set starts_at = p_starts_at, ends_at = p_starts_at + make_interval(mins => a.duration_minutes)
     where id = p_id returning * into a;
  exception when exclusion_violation then
    raise exception 'Это время уже занято. Выберите другое' using errcode = 'P0001';
  end;

  insert into public.status_history (appointment_id, from_status, to_status, actor_id, actor_role, actor_name, note)
  values (p_id, a.status, a.status, v_uid, v_role::text, public._actor_name(v_uid), 'Перенос с ' || v_old::text);

  perform public._schedule_reminders(p_id);

  insert into public.notifications (scope, type, title, body, appointment_id)
  values ('staff', 'appointment_rescheduled', 'Запись №' || a.number || ' перенесена', a.client_name, p_id);
  if v_is_staff and a.client_user_id is not null then
    insert into public.notifications (scope, type, title, body, appointment_id)
    values (a.client_user_id, 'appointment_rescheduled', 'Запись перенесена', 'Запись №' || a.number || ' перенесена барбершопом', p_id);
  end if;
  return a;
end $$;

-- ---------- Занятость для расчёта слотов (без персональных данных) ----------
create or replace function public.get_busy_intervals(p_from timestamptz, p_to timestamptz)
returns table (id uuid, master_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.master_id, a.starts_at, a.ends_at
  from public.appointments a
  where a.status in ('pending', 'confirmed', 'in_progress')
    and a.starts_at < p_to and a.ends_at > p_from
    and p_to - p_from <= interval '400 days'
$$;

-- ---------- Профиль: создание при первом входе ----------
create or replace function public.ensure_profile(p_name text, p_surname text, p_email text)
returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid text := public.current_uid();
  p public.profiles;
begin
  if v_uid is null then
    raise exception 'Войдите в аккаунт' using errcode = 'P0001';
  end if;
  insert into public.profiles (id, name, surname, email)
  values (v_uid, left(coalesce(p_name, ''), 60), left(coalesce(p_surname, ''), 60), left(coalesce(p_email, ''), 254))
  on conflict (id) do nothing;
  select * into p from public.profiles where id = v_uid;
  return p;
end $$;

-- Первый владелец: срабатывает, только пока в системе нет ни одного владельца.
-- Владелец должен выполнить это сразу после запуска.
create or replace function public.claim_first_owner()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid text := public.current_uid();
  v_rows integer;
begin
  if v_uid is null then
    raise exception 'Войдите в аккаунт' using errcode = 'P0001';
  end if;
  -- Блокировка таблицы исключает гонку двух претендентов
  lock table public.profiles in share row exclusive mode;
  if exists (select 1 from public.profiles where role = 'owner') then
    return false;
  end if;
  perform set_config('app.role_guard_bypass', 'on', true);
  update public.profiles set role = 'owner', active = true where id = v_uid;
  get diagnostics v_rows = row_count;
  perform set_config('app.role_guard_bypass', 'off', true);
  if v_rows = 0 then
    raise exception 'Сначала войдите, чтобы создался профиль' using errcode = 'P0001';
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id) values (v_uid, 'claim_first_owner', 'profiles', v_uid);
  return true;
end $$;

-- ---------- Управление пользователями ----------
create or replace function public.set_user_role(p_user text, p_role public.app_role)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid text := public.current_uid();
  t public.profiles;
begin
  if not public.is_owner() then
    raise exception 'Роли меняет только владелец' using errcode = 'P0001';
  end if;
  select * into t from public.profiles where id = p_user for update;
  if not found then
    raise exception 'Пользователь не найден' using errcode = 'P0001';
  end if;
  if t.role = 'owner' and p_role <> 'owner'
     and (select count(*) from public.profiles where role = 'owner' and active) <= 1 then
    raise exception 'Нельзя снять роль с единственного владельца' using errcode = 'P0001';
  end if;
  perform set_config('app.role_guard_bypass', 'on', true);
  update public.profiles set role = p_role where id = p_user;
  perform set_config('app.role_guard_bypass', 'off', true);
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (v_uid, 'set_role', 'profiles', p_user, jsonb_build_object('from', t.role, 'to', p_role));
end $$;

create or replace function public.set_user_active(p_user text, p_active boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid text := public.current_uid();
  t public.profiles;
begin
  if not public.is_owner() then
    raise exception 'Доступом управляет только владелец' using errcode = 'P0001';
  end if;
  if p_user = v_uid and not p_active then
    raise exception 'Нельзя отключить собственный доступ' using errcode = 'P0001';
  end if;
  select * into t from public.profiles where id = p_user for update;
  if not found then
    raise exception 'Пользователь не найден' using errcode = 'P0001';
  end if;
  if not p_active and t.role = 'owner'
     and (select count(*) from public.profiles where role = 'owner' and active) <= 1 then
    raise exception 'Нельзя отключить единственного владельца' using errcode = 'P0001';
  end if;
  perform set_config('app.role_guard_bypass', 'on', true);
  update public.profiles set active = p_active where id = p_user;
  perform set_config('app.role_guard_bypass', 'off', true);
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (v_uid, 'set_active', 'profiles', p_user, jsonb_build_object('active', p_active));
end $$;

-- ---------- Отзывы ----------
create or replace function public.add_site_review(p_appointment_id uuid, p_rating smallint, p_text text)
returns public.reviews
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid text := public.current_uid();
  a public.appointments;
  r public.reviews;
  v_text text := trim(coalesce(p_text, ''));
begin
  if v_uid is null then
    raise exception 'Войдите в аккаунт, чтобы оставить отзыв' using errcode = 'P0001';
  end if;
  select * into a from public.appointments where id = p_appointment_id;
  -- Подлинность: только по своей завершённой записи
  if not found or a.client_user_id is distinct from v_uid or a.status <> 'completed' then
    raise exception 'Отзыв можно оставить после завершённой записи' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.reviews where appointment_id = p_appointment_id) then
    raise exception 'Вы уже оставили отзыв по этой записи' using errcode = 'P0001';
  end if;
  if p_rating not between 1 and 5 then
    raise exception 'Поставьте оценку от 1 до 5' using errcode = 'P0001';
  end if;
  if char_length(v_text) < 10 then
    raise exception 'Напишите хотя бы 10 символов' using errcode = 'P0001';
  end if;
  if char_length(v_text) > 1000 then
    raise exception 'Отзыв не должен быть длиннее 1000 символов' using errcode = 'P0001';
  end if;
  insert into public.reviews (author_id, author_name, rating, text, source, status, appointment_id)
  values (v_uid, coalesce(nullif((select name from public.profiles where id = v_uid), ''), 'Клиент'),
          p_rating, v_text, 'site', 'pending', p_appointment_id)
  returning * into r;
  return r;
end $$;

-- ---------- Удаление услуги без потери истории ----------
create or replace function public.remove_service(p_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Каталог меняет только владелец' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.appointment_items where service_id = p_id) then
    update public.services set active = false where id = p_id;
    insert into public.audit_log (actor_id, action, entity, entity_id) values (public.current_uid(), 'archive', 'services', p_id::text);
    return 'archived';
  end if;
  delete from public.services where id = p_id;
  insert into public.audit_log (actor_id, action, entity, entity_id) values (public.current_uid(), 'delete', 'services', p_id::text);
  return 'deleted';
end $$;

-- ---------- Права на выполнение ----------
-- Внутренние функции недоступны извне
revoke execute on function public._actor_name(text) from public, anon, authenticated;
revoke execute on function public._assert_slot_available(uuid, timestamptz, timestamptz, uuid, boolean) from public, anon, authenticated;
revoke execute on function public._cancel_reminders(uuid) from public, anon, authenticated;
revoke execute on function public._schedule_reminders(uuid) from public, anon, authenticated;

revoke execute on function public.create_appointment(uuid, uuid, uuid[], timestamptz, text, text, text, public.appointment_source) from public, anon;
revoke execute on function public.change_appointment_status(uuid, public.appointment_status, text) from public, anon;
revoke execute on function public.reschedule_appointment(uuid, timestamptz) from public, anon;
revoke execute on function public.ensure_profile(text, text, text) from public, anon;
revoke execute on function public.claim_first_owner() from public, anon;
revoke execute on function public.set_user_role(text, public.app_role) from public, anon;
revoke execute on function public.set_user_active(text, boolean) from public, anon;
revoke execute on function public.add_site_review(uuid, smallint, text) from public, anon;
revoke execute on function public.remove_service(uuid) from public, anon;

grant execute on function public.create_appointment(uuid, uuid, uuid[], timestamptz, text, text, text, public.appointment_source) to authenticated;
grant execute on function public.change_appointment_status(uuid, public.appointment_status, text) to authenticated;
grant execute on function public.reschedule_appointment(uuid, timestamptz) to authenticated;
grant execute on function public.ensure_profile(text, text, text) to authenticated;
grant execute on function public.claim_first_owner() to authenticated;
grant execute on function public.set_user_role(text, public.app_role) to authenticated;
grant execute on function public.set_user_active(text, boolean) to authenticated;
grant execute on function public.add_site_review(uuid, smallint, text) to authenticated;
grant execute on function public.remove_service(uuid) to authenticated;
grant execute on function public.get_busy_intervals(timestamptz, timestamptz) to anon, authenticated;
