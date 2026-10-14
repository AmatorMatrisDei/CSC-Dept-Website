-- Core content model for the department website.
--
-- Who can do what (enforced by the row level security policies at the bottom):
--   anyone             reads published projects and posts, and profiles that opted in to being public
--   signed-in users    edit their own profile, create draft projects, edit projects they help run
--   faculty and admin  see everything, publish and feature projects, write news posts
--   admin              also changes other users' roles
--
-- Photos live in the `media` storage bucket (see the storage migration). Columns ending in
-- `_path` hold a path inside that bucket, and each path must sit under its owner's folder.

-- Helpers live in `private`, which the Data API does not expose.
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

create type public.app_role as enum ('student', 'faculty', 'admin');
create type public.project_status as enum ('proposed', 'ongoing', 'completed');
create type public.publish_state as enum ('draft', 'in_review', 'published');

-- Tables ---------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'student',
  full_name text not null default '',
  headline text not null default '',
  bio text not null default '',
  major text,
  graduation_year integer check (graduation_year between 1950 and 2100),
  avatar_path text check (avatar_path like 'avatars/' || id::text || '/%'),
  website_url text,
  github_url text,
  linkedin_url text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.is_public is
  'Off by default: a student opts in before their profile and photo appear on the public site.';

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(trim(title)) > 0),
  summary text not null default '',
  description text not null default '',
  status public.project_status not null default 'proposed',
  publish_state public.publish_state not null default 'draft',
  is_featured boolean not null default false,
  cover_image_path text check (cover_image_path like 'projects/' || id::text || '/%'),
  tags text[] not null default '{}',
  repo_url text,
  demo_url text,
  started_on date,
  ended_on date check (ended_on >= started_on),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.projects.description is 'Markdown. Render it without allowing raw HTML.';
comment on column public.projects.is_featured is 'Shown in the donor showcase. Only faculty and admins can change it.';

create index projects_listing_idx on public.projects (publish_state, status);
create index projects_tags_idx on public.projects using gin (tags);
create index projects_created_by_idx on public.projects (created_by);

-- One row per role a person held on a project. A student's profile page lists these as their
-- experience; a project page lists them as the team.
create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role_title text not null check (length(trim(role_title)) > 0),
  term text not null default '',
  can_edit boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, profile_id, role_title)
);

comment on column public.project_members.term is 'Free text such as "Fall 2026".';
comment on column public.project_members.can_edit is 'Lets this member edit the project, its team and its photos.';

create index project_members_profile_idx on public.project_members (profile_id);

create table public.project_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  storage_path text not null unique check (storage_path like 'projects/' || project_id::text || '/%'),
  alt_text text not null check (length(trim(alt_text)) > 0),
  caption text not null default '',
  sort_order integer not null default 0,
  uploaded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index project_images_project_idx on public.project_images (project_id, sort_order);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(trim(title)) > 0),
  summary text not null default '',
  body text not null default '',
  cover_image_path text check (cover_image_path like 'posts/' || id::text || '/%'),
  publish_state public.publish_state not null default 'draft',
  author_id uuid default auth.uid() references public.profiles (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.posts.body is 'Markdown. Render it without allowing raw HTML.';

create index posts_listing_idx on public.posts (publish_state, published_at desc);

-- Permission helpers ---------------------------------------------------------------------------
-- SECURITY DEFINER lets policies look up roles and memberships without tripping over the RLS
-- of the tables they read.

create function private.current_app_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create function private.is_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.current_app_role() in ('faculty', 'admin'), false)
$$;

create function private.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.current_app_role() = 'admin', false)
$$;

