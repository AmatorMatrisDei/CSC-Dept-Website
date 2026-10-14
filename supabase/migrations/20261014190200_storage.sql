-- Photo storage. One public bucket, `media`, with a folder per owner:
--   avatars/<user id>/...     the user's own profile photos
--   projects/<project id>/... photos of a project, managed by its editors
--   posts/<post id>/...       news post images, managed by staff
--
-- The bucket is public so the site can link to images directly. Anyone who has an image's URL
-- can load it, even if the project is still a draft; don't upload anything that must stay private.
-- The free plan has 1 GB of file storage in total, so the frontend should resize photos
-- (around 2000px on the long side, WebP or JPEG) before uploading.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create function private.can_manage_media(object_name text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  folders text[] := storage.foldername(object_name);
begin
  if (select auth.uid()) is null or cardinality(folders) < 2 then
    return false;
  end if;

  case folders[1]
    when 'avatars' then
      return folders[2] = (select auth.uid())::text;
    when 'projects' then
      return folders[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and private.can_edit_project(folders[2]::uuid);
    when 'posts' then
      return private.is_staff();
    else
      return false;
  end case;
end;
$$;

-- Reading public files needs no policy. SELECT is still required for uploads that overwrite
-- (upsert) and for deletes, so it is granted where the user could write.
create policy "Media: see files you manage"
  on storage.objects for select to authenticated
  using (bucket_id = 'media' and private.can_manage_media(name));

create policy "Media: upload where you can edit"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and private.can_manage_media(name));

create policy "Media: replace files you manage"
  on storage.objects for update to authenticated
  using (bucket_id = 'media' and private.can_manage_media(name))
  with check (bucket_id = 'media' and private.can_manage_media(name));

create policy "Media: delete files you manage"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and private.can_manage_media(name));
