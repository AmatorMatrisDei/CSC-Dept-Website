-- Safeguards for the student submission forms on the website.
--
--   project slugs   made at approval from the proposed slug or the title, and numbered when
--                   taken, so a student never has to pick one and approval never fails on a
--                   duplicate
--   approved photos students cannot replace or delete a file in their own folders once a live
--                   row or an open submission uses it; otherwise they could swap a reviewed
--                   photo for anything without a new review

-- Project slugs -----------------------------------------------------------------------------------

create or replace function private.validate_project_submission(data jsonb, target_project uuid)
returns void
language plpgsql stable set search_path = ''
as $$
declare
  image record;
begin
  perform private.require_keys_within(data, private.project_fields() || private.project_link_keys());
  perform jsonb_populate_record(null::public.projects, data);

  if target_project is null and not (data ?& array['title', 'category_id', 'sub_department_id']) then
    raise exception 'A new project needs a title, category_id and sub_department_id' using errcode = '22023';
  end if;
  if data ? 'title' and coalesce(trim(data ->> 'title'), '') = '' then
    raise exception 'A project needs a title' using errcode = '22023';
  end if;

  perform private.check_submitted_photo(data ->> 'thumbnail_path', target_project);
  if data ->> 'thumbnail_path' is not null and coalesce(trim(data ->> 'thumbnail_alt'), '') = '' then
    raise exception 'A thumbnail needs alt text (thumbnail_alt)' using errcode = '22023';
  end if;

  if data ? 'members' then
    if exists (
      select 1 from jsonb_to_recordset(data -> 'members') as m (student_id uuid, external_name text, role text, term text, can_edit boolean)
      where (m.student_id is null) = (nullif(trim(m.external_name), '') is null)
         or coalesce(trim(m.role), '') = ''
    ) then
      raise exception 'Each member needs a role and either a student_id or an external_name' using errcode = '22023';
    end if;
  end if;

  if data ? 'advisor_ids' then
    perform private.uuid_array(data -> 'advisor_ids');
  end if;
  if data ? 'organization_ids' then
    perform private.uuid_array(data -> 'organization_ids');
  end if;

  if data ? 'images' then
    for image in select * from jsonb_to_recordset(data -> 'images') as m (storage_path text, alt_text text, caption text) loop
      if coalesce(trim(image.alt_text), '') = '' then
        raise exception 'Every photo needs alt text' using errcode = '22023';
      end if;
      perform private.check_submitted_photo(coalesce(image.storage_path, ''), target_project);
    end loop;
  end if;
end;
$$;

-- The same as in the review queue migration, except that a project's slug is made here: from
-- the proposed slug if there is one, otherwise from the title, numbered (-2, -3, ...) if taken.
create or replace function private.apply_change(change public.pending_changes)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  target uuid := change.target_id;
  data jsonb := change.proposed_data;
begin
  case change.target_type
    when 'profile' then
      target := change.submitter_id;
      if change.action = 'delete' then
        perform private.remove_student(target);
      else
        perform private.write_fields('public.profiles', private.profile_fields(), data, target);
        if change.action = 'create' then
          if not private.has_consent(target, 'directory') then
            raise exception 'The student has withdrawn consent to be listed' using errcode = '23514';
          end if;
          update public.profiles set visible = true where id = target;
        end if;
      end if;

    when 'project' then
      if change.action = 'delete' then
        delete from public.projects where id = target;
      else
        if change.action = 'create' or data ? 'slug' then
          data := data || jsonb_build_object('slug', private.unique_slug(
            'public.projects',
            coalesce(nullif(trim(data ->> 'slug'), ''), data ->> 'title'),
            coalesce(target, '00000000-0000-0000-0000-000000000000')));
        end if;
        if change.action = 'create' then
          target := private.insert_fields('public.projects', private.project_fields(), data);
          update public.projects set created_by = change.submitter_id, published = true where id = target;
        else
          perform private.write_fields('public.projects', private.project_fields(), data, target);
        end if;
        perform private.sync_project_links(target, data, change.submitter_id);
      end if;

    when 'internship' then
      if change.action = 'delete' then
        delete from public.internships where id = target and student_id = change.submitter_id;
      elsif change.action = 'create' then
        target := private.insert_fields('public.internships', private.internship_fields() || array['student_id'],
          data || jsonb_build_object('student_id', change.submitter_id));
      else
        perform private.write_fields('public.internships', private.internship_fields(), data, target);
      end if;
  end case;

  return target;
end;
$$;

-- Approved photos -------------------------------------------------------------------------------

-- True when a live profile or project, or an open submission, uses the file at `object_name`.
create function private.is_media_in_use(object_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where photo_path = object_name)
    or exists (select 1 from public.projects where thumbnail_path = object_name)
    or exists (select 1 from public.project_images where storage_path = object_name)
    or exists (
      select 1 from public.pending_changes p
      where p.status in ('pending', 'changes_requested')
        and (p.proposed_data ->> 'photo_path' = object_name
          or p.proposed_data ->> 'thumbnail_path' = object_name
          or (jsonb_typeof(p.proposed_data -> 'images') = 'array'
            and exists (
              select 1 from jsonb_array_elements(p.proposed_data -> 'images') as image
              where image ->> 'storage_path' = object_name)))
    )
$$;

-- Replacing or deleting a file: where the user may upload, and only if nothing uses it. Admins
-- manage files that are in use (their folders hold only live files).
create function private.can_replace_media(object_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.can_manage_media(object_name)
    and (private.is_admin() or not private.is_media_in_use(object_name))
$$;

revoke execute on function private.is_media_in_use(text), private.can_replace_media(text)
  from public, anon, authenticated, service_role;
grant execute on function private.can_replace_media(text) to anon, authenticated, service_role;

drop policy "Media: replace files you manage" on storage.objects;
drop policy "Media: delete files you manage" on storage.objects;

create policy "Media: replace files you manage that nothing uses"
  on storage.objects for update to authenticated
  using (bucket_id = 'media' and private.can_replace_media(name))
  with check (bucket_id = 'media' and private.can_replace_media(name));

create policy "Media: delete files you manage that nothing uses"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and private.can_replace_media(name));
