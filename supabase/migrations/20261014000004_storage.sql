-- Фото услуг, мастеров и главной страницы. Читать может любой
-- (публичный бакет), загружать/удалять — только владелец.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists photos_owner_insert on storage.objects;
create policy photos_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (select public.is_owner()));

drop policy if exists photos_owner_update on storage.objects;
create policy photos_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (select public.is_owner()))
  with check (bucket_id = 'photos' and (select public.is_owner()));

drop policy if exists photos_owner_delete on storage.objects;
create policy photos_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (select public.is_owner()));
