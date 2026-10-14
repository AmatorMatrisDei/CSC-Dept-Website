-- Schema v2, part 2 of 4: projects and what links to them.
-- Follows the Requirements and Team Guide v1.4, section 3.2.
--
-- Access changes from version 1: students no longer write to these tables. They submit changes
-- through the review queue (next migration), and only admins write directly (FR-6.1, FR-6.2).
-- Visitors see published projects, and only the team members who are listed students and have
-- confirmed being on the project (FR-2.6, FR-3.7).

-- Retire the version 1 access rules ------------------------------------------------------------

drop policy "Profiles are visible when public, to their owner, and to staff" on public.profiles;
drop policy "Users edit their own profile and admins edit any" on public.profiles;
drop policy "Projects are visible when published, and to their team and staff" on public.projects;
drop policy "Signed-in users create projects as themselves" on public.projects;
drop policy "Project editors and staff update projects" on public.projects;
drop policy "Staff delete projects and editors delete drafts" on public.projects;
drop policy "Team members are visible when the project is" on public.project_members;
drop policy "Project editors add team members" on public.project_members;
drop policy "Project editors change team members" on public.project_members;
drop policy "Project editors remove team members" on public.project_members;
drop policy "Project photos are visible when the project is" on public.project_images;
drop policy "Project editors add photos" on public.project_images;
drop policy "Project editors change photos" on public.project_images;
drop policy "Project editors remove photos" on public.project_images;
drop policy "Published posts are visible to everyone and drafts to staff" on public.posts;
drop policy "Staff write posts" on public.posts;
drop policy "Staff edit posts" on public.posts;
drop policy "Staff delete posts" on public.posts;

drop trigger guard_project_changes on public.projects;
drop trigger stamp_published_at on public.projects;
drop function private.guard_project_changes();

-- Projects -------------------------------------------------------------------------------------

alter type public.project_status rename value 'proposed' to 'planned';
alter type public.project_status rename value 'ongoing' to 'active';

alter table public.projects rename column started_on to date_started;
alter table public.projects rename column ended_on to date_finished;
alter table public.projects rename column cover_image_path to thumbnail_path;

alter table public.projects
  add column category_id uuid references public.categories (id),
  add column sub_department_id uuid references public.sub_departments (id),
  add column priority smallint not null default 1 check (priority between 1 and 10),
  add column is_pinned boolean not null default false,
  add column poster_url text,
  add column primary_contact_email text,
  add column primary_contact_phone text,
  add column primary_contact_student_id uuid references public.profiles (id) on delete set null,
  add column open_to_contributors boolean not null default false,
  add column published boolean not null default false;

-- Existing rows (local and dev data only) get a category and sub-department so the columns can
-- be required.
update public.projects set
  published = (publish_state = 'published'),
  category_id = (select id from public.categories where slug = 'personal'),
  sub_department_id = (select id from public.sub_departments where slug = 'computer-science');

alter table public.projects
  alter column category_id set not null,
  alter column sub_department_id set not null,
  drop column publish_state,
  drop column is_featured;

-- Student submissions upload into their own submissions/<user id>/ folder, so a project's photos
-- may live there as well as in projects/<project id>/.
alter table public.projects drop constraint projects_check;
alter table public.projects add constraint projects_thumbnail_path_check
  check (thumbnail_path like 'projects/' || id::text || '/%' or thumbnail_path like 'submissions/%');

alter table public.projects add column search tsvector generated always as (
  to_tsvector('english', title || ' ' || summary || ' ' || description)
) stored;

comment on column public.projects.priority is 'Weight in the daily carousel pick, 1 (default) to 10.';
comment on column public.projects.is_pinned is 'Always in the daily carousel while it is in the monthly pool.';
comment on column public.projects.primary_contact_email is 'A faculty member or office. For a student contact, use primary_contact_student_id.';
comment on column public.projects.primary_contact_phone is 'A faculty member or office. For a student contact, use primary_contact_student_id.';
comment on column public.projects.primary_contact_student_id is
  'A student contact. Show the email and phone from their profile, which are only set if they consented.';
comment on column public.projects.search is 'Full-text search over title, summary and description (FR-4.3).';

create index projects_listing_idx on public.projects (published, status);
create index projects_sub_department_idx on public.projects (sub_department_id);
create index projects_category_idx on public.projects (category_id);
create index projects_date_started_idx on public.projects (date_started);
create index projects_search_idx on public.projects using gin (search);

create trigger stamp_published_at before insert or update on public.projects
  for each row execute function private.stamp_published_flag();

