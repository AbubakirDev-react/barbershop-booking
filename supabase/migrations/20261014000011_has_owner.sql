-- Есть ли у барбершопа владелец. Нужна, чтобы прятать кнопку «Стать владельцем».
-- Возвращает только да/нет — никаких данных о пользователях.
create or replace function public.has_owner()
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where role = 'owner' and active) $$;

revoke execute on function public.has_owner() from public, anon;
grant execute on function public.has_owner() to authenticated;
