-- Page text is not the only thing editors change: project, student and faculty details and a
-- project's photos are edited the same way. Those edits wait here as drafts and go live in the
-- same step as the page text, when an editor publishes.
--
-- One draft per record (table + slug). `patch` holds the changed columns; `gallery`, for projects
-- only, holds the whole photo list as the editor wants it. Photo files are uploaded straight away
-- (they cannot be seen until something points to them); files that stop being used are deleted
-- by the site after publishing or discarding, using the paths these functions return.
--
-- A student's or faculty member's photo (photo_path) is edited the same way. The newest three
-- replaced photos of each person stay in record_history, so they can be put back.

create table public.record_draft (
  table_name text not null check (table_name in ('projects', 'profiles', 'faculty')),
  row_slug text not null check (char_length(row_slug) <= 100),
  patch jsonb not null default '{}'::jsonb check (jsonb_typeof(patch) = 'object' and pg_column_size(patch) <= 100000),
  gallery jsonb check (gallery is null or (jsonb_typeof(gallery) = 'array' and jsonb_array_length(gallery) <= 20)),
  base_updated_at timestamptz not null,
  edited_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (table_name, row_slug),
  check (table_name = 'projects' or gallery is null)
);

alter table public.record_draft enable row level security;
revoke all on public.record_draft from anon, authenticated;
grant select on public.record_draft to authenticated;
create policy "Editors read record drafts"
  on public.record_draft for select to authenticated using ((select private.can_edit_site()));

-- Checks a photo list for a project and returns it in a fixed shape. A photo must be in the
-- project's own folder, or already be one of the project's photos (older submissions).
create function private.clean_gallery(project_id uuid, raw jsonb)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  item jsonb;
  item_path text;
  item_alt text;
  cleaned jsonb := '[]'::jsonb;
  seen text[] := '{}'::text[];
begin
  if jsonb_typeof(raw) <> 'array' or jsonb_array_length(raw) > 20 then
    raise exception 'A gallery is an array of at most 20 photos' using errcode = '23514';
  end if;
  for item in select * from jsonb_array_elements(raw) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Each photo must be an object' using errcode = '23514';
    end if;
    item_path := item ->> 'path';
    item_alt := private.tidy_text(coalesce(item ->> 'alt_text', ''));
    if item_path is null or item_path = any (seen) then
      raise exception 'Each photo needs its own path' using errcode = '23514';
    end if;
    if item_path not like 'projects/' || project_id::text || '/%'
       and not exists (select 1 from public.project_images i where i.project_id = clean_gallery.project_id and i.storage_path = item_path) then
      raise exception 'That photo does not belong to this project' using errcode = '23514';
    end if;
    if item_alt = '' or char_length(item_alt) > 300 then
      raise exception 'Every photo needs a description (alt text) of up to 300 characters' using errcode = '23514';
    end if;
    seen := seen || item_path;
    cleaned := cleaned || jsonb_build_array(jsonb_build_object(
      'path', item_path,
      'alt_text', item_alt,
      'caption', left(private.tidy_text(coalesce(item ->> 'caption', '')), 500)
    ));
  end loop;
  return cleaned;
end;
$$;

