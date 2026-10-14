-- Привязка аккаунта сотрудника к мастеру. После привязки барбер в панели
-- видит и меняет только записи своего мастера (own_master_id в RLS и RPC).
create or replace function public.set_master_user(p_master uuid, p_user text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Привязывать сотрудников может только владелец' using errcode = 'P0001';
  end if;
  if p_user is not null and not exists (
    select 1 from public.profiles where id = p_user and active and role in ('barber', 'owner')
  ) then
    raise exception 'Сначала выдайте пользователю роль «Барбер» в разделе «Пользователи»' using errcode = 'P0001';
  end if;
  begin
    update public.masters set user_id = p_user where id = p_master;
  exception when unique_violation then
    raise exception 'Этот сотрудник уже привязан к другому мастеру' using errcode = 'P0001';
  end;
  if not found then
    raise exception 'Мастер не найден' using errcode = 'P0001';
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (public.current_uid(), 'link_user', 'masters', p_master::text, jsonb_build_object('user_id', p_user));
end $$;

revoke execute on function public.set_master_user(uuid, text) from public, anon;
grant execute on function public.set_master_user(uuid, text) to authenticated;
