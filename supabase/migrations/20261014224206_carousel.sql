-- Schema v2, part 4 of 4: the home-page carousel (FR-5.4 to FR-5.8).
--
--   monthly_pool    the projects an admin picks for a month (FR-5.4)
--   daily_carousel  each day's 5 to 7 projects in display order (FR-5.5)
--   carousel_state  per day, when it was picked and how many times an admin re-shuffled
--   carousel_today  the API the home page reads (FR-5.8)
--
-- The pick itself (FR-5.6) is the Algorithms team's function, run by the `carousel` Edge
-- Function: it reads carousel_candidates(), picks with the seed '<day>:<re-shuffle count>', and
-- stores the result with save_carousel(). Days run on Eastern time.

create table public.monthly_pool (
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  project_id uuid not null references public.projects (id) on delete cascade,
  selected_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (month, project_id)
);

comment on column public.monthly_pool.month is 'YYYY-MM.';

create table public.daily_carousel (
  day date not null,
  position smallint not null check (position between 1 and 7),
  project_id uuid not null references public.projects (id) on delete cascade,
  primary key (day, position),
  unique (day, project_id)
);

create table public.carousel_state (
  day date primary key,
  reshuffles integer not null default 0 check (reshuffles >= 0),
  generated_at timestamptz not null default now()
);

create function public.carousel_day()
returns date
language sql stable set search_path = ''
as $$
  select (now() at time zone 'America/New_York')::date
$$;

-- The pick's input: the published projects in the day's monthly pool. If the admin hasn't picked
-- a pool for the month, the 15 most recently updated published projects (guide 4.3).
create function public.carousel_candidates(for_day date)
returns table (project_id uuid, sub_department_id uuid, priority smallint, is_pinned boolean, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with pool as (
    select p.id, p.sub_department_id, p.priority, p.is_pinned, p.updated_at
    from public.monthly_pool mp
    join public.projects p on p.id = mp.project_id
    where mp.month = to_char(for_day, 'YYYY-MM') and p.published
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

-- Stores a day's pick in display order. Pass the admin's id when it is a re-shuffle (FR-5.7);
-- that bumps the day's re-shuffle count and writes the audit log.
create function public.save_carousel(for_day date, project_ids uuid[], reshuffled_by uuid default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if cardinality(project_ids) > 7 then
    raise exception 'The carousel holds at most 7 projects' using errcode = '22023';
  end if;

  delete from public.daily_carousel where day = for_day;
  insert into public.daily_carousel (day, position, project_id)
  select for_day, ordinal, id from unnest(project_ids) with ordinality as picked (id, ordinal);

  insert into public.carousel_state (day, reshuffles, generated_at)
  values (for_day, case when reshuffled_by is null then 0 else 1 end, now())
  on conflict (day) do update set
    reshuffles = carousel_state.reshuffles + case when reshuffled_by is null then 0 else 1 end,
    generated_at = now();

  if reshuffled_by is not null then
    insert into public.audit_log (actor_id, action, target_type, details)
    values (reshuffled_by, 'carousel_reshuffled', 'carousel', jsonb_build_object('day', for_day, 'project_ids', project_ids));
  end if;
end;
$$;

-- Today's cards (FR-5.2, FR-5.8). Falls back to the most recent day picked, so the home page
-- never goes empty if a run is missed. Members are confirmed listed students and external names.
create view public.carousel_today with (security_invoker = true) as
select
  dc.position,
  p.id,
  p.slug,
  p.title,
  p.summary,
  p.status,
  p.thumbnail_path,
  coalesce((
    select jsonb_agg(jsonb_build_object('name', coalesce(s.name, c.external_name), 'role', c.role, 'student_id', c.student_id)
      order by c.sort_order)
    from public.contributions c
    left join public.profiles s on s.id = c.student_id
    where c.project_id = p.id
      and c.confirmed
      and (c.student_id is null or private.is_listed_student(c.student_id))
  ), '[]'::jsonb) as members,
  coalesce((
    select jsonb_agg(jsonb_build_object('name', f.name, 'faculty_id', f.id) order by f.name)
    from public.advising a
    join public.faculty f on f.id = a.faculty_id
    where a.project_id = p.id
  ), '[]'::jsonb) as advisors
from public.daily_carousel dc
join public.projects p on p.id = dc.project_id
where dc.day = (select max(d.day) from public.daily_carousel d where d.day <= public.carousel_day())
order by dc.position;

-- Grants and row level security ----------------------------------------------------------------

revoke all on public.monthly_pool, public.daily_carousel, public.carousel_state, public.carousel_today
  from anon, authenticated;

grant select on public.daily_carousel, public.carousel_today to anon, authenticated;
grant select, insert, delete on public.monthly_pool to authenticated;
grant select on public.carousel_state to authenticated;
grant all on public.monthly_pool, public.daily_carousel, public.carousel_state to service_role;
grant select on public.carousel_today to service_role;

revoke execute on function public.carousel_candidates(date) from public, anon, authenticated;
revoke execute on function public.save_carousel(date, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.carousel_candidates(date) to service_role;
grant execute on function public.save_carousel(date, uuid[], uuid) to service_role;

alter table public.monthly_pool enable row level security;
alter table public.daily_carousel enable row level security;
alter table public.carousel_state enable row level security;

create policy "Reviewers see the monthly pool"
  on public.monthly_pool for select to authenticated
  using ((select private.is_reviewer()));
create policy "Admins manage the monthly pool"
  on public.monthly_pool for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- Rows only hold project ids; carousel_today hides projects the viewer can't see.
create policy "The daily carousel is public"
  on public.daily_carousel for select to anon, authenticated
  using (true);

create policy "Reviewers see carousel runs"
  on public.carousel_state for select to authenticated
  using ((select private.is_reviewer()));
