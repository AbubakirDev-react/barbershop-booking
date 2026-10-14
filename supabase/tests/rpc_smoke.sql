-- Дымовая проверка правил записи на живой базе. Ничего не сохраняет:
-- блок всегда завершается исключением 'RESULT ...', и транзакция откатывается.
-- Запуск: вставить в SQL Editor Supabase. В результате каждая проверка должна
-- быть *_rejected или ожидаемым значением; строка с (BAD) — ошибка правил.
do $$
declare
  r text := '';
  m uuid; s1 uuid; s2 uuid;
  a1 public.appointments; a2 public.appointments;
  t timestamptz := ((now() at time zone 'Europe/Moscow')::date + 1 + time '12:00') at time zone 'Europe/Moscow';
  n int;
  wd int;
begin
  perform set_config('app.role_guard_bypass', 'on', true);
  insert into public.profiles (id, name, role) values ('test_owner', 'Владелец', 'owner'), ('test_c1', 'Иван', 'client'), ('test_c2', 'Пётр', 'client');
  perform set_config('app.role_guard_bypass', 'off', true);
  insert into public.masters (name) values ('Тест') returning id into m;
  insert into public.services (name, price, duration_minutes) values ('Стрижка', 1500, 60) returning id into s1;
  insert into public.services (name, price, duration_minutes) values ('Борода', 500.50, 30) returning id into s2;
  insert into public.master_services values (m, s1), (m, s2);
  for wd in 0..6 loop insert into public.schedules values (m, wd, '10:00', '20:00'); end loop;
  insert into public.breaks (master_id, weekday, start_time, end_time) select m, g, '14:00', '15:00' from generate_series(0, 6) g;

  perform set_config('role', 'authenticated', true);

  perform set_config('request.jwt.claims', '{"sub":"test_c1","role":"authenticated"}', true);
  a1 := public.create_appointment('00000000-0000-0000-0000-000000000001', m, array[s1, s2], t, 'Иван', '+7 900 000-00-01');
  r := r || 'create:' || a1.status || ' total=' || a1.total || ' dur=' || a1.duration_minutes || '; ';
  a2 := public.create_appointment('00000000-0000-0000-0000-000000000001', m, array[s1, s2], t, 'Иван', '+7 900 000-00-01');
  r := r || 'idempotent:' || (a1.id = a2.id) || '; ';

  perform set_config('request.jwt.claims', '{"sub":"test_c2","role":"authenticated"}', true);
  begin
    perform public.create_appointment('00000000-0000-0000-0000-000000000002', m, array[s2], t + interval '30 min', 'Пётр', '+7 900 000-00-02');
    r := r || 'overlap:ALLOWED(BAD); ';
  exception when others then r := r || 'overlap_rejected; '; end;
  begin
    perform public.create_appointment('00000000-0000-0000-0000-000000000003', m, array[s2], t + interval '2 hours', 'Пётр', '+7 900 000-00-02');
    r := r || 'break:ALLOWED(BAD); ';
  exception when others then r := r || 'break_rejected; '; end;
  select count(*) into n from public.appointments;
  r := r || 'c2_sees_foreign_appts:' || n || '; ';
  begin
    perform public.change_appointment_status(a1.id, 'cancelled');
    r := r || 'foreign_cancel:ALLOWED(BAD); ';
  exception when others then r := r || 'foreign_cancel_rejected; '; end;
  begin
    insert into public.appointments (request_id, client_name, client_phone, master_id, starts_at, ends_at, source, total, duration_minutes)
    values (gen_random_uuid(), 'x', 'x', m, t + interval '5 hours', t + interval '6 hours', 'online', 0, 60);
    r := r || 'direct_insert:ALLOWED(BAD); ';
  exception when others then r := r || 'direct_insert_rejected; '; end;
  begin
    update public.profiles set role = 'owner' where id = 'test_c2';
    r := r || 'self_promote:ALLOWED(BAD); ';
  exception when others then r := r || 'self_promote_rejected; '; end;

  perform set_config('request.jwt.claims', '{"sub":"test_c1","role":"authenticated"}', true);
  begin
    perform public.change_appointment_status(a1.id, 'completed');
    r := r || 'client_complete:ALLOWED(BAD); ';
  exception when others then r := r || 'client_complete_rejected; '; end;

  perform set_config('request.jwt.claims', '{"sub":"test_owner","role":"authenticated"}', true);
  perform public.change_appointment_status(a1.id, 'confirmed');
  perform public.change_appointment_status(a1.id, 'in_progress');
  perform public.change_appointment_status(a1.id, 'completed');
  select count(*) into n from public.status_history where appointment_id = a1.id;
  r := r || 'owner_flow_history:' || n || '; ';
  begin
    perform public.set_user_role('test_owner', 'client');
    r := r || 'last_owner_demote:ALLOWED(BAD); ';
  exception when others then r := r || 'last_owner_demote_rejected; '; end;

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.appointments;
  r := r || 'anon_sees_appts:' || n || '; ';

  raise exception 'RESULT %', r;
end $$;
