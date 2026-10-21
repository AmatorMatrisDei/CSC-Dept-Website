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

-- The columns a draft may change, per table. Saving checks against it and publishing writes only these.
create function private.draft_fields(kind text)
returns text[]
language sql immutable set search_path = ''
as $$
  select case kind
    when 'projects' then array['title', 'summary', 'description', 'primary_contact_email', 'primary_contact_phone',
      'repo_url', 'demo_url', 'poster_url', 'thumbnail_alt', 'thumbnail_path']
    when 'profiles' then array['name', 'headline', 'background', 'major', 'contact_email', 'contact_phone',
      'linkedin_url', 'github_url', 'website_url', 'skills', 'clubs_roles', 'photo_path']
    when 'faculty' then array['name', 'title', 'email', 'photo_path']
  end
$$;

-- Saves (or adds to) the draft for one record. `draft_patch` has only the columns being changed;
-- later saves are merged into earlier ones. `draft_gallery` replaces the photo list when given.
-- seen_updated_at is the record's updated_at as the editor saw it. The oldest one seen is kept,
-- so a second editor working from a stale copy still gets a clash when publishing.
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
  tidy text;
  photo_folder text := case when draft_table = 'profiles' then 'avatars/' else 'faculty/' end;
begin
  if not private.can_edit_site() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if draft_patch is null or jsonb_typeof(draft_patch) <> 'object' then
    raise exception 'The changes must be an object' using errcode = '23514';
  end if;

  allowed := private.draft_fields(draft_table);
  if allowed is null then
    raise exception 'Unknown table "%"', draft_table using errcode = '23514';
  elsif draft_table = 'projects' then
    select p.id, p.updated_at into target_id, target_stamp from public.projects p where p.slug = draft_slug;
  elsif draft_table = 'profiles' then
    select p.id, p.updated_at into target_id, target_stamp from public.profiles p where p.slug = draft_slug;
  else
    select f.id, f.updated_at into target_id, target_stamp from public.faculty f where f.slug = draft_slug;
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
    elsif jsonb_typeof(entry.value) in ('string', 'null') then
      tidy := case when jsonb_typeof(entry.value) = 'string' then private.tidy_text(entry.value #>> '{}') end;
      if (entry.key = 'title' and draft_table = 'projects') or entry.key = 'name' then
        if tidy is null or tidy = '' then
          raise exception 'A % cannot be empty', case when entry.key = 'title' then 'title' else 'name' end
            using errcode = '23514';
        end if;
      end if;
      -- Contact details are shown only while the student agrees to it (as the database insists).
      if draft_table = 'profiles' and entry.key in ('contact_email', 'contact_phone') and tidy is not null and tidy <> ''
         and not private.has_consent(target_id, (case entry.key when 'contact_email' then 'email' else 'phone' end)::public.consent_scope) then
        raise exception 'The student has not consented to showing that contact detail' using errcode = '23514';
      end if;
      cleaned := cleaned || jsonb_build_object(entry.key, tidy);
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
        base_updated_at = least(public.record_draft.base_updated_at, excluded.base_updated_at),
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
    -- A student's photo and contact details are not kept once they have not agreed to show them.
    and not (kind = 'profiles' and k.key in ('photo_path', 'contact_email', 'contact_phone')
      and not private.has_consent((old_row ->> 'id')::uuid,
        (case k.key when 'photo_path' then 'photo' when 'contact_email' then 'email' else 'phone' end)::public.consent_scope))
  having count(*) > 0;
$$;

-- After a student's or faculty member's page was published: a photo that is live again leaves
-- their history, and only the newest three replaced photos are kept. Returns the files of the
-- older ones, for the site to delete once nothing uses them (private.unused_files).
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

  return dropped;
end;
$$;

-- Which of these files nothing uses any more, so they can be deleted: not live, not in a draft,
-- not in the history, not in a pending submission. Only files this site's editors manage count.
create function private.unused_files(paths text[])
returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct p.path), '{}')
  from unnest(paths) as p (path)
  where p.path is not null
    and (p.path like 'projects/%' or p.path like 'faculty/%' or p.path like 'avatars/%')
    and not private.is_media_in_use(p.path)
    and not exists (select 1 from public.faculty f where f.photo_path = p.path)
    and not exists (select 1 from public.record_photo_history h where h.storage_path = p.path)
    and not exists (select 1 from public.record_history h where h.before ->> 'photo_path' = p.path)
    and not exists (
      select 1 from public.record_draft d
      where d.patch ->> 'photo_path' = p.path or d.patch ->> 'thumbnail_path' = p.path
        or exists (select 1 from jsonb_array_elements(coalesce(d.gallery, '[]'::jsonb)) g where g ->> 'path' = p.path))