-- Members (the guide's Contribution) -----------------------------------------------------------

alter table public.project_members rename to contributions;
alter table public.contributions rename column profile_id to student_id;
alter table public.contributions rename column role_title to role;
alter index public.project_members_profile_idx rename to contributions_student_idx;

alter table public.contributions
  alter column student_id drop not null,
  add column external_name text check (length(trim(external_name)) > 0),
  add column confirmed boolean not null default false,
  add constraint contributions_one_member_check check ((student_id is null) <> (external_name is null));

-- Rows from before confirmation existed were added by the people on them.
update public.contributions set confirmed = true;

comment on column public.contributions.external_name is 'Only for people who are not students, such as outside partners (FR-2.6).';
comment on column public.contributions.confirmed is
  'The student agreed to be listed (FR-3.7). Always true for external names.';
comment on column public.contributions.can_edit is 'Lets this student submit changes to the project for review.';

-- Advisors, organizations, photos --------------------------------------------------------------

create table public.advising (
  project_id uuid not null references public.projects (id) on delete cascade,
  faculty_id uuid not null references public.faculty (id) on delete cascade,
  primary key (project_id, faculty_id)
);

create index advising_faculty_idx on public.advising (faculty_id);

create table public.project_organizations (
  project_id uuid not null references public.projects (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  primary key (project_id, organization_id)
);

create index project_organizations_organization_idx on public.project_organizations (organization_id);

alter table public.project_images drop constraint project_images_check;
alter table public.project_images add constraint project_images_storage_path_check
  check (storage_path like 'projects/' || project_id::text || '/%' or storage_path like 'submissions/%');

-- Permission helpers ---------------------------------------------------------------------------

alter function private.can_edit_project(uuid) rename to can_submit_for_project;

create or replace function private.can_submit_for_project(target_project uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_admin()
    or exists (
      select 1 from public.projects p
      where p.id = target_project and p.created_by = (select auth.uid())
    )
    or exists (
      select 1 from public.contributions c
      where c.project_id = target_project and c.student_id = (select auth.uid()) and c.can_edit and c.confirmed
    )
$$;

create function private.is_project_published(target_project uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.projects p where p.id = target_project and p.published)
$$;

create function private.is_on_project_team(target_project uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
      select 1 from public.projects p
      where p.id = target_project and p.created_by = (select auth.uid())
    )
    or exists (
      select 1 from public.contributions c
      where c.project_id = target_project and c.student_id = (select auth.uid())
    )
$$;

create or replace function private.can_view_project(target_project uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_project_published(target_project)
    or private.is_reviewer()
    or private.is_on_project_team(target_project)
$$;

-- Uploads: users write to their own avatars/ and submissions/ folders; everything else in the
-- bucket is written by admins.
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
    when 'avatars', 'submissions' then
      return folders[2] = (select auth.uid())::text;
    when 'projects', 'posts', 'faculty', 'alumni', 'organizations' then
      return private.is_admin();
    else
      return false;
  end case;
end;
$$;

drop function private.is_staff();

-- Grants ---------------------------------------------------------------------------------------

revoke all on public.projects, public.contributions, public.project_images, public.posts,
  public.advising, public.project_organizations
  from anon, authenticated;

grant select on public.projects, public.contributions, public.project_images, public.posts,
  public.advising, public.project_organizations
  to anon, authenticated;

grant insert, update, delete on public.projects, public.contributions, public.project_images, public.posts,
  public.advising, public.project_organizations
  to authenticated;

grant all on public.advising, public.project_organizations to service_role;

-- Row level security ---------------------------------------------------------------------------

alter table public.advising enable row level security;
alter table public.project_organizations enable row level security;

create policy "Listed students' profiles are public"
  on public.profiles for select to anon, authenticated
  using (
    (visible and private.has_consent(id, 'directory'))
    or id = (select auth.uid())
    or (select private.is_reviewer())
  );

-- Students change their profile through the review queue; admins edit directly, e.g. roles.
create policy "Admins edit profiles"
  on public.profiles for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Projects are public once published"
  on public.projects for select to anon, authenticated
  using (published or ((select auth.uid()) is not null and private.can_view_project(id)));
create policy "Admins manage projects"
  on public.projects for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Confirmed listings of listed students are public"
  on public.contributions for select to anon, authenticated
  using (
    (confirmed
      and private.is_project_published(project_id)
      and (student_id is null or private.is_listed_student(student_id)))
    or student_id = (select auth.uid())
    or ((select auth.uid()) is not null and private.can_view_project(project_id))
  );
create policy "Admins manage contributions"
  on public.contributions for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Advisors are public when the project is"
  on public.advising for select to anon, authenticated
  using (private.is_project_published(project_id) or ((select auth.uid()) is not null and private.can_view_project(project_id)));
create policy "Admins manage advising"
  on public.advising for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Partners are public when the project is"
  on public.project_organizations for select to anon, authenticated
  using (private.is_project_published(project_id) or ((select auth.uid()) is not null and private.can_view_project(project_id)));
create policy "Admins manage project partners"
  on public.project_organizations for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Project photos are public when the project is"
  on public.project_images for select to anon, authenticated
  using (private.is_project_published(project_id) or ((select auth.uid()) is not null and private.can_view_project(project_id)));
create policy "Admins manage project photos"
  on public.project_images for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Published posts are public and drafts visible to reviewers"
  on public.posts for select to anon, authenticated
  using (publish_state = 'published' or (select private.is_reviewer()));
create policy "Admins manage posts"
  on public.posts for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
