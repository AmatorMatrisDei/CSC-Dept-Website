-- Directory view, URL slugs for people, and alt text for project thumbnails. Requested in the
-- review of the frontend PR (#5).
--
--   listed_students   the public student directory: only listed students, whoever is signed in
--   faculty.slug,     readable URLs (/faculty/dr-pat-faculty) made from the name, unique, set
--   profiles.slug     automatically; admins may change them
--   thumbnail_alt     alt text for projects.thumbnail_path, required when a thumbnail is set (NFR-5)

-- New functions are private by default ----------------------------------------------------------
-- The security hardening migration tried this per schema (`in schema private`), which cannot
-- undo Postgres's global "anyone may execute" default, so it had no effect. This is the global
-- form. The public and storage schemas keep Supabase's own defaults, which grant execute to the
-- API roles; anything else is granted explicitly, as the sign-up hook already is.
-- 01_schema.test.sql caught the gap and keeps checking.

alter default privileges for role postgres revoke execute on functions from public;

-- Slugs -------------------------------------------------------------------------------------------

create function private.slugify(value text)
returns text
language sql immutable set search_path = ''
as $$
  select coalesce(
    nullif(trim(both '-' from left(regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g'), 60)), ''),
    'person'
  )
$$;

-- The first free slug for `name` in `tbl`: the plain slug, then -2, -3, ...
create function private.unique_slug(tbl regclass, name text, row_id uuid)
returns text
language plpgsql volatile set search_path = ''
as $$
declare
  base text := private.slugify(name);
  candidate text := base;
  suffix integer := 1;
  taken boolean;
begin
  loop
    execute format('select exists (select 1 from %s where slug = $1 and id <> $2)', tbl)
      into taken using candidate, row_id;
    exit when not taken;
    suffix := suffix + 1;
    candidate := base || '-' || suffix;
  end loop;
  return candidate;
end;
$$;

-- Runs as the owner so it sees every row when checking for a free slug.
create function private.set_slug_from_name()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(new.slug, '') = '' then
    new.slug := private.unique_slug(tg_relid::regclass, new.name, new.id);
  end if;
  return new;
end;
$$;

-- Already private by the default above; stated so the intent survives a copy-paste.
revoke execute on function private.slugify(text), private.unique_slug(regclass, text, uuid), private.set_slug_from_name()
  from public, anon, authenticated, service_role;

alter table public.faculty add column slug text;
alter table public.profiles add column slug text;

-- One row at a time, so each slug sees the ones assigned before it.
do $$
declare
  r record;
begin
  for r in select id, name from public.faculty order by created_at, id loop
    update public.faculty set slug = private.unique_slug('public.faculty', r.name, r.id) where id = r.id;
  end loop;
  for r in select id, name from public.profiles order by created_at, id loop
    update public.profiles set slug = private.unique_slug('public.profiles', r.name, r.id) where id = r.id;
  end loop;
end;
$$;

alter table public.faculty
  alter column slug set not null,
  add constraint faculty_slug_key unique (slug),
  add constraint faculty_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 70);

alter table public.profiles
  alter column slug set not null,
  add constraint profiles_slug_key unique (slug),
  add constraint profiles_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 70);

create trigger set_slug before insert on public.faculty
  for each row execute function private.set_slug_from_name();
create trigger set_slug before insert on public.profiles
  for each row execute function private.set_slug_from_name();

comment on column public.faculty.slug is 'For URLs. Made from the name when the row is created; admins may change it.';
comment on column public.profiles.slug is 'For URLs. Made from the name at sign-up; admins may change it. Students cannot.';

-- Admins edit profiles directly; students never set a slug (it is not a submission field).
grant update (slug) on public.profiles to authenticated;

-- Thumbnail alt text ----------------------------------------------------------------------------

alter table public.projects add column thumbnail_alt text;

update public.projects set thumbnail_alt = title where thumbnail_path is not null and thumbnail_alt is null;

alter table public.projects add constraint projects_thumbnail_alt_check
  check (thumbnail_path is null or coalesce(length(trim(thumbnail_alt)), 0) between 1 and 300);

comment on column public.projects.thumbnail_alt is 'Alt text for thumbnail_path; required when there is a thumbnail.';

create or replace function private.project_fields()
returns text[]
language sql immutable set search_path = ''
as $$
  select array['slug', 'title', 'summary', 'description', 'status', 'category_id', 'sub_department_id',
    'date_started', 'date_finished', 'thumbnail_path', 'thumbnail_alt', 'tags', 'repo_url', 'demo_url',
    'poster_url', 'primary_contact_email', 'primary_contact_phone', 'primary_contact_student_id',
    'open_to_contributors']
$$;

create or replace function private.validate_project_submission(data jsonb, target_project uuid)
returns void
language plpgsql stable set search_path = ''
as $$
declare
  image record;
begin
  perform private.require_keys_within(data, private.project_fields() || private.project_link_keys());
  perform jsonb_populate_record(null::public.projects, data);

  if target_project is null and not (data ?& array['title', 'slug', 'category_id', 'sub_department_id']) then
    raise exception 'A new project needs a title, slug, category_id and sub_department_id' using errcode = '22023';
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

-- The student directory -------------------------------------------------------------------------
-- What the public site lists, whoever is signed in. Row level security alone would show a
-- signed-in reviewer every student; this view keeps the public pages public. It runs with the
-- caller's permissions, so it can never show more than row level security allows.

create view public.listed_students with (security_invoker = true) as
select
  id, slug, name, headline, background, major, class_year, photo_path, contact_email, contact_phone,
  website_url, github_url, linkedin_url, skills, clubs_roles
from public.profiles
where visible and private.has_consent(id, 'directory');

comment on view public.listed_students is
  'The public student directory: approved, consenting students. Contribution rows can embed it to name only listed students.';

revoke all on public.listed_students from anon, authenticated;
grant select on public.listed_students to anon, authenticated, service_role;