$$;

-- What a publish changed on one record, for the audit log: the columns, and their old and new
-- values cut short. Contact details are named but their values are not written down.
create function private.audit_change(kind text, slug text, old_row jsonb, patch jsonb)
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'table', kind,
    'slug', slug,
    'columns', coalesce(jsonb_agg(k.key order by k.key), '[]'::jsonb),
    'before', coalesce(jsonb_object_agg(k.key, left(old_row ->> k.key, 200))
      filter (where k.key not in ('contact_email', 'contact_phone', 'primary_contact_email', 'primary_contact_phone', 'email')), '{}'::jsonb),
    'after', coalesce(jsonb_object_agg(k.key, left(patch ->> k.key, 200))
      filter (where k.key not in ('contact_email', 'contact_phone', 'primary_contact_email', 'primary_contact_phone', 'email')), '{}'::jsonb))
  from jsonb_object_keys(patch) as k (key)
  where old_row -> k.key is distinct from patch -> k.key
$$;

-- Publishes every draft: page text and record drafts together, or nothing. If anything was changed
-- by someone else after its draft was started, nothing is published and the clashes are returned
-- (text keys as they are, records as "projects/<slug>"). `only_keys` limits the page text; record
-- drafts are published only when it is null. Only the drafts locked at the start are published and
-- removed, so a draft saved while this runs stays for next time. Also returns the photo files that
-- are no longer used, for the site to delete.
create or replace function public.publish_site_drafts(only_keys text[] default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  conflicts text[];
  done int;
  records int := 0;
  removed text[] := '{}'::text[];
  locked_keys text[] := '{}'::text[];
  locked public.record_draft[] := '{}';
  changes jsonb := '[]'::jsonb;
  r public.record_draft;
  k text;
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

  for k in select d.key from public.site_content_draft d
    where only_keys is null or d.key = any (only_keys)
    order by d.key for update loop
    locked_keys := locked_keys || k;
  end loop;

  perform 1 from public.site_content c where c.key = any (locked_keys) order by c.key for update;

  -- Live text that changed (or appeared) since the draft was started.
  select coalesce(array_agg(d.key order by d.key), '{}') into conflicts
  from public.site_content_draft d
  join public.site_content c on c.key = d.key
  where d.key = any (locked_keys)
    and c.updated_at is distinct from d.base_updated_at;

  if only_keys is null then
    -- Lock each record draft and the record it changes, then look for records changed meanwhile.
    for r in select * from public.record_draft order by table_name, row_slug for update loop
      locked := locked || r;
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
    where d.key = any (locked_keys)
    returning d.key, d.value
  )
  insert into public.site_content (key, value)
  select key, value from taken
  on conflict (key) do update set value = excluded.value;
  get diagnostics done = row_count;

  foreach r in array locked loop
    if r.table_name = 'projects' then
      select p.id, p.thumbnail_path, to_jsonb(p) into target_id, old_thumbnail, old_row from public.projects p where p.slug = r.row_slug;
      perform private.remember_record('projects', r.row_slug, old_row, r.patch);
      changes := changes || private.audit_change('projects', r.row_slug, old_row, r.patch);
      perform private.write_fields('public.projects'::regclass, private.draft_fields('projects'), r.patch, target_id);
      select p.thumbnail_path into new_thumbnail from public.projects p where p.id = target_id;

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
        changes := changes || jsonb_build_object('table', 'projects', 'slug', r.row_slug, 'gallery_photos', cardinality(kept));
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
            select x.id from public.record_photo_history x where x.project_id = target_id
            order by x.replaced_at desc, x.id desc limit 3)
        returning h.storage_path
      )
      select coalesce(array_agg(e.storage_path), '{}') into trimmed from extra e;
      removed := removed || trimmed;
    elsif r.table_name = 'profiles' then
      select to_jsonb(p) into old_row from public.profiles p where p.slug = r.row_slug;
      perform private.remember_record('profiles', r.row_slug, old_row, r.patch);
      changes := changes || private.audit_change('profiles', r.row_slug, old_row, r.patch);
      perform private.write_fields('public.profiles'::regclass, private.draft_fields('profiles'), r.patch, (old_row ->> 'id')::uuid);
      removed := removed || private.trim_person_photos('profiles', r.row_slug);
    else
      select to_jsonb(f) into old_row from public.faculty f where f.slug = r.row_slug;
      perform private.remember_record('faculty', r.row_slug, old_row, r.patch);
      changes := changes || private.audit_change('faculty', r.row_slug, old_row, r.patch);
      perform private.write_fields('public.faculty'::regclass, private.draft_fields('faculty'), r.patch, (old_row ->> 'id')::uuid);
      removed := removed || private.trim_person_photos('faculty', r.row_slug);
    end if;
    records := records + 1;
  end loop;

  delete from public.record_draft d using unnest(locked) as l
  where d.table_name = l.table_name and d.row_slug = l.row_slug;
  -- With the drafts gone, keep only the files nothing at all uses.
  removed := private.unused_files(removed);

  perform private.audit('site_text_published', 'site_content', null,
    jsonb_build_object('count', done, 'records', records, 'keys', locked_keys, 'changes', changes));
  return jsonb_build_object('published', done, 'records', records, 'conflicts', '[]'::jsonb, 'removed_paths', to_jsonb(removed));