create function private.can_edit_project(target_project uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_staff()
    or exists (
      select 1 from public.projects p
      where p.id = target_project and p.created_by = (select auth.uid())
    )
    or exists (
      select 1 from public.project_members m
      where m.project_id = target_project and m.profile_id = (select auth.uid()) and m.can_edit
    )
$$;

create function private.can_view_project(target_project uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
      select 1 from public.projects p
      where p.id = target_project and p.publish_state = 'published'
    )
    or private.can_edit_project(target_project)
    or exists (
      select 1 from public.project_members m
      where m.project_id = target_project and m.profile_id = (select auth.uid())
    )
$$;

-- Triggers -------------------------------------------------------------------------------------
-- The guards only restrict requests made through the Data API (roles anon and authenticated).
-- Migrations, the SQL editor and the service role are trusted.

create function private.set_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function private.stamp_published_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.publish_state = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create function private.guard_profile_changes()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
     and new.role is distinct from old.role
     and not private.is_admin() then
    raise exception 'Only admins can change roles' using errcode = '42501';
  end if;
  return new;
end;
$$;

create function private.guard_project_changes()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') or private.is_staff() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.publish_state = 'published' or new.is_featured then
      raise exception 'Only faculty can publish or feature a project' using errcode = '42501';
    end if;
  else
    if (new.publish_state = 'published') <> (old.publish_state = 'published')
       or new.is_featured is distinct from old.is_featured then
      raise exception 'Only faculty can publish, unpublish or feature a project' using errcode = '42501';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception 'A project''s creator cannot be changed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.projects
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.posts
  for each row execute function private.set_updated_at();

create trigger guard_profile_changes before update on public.profiles
  for each row execute function private.guard_profile_changes();
create trigger guard_project_changes before insert or update on public.projects
  for each row execute function private.guard_project_changes();

create trigger stamp_published_at before insert or update on public.projects
  for each row execute function private.stamp_published_at();
create trigger stamp_published_at before insert or update on public.posts
  for each row execute function private.stamp_published_at();

-- Grants ---------------------------------------------------------------------------------------
-- Explicit, so the result is the same whether or not the project auto-exposes new tables.

revoke all on public.profiles, public.projects, public.project_members, public.project_images, public.posts
  from anon, authenticated;

grant select on public.profiles, public.projects, public.project_members, public.project_images, public.posts
  to anon, authenticated;

-- Profiles are created by the sign-up trigger, so users only ever update them.
grant update (
  role, full_name, headline, bio, major, graduation_year, avatar_path,
  website_url, github_url, linkedin_url, is_public
) on public.profiles to authenticated;

grant insert, update, delete on public.projects, public.project_members, public.project_images, public.posts
  to authenticated;

grant all on public.profiles, public.projects, public.project_members, public.project_images, public.posts
  to service_role;

-- Row level security ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_images enable row level security;
alter table public.posts enable row level security;

create policy "Profiles are visible when public, to their owner, and to staff"
  on public.profiles for select to anon, authenticated
  using (is_public or id = (select auth.uid()) or (select private.is_staff()));

create policy "Users edit their own profile and admins edit any"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

-- `created_by` is checked on the row itself: during INSERT ... RETURNING a helper function
-- cannot see the row being inserted yet.
create policy "Projects are visible when published, and to their team and staff"
  on public.projects for select to anon, authenticated
  using (
    publish_state = 'published'
    or created_by = (select auth.uid())
    or ((select auth.uid()) is not null and private.can_view_project(id))
  );

create policy "Signed-in users create projects as themselves"
  on public.projects for insert to authenticated
  with check (created_by = (select auth.uid()) or (select private.is_staff()));

create policy "Project editors and staff update projects"
  on public.projects for update to authenticated
  using (created_by = (select auth.uid()) or private.can_edit_project(id))
  with check (created_by = (select auth.uid()) or private.can_edit_project(id));

create policy "Staff delete projects and editors delete drafts"
  on public.projects for delete to authenticated
  using (
    (select private.is_staff())
    or (publish_state = 'draft' and (created_by = (select auth.uid()) or private.can_edit_project(id)))
  );

create policy "Team members are visible when the project is"
  on public.project_members for select to anon, authenticated
  using (private.can_view_project(project_id));

create policy "Project editors add team members"
  on public.project_members for insert to authenticated
  with check (private.can_edit_project(project_id));

create policy "Project editors change team members"
  on public.project_members for update to authenticated
  using (private.can_edit_project(project_id))
  with check (private.can_edit_project(project_id));

create policy "Project editors remove team members"
  on public.project_members for delete to authenticated
  using (private.can_edit_project(project_id));

create policy "Project photos are visible when the project is"
  on public.project_images for select to anon, authenticated
  using (private.can_view_project(project_id));

create policy "Project editors add photos"
  on public.project_images for insert to authenticated
  with check (private.can_edit_project(project_id));

create policy "Project editors change photos"
  on public.project_images for update to authenticated
  using (private.can_edit_project(project_id))
  with check (private.can_edit_project(project_id));

create policy "Project editors remove photos"
  on public.project_images for delete to authenticated
  using (private.can_edit_project(project_id));

create policy "Published posts are visible to everyone and drafts to staff"
  on public.posts for select to anon, authenticated
  using (publish_state = 'published' or (select private.is_staff()));

create policy "Staff write posts"
  on public.posts for insert to authenticated
  with check ((select private.is_staff()));

create policy "Staff edit posts"
  on public.posts for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

create policy "Staff delete posts"
  on public.posts for delete to authenticated
  using ((select private.is_staff()));
