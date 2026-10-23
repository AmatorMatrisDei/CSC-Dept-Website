-- Home page highlights. Any project, student or alumni story can be switched "on" for highlighting
-- by an editor (admins and faculty, through private.can_edit_site()). Rows here are the
-- pool the home page picks from; it shows a different few each day, so the page varies without
-- anyone choosing by hand. One table covers every kind of page, so a new kind is one more check value.
--
-- Events get an importance instead: 'major' ones lead the home page; 'minor' ones are tags for
-- filtering. Nothing about importance changes how an event looks yet.

create table public.highlights (
  kind text not null check (kind in ('project', 'student', 'alumni')),
  ref uuid not null,
  blurb text not null default '' check (length(blurb) <= 200),
  created_at timestamptz not null default now(),
  primary key (kind, ref)
);

comment on table public.highlights is
  'The pool the home page highlights come from. ref is the id of the project, student profile or alumni story. blurb is an optional one-line quote or description.';

alter table public.highlights enable row level security;

-- A visitor reads only the highlights of pages they could already see: the raw table must not leak
-- the blurb of an unpublished project or story, or of a student who is not listed. (Editors read
-- every row through the policy below.)
create policy "Visitors see highlights of public pages" on public.highlights for select to anon, authenticated
  using (
    (kind = 'project' and private.is_project_published(ref))
    or (kind = 'student' and private.is_listed_student(ref))
    or (kind = 'alumni' and exists (select 1 from public.alumni_stories a where a.id = ref and a.published))
  );
create policy "Editors manage highlights" on public.highlights for all to authenticated
  using ((select private.can_edit_site())) with check ((select private.can_edit_site()));

revoke all on public.highlights from anon, authenticated;
grant select on public.highlights to anon, authenticated;
grant insert, update, delete on public.highlights to authenticated;

create trigger audit_admin_edit after insert or update or delete on public.highlights
  for each row execute function private.audit_admin_edit();

-- Only a student who chose to be listed can be highlighted: nobody else's consent counts here, an
-- editor included. A student who is later hidden leaves the pool, so they do not reappear
-- if they are listed again; an editor must choose them afresh.
create function private.check_highlight_target()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind = 'student'
     and not exists (select 1 from public.profiles p
                     where p.id = new.ref and p.visible and private.has_consent(p.id, 'directory')) then
    raise exception 'Only a student who is listed in the directory can be highlighted'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_highlight_target before insert or update of kind, ref on public.highlights
  for each row execute function private.check_highlight_target();
revoke execute on function private.check_highlight_target() from public, anon, authenticated;

create function private.drop_highlight_if_hidden()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.highlights where kind = 'student' and ref = new.id;
  return new;
end;
$$;

create trigger drop_highlight_if_hidden after update of visible on public.profiles
  for each row when (old.visible and not new.visible) execute function private.drop_highlight_if_hidden();
revoke execute on function private.drop_highlight_if_hidden() from public, anon, authenticated;

-- Withdrawing directory permission ends the highlight too (it can leave `visible` alone), so
-- agreeing to be listed again does not bring it back.
create function private.drop_highlight_if_unconsented()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.highlights where kind = 'student' and ref = new.student_id;
  return new;
end;
$$;

create trigger drop_highlight_if_unconsented after update of revoked_at on public.consents
  for each row when (new.scope = 'directory' and old.revoked_at is null and new.revoked_at is not null)
  execute function private.drop_highlight_if_unconsented();
revoke execute on function private.drop_highlight_if_unconsented() from public, anon, authenticated;

-- A deleted project, student or story leaves the pool with it.
create function private.drop_highlight()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.highlights where kind = tg_argv[0] and ref = old.id;
  return old;
end;
$$;

create trigger drop_highlight after delete on public.projects
  for each row execute function private.drop_highlight('project');
create trigger drop_highlight after delete on public.profiles
  for each row execute function private.drop_highlight('student');
create trigger drop_highlight after delete on public.alumni_stories
  for each row execute function private.drop_highlight('alumni');
revoke execute on function private.drop_highlight() from public, anon, authenticated;

-- What the home page reads: the pool, limited to what the viewer may see. Projects must be
-- published, students listed in the directory, stories published; anything else drops out quietly.
create view public.home_highlights with (security_invoker = true) as
select 'project'::text as kind, h.ref, h.blurb, p.title as name, p.summary as detail,
       p.slug, p.thumbnail_path as image_path
