-- Schema v2, part 1 of 4: people and reference data.
-- Follows the Requirements and Team Guide v1.4, sections 2.1, 2.3 and 3.3.
--
-- Roles become the guide's Student, Reviewer (TA) and Admin. Faculty are no longer a role: they
-- are records of their own (public.faculty) that projects link to. A faculty member who signs in
-- gets the reviewer or admin role on their account, and faculty.profile_id ties the two together.

-- Roles ----------------------------------------------------------------------------------------

alter type public.app_role rename value 'faculty' to 'reviewer';

create function private.is_reviewer()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.current_app_role() in ('reviewer', 'admin'), false)
$$;

-- Kept only until the next migration replaces the policies that call it.
create or replace function private.is_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_reviewer()
$$;

-- Students (public.profiles) -------------------------------------------------------------------
-- One row per account. The guide's "Student" is a profile with role 'student'. Column names
-- follow the guide.

alter table public.profiles rename column full_name to name;
alter table public.profiles rename column bio to background;
alter table public.profiles rename column graduation_year to class_year;
alter table public.profiles rename column avatar_path to photo_path;
alter table public.profiles rename column is_public to visible;

alter table public.profiles
  add column contact_email text,
  add column contact_phone text,
  add column skills text[] not null default '{}',
  add column clubs_roles text[] not null default '{}';

comment on column public.profiles.visible is
  'Listed in the student directory. Set when a reviewer approves the student''s request to be added; cleared at once by a removal request.';
comment on column public.profiles.photo_path is 'Only set while the student consents to the photo scope.';
comment on column public.profiles.contact_email is 'Only set while the student consents to the email scope.';
comment on column public.profiles.contact_phone is 'Only set while the student consents to the phone scope.';
comment on column public.profiles.clubs_roles is 'Roles in clubs and student organizations, e.g. "ACM, treasurer" (FR-1.9).';

create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1),
      ''
    )
  );
  return new;
end;
$$;

-- Consent (NFR-3) ------------------------------------------------------------------------------
-- A student's permission to publish their information, one row per grant. Revoking sets
-- revoked_at; granting again adds a new row. Rows are never deleted, and student_id has no
-- foreign key so the record outlives the account.

create type public.consent_scope as enum ('directory', 'photo', 'email', 'phone');

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null default auth.uid(),
  scope public.consent_scope not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz check (revoked_at >= granted_at)
);

comment on table public.consents is
  'directory: listed in the student directory and on projects; photo, email, phone: that field may be shown.';

create unique index consents_one_active_idx on public.consents (student_id, scope) where revoked_at is null;
create index consents_student_idx on public.consents (student_id);

create function private.has_consent(student uuid, wanted public.consent_scope)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.consents c
    where c.student_id = student and c.scope = wanted and c.revoked_at is null
  )
$$;

-- Listed students are the ones the public may see: approved for the directory and consenting.
create function private.is_listed_student(student uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = student and p.visible)
    and private.has_consent(student, 'directory')
$$;

create function private.keep_consents_append_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Consent records cannot be deleted; revoke them instead' using errcode = '42501';
  end if;
  if old.revoked_at is not null
     or new.revoked_at is null
     or (new.id, new.student_id, new.scope, new.granted_at) is distinct from (old.id, old.student_id, old.scope, old.granted_at) then
    raise exception 'A consent record can only be revoked, once' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger keep_consents_append_only before update or delete on public.consents
  for each row execute function private.keep_consents_append_only();

-- Revoking a field's consent removes that field from the live profile straight away.
create function private.apply_consent_revocation()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set
    photo_path = case when new.scope = 'photo' then null else photo_path end,
    contact_email = case when new.scope = 'email' then null else contact_email end,
    contact_phone = case when new.scope = 'phone' then null else contact_phone end
  where id = new.student_id;
  return new;
end;
$$;

create trigger apply_consent_revocation after update of revoked_at on public.consents
  for each row execute function private.apply_consent_revocation();

-- The database refuses to store a consent-gated field the student hasn't agreed to show, so a
-- hidden field can never leak through a query (guide 6.3).
create function private.check_profile_consents()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.photo_path is not null and not private.has_consent(new.id, 'photo') then
    raise exception 'The student has not consented to showing a photo' using errcode = '23514';
  end if;
  if new.contact_email is not null and not private.has_consent(new.id, 'email') then
    raise exception 'The student has not consented to showing an email address' using errcode = '23514';
  end if;
  if new.contact_phone is not null and not private.has_consent(new.id, 'phone') then
    raise exception 'The student has not consented to showing a phone number' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_profile_consents before insert or update on public.profiles
  for each row execute function private.check_profile_consents();

-- Reference data -------------------------------------------------------------------------------
-- Managed by admins in the admin panel (FR-6.4). The starting rows are part of the schema so
-- every database has them.

