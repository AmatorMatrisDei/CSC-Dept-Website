-- Home page highlights. Any project, student or alumni story can be switched "on" for highlighting
-- by an editor (admins now, faculty once private.can_edit_site() includes them). Rows here are the
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

create policy "Highlights are public" on public.highlights for select to anon, authenticated using (true);
create policy "Editors manage highlights" on public.highlights for all to authenticated
  using ((select private.can_edit_site())) with check ((select private.can_edit_site()));

revoke all on public.highlights from anon, authenticated;
grant select on public.highlights to anon, authenticated;
grant insert, update, delete on public.highlights to authenticated;

create trigger audit_admin_edit after insert or update or delete on public.highlights
  for each row execute function private.audit_admin_edit();

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

-- Highlighted projects join the carousel's pool alongside the admin's monthly picks.
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
    where p.published and not exists (select 1 from pool)
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