from public.highlights h join public.projects p on p.id = h.ref
where h.kind = 'project' and p.published
union all
select 'student', h.ref, h.blurb, s.name,
       concat_ws(' · ', nullif(s.major, ''), case when s.class_year is not null then 'Class of ' || s.class_year end),
       s.slug, s.photo_path
from public.highlights h join public.listed_students s on s.id = h.ref
where h.kind = 'student'
union all
select 'alumni', h.ref, h.blurb, a.name,
       concat_ws(' · ', case when a.grad_year is not null then 'Class of ' || a.grad_year end,
                 nullif(concat_ws(', ', nullif(a.job_title, ''), nullif(a.employer, '')), '')),
       null, a.photo_path
from public.highlights h join public.alumni_stories a on a.id = h.ref
where h.kind = 'alumni' and a.published;

revoke all on public.home_highlights from anon, authenticated;
grant select on public.home_highlights to anon, authenticated;

-- Highlighted projects join the carousel's pool alongside the admin's monthly picks. The recent
-- projects still fill the rest, unless a monthly pool of published projects has been chosen:
-- a few highlights must not shrink the carousel to just those projects.
create or replace function public.carousel_candidates(for_day date)
returns table (project_id uuid, sub_department_id uuid, priority smallint, is_pinned boolean, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with pool as (
    select p.id, p.sub_department_id, p.priority, p.is_pinned, p.updated_at
    from public.projects p
    where p.published and (
      exists (select 1 from public.monthly_pool mp
              where mp.project_id = p.id and mp.month = to_char(for_day, 'YYYY-MM'))
      or exists (select 1 from public.highlights h where h.kind = 'project' and h.ref = p.id))
  )
  select * from pool
  union all
  select * from (
    select p.id, p.sub_department_id, p.priority, p.is_pinned, p.updated_at
    from public.projects p
    where p.published
      and not exists (select 1 from public.monthly_pool mp join public.projects mpp on mpp.id = mp.project_id
                      where mp.month = to_char(for_day, 'YYYY-MM') and mpp.published)
      and p.id not in (select id from pool)
    order by p.updated_at desc
    limit 15
  ) as recent
$$;

-- Event importance ---------------------------------------------------------------------------------

alter table public.events
  add column importance text not null default 'regular' check (importance in ('major', 'regular', 'minor'));

comment on column public.events.importance is
  'major leads the home page; regular is the default; minor is for filtering. No visual difference elsewhere yet.';

create index events_importance_idx on public.events (importance, event_date);

-- A highlight row has no id of its own (its key is kind + ref), so a changed line in the audit log
-- would not say which page it was for. Log the ref as the entry's target and add the kind.
create or replace function private.log_admin_edit(tbl text, op text, before_row jsonb, after_row jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  ident text;
  changes jsonb;
  row_now jsonb := coalesce(after_row, before_row);
begin
  if not (private.can_edit_content() or current_setting('role', true) = 'service_role') then
    return;
  end if;
  ident := row_now ->> coalesce(
    (select k from unnest(array['id', 'key', 'user_id', 'year', 'ref']) k where row_now ? k limit 1), 'id');

  select coalesce(jsonb_object_agg(k, jsonb_build_object(
           'from', private.audit_clip(before_row -> k), 'to', private.audit_clip(after_row -> k))), '{}')
  into changes
  from jsonb_object_keys(row_now) k
  where k not in ('updated_at', 'created_at', 'search')
    and not (tbl = 'profiles' and k = 'role')  -- role changes have their own entry
    and (op <> 'UPDATE' or before_row -> k is distinct from after_row -> k);

  if op = 'UPDATE' and changes = '{}'::jsonb then
    return;
  end if;

  perform private.audit(
    case op when 'INSERT' then 'admin_created' when 'UPDATE' then 'admin_edited' else 'admin_deleted' end,
    tbl,
    case when ident ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then ident::uuid end,
    jsonb_build_object('key', ident, 'changes', changes)
      || case when tbl <> 'planner_catalogs' and row_now ? 'catalog_year'
              then jsonb_build_object('catalog_year', row_now ->> 'catalog_year') else '{}'::jsonb end
      || case when tbl = 'highlights' then jsonb_build_object('kind', row_now ->> 'kind') else '{}'::jsonb end
  );
end;
$$;