create table public.sub_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order integer not null default 0
);

insert into public.sub_departments (name, slug, sort_order) values
  ('Computer Science', 'computer-science', 1),
  ('Mechanical Engineering', 'mechanical-engineering', 2),
  ('Software Engineering', 'software-engineering', 3),
  ('Business + AI', 'business-ai', 4);

-- Project categories for the Projects menu (FR-1.1). parent_id allows a tree; the starting
-- categories are all top level. Internships and Alumni Stories have tables of their own below.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  parent_id uuid references public.categories (id) on delete restrict,
  sort_order integer not null default 0
);

insert into public.categories (name, slug, sort_order) values
  ('Current Student / Personal', 'personal', 1),
  ('Capstone', 'capstone', 2),
  ('Class', 'class', 3),
  ('Collaborating Organizations', 'partner', 4);

create table public.faculty (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  title text not null default '',
  email text,
  photo_path text check (photo_path like 'faculty/' || id::text || '/%'),
  profile_id uuid unique references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.faculty.profile_id is 'The faculty member''s own account, if they sign in.';

create type public.organization_type as enum ('grant', 'organization');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  type public.organization_type not null,
  url text,
  logo_path text check (logo_path like 'organizations/' || id::text || '/%'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Written by admins: alumni usually no longer have a university address to sign in with.
create table public.alumni_stories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  grad_year integer check (grad_year between 1950 and 2100),
  job_title text not null default '',
  employer text not null default '',
  story text not null default '',
  photo_path text check (photo_path like 'alumni/' || id::text || '/%'),
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.alumni_stories.story is 'Markdown. Render it without allowing raw HTML.';
comment on column public.alumni_stories.job_title is 'The guide''s current_role, which is a reserved word in SQL.';

create table public.internships (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  company text not null check (length(trim(company)) > 0),
  term text not null default '',
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index internships_student_idx on public.internships (student_id);

-- Triggers -------------------------------------------------------------------------------------

create function private.stamp_published_flag()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.published and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger set_updated_at before update on public.faculty
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.alumni_stories
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.internships
  for each row execute function private.set_updated_at();
create trigger stamp_published_at before insert or update on public.alumni_stories
  for each row execute function private.stamp_published_flag();

-- Grants ---------------------------------------------------------------------------------------

revoke all on public.consents, public.sub_departments, public.categories, public.faculty,
  public.organizations, public.alumni_stories, public.internships
  from anon, authenticated;

grant select on public.sub_departments, public.categories, public.faculty, public.organizations,
  public.alumni_stories, public.internships
  to anon, authenticated;

grant insert, update, delete on public.sub_departments, public.categories, public.faculty,
  public.organizations, public.alumni_stories, public.internships
  to authenticated;

-- Students grant consent and revoke it; nothing else.
grant select, insert on public.consents to authenticated;
grant update (revoked_at) on public.consents to authenticated;

grant all on public.consents, public.sub_departments, public.categories, public.faculty,
  public.organizations, public.alumni_stories, public.internships
  to service_role;

-- Row level security ---------------------------------------------------------------------------

alter table public.consents enable row level security;
alter table public.sub_departments enable row level security;
alter table public.categories enable row level security;
alter table public.faculty enable row level security;
alter table public.organizations enable row level security;
alter table public.alumni_stories enable row level security;
alter table public.internships enable row level security;

create policy "Students see their own consents and reviewers see all"
  on public.consents for select to authenticated
  using (student_id = (select auth.uid()) or (select private.is_reviewer()));

create policy "Students grant consent for themselves"
  on public.consents for insert to authenticated
  with check (student_id = (select auth.uid()) and revoked_at is null);

create policy "Students revoke their own consents"
  on public.consents for update to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));

create policy "Sub-departments are public"
  on public.sub_departments for select to anon, authenticated using (true);
create policy "Admins manage sub-departments"
  on public.sub_departments for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Categories are public"
  on public.categories for select to anon, authenticated using (true);
create policy "Admins manage categories"
  on public.categories for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Faculty are public"
  on public.faculty for select to anon, authenticated using (true);
create policy "Admins manage faculty"
  on public.faculty for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Organizations are public"
  on public.organizations for select to anon, authenticated using (true);
create policy "Admins manage organizations"
  on public.organizations for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Alumni stories are public once published"
  on public.alumni_stories for select to anon, authenticated
  using (published or (select private.is_reviewer()));
create policy "Admins manage alumni stories"
  on public.alumni_stories for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- Students change internships through the review queue; only admins write directly.
create policy "Internships of listed students are public"
  on public.internships for select to anon, authenticated
  using (
    private.is_listed_student(student_id)
    or student_id = (select auth.uid())
    or (select private.is_reviewer())
  );
create policy "Admins manage internships"
  on public.internships for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