-- Saves (or adds to) the draft for one record. `draft_patch` has only the columns being changed;
-- later saves are merged into earlier ones. `draft_gallery` replaces the photo list when given.
-- seen_updated_at is the record's updated_at as the editor saw it, kept from the first save.
create function public.save_record_draft(
  draft_table text,
  draft_slug text,
  draft_patch jsonb default '{}'::jsonb,
  draft_gallery jsonb default null,
  seen_updated_at timestamptz default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  allowed text[];
  target_id uuid;
  target_stamp timestamptz;
  entry record;
  cleaned jsonb := '{}'::jsonb;
  cleaned_gallery jsonb;
  photo_folder text := case when draft_table = 'profiles' then 'avatars/' else 'faculty/' end;
begin
  if not private.can_edit_site() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if draft_patch is null or jsonb_typeof(draft_patch) <> 'object' then
    raise exception 'The changes must be an object' using errcode = '23514';
  end if;

  if draft_table = 'projects' then
    allowed := array['title', 'summary', 'description', 'primary_contact_email', 'primary_contact_phone',
      'repo_url', 'demo_url', 'poster_url', 'thumbnail_alt', 'thumbnail_path'];
    select p.id, p.updated_at into target_id, target_stamp from public.projects p where p.slug = draft_slug;
  elsif draft_table = 'profiles' then
    allowed := array['name', 'headline', 'background', 'major', 'contact_email', 'contact_phone',
      'linkedin_url', 'github_url', 'website_url', 'skills', 'clubs_roles', 'photo_path'];
    select p.id, p.updated_at into target_id, target_stamp from public.profiles p where p.slug = draft_slug;
  elsif draft_table = 'faculty' then
    allowed := array['name', 'title', 'email', 'photo_path'];
    select f.id, f.updated_at into target_id, target_stamp from public.faculty f where f.slug = draft_slug;
  else
    raise exception 'Unknown table "%"', draft_table using errcode = '23514';
  end if;
  if target_id is null then
    raise exception 'No such record' using errcode = 'P0002';
  end if;
  if draft_gallery is not null and draft_table <> 'projects' then
    raise exception 'Only projects have a gallery' using errcode = '23514';
  end if;

  for entry in select key, value from jsonb_each(draft_patch) loop
    if not (entry.key = any (allowed)) then
      raise exception 'Cannot edit "%"', entry.key using errcode = '23514';
    end if;
    if entry.key in ('skills', 'clubs_roles') then
      if jsonb_typeof(entry.value) <> 'array'
         or exists (select 1 from jsonb_array_elements(entry.value) e where jsonb_typeof(e) <> 'string') then
        raise exception '"%" must be a list of text', entry.key using errcode = '23514';
      end if;
      cleaned := cleaned || jsonb_build_object(entry.key, entry.value);
    elsif entry.key = 'photo_path' then
      if jsonb_typeof(entry.value) = 'null' then
        cleaned := cleaned || jsonb_build_object(entry.key, null);
      elsif jsonb_typeof(entry.value) <> 'string'
         or (entry.value #>> '{}') not like photo_folder || target_id::text || '/%' then
        raise exception 'That photo does not belong to this person' using errcode = '23514';
      elsif draft_table = 'profiles' and not private.has_consent(target_id, 'photo') then
        raise exception 'The student has not consented to showing a photo' using errcode = '23514';
      else
        cleaned := cleaned || jsonb_build_object(entry.key, entry.value);
      end if;
    elsif jsonb_typeof(entry.value) = 'string' then
      cleaned := cleaned || jsonb_build_object(entry.key, private.tidy_text(entry.value #>> '{}'));
    elsif jsonb_typeof(entry.value) = 'null' then
      cleaned := cleaned || jsonb_build_object(entry.key, null);
    else
      raise exception '"%" must be text', entry.key using errcode = '23514';
    end if;
  end loop;

  cleaned_gallery := case when draft_gallery is null then null else private.clean_gallery(target_id, draft_gallery) end;

  insert into public.record_draft (table_name, row_slug, patch, gallery, base_updated_at, edited_by)
  values (draft_table, draft_slug, cleaned, cleaned_gallery, coalesce(seen_updated_at, target_stamp), (select auth.uid()))
  on conflict (table_name, row_slug) do update
    set patch = public.record_draft.patch || excluded.patch,
        gallery = coalesce(excluded.gallery, public.record_draft.gallery),
        edited_by = excluded.edited_by,
        updated_at = now();
end;
$$;

-- Earlier values ---------------------------------------------------------------------------------

-- The values a publish replaced on a project, student or faculty page: just the columns that
-- changed, as they were. A project's photos are kept separately (record_photo_history below).
create table public.record_history (
  id bigint generated always as identity primary key,
  table_name text not null check (table_name in ('projects', 'profiles', 'faculty')),
  row_slug text not null,
  before jsonb not null check (jsonb_typeof(before) = 'object'),
  replaced_by uuid references public.profiles (id) on delete set null,
  replaced_at timestamptz not null default now()
);
create index record_history_recent on public.record_history (replaced_at desc);

alter table public.record_history enable row level security;
revoke all on public.record_history from anon, authenticated;
grant select on public.record_history to authenticated;
create policy "Editors read record history"
  on public.record_history for select to authenticated using ((select private.can_edit_site()));

-- The photos a publish replaced or removed, so they can be put back. Only the newest few per
-- project are kept; older files are deleted (publishing returns them in removed_paths).
create table public.record_photo_history (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  project_slug text not null,
  kind text not null check (kind in ('cover', 'gallery')),
  storage_path text not null unique,
  alt_text text not null default '',
  caption text not null default '',
  replaced_by uuid references public.profiles (id) on delete set null,
  replaced_at timestamptz not null default now()
);
create index record_photo_history_project on public.record_photo_history (project_id, replaced_at desc);

alter table public.record_photo_history enable row level security;
revoke all on public.record_photo_history from anon, authenticated;
grant select on public.record_photo_history to authenticated;
create policy "Editors read photo history"
  on public.record_photo_history for select to authenticated using ((select private.can_edit_site()));

-- Files outside projects/ (older submissions) are never deleted, so they need no history.
create function private.keep_photo(pid uuid, slug text, kind text, path text, alt text, note text)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.record_photo_history (project_id, project_slug, kind, storage_path, alt_text, caption, replaced_by)
  select pid, slug, kind, path, coalesce(alt, ''), coalesce(note, ''), (select auth.uid())
  where path like 'projects/%'
  on conflict (storage_path) do nothing;
$$;

-- Called by publishing with the record as it is now and the patch about to be applied.
create function private.remember_record(kind text, slug text, old_row jsonb, patch jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.record_history (table_name, row_slug, before, replaced_by)
  select kind, slug, jsonb_object_agg(k.key, old_row -> k.key), (select auth.uid())
  from jsonb_object_keys(patch) as k (key)
  where k.key not in ('thumbnail_path', 'thumbnail_alt')
    and old_row -> k.key is distinct from patch -> k.key
  having count(*) > 0;
$$;

-- After a student's or faculty member's page was published: a photo that is live again leaves
-- their history, and only the newest three replaced photos are kept. Returns the files of the
-- older ones, unless something still uses them, for the site to delete.
create function private.trim_person_photos(kind text, slug text)
returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  live_path text;
  dropped text[];
begin
  if kind = 'profiles' then
    select p.photo_path into live_path from public.profiles p where p.slug = trim_person_photos.slug;
  else
    select f.photo_path into live_path from public.faculty f where f.slug = trim_person_photos.slug;
  end if;

  update public.record_history h set before = h.before - 'photo_path'
  where h.table_name = kind and h.row_slug = slug and live_path is not null and h.before ->> 'photo_path' = live_path;

  with extra as (
    select h.id, h.before ->> 'photo_path' as path
    from public.record_history h
    where h.table_name = kind and h.row_slug = slug and h.before ->> 'photo_path' is not null
    order by h.replaced_at desc, h.id desc
    offset 3
  ), stripped as (
    update public.record_history h set before = h.before - 'photo_path'
    from extra e where h.id = e.id
    returning e.path
  )
  select coalesce(array_agg(s.path), '{}') into dropped from stripped s;

  delete from public.record_history h where h.table_name = kind and h.row_slug = slug and h.before = '{}'::jsonb;

  return array(
    select d.path from unnest(dropped) as d (path)
    where not private.is_media_in_use(d.path)
      and not exists (select 1 from public.faculty f where f.photo_path = d.path)
      and not exists (select 1 from public.record_history h where h.before ->> 'photo_path' = d.path)
  );
end;
$$;

-- Publishes every draft: page text and record drafts together, or nothing. If anything was changed
-- by someone else after its draft was started, nothing is published and the clashes are returned
-- (text keys as they are, records as "projects/<slug>"). `only_keys` limits the page text; record
-- drafts are published only when it is null. Also returns the photo files that are no longer used,
-- for the site to delete.
create or replace function public.publish_site_drafts(only_keys text[] default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  conflicts text[];
  done int;
  records int := 0;
  removed text[] := '{}'::text[];
  r public.record_draft;
  target_id uuid;
  old_thumbnail text;
  new_thumbnail text;
  kept text[];
  old_row jsonb;
  trimmed text[];
begin
  if not private.can_edit_site() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  perform 1 from public.site_content_draft d
  where only_keys is null or d.key = any (only_keys)
  order by d.key for update;

  perform 1 from public.site_content c
  where c.key in (select d.key from public.site_content_draft d where only_keys is null or d.key = any (only_keys))
  order by c.key for update;

  -- Live text that changed (or appeared) since the draft was started.
  select coalesce(array_agg(d.key order by d.key), '{}') into conflicts
  from public.site_content_draft d
  join public.site_content c on c.key = d.key
  where (only_keys is null or d.key = any (only_keys))
    and c.updated_at is distinct from d.base_updated_at;

  if only_keys is null then
    -- Lock each record draft and the record it changes, then look for records changed meanwhile.
    for r in select * from public.record_draft order by table_name, row_slug for update loop
      if r.table_name = 'projects' then
        perform 1 from public.projects t where t.slug = r.row_slug and t.updated_at is not distinct from r.base_updated_at for update;
      elsif r.table_name = 'profiles' then
        perform 1 from public.profiles t where t.slug = r.row_slug and t.updated_at is not distinct from r.base_updated_at for update;
      else
        perform 1 from public.faculty t where t.slug = r.row_slug and t.updated_at is not distinct from r.base_updated_at for update;
      end if;
      if not found then
        conflicts := conflicts || (r.table_name || '/' || r.row_slug);
      end if;
    end loop;
  end if;

  if cardinality(conflicts) > 0 then
    return jsonb_build_object('published', 0, 'records', 0, 'conflicts', to_jsonb(conflicts), 'removed_paths', '[]'::jsonb);
  end if;

  with taken as (
    delete from public.site_content_draft d
    where only_keys is null or d.key = any (only_keys)
    returning d.key, d.value
  )
  insert into public.site_content (key, value)
  select key, value from taken
  on conflict (key) do update set value = excluded.value;
  get diagnostics done = row_count;

  if only_keys is null then
    for r in select * from public.record_draft order by table_name, row_slug loop
      if r.table_name = 'projects' then
        select p.id, p.thumbnail_path, to_jsonb(p) into target_id, old_thumbnail, old_row from public.projects p where p.slug = r.row_slug;
        perform private.remember_record('projects', r.row_slug, old_row, r.patch);
        update public.projects p set
          title = case when r.patch ? 'title' then r.patch ->> 'title' else p.title end,
          summary = case when r.patch ? 'summary' then r.patch ->> 'summary' else p.summary end,
          description = case when r.patch ? 'description' then r.patch ->> 'description' else p.description end,
          primary_contact_email = case when r.patch ? 'primary_contact_email' then r.patch ->> 'primary_contact_email' else p.primary_contact_email end,
          primary_contact_phone = case when r.patch ? 'primary_contact_phone' then r.patch ->> 'primary_contact_phone' else p.primary_contact_phone end,
          repo_url = case when r.patch ? 'repo_url' then r.patch ->> 'repo_url' else p.repo_url end,
          demo_url = case when r.patch ? 'demo_url' then r.patch ->> 'demo_url' else p.demo_url end,
          poster_url = case when r.patch ? 'poster_url' then r.patch ->> 'poster_url' else p.poster_url end,
          thumbnail_alt = case when r.patch ? 'thumbnail_alt' then r.patch ->> 'thumbnail_alt' else p.thumbnail_alt end,
          thumbnail_path = case when r.patch ? 'thumbnail_path' then r.patch ->> 'thumbnail_path' else p.thumbnail_path end
        where p.id = target_id
        returning p.thumbnail_path into new_thumbnail;

        if r.gallery is not null then
          select coalesce(array_agg(g ->> 'path'), '{}') into kept from jsonb_array_elements(r.gallery) g;
          perform private.keep_photo(target_id, r.row_slug, 'gallery', i.storage_path, i.alt_text, i.caption)
          from public.project_images i
          where i.project_id = target_id and i.storage_path <> all (kept);
          delete from public.project_images i where i.project_id = target_id and i.storage_path <> all (kept);
          insert into public.project_images (project_id, storage_path, alt_text, caption, sort_order)
          select target_id, g.item ->> 'path', g.item ->> 'alt_text', g.item ->> 'caption', (g.n - 1)::int
          from jsonb_array_elements(r.gallery) with ordinality as g (item, n)
          on conflict (storage_path) do update
            set alt_text = excluded.alt_text, caption = excluded.caption, sort_order = excluded.sort_order;
        else
          select coalesce(array_agg(i.storage_path), '{}') into kept from public.project_images i where i.project_id = target_id;
        end if;

        if old_thumbnail is distinct from new_thumbnail and old_thumbnail <> all (kept) then
          perform private.keep_photo(target_id, r.row_slug, 'cover', old_thumbnail, old_row ->> 'thumbnail_alt', '');
        end if;

        -- A photo that is live again needs no history entry; only the newest few are kept.
        delete from public.record_photo_history h
        where h.project_id = target_id
          and (h.storage_path = new_thumbnail
            or exists (select 1 from public.project_images i where i.storage_path = h.storage_path));
        with extra as (
          delete from public.record_photo_history h
          where h.project_id = target_id
            and h.id not in (
              select k.id from public.record_photo_history k where k.project_id = target_id
              order by k.replaced_at desc, k.id desc limit 3)
          returning h.storage_path
        )
        select coalesce(array_agg(e.storage_path), '{}') into trimmed from extra e;
        removed := removed || trimmed;
      elsif r.table_name = 'profiles' then
        select to_jsonb(p) into old_row from public.profiles p where p.slug = r.row_slug;
        perform private.remember_record('profiles', r.row_slug, old_row, r.patch);
        update public.profiles p set
          name = case when r.patch ? 'name' then r.patch ->> 'name' else p.name end,
          headline = case when r.patch ? 'headline' then r.patch ->> 'headline' else p.headline end,
          background = case when r.patch ? 'background' then r.patch ->> 'background' else p.background end,
          major = case when r.patch ? 'major' then r.patch ->> 'major' else p.major end,
          contact_email = case when r.patch ? 'contact_email' then r.patch ->> 'contact_email' else p.contact_email end,
          contact_phone = case when r.patch ? 'contact_phone' then r.patch ->> 'contact_phone' else p.contact_phone end,
          linkedin_url = case when r.patch ? 'linkedin_url' then r.patch ->> 'linkedin_url' else p.linkedin_url end,
          github_url = case when r.patch ? 'github_url' then r.patch ->> 'github_url' else p.github_url end,
          website_url = case when r.patch ? 'website_url' then r.patch ->> 'website_url' else p.website_url end,
          skills = case when r.patch ? 'skills' then array(select jsonb_array_elements_text(r.patch -> 'skills')) else p.skills end,
          clubs_roles = case when r.patch ? 'clubs_roles' then array(select jsonb_array_elements_text(r.patch -> 'clubs_roles')) else p.clubs_roles end,
          photo_path = case when r.patch ? 'photo_path' then r.patch ->> 'photo_path' else p.photo_path end
        where p.slug = r.row_slug;
        removed := removed || private.trim_person_photos('profiles', r.row_slug);
      else
        select to_jsonb(f) into old_row from public.faculty f where f.slug = r.row_slug;
        perform private.remember_record('faculty', r.row_slug, old_row, r.patch);
        update public.faculty f set
          name = case when r.patch ? 'name' then r.patch ->> 'name' else f.name end,
          title = case when r.patch ? 'title' then r.patch ->> 'title' else f.title end,
          email = case when r.patch ? 'email' then r.patch ->> 'email' else f.email end,
          photo_path = case when r.patch ? 'photo_path' then r.patch ->> 'photo_path' else f.photo_path end
        where f.slug = r.row_slug;
        removed := removed || private.trim_person_photos('faculty', r.row_slug);
      end if;
      records := records + 1;
    end loop;
    delete from public.record_draft where true;
    removed := array(select u.path from unnest(removed) as u (path)
      where u.path like 'projects/%' or u.path like 'faculty/%' or u.path like 'avatars/%');
  end if;

  perform private.audit('site_text_published', 'site_content', null,
    jsonb_build_object('count', done, 'records', records, 'keys', only_keys));
  return jsonb_build_object('published', done, 'records', records, 'conflicts', '[]'::jsonb, 'removed_paths', to_jsonb(removed));
end;
$$;

-- Throws away every record draft. Returns the photo files the drafts added, which nothing uses,
-- for the site to delete.
create function public.discard_record_drafts()
returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  unused text[];
begin
  if not private.can_edit_site() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct x.path), '{}') into unused
  from (
    select p.id, g ->> 'path' as path
    from public.record_draft d
    join public.projects p on d.table_name = 'projects' and p.slug = d.row_slug
    cross join lateral jsonb_array_elements(coalesce(d.gallery, '[]'::jsonb)) g
    union all
    select p.id, d.patch ->> 'thumbnail_path'
    from public.record_draft d
    join public.projects p on d.table_name = 'projects' and p.slug = d.row_slug
  ) x
  where x.path like 'projects/' || x.id::text || '/%'
    and not exists (select 1 from public.project_images i where i.storage_path = x.path)
    and not exists (select 1 from public.projects q where q.thumbnail_path = x.path)
    and not exists (select 1 from public.record_photo_history h where h.storage_path = x.path);
  -- Photos picked for a student or faculty member that nothing uses and the history does not keep.
  unused := unused || array(
    select distinct d.patch ->> 'photo_path'
    from public.record_draft d
    where d.table_name in ('profiles', 'faculty') and d.patch ->> 'photo_path' is not null
      and not private.is_media_in_use(d.patch ->> 'photo_path')
      and not exists (select 1 from public.faculty f where f.photo_path = d.patch ->> 'photo_path')
      and not exists (select 1 from public.record_history h where h.before ->> 'photo_path' = d.patch ->> 'photo_path')
  );
  delete from public.record_draft where true;
  return unused;
end;
$$;

-- Puts an earlier version back as a draft, to be looked over and published like any edit.
create function public.restore_record_version(history_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  old_row public.record_history;
  stamp timestamptz;
begin
  if not private.can_edit_site() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into old_row from public.record_history h where h.id = history_id;
  if not found then
    raise exception 'That version no longer exists' using errcode = 'P0002';
  end if;
  if old_row.table_name = 'projects' then
    select updated_at into stamp from public.projects where slug = old_row.row_slug;
  elsif old_row.table_name = 'profiles' then
    select updated_at into stamp from public.profiles where slug = old_row.row_slug;
  else
    select updated_at into stamp from public.faculty where slug = old_row.row_slug;
  end if;
  perform public.save_record_draft(old_row.table_name, old_row.row_slug, old_row.before, null, stamp);
end;
$$;

revoke execute on function public.save_record_draft(text, text, jsonb, jsonb, timestamptz), public.discard_record_drafts(),
  public.restore_record_version(bigint) from public, anon;
grant execute on function public.save_record_draft(text, text, jsonb, jsonb, timestamptz), public.discard_record_drafts(),
  public.restore_record_version(bigint) to authenticated;
revoke execute on function private.clean_gallery(uuid, jsonb), private.remember_record(text, text, jsonb, jsonb),
  private.trim_person_photos(text, text),
  private.keep_photo(uuid, text, text, text, text, text)
  from public, anon, authenticated;

-- The student directory view also shows when each profile last changed, so an editor's page can
-- tell if someone else changed it before publishing.
create or replace view public.listed_students with (security_invoker = true) as
select
  id, slug, name, headline, background, major, class_year, photo_path, contact_email, contact_phone,
  website_url, github_url, linkedin_url, skills, clubs_roles, updated_at
from public.profiles
where visible and private.has_consent(id, 'directory');

-- Admins may also write into a student's avatars folder, to change the photo for them. (Other
-- folders are as before: admins for projects, posts, faculty, alumni and organizations.)
create or replace function private.can_manage_media(object_name text)
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
      return folders[2] = (select auth.uid())::text or private.is_admin();
    when 'submissions' then
      return folders[2] = (select auth.uid())::text;
    when 'projects', 'posts', 'faculty', 'alumni', 'organizations' then
      return private.is_admin();
    else
      return false;
  end case;
end;
$$;
