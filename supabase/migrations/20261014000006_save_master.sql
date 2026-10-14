-- Атомарное сохранение мастера: профиль, услуги, расписание и перерывы
-- меняются одной транзакцией, чтобы не оставить мастера «наполовину».
-- p_schedule: массив из 7 элементов (индекс = день недели, 0 — воскресенье),
-- элемент null — выходной, иначе {"start":"10:00","end":"20:00","breaks":[{"start":"14:00","end":"15:00"}]}
create or replace function public.save_master(
  p_id uuid,
  p_name text,
  p_specialization text,
  p_bio text,
  p_photo_path text,
  p_active boolean,
  p_service_ids uuid[],
  p_schedule jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_day jsonb;
  v_break jsonb;
  i integer;
begin
  if not public.is_owner() then
    raise exception 'Мастеров меняет только владелец' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 1 then
    raise exception 'Укажите имя мастера' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_schedule) <> 'array' or jsonb_array_length(p_schedule) <> 7 then
    raise exception 'Некорректное расписание' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.masters (name, specialization, bio, photo_path, active)
    values (trim(p_name), trim(coalesce(p_specialization, '')), trim(coalesce(p_bio, '')), p_photo_path, coalesce(p_active, true))
    returning id into v_id;
  else
    update public.masters
       set name = trim(p_name), specialization = trim(coalesce(p_specialization, '')),
           bio = trim(coalesce(p_bio, '')), photo_path = p_photo_path, active = coalesce(p_active, true)
     where id = v_id;
    if not found then
      raise exception 'Мастер не найден' using errcode = 'P0001';
    end if;
  end if;

  delete from public.master_services where master_id = v_id;
  insert into public.master_services (master_id, service_id)
  select v_id, s.id from public.services s where s.id = any (coalesce(p_service_ids, array[]::uuid[]));

  delete from public.schedules where master_id = v_id;
  delete from public.breaks where master_id = v_id;
  for i in 0..6 loop
    v_day := p_schedule -> i;
    if v_day is not null and jsonb_typeof(v_day) = 'object' then
      insert into public.schedules (master_id, weekday, start_time, end_time)
      values (v_id, i, (v_day ->> 'start')::time, (v_day ->> 'end')::time);
      for v_break in select * from jsonb_array_elements(coalesce(v_day -> 'breaks', '[]'::jsonb)) loop
        if (v_break ->> 'start')::time < (v_day ->> 'start')::time or (v_break ->> 'end')::time > (v_day ->> 'end')::time then
          raise exception 'Перерыв должен быть внутри рабочего времени' using errcode = 'P0001';
        end if;
        insert into public.breaks (master_id, weekday, start_time, end_time)
        values (v_id, i, (v_break ->> 'start')::time, (v_break ->> 'end')::time);
      end loop;
    end if;
  end loop;

  insert into public.audit_log (actor_id, action, entity, entity_id)
  values (public.current_uid(), case when p_id is null then 'create' else 'update' end, 'masters', v_id::text);
  return v_id;
exception
  when check_violation then
    raise exception 'Проверьте расписание: конец рабочего дня и перерыва должен быть позже начала' using errcode = 'P0001';
end $$;

revoke execute on function public.save_master(uuid, text, text, text, text, boolean, uuid[], jsonb) from public, anon;
grant execute on function public.save_master(uuid, text, text, text, text, boolean, uuid[], jsonb) to authenticated;