end;
$$;

-- Throws away every record draft. Returns the photo files the drafts added, which nothing uses,
-- for the site to delete. Only the drafts locked here are removed.
create function public.discard_record_drafts()
returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  locked public.record_draft[] := '{}';
  candidates text[] := '{}'::text[];
  r public.record_draft;
begin
  if not private.can_edit_site() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  for r in select * from public.record_draft order by table_name, row_slug for update loop
    locked := locked || r;
    candidates := candidates
      || array(select g ->> 'path' from jsonb_array_elements(coalesce(r.gallery, '[]'::jsonb)) g)
      || array[r.patch ->> 'thumbnail_path', r.patch ->> 'photo_path'];
  end loop;
  delete from public.record_draft d using unnest(locked) as l
  where d.table_name = l.table_name and d.row_slug = l.row_slug;
  return private.unused_files(candidates);
end;
$$;

-- Of these files, the ones nothing uses (not live, not in any draft or history, not in a pending
-- submission). The site deletes only what this returns, so one editor's file is never deleted
-- while another editor's draft still points at it.
create function public.release_draft_files(paths text[])
returns text[]
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.can_edit_site() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return private.unused_files(paths);
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
  public.restore_record_version(bigint), public.release_draft_files(text[]) from public, anon;
grant execute on function public.save_record_draft(text, text, jsonb, jsonb, timestamptz), public.discard_record_drafts(),
  public.restore_record_version(bigint), public.release_draft_files(text[]) to authenticated;
revoke execute on function private.clean_gallery(uuid, jsonb), private.remember_record(text, text, jsonb, jsonb),
  private.trim_person_photos(text, text), private.draft_fields(text), private.unused_files(text[]),
  private.audit_change(text, text, jsonb, jsonb),
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

-- When a student withdraws consent, their photo or contact detail also leaves the history of
-- earlier versions and any waiting draft, not just their live page.
create or replace function private.apply_consent_revocation()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  column_name text := case new.scope when 'photo' then 'photo_path' when 'email' then 'contact_email' when 'phone' then 'contact_phone' end;
  student_slug text;
begin
  update public.profiles set
    photo_path = case when new.scope = 'photo' then null else photo_path end,
    contact_email = case when new.scope = 'email' then null else contact_email end,
    contact_phone = case when new.scope = 'phone' then null else contact_phone end
  where id = new.student_id
  returning slug into student_slug;

  if column_name is not null and student_slug is not null then
    update public.record_history h set before = h.before - column_name
    where h.table_name = 'profiles' and h.row_slug = student_slug and h.before ? column_name;
    delete from public.record_history h
    where h.table_name = 'profiles' and h.row_slug = student_slug and h.before = '{}'::jsonb;
    update public.record_draft d set patch = d.patch - column_name
    where d.table_name = 'profiles' and d.row_slug = student_slug and d.patch ? column_name;
  end if;
  return new;
end;
$$;
