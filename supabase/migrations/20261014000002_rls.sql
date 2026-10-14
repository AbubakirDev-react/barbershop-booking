-- =====================================================================
-- Роли и Row Level Security.
-- Роль берётся только из profiles (доверенная сторона), а не из запроса.
-- Таблицы записей не имеют политик на запись: менять их можно только
-- через RPC-функции (security definer), где проверяются все правила.
-- =====================================================================

create or replace function public.current_uid()
returns text language sql stable set search_path = ''
as $$ select nullif(auth.jwt() ->> 'sub', '') $$;

-- security definer: читает profiles в обход RLS, иначе политики profiles
-- рекурсивно вызывали бы сами себя
create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = ''
as $$ select p.role from public.profiles p where p.id = public.current_uid() and p.active $$;

create or replace function public.is_staff()
returns boolean language sql stable set search_path = ''
as $$ select coalesce(public.current_app_role() in ('barber', 'owner'), false) $$;

create or replace function public.is_owner()
returns boolean language sql stable set search_path = ''
as $$ select coalesce(public.current_app_role() = 'owner', false) $$;

create or replace function public.own_master_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select m.id from public.masters m where m.user_id = public.current_uid() limit 1 $$;

-- ---------- Защита роли и доступа в profiles ----------
-- Клиент может редактировать свои имя/телефон, но не роль и не флаг доступа.
-- Доверенные функции включают обход через app.role_guard_bypass.
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
    return new;
  end if;
  if (new.role is distinct from old.role or new.active is distinct from old.active) then
    raise exception 'Роль и доступ меняет только владелец' using errcode = '42501';
  end if;
  if new.id is distinct from old.id then
    raise exception 'Идентификатор пользователя менять нельзя' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before insert or update on public.profiles
for each row execute function public.profiles_guard();

-- ---------- Включаем RLS везде ----------
alter table public.profiles enable row level security;
alter table public.shop_settings enable row level security;
alter table public.categories enable row level security;
alter table public.services enable row level security;
alter table public.masters enable row level security;
alter table public.master_services enable row level security;
alter table public.schedules enable row level security;
alter table public.breaks enable row level security;
alter table public.time_off enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_items enable row level security;
alter table public.status_history enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_tasks enable row level security;
alter table public.reviews enable row level security;
alter table public.audit_log enable row level security;

-- ---------- profiles ----------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select public.current_uid()) or (select public.is_staff()));

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select public.current_uid()));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select public.current_uid()))
  with check (id = (select public.current_uid()));

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated
  using (id = (select public.current_uid()) and role = 'client');

-- ---------- Публичный каталог: читать могут все, менять — владелец ----------
drop policy if exists shop_settings_select on public.shop_settings;
create policy shop_settings_select on public.shop_settings for select to anon, authenticated using (true);
drop policy if exists shop_settings_update on public.shop_settings;
create policy shop_settings_update on public.shop_settings for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories for select to anon, authenticated using (true);
drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- Скрытые услуги и неработающих мастеров видят только сотрудники
drop policy if exists services_select on public.services;
create policy services_select on public.services for select to anon, authenticated
  using (active or (select public.is_staff()));
drop policy if exists services_write on public.services;
create policy services_write on public.services for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists masters_select on public.masters;
create policy masters_select on public.masters for select to anon, authenticated
  using (active or (select public.is_staff()));
drop policy if exists masters_write on public.masters;
create policy masters_write on public.masters for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists master_services_select on public.master_services;
create policy master_services_select on public.master_services for select to anon, authenticated using (true);
drop policy if exists master_services_write on public.master_services;
create policy master_services_write on public.master_services for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists schedules_select on public.schedules;
create policy schedules_select on public.schedules for select to anon, authenticated using (true);
drop policy if exists schedules_write on public.schedules;
create policy schedules_write on public.schedules for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists breaks_select on public.breaks;
create policy breaks_select on public.breaks for select to anon, authenticated using (true);
drop policy if exists breaks_write on public.breaks;
create policy breaks_write on public.breaks for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- Даты выходных нужны для расчёта слотов, поэтому читаются публично
drop policy if exists time_off_select on public.time_off;
create policy time_off_select on public.time_off for select to anon, authenticated using (true);
drop policy if exists time_off_write on public.time_off;
create policy time_off_write on public.time_off for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- ---------- Записи: только чтение, изменения через RPC ----------
create or replace function public.can_see_master_appointments(p_master uuid)
returns boolean language sql stable set search_path = ''
as $$
  select public.is_owner()
      or (public.is_staff() and (public.own_master_id() is null or public.own_master_id() = p_master))
$$;

drop policy if exists appointments_select on public.appointments;
create policy appointments_select on public.appointments for select to authenticated
  using (client_user_id = (select public.current_uid()) or public.can_see_master_appointments(master_id));

-- Вложенные таблицы наследуют видимость записи через подзапрос (RLS применяется и в нём)
drop policy if exists appointment_items_select on public.appointment_items;
create policy appointment_items_select on public.appointment_items for select to authenticated
  using (exists (select 1 from public.appointments a where a.id = appointment_id));

drop policy if exists status_history_select on public.status_history;
create policy status_history_select on public.status_history for select to authenticated
  using (exists (select 1 from public.appointments a where a.id = appointment_id));

-- ---------- Уведомления ----------
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (scope = (select public.current_uid()) or (scope = 'staff' and (select public.is_staff())));

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (scope = (select public.current_uid()) or (scope = 'staff' and (select public.is_staff())))
  with check (scope = (select public.current_uid()) or (scope = 'staff' and (select public.is_staff())));

-- Менять можно только флаг «прочитано»
revoke update on public.notifications from anon, authenticated;
grant update (read) on public.notifications to authenticated;

drop policy if exists notification_tasks_select on public.notification_tasks;
create policy notification_tasks_select on public.notification_tasks for select to authenticated
  using ((select public.is_owner()));

-- ---------- Отзывы ----------
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews for select to anon, authenticated
  using (status = 'published' or author_id = (select public.current_uid()) or (select public.is_owner()));

drop policy if exists reviews_owner_write on public.reviews;
create policy reviews_owner_write on public.reviews for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- ---------- Журнал ----------
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select public.is_owner()));
