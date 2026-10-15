-- Degree planner: requirements that match the catalog, and safeguards for admin edits.
--
-- The first import kept only the first course code of each prerequisite, so "MTH 220 and either
-- CSC 144 or CSC 171" became just MTH 220, and "high school math or MTH 160" became MTH 160. This
-- migration stores requirements the way the catalog states them and re-reads every course from
-- the 2025-2026 catalog (the data section at the end, generated from the catalog's course pages).
--
--   prerequisite_groups  all groups must be met; a group is met by any one of its courses done or
--                        planned earlier, or in the same term when it has "concurrent": true.
--                        "other" names something outside the plan that also meets it (high
--                        school math, placement), so the planner shouldn't warn about it.
--                        [{"courses": ["MTH220"]}, {"courses": ["CSC144", "CSC171"]}]
--   prerequisite_text,   the catalog's own wording, shown to students; it also covers what no
--   corequisite_text     course can satisfy (junior standing, instructor permission, majors only)
--   offered_years        {"fall": "every" | "odd" | "even", "spring": ...}: the catalog's "Offered"
--   offered_text         line, e.g. "Odd falls, every spring"; `offered` keeps the terms alone
--   credits_max          for variable-credit courses (internships "1-6"); `credits` is the minimum
--   catalog_url          the course's page in the online catalog
--
-- Safeguards: course references must exist, a course still used elsewhere can't be deleted or
-- renamed, hard prerequisites can't loop, and suggested plans must be well formed.
-- planner_catalog_issues() lists what's wrong with the suggested plans (a course before its
-- prerequisites, in a term it isn't offered, credit totals that don't add up).

-- New columns -------------------------------------------------------------------------------------

alter table public.planner_courses
  add column prerequisite_groups jsonb not null default '[]'::jsonb,
  add column prerequisite_text text check (prerequisite_text is null or char_length(prerequisite_text) <= 1000),
  add column corequisite_text text check (corequisite_text is null or char_length(corequisite_text) <= 1000),
  add column offered_years jsonb not null default '{}'::jsonb,
  add column offered_text text check (offered_text is null or char_length(offered_text) <= 200),
  add column credits_max smallint check (credits_max is null or credits_max between 1 and 12),
  add column catalog_url text check (catalog_url is null or catalog_url ~ '^https://[^ ]+$'),
  add constraint planner_courses_credit_range check (credits_max is null or credits_max > credits),
  add constraint planner_courses_code_key unique (code);

comment on column public.planner_courses.prerequisite_groups is
  'All groups must be met. A group is met by any one of its courses (done or planned earlier, or in the same term if "concurrent"), or by its "other" text.';

-- Course rows: shape now, references when the transaction ends ------------------------------------

create function private.check_planner_course()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  grp jsonb;
begin
  if tg_op = 'UPDATE' and new.id <> old.id then
    raise exception 'A course''s id can''t change; add a new course instead' using errcode = '22023';
  end if;
  if jsonb_typeof(new.prerequisite_groups) <> 'array' or jsonb_array_length(new.prerequisite_groups) > 20 then
    raise exception 'prerequisite_groups must be a list of up to 20 groups' using errcode = '22023';
  end if;
  for grp in select value from jsonb_array_elements(new.prerequisite_groups) loop
    if jsonb_typeof(grp) <> 'object'
       or exists (select 1 from jsonb_object_keys(grp) k where k not in ('courses', 'other', 'concurrent'))
       or jsonb_typeof(grp -> 'courses') <> 'array'
       or jsonb_array_length(grp -> 'courses') not between 1 and 12
       or exists (select 1 from jsonb_array_elements(grp -> 'courses') c where jsonb_typeof(c) <> 'string')
       or (grp ? 'other' and (jsonb_typeof(grp -> 'other') <> 'string' or char_length(grp ->> 'other') not between 1 and 300))
       or (grp ? 'concurrent' and jsonb_typeof(grp -> 'concurrent') <> 'boolean') then
      raise exception 'Each prerequisite group needs "courses" (1 to 12 course ids), and may have "other" (text) and "concurrent" (true/false)'
        using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(new.offered_years) <> 'object'
     or exists (select 1 from jsonb_each(new.offered_years) e
                where e.key not in ('fall', 'spring', 'summer')
                   or jsonb_typeof(e.value) <> 'string' or e.value #>> '{}' not in ('every', 'odd', 'even')) then
    raise exception 'offered_years maps fall, spring or summer to every, odd or even' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger check_planner_course before insert or update on public.planner_courses
  for each row execute function private.check_planner_course();

-- The course ids a row names as prerequisites or corequisites.
create function private.planner_course_refs(groups jsonb, coreqs text[])
returns text[]
language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(distinct ref), '{}')
  from (
    select jsonb_array_elements_text(g -> 'courses') as ref from jsonb_array_elements(groups) g
    union all
    select unnest(coreqs)
  ) refs
$$;

-- Runs when the transaction ends, so a batch of new courses can refer to each other.
create function private.check_planner_course_refs()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  missing text;
begin
  if not exists (select 1 from public.planner_courses where id = new.id) then
    return null;  -- deleted again in the same transaction
  end if;
  select string_agg(ref, ', ') into missing
  from unnest(private.planner_course_refs(new.prerequisite_groups, new.corequisites)) ref
  where ref = new.id or not exists (select 1 from public.planner_courses c where c.id = ref);
  if missing is not null then
    raise exception '% names courses that aren''t in the catalog, or itself: %', new.code, missing using errcode = '23503';
  end if;
  -- A loop of hard prerequisites (one course, no alternatives) could never be met.
  if exists (
    with recursive needs(id) as (
      select jsonb_array_elements_text(g -> 'courses')
      from jsonb_array_elements(new.prerequisite_groups) g
      where jsonb_array_length(g -> 'courses') = 1 and not g ? 'other' and not coalesce((g ->> 'concurrent')::boolean, false)
      union
      select jsonb_array_elements_text(g -> 'courses')
      from needs n
      join public.planner_courses c on c.id = n.id
      cross join lateral jsonb_array_elements(c.prerequisite_groups) g
      where jsonb_array_length(g -> 'courses') = 1 and not g ? 'other' and not coalesce((g ->> 'concurrent')::boolean, false)
    )
    select 1 from needs where id = new.id
  ) then
    raise exception '% would end up requiring itself through its prerequisites', new.code using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger check_planner_course_refs after insert or update on public.planner_courses
  deferrable initially deferred
  for each row execute function private.check_planner_course_refs();

-- A course other courses or a suggested plan still use can't be deleted.
create function private.guard_planner_course_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  used_by text;
begin
  select string_agg(label, ', ') into used_by from (
    select c.code as label from public.planner_courses c
    where c.id <> old.id and old.id = any (private.planner_course_refs(c.prerequisite_groups, c.corequisites))
    union all
    select d.name || ' suggested plan' from public.planner_degrees d
    where exists (
      select 1 from jsonb_array_elements(d.semesters) s, jsonb_array_elements(s -> 'entries') e
      where e ->> 'course' = old.id)
  ) uses;
  if used_by is not null then
    raise exception '% is still used by: %. Remove it there first.', old.code, used_by using errcode = '23503';
  end if;
  return old;
end;
$$;

create trigger guard_planner_course_delete before delete on public.planner_courses
  for each row execute function private.guard_planner_course_delete();

-- Suggested plans ----------------------------------------------------------------------------------

create function private.check_planner_degree()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  sem jsonb;
  entry jsonb;
  missing text;
begin
  for sem in select value from jsonb_array_elements(new.semesters) loop
    if jsonb_typeof(sem) <> 'object'
       or jsonb_typeof(sem -> 'year') <> 'number' or (sem ->> 'year')::numeric not between 1 and 8
       or sem ->> 'term' not in ('Fall', 'Spring', 'Summer')
       or (sem ? 'note' and jsonb_typeof(sem -> 'note') not in ('string', 'null'))
       or jsonb_typeof(sem -> 'entries') <> 'array' then
      raise exception 'Each semester needs a year (1 to 8), a term (Fall, Spring or Summer) and a list of entries'
        using errcode = '22023';
    end if;
    for entry in select value from jsonb_array_elements(sem -> 'entries') loop
      if not (
        (entry ? 'course' and jsonb_typeof(entry -> 'course') = 'string' and not entry ? 'slot')
        or (entry ? 'slot' and jsonb_typeof(entry -> 'slot') = 'string' and char_length(entry ->> 'slot') between 1 and 100
            and jsonb_typeof(entry -> 'credits') = 'number' and (entry ->> 'credits')::numeric between 0 and 20)
      ) then
        raise exception 'Each entry is either {"course": id} or {"slot": name, "credits": 0 to 20}' using errcode = '22023';
      end if;
    end loop;
  end loop;

  select string_agg(distinct e ->> 'course', ', ') into missing
  from jsonb_array_elements(new.semesters) s, jsonb_array_elements(s -> 'entries') e
  where e ? 'course' and not exists (select 1 from public.planner_courses c where c.id = e ->> 'course');
  if missing is not null then
    raise exception 'The % plan names courses that aren''t in the catalog: %', new.name, missing using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger check_planner_degree before insert or update of semesters on public.planner_degrees
  for each row execute function private.check_planner_degree();

-- Checking the suggested plans ---------------------------------------------------------------------

-- One row per problem: degree, the semester's position (0 = first), the course, and what's wrong.
-- course_id is null for problems with the whole plan or a semester.
create function public.planner_catalog_issues()
returns table (degree_id text, semester_index integer, course_id text, issue text)
language sql stable security invoker set search_path = ''
as $$
  with entries as (
    select d.id as degree_id, d.name, d.total_credits, (s.ord - 1)::integer as idx, s.value ->> 'term' as term,
           e.value ->> 'course' as course_id, coalesce(c.credits, (e.value ->> 'credits')::integer, 0) as credits
    from public.planner_degrees d
    cross join lateral jsonb_array_elements(d.semesters) with ordinality s(value, ord)
    cross join lateral jsonb_array_elements(s.value -> 'entries') e(value)
    left join public.planner_courses c on c.id = e.value ->> 'course'
  ),
  courses as (
    select e.*, c.code, c.prerequisite_groups, c.corequisites, c.offered
    from entries e join public.planner_courses c on c.id = e.course_id
  )
  -- Prerequisite groups that nothing earlier (or alongside, when allowed) meets.
  select x.degree_id, x.idx, x.course_id,
         'Needs ' || (select string_agg(coalesce(pc.code, r), ' or ')
                      from jsonb_array_elements_text(g -> 'courses') r
                      left join public.planner_courses pc on pc.id = r) || ' first'
  from courses x
  cross join lateral jsonb_array_elements(x.prerequisite_groups) g
  where not g ? 'other'
    and not exists (
      select 1 from entries y
      where y.degree_id = x.degree_id
        and y.course_id in (select jsonb_array_elements_text(g -> 'courses'))
        and (y.idx < x.idx or (y.idx = x.idx and coalesce((g ->> 'concurrent')::boolean, false))))
  union all
  -- Corequisites that aren't planned in the same or an earlier term.
  select x.degree_id, x.idx, x.course_id, 'Take with ' || coalesce(cc.code, r)
  from courses x
  cross join lateral unnest(x.corequisites) r
  left join public.planner_courses cc on cc.id = r
  where not exists (select 1 from entries y where y.degree_id = x.degree_id and y.course_id = r and y.idx <= x.idx)
  union all
  -- Courses placed in a term they aren't offered.
  select x.degree_id, x.idx, x.course_id, 'Only offered in ' || array_to_string(x.offered, ' and ')
  from courses x
  where cardinality(x.offered) > 0 and lower(x.term) <> all (x.offered)
  union all
  -- Semesters over 18 credits.
  select e.degree_id, e.idx, null, 'Semester has ' || sum(e.credits) || ' credits (over 18)'
  from entries e group by e.degree_id, e.idx having sum(e.credits) > 18
  union all
  -- Plans whose credits don't add up to the degree's total.
  select e.degree_id, null, null, 'Plan adds up to ' || sum(e.credits) || ' credits; the degree needs ' || max(e.total_credits)
  from entries e group by e.degree_id having sum(e.credits) <> max(e.total_credits)
  order by 1, 2 nulls first, 3
$$;

comment on function public.planner_catalog_issues() is
  'Problems in the suggested plans: prerequisites not met earlier, corequisites not alongside, terms not offered, credit totals.';

revoke execute on function public.planner_catalog_issues() from public;
grant execute on function public.planner_catalog_issues() to anon, authenticated, service_role;

-- Already private by default; stated so the intent survives a copy-paste.
revoke execute on function private.check_planner_course(), private.planner_course_refs(jsonb, text[]),
  private.check_planner_course_refs(), private.guard_planner_course_delete(), private.check_planner_degree()
  from public, anon, authenticated, service_role;

-- Corrected catalog data ---------------------------------------------------------------------------
-- Generated from the 2025-2026 undergraduate catalog's course pages (franciscan.smartcatalogiq.com).
-- Requirements were read from each page's Prerequisite and Corequisite sections; a few ambiguous
-- sentences were set by hand from the same wording, which is stored alongside for students to read.

-- Courses the requirements name that the planner didn't have yet.
insert into public.planner_courses (id, code, title, credits, credits_max, corequisites, offered, prerequisite_groups,
  prerequisite_text, corequisite_text, offered_years, offered_text, catalog_url) values
  ('PSY204', 'PSY 204', 'Research Statistics', 3, null, array[]::text[], array[]::text[], '[{"courses":["MTH155"],"other":"two years of high school mathematics including algebra"}]'::jsonb, 'Two years of high school mathematics including high school algebra or MTH 155.', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/psy-psychology-course-descriptions/200/psy-204'),
  ('COM281', 'COM 281', 'Graphic Design', 3, null, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/com-communication-arts-course-descriptions/200/com-281'),
  ('PSY310', 'PSY 310', 'Motivation and Leadership', 3, null, array[]::text[], array[]::text[], '[]'::jsonb, 'PSY 105', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/psy-psychology-course-descriptions/300/psy-310'),
  ('PSY318', 'PSY 318', 'Perception', 3, null, array[]::text[], array[]::text[], '[]'::jsonb, 'PSY 105 , BIO 134 or BIO 142', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/psy-psychology-course-descriptions/300/psy-318');

-- Every other course, as the catalog states it.
update public.planner_courses c set
  title = v.title, credits = v.credits, credits_max = v.credits_max, corequisites = v.corequisites,
  offered = v.offered, prerequisite_groups = v.prerequisite_groups, prerequisite_text = v.prerequisite_text,
  corequisite_text = v.corequisite_text, offered_years = v.offered_years, offered_text = v.offered_text,
  catalog_url = v.catalog_url
from (values
  ('CHM105', 'Energy Production and Society', 3, null::smallint, array[]::text[], array['summer']::text[], '[]'::jsonb, null, null, '{"summer":"every"}'::jsonb, 'Online summer only', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/100/chm-105'),
  ('CHM110', 'Chemistry with Biological and Medical Applications', 3, null::smallint, array['CHM115']::text[], array[]::text[], '[]'::jsonb, null, 'For pre nursing and middle childhood education students: CHM 115', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/100/chm-110'),
  ('CHM111', 'General Chemistry I', 3, null::smallint, array['CHM116']::text[], array[]::text[], '[]'::jsonb, null, 'Co-requisite for science majors and for pre-engineering and pre-professional students: CHM 116', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/100/chm-111'),
  ('CHM112', 'General Chemistry II', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CHM111"]}]'::jsonb, 'CHM 111', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/100/chm-112'),
  ('CHM114', 'Introductory Physiological Chemistry', 3, null::smallint, array['CHM118']::text[], array[]::text[], '[{"courses":["CHM110","CHM111"]},{"courses":["CHM115","CHM116"]}]'::jsonb, 'CHM 110 & CHM 115 or CHM 111 & CHM 116', 'For pre-nursing majors: CHM 118', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/100/chm-114'),
  ('CHM115', 'Chemistry with Biological and Medical Applications Laboratory', 1, null::smallint, array['CHM110']::text[], array[]::text[], '[]'::jsonb, null, 'CHM 110', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/100/chm-115'),
  ('CHM116', 'General Chemistry Laboratory I', 1, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CHM111"],"concurrent":true}]'::jsonb, 'CHM 111 (may be taken concurrently)', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/100/chm-116'),
  ('CHM117', 'General Chemistry Laboratory II', 1, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CHM112"],"concurrent":true},{"courses":["CHM116"]}]'::jsonb, 'CHM 112 (may be taken concurrently), CHM 116', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/100/chm-117'),
  ('CHM118', 'Introductory Physiological Chemistry Laboratory', 1, null::smallint, array['CHM114']::text[], array[]::text[], '[]'::jsonb, null, 'CHM 114', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/100/chm-118'),
  ('CHM141', 'General Chemistry for Technical Applications', 4, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/100/chm-141'),
  ('CHM200', 'Chemistry Seminar', 1, null::smallint, array[]::text[], array['fall']::text[], '[]'::jsonb, null, null, '{"fall":"even"}'::jsonb, 'Even falls', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/200/chm-200'),
  ('CHM203', 'Organic Chemistry I', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CHM112"]}]'::jsonb, 'CHM 112', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/200/chm-203'),
  ('CHM204', 'Organic Chemistry II', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CHM203"]}]'::jsonb, 'CHM 203', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/200/chm-204'),
  ('CHM205', 'Organic Chemistry I Laboratory', 1, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CHM116"]},{"courses":["CHM203"],"concurrent":true}]'::jsonb, 'CHM 116 , CHM 203 (may be taken concurrently)', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/200/chm-205'),
  ('CHM206', 'Organic Chemistry II Laboratory', 1, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CHM204"],"concurrent":true},{"courses":["CHM205"]}]'::jsonb, 'CHM 204 (may be taken concurrently), CHM 205', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/200/chm-206'),
  ('CHM213', 'Inorganic Chemistry', 3, null::smallint, array[]::text[], array['spring']::text[], '[{"courses":["CHM112"]}]'::jsonb, 'Pre-requisite: CHM 112', null, '{"spring":"even"}'::jsonb, 'Even springs', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/200/chm-213'),
  ('CHM225', 'Fundamentals of Chemical Analysis', 4, null::smallint, array[]::text[], array['fall', 'spring']::text[], '[{"courses":["CHM203"]}]'::jsonb, 'CHM 203', null, '{"fall":"odd","spring":"every"}'::jsonb, 'Odd falls, every spring', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/200/chm-225'),
  ('CHM312', 'Instrumental Analysis', 4, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CHM204"]},{"courses":["CHM225"]}]'::jsonb, 'CHM 204 , CHM 225', null, '{}'::jsonb, 'By demand', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/300/chm-312'),
  ('CHM321', 'Thermodynamics and Kinetics', 3, null::smallint, array['CHM324', 'CHM325']::text[], array['fall']::text[], '[{"courses":["CHM204"]},{"courses":["MTH162"]},{"courses":["PHY113","PHY222"]}]'::jsonb, 'CHM 204 ; MTH 162 ; either PHY 113 or PHY 222 .', 'CHM 324 , CHM 325', '{"fall":"every"}'::jsonb, 'Every fall', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/300/chm-321'),
  ('CHM322', 'Principles of Spectroscopy', 3, null::smallint, array['CHM324', 'CHM325']::text[], array['spring']::text[], '[{"courses":["CHM204"]},{"courses":["MTH162"]},{"courses":["PHY113","PHY222"]}]'::jsonb, 'CHM 204 ; MTH 162 ; either PHY 113 or PHY 222', 'CHM 324 - CHM 325', '{"spring":"even"}'::jsonb, 'Even springs', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/300/chm-322'),
  ('CHM323', 'Computational Chemistry', 4, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CHM204"]},{"courses":["MTH162"]},{"courses":["PHY113","PHY222"]}]'::jsonb, 'CHM 204 ; MTH 162 ; either PHY 113 or PHY 222', null, '{}'::jsonb, 'By demand', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/300/chm-323'),
  ('CHM324', 'Kinetics and Thermodynamics Laboratory', 1, null::smallint, array[]::text[], array['fall']::text[], '[{"courses":["CHM321"],"concurrent":true},{"courses":["CHM206"]},{"courses":["PHY114","PHY223","PHY225"]}]'::jsonb, 'CHM 321 (may be taken concurrently); CHM 206 ; either PHY 114 or PHY 223 or PHY 225', null, '{"fall":"every"}'::jsonb, 'Every fall', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/300/chm-324'),
  ('CHM325', 'Spectroscopy Laboratory', 1, null::smallint, array[]::text[], array['spring']::text[], '[{"courses":["CHM322"],"concurrent":true},{"courses":["CHM206"]},{"courses":["PHY114","PHY223","PHY225"]}]'::jsonb, 'CHM 322 (may be taken concurrently); CHM 206 ; and either PHY 114 or PHY 223 or PHY 225', null, '{"spring":"even"}'::jsonb, 'Even springs', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/300/chm-325'),
  ('CHM361', 'Materials Science and Engineering', 3, null::smallint, array[]::text[], array['fall']::text[], '[{"courses":["CHM111","CHM141"]}]'::jsonb, 'CHM 111 or CHM 141', null, '{"fall":"every"}'::jsonb, 'Every fall', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/300/chm-361'),
  ('CHM400', 'Internship', 1, 6::smallint, array[]::text[], array[]::text[], '[]'::jsonb, 'Chemistry senior standing and permission of the department chair. Internships must be preapproved.', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/400/chm-400'),
  ('CHM414', 'Advanced Inorganic Chemistry', 3, null::smallint, array[]::text[], array['spring']::text[], '[{"courses":["CHM213"]},{"courses":["CHM322","CHM323"]}]'::jsonb, 'CHM 213 and either CHM 322 or CHM 323', null, '{"spring":"odd"}'::jsonb, 'Odd springs', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/400/chm-414'),
  ('CHM419', 'Principles of Toxicology', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CHM203"]},{"courses":["CHM204"]}]'::jsonb, 'CHM 203 and CHM 204', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/400/chm-419'),
  ('CHM421', 'Foundations of Biochemistry I', 3, null::smallint, array[]::text[], array['fall']::text[], '[{"courses":["CHM203"]}]'::jsonb, 'CHM 203', null, '{"fall":"every"}'::jsonb, 'Every fall', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/400/chm-421'),
  ('CHM422', 'Foundations of Biochemistry II', 3, null::smallint, array[]::text[], array['spring']::text[], '[{"courses":["CHM421"]}]'::jsonb, 'CHM 421', null, '{"spring":"every"}'::jsonb, 'Every spring', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/400/chm-422'),
  ('CHM423', 'Biochemistry Laboratory', 1, null::smallint, array[]::text[], array['spring']::text[], '[{"courses":["CHM421"]},{"courses":["CHM422"],"concurrent":true}]'::jsonb, 'CHM 421 , CHM 422 (may be taken concurrently)', null, '{"spring":"every"}'::jsonb, 'Every spring', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/400/chm-423'),
  ('CHM431', 'Advanced Organic Chemistry', 3, null::smallint, array[]::text[], array['spring']::text[], '[]'::jsonb, 'Departmental permission', null, '{"spring":"odd"}'::jsonb, 'Odd springs', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/400/chm-431'),
  ('CHM434', 'Chemistry Thesis', 1, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/400/chm-434'),
  ('CHM437', 'Chemistry Research', 1, 3::smallint, array[]::text[], array[]::text[], '[]'::jsonb, 'Permission of instructor.', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/chm-chemistry-course-descriptions/400/chm-437'),
  ('CSC140', 'Survey of Computers', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/100/csc-140'),
  ('CSC141', 'Introduction to Computer Science', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/100/csc-141'),
  ('CSC142', 'Object-Oriented Programming Lab', 1, null::smallint, array['CSC144']::text[], array[]::text[], '[]'::jsonb, null, 'CSC 144', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/100/csc-142'),
  ('CSC144', 'Object-Oriented Programming', 3, null::smallint, array['CSC142']::text[], array[]::text[], '[]'::jsonb, null, 'CSC 142', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/100/csc-144'),
  ('CSC145', 'Data Structures', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC144"]}]'::jsonb, 'CSC 144 or permission of instructor.', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/100/csc-145'),
  ('CSC155', 'Computers and Instructional Technology I', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/100/csc-155'),
  ('CSC171', 'Applied Object-Oriented Programming', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/100/csc-171'),
  ('CSC204', 'Software Architecture and Patterns', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC144","CSC171"]}]'::jsonb, 'Sophomore Standing and CSC 144 or CSC 171', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/200/csc-204'),
  ('CSC205', 'Bioinformatics Programming', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC141","CSC144","CSC171","CSC280"]}]'::jsonb, 'CSC 141 , CSC 144 , CSC 171 or CSC 280', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/200/csc-205'),
  ('CSC210', 'Bioinformatics Algorithms', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC141","CSC144","CSC171","CSC280"]}]'::jsonb, 'CSC 141 , CSC 144 , CSC 171 or CSC 280', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/200/csc-210'),
  ('CSC230', 'Data Methods in Natural Sciences', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["MTH204","PSY204","ECO212","MTH401"]}]'::jsonb, 'MTH 204 or PSY 204 , ECO 212 , or MTH 401', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/200/csc-230'),
  ('CSC231', 'Nursing Informatics', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, 'Nursing Major', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/200/csc-231'),
  ('CSC255', 'Computers and Instructional Technology II', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC155"]}]'::jsonb, 'CSC 155 , Education majors only', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/200/csc-255'),
  ('CSC256', 'Networking/Telecommunications', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC141","CSC144"],"other":"sophomore standing"}]'::jsonb, 'CSC 141 or CSC 144 or sophomore standing', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/200/csc-256'),
  ('CSC261', 'Database and Information Processing Systems', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC141","CSC171","CSC144"]}]'::jsonb, 'CSC 141 , CSC 171 or CSC 144', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/200/csc-261'),
  ('CSC265', 'Intro to AI/ML Programming', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["MTH204"],"other":"an equivalent statistics course"},{"courses":["MTH172"]},{"courses":["SFE128"]}]'::jsonb, 'MTH 204 or equivalent, MTH 172 , SFE 128', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/200/csc-265'),
  ('CSC271', 'Structured Systems Analysis', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC171","CSC144"]}]'::jsonb, 'CSC 171 or CSC 144', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/200/csc-271'),
  ('CSC276', 'Intro to Distributed and Cloud Computing', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["SFE128"]},{"courses":["SFE240","CSC256"]}]'::jsonb, 'SFE 128 and ( SFE 240 or CSC 256 )', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/200/csc-276'),
  ('CSC280', 'Numerical Computing', 3, null::smallint, array['MTH161']::text[], array[]::text[], '[]'::jsonb, null, 'MTH 161', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/200/csc-280'),
  ('CSC310', 'Programming Languages', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC145"]}]'::jsonb, 'CSC 145', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/300/csc-310'),
  ('CSC315', 'Introduction to Data Science', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["PSY204","MTH204","MTH401","ECO212"]}]'::jsonb, 'PSY 204 or MTH 204 , MTH 401 , or ECO 212', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/300/csc-315'),
  ('CSC320', 'Evolutionary Algorithms', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC141","CSC144","CSC171","CSC230","CSC280"]}]'::jsonb, 'CSC 141 , CSC 144 , CSC 171 , CSC 230 or CSC 280', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/300/csc-320'),
  ('CSC330', 'Cryptography', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC141","CSC144","CSC171","CSC280"]},{"courses":["MTH220"]}]'::jsonb, 'CSC 141 , CSC 144 , CSC 171 , or CSC 280 ; and MTH 220 .', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/300/csc-330'),
  ('CSC335', 'Junior Seminar', 1, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, 'Junior Standing', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/300/csc-335'),
  ('CSC344', 'Algorithms and Complexity', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC145"]},{"courses":["MTH220"],"concurrent":true}]'::jsonb, 'CSC 145 and MTH 220 (May be taken concurrently with instructor permission)', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/300/csc-344'),
  ('CSC351', 'Current Topics in Computer Information Science', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, 'Junior standing or permission of instructor', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/300/csc-351'),
  ('CSC356', 'Advanced Networking', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC256","SFE240"]}]'::jsonb, 'CSC 256 or ( SFE 240 and permission of instructor)', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/300/csc-356'),
  ('CSC376', 'Software as a Service', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC276"]}]'::jsonb, 'CSC 276', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/300/csc-376'),
  ('CSC385', 'The User Experience', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["COM281","PSY310","PSY318"],"other":"permission of the instructor"}]'::jsonb, 'COM281 or CSC381 or PSY310 or PSY318 or permission of the instructor', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/300/csc-385'),
  ('CSC391', 'Web Dev: The Front End', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC145"]},{"courses":["CSC261"]}]'::jsonb, 'CSC 145 and CSC 261', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/300/csc-391'),
  ('CSC392', 'Web Dev: The Back End', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC145"]},{"courses":["CSC261"]}]'::jsonb, 'CSC 145 and CSC 261', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/300/csc-392'),
  ('CSC400', 'Internship', 1, 6::smallint, array[]::text[], array[]::text[], '[]'::jsonb, 'Computer science junior or senior standing and permission of the department chair. Internships must be preapproved.', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/400/csc-400'),
  ('CSC401', 'Computer Architecture and Operating Systems', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["MTH220"]},{"courses":["CSC144","CSC171"]}]'::jsonb, 'MTH 220 and either CSC 144 or CSC 171', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/400/csc-401'),
  ('CSC402', 'Hardware and Software Systems', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, 'Junior standing or permission of instructor', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/400/csc-402'),
  ('CSC403', 'Operating Systems', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC145"]},{"courses":["CSC401"]}]'::jsonb, 'CSC 145 and CSC 401', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/400/csc-403'),
  ('CSC404', 'Computer Architecture with Assembly Language', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC401"]}]'::jsonb, 'CSC 401', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/400/csc-404'),
  ('CSC405', 'Systems Project', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC204","CSC271"]}]'::jsonb, 'CSC 204 or CSC 271', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/400/csc-405'),
  ('CSC410', 'Artificial Intelligence Systems', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC265"]},{"courses":["PHL212"]}]'::jsonb, 'CSC 265 and PHL 212', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/400/csc-410'),
  ('CSC430', 'Theory of Computing', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["MTH220"]}]'::jsonb, 'MTH 220', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/400/csc-430'),
  ('CSC434', 'Senior Thesis', 1, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC335"]}]'::jsonb, 'CSC 335 and senior standing', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/400/csc-434'),
  ('CSC438', 'Senior Capstone Project I', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC335"]},{"courses":["SFE384","CSC391","CSC392"]}]'::jsonb, 'CSC 335 and SFE 384 or CSC 391 or CSC 392', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/400/csc-438'),
  ('CSC439', 'Senior Capstone Project II', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC438"]}]'::jsonb, 'CSC 438', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/csc-computer-science-course-descriptions/400/csc-439'),
  ('ECO121', 'Fundamentals of Economics', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/100/eco-121'),
  ('ECO201', 'Principles of Macroeconomics', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/200/eco-201'),
  ('ECO202', 'Principles of Microeconomics', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/200/eco-202'),
  ('ECO212', 'Fundamentals of Business Statistics', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["MTH155"],"other":"two years of high school mathematics including algebra, or a higher math course"}]'::jsonb, 'Two years of high school mathematics including algebra, or MTH 155 or higher', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/200/eco-212'),
  ('ECO290', 'Economic Theory of Games and Strategy', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/200/eco-290'),
  ('ECO302', 'Current Economic Problems', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["ECO201"]},{"courses":["ECO202"]}]'::jsonb, 'ECO 201 - ECO 202', null, '{}'::jsonb, 'Cycled course offered every other year', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/300/eco-302'),
  ('ECO303', 'Labor Economics', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["ECO201"]},{"courses":["ECO202"]}]'::jsonb, 'ECO 201 - ECO 202', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/300/eco-303'),
  ('ECO321', 'Money and Banking', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/300/eco-321'),
  ('ECO325', 'Public Choice', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["ECO121","ECO201"]},{"courses":["ECO121","ECO202"]}]'::jsonb, 'ECO 121 or ( ECO 201 and ECO 202 )', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/300/eco-325'),
  ('ECO341', 'Econometrics', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["ECO201"]},{"courses":["ECO202"]},{"courses":["ECO212"]},{"courses":["MTH156"]}]'::jsonb, 'ECO 201 , ECO 202 , ECO 212 , and MTH 156', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/300/eco-341'),
  ('ECO348', 'Sports Economics', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["ECO121","ECO201"]}]'::jsonb, 'ECO 121 or ECO 201', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/300/eco-348'),
  ('ECO355', 'Comparative Economic Systems', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["ECO201"]}]'::jsonb, 'ECO 201', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/300/eco-355'),
  ('ECO400', 'Internship', 1, 6::smallint, array[]::text[], array[]::text[], '[]'::jsonb, 'Economics senior standing and permission of chair; Internships must be preapproved.', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/400/eco-400'),
  ('ECO401', 'History of Economic Thought', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["ECO201"]},{"courses":["ECO202"]}]'::jsonb, 'ECO 201 - ECO 202', null, '{}'::jsonb, 'Cycled course offered every other year', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/400/eco-401'),
  ('ECO404', 'Law and Economics', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/400/eco-404'),
  ('ECO411', 'Intermediate Macroeconomic Theory', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["ECO201"]}]'::jsonb, 'ECO 201', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/400/eco-411'),
  ('ECO412', 'Intermediate Microeconomic Theory', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["ECO202"]}]'::jsonb, 'ECO 202', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/400/eco-412'),
  ('ECO427', 'International Trade and Finance', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["ECO201"]},{"courses":["ECO202"]}]'::jsonb, 'ECO 201 , ECO 202', null, '{}'::jsonb, 'Cycled course offered every other year', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/400/eco-427'),
  ('ECO430', 'Economics Practicum', 2, null::smallint, array['ECO434']::text[], array[]::text[], '[]'::jsonb, 'Senior standing', 'This course runs concurrently with ECO 434 .', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/400/eco-430'),
  ('ECO434', 'Senior Thesis', 1, null::smallint, array['ECO430']::text[], array[]::text[], '[]'::jsonb, 'Senior standing', 'This course must be taken concurrently with ECO 430 .', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/eco-economic-course-descriptions/400/eco-434'),
  ('EGR101', 'Introduction to Engineering and Design', 2, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/egr-engineering-course-descriptions/100/egr-101'),
  ('EGR102', 'Introduction to Engineering Analysis', 1, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/egr-engineering-course-descriptions/100/egr-102'),
  ('EGR160', 'Engineering Analysis', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["EGR102"]}]'::jsonb, 'EGR 102', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/egr-engineering-course-descriptions/100/egr-160'),
  ('EGR215', 'Rigid Body Statics', 3, null::smallint, array['MTH162']::text[], array[]::text[], '[{"courses":["PHY220"]},{"courses":["MTH162"],"concurrent":true}]'::jsonb, 'PHY 220 , MTH 162 (taken concurrently or as a prerequisite )', 'MTH 162', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/egr-engineering-course-descriptions/200/egr-215'),
  ('EGR216', 'Rigid Body Dynamics', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["EGR215"]}]'::jsonb, 'EGR 215', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/egr-engineering-course-descriptions/200/egr-216'),
  ('EGR217', 'Strength of Materials', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["EGR215"]}]'::jsonb, 'EGR 215', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/egr-engineering-course-descriptions/200/egr-217'),
  ('EGR218', 'Engineering Thermodynamics', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["PHY222"]}]'::jsonb, 'PHY 222', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/egr-engineering-course-descriptions/200/egr-218'),
  ('EGR230', 'Introduction to Electrical Systems Engineering', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["EGR160"]},{"courses":["PHY225"]}]'::jsonb, 'EGR 160 , PHY 225', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/egr-engineering-course-descriptions/200/egr-230'),
  ('EGR260', 'Introduction to Chemical Engineering Analysis', 3, null::smallint, array['MTH162']::text[], array[]::text[], '[{"courses":["PHY220"]},{"courses":["PHY221"]}]'::jsonb, 'PHY 220 , 221', 'MTH 162', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/egr-engineering-course-descriptions/200/egr-260'),
  ('EGR261', 'Materials Science and Engineering', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CHM111","CHM141"]}]'::jsonb, 'CHM 111 or CHM 141', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/egr-engineering-course-descriptions/200/egr-261'),
  ('EGR437', 'Special Projects in Engineering.', 1, 3::smallint, array[]::text[], array[]::text[], '[{"courses":["EGR101","EGR102"]}]'::jsonb, 'EGR 101 or EGR 102', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/egr-engineering-course-descriptions/400/egr-437'),
  ('HON101', 'Seminar I: Early Classical Thought', 4, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, 'Admission to the Honors Program', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/hon-honors-course-descriptions/100/hon-101'),
  ('HON102', 'Seminar II: Later Classical Thought', 4, null::smallint, array[]::text[], array[]::text[], '[{"courses":["HON101"]}]'::jsonb, 'Admission to the Honors Program and HON 101', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/hon-honors-course-descriptions/100/hon-102'),
  ('HON201', 'Seminar III: The Early Fathers', 4, null::smallint, array[]::text[], array[]::text[], '[{"courses":["HON102"]}]'::jsonb, 'Admission to the Honors Program and HON 102', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/hon-honors-course-descriptions/200/hon-201'),
  ('HON202', 'Seminar IV: Medieval Thought', 4, null::smallint, array[]::text[], array[]::text[], '[{"courses":["HON201"]}]'::jsonb, 'Admission to the Honors Program and HON 201', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/hon-honors-course-descriptions/200/hon-202'),
  ('HON301', 'Seminar V: The Renaissance', 4, null::smallint, array[]::text[], array[]::text[], '[{"courses":["HON202"]}]'::jsonb, 'Admission to the Honors Program and HON 202', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/hon-honors-course-descriptions/300/hon-301'),
  ('HON302', 'Seminar VI: The Enlightenment', 4, null::smallint, array[]::text[], array[]::text[], '[{"courses":["HON301"]}]'::jsonb, 'Admission to the Honors Program and HON 301', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/hon-honors-course-descriptions/300/hon-302'),
  ('HON401', 'Seminar VII: The 19th Century', 4, null::smallint, array[]::text[], array[]::text[], '[{"courses":["HON302"]}]'::jsonb, 'Admission to the Honors Program and HON 302', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/hon-honors-course-descriptions/400/hon-401'),
  ('HON402', 'Seminar VIII: The 20th Century', 4, null::smallint, array[]::text[], array[]::text[], '[{"courses":["HON401"]}]'::jsonb, 'Admission to the Honors Program and HON 401', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/hon-honors-course-descriptions/400/hon-402'),
  ('MEC227', 'Strength of Materials Lab', 1, null::smallint, array['EGR217']::text[], array[]::text[], '[{"courses":["EGR217"],"concurrent":true}]'::jsonb, 'EGR 217 can be taken concurrently or as a prerequisite', 'EGR 217', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mec-227-mechanical-engineering-descriptions/200/mec-227'),
  ('MEC300', 'Virtue, Technology, and Society', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["PHL212"]}]'::jsonb, 'PHL 212', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mec-227-mechanical-engineering-descriptions/300/mec-300'),
  ('MEC320', 'Mechanical Design', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["EGR160"]},{"courses":["EGR217"]}]'::jsonb, 'EGR 160 , EGR 217', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mec-227-mechanical-engineering-descriptions/300/mec-320'),
  ('MEC330', 'Solid Modeling and Manufacturing', 3, null::smallint, array['EGR261']::text[], array[]::text[], '[{"courses":["EGR217"]}]'::jsonb, 'EGR 217', 'EGR 261', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mec-227-mechanical-engineering-descriptions/300/mec-330'),
  ('MEC331', 'Solid Modeling and Manufacturing Lab', 1, null::smallint, array['MEC330']::text[], array[]::text[], '[{"courses":["MEC330"],"concurrent":true}]'::jsonb, 'MEC 330 can be taken concurrently or as a prerequisite', 'MEC 330', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mec-227-mechanical-engineering-descriptions/300/mec-331'),
  ('MEC350', 'Fluid Mechanics', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["EGR218"]}]'::jsonb, 'EGR 218', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mec-227-mechanical-engineering-descriptions/300/mec-350'),
  ('MEC351', 'Fluid Mechanics Lab', 1, null::smallint, array['MEC350']::text[], array[]::text[], '[{"courses":["MEC350"],"concurrent":true}]'::jsonb, 'MEC 350 can be taken concurrently or as a prerequisite', 'MEC 350', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mec-227-mechanical-engineering-descriptions/300/mec-351'),
  ('MEC360', 'Heat Transfer', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["MEC350"]},{"courses":["MTH265"]}]'::jsonb, 'MEC 350 , MTH 265', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mec-227-mechanical-engineering-descriptions/300/mec-360'),
  ('MEC361', 'Heat Transfer Lab', 1, null::smallint, array['MEC360']::text[], array[]::text[], '[{"courses":["MEC360"],"concurrent":true}]'::jsonb, 'MEC 360 can be taken concurrently or as a prerequisite', 'MEC 360', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mec-227-mechanical-engineering-descriptions/300/mec-361'),
  ('MEC404', 'Special Problems in Mechanical Engineering', 1, 3::smallint, array[]::text[], array[]::text[], '[{"courses":["EGR101","EGR102"]}]'::jsonb, 'EGR 101 or EGR 102', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mec-227-mechanical-engineering-descriptions/400/mec-404'),
  ('MEC407', 'Engineering Internship', 1, 3::smallint, array[]::text[], array[]::text[], '[]'::jsonb, 'Permission of chair. Internships must be preapproved if they are to be counted for class credit.', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mec-227-mechanical-engineering-descriptions/400/mec-407'),
  ('MEC430', 'Dynamic Systems', 3, null::smallint, array['PHY225']::text[], array[]::text[], '[{"courses":["MTH265"]}]'::jsonb, 'MTH 265', 'PHY 225', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mec-227-mechanical-engineering-descriptions/400/mec-430'),
  ('MEC433', 'Senior Capstone Project I', 3, null::smallint, array['MEC320']::text[], array[]::text[], '[{"courses":["MEC320"]}]'::jsonb, 'MEC 320', 'MEC 320', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mec-227-mechanical-engineering-descriptions/400/mec-433'),
  ('MEC435', 'Senior Capstone Project II', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["MEC330"]},{"courses":["MEC433"]}]'::jsonb, 'MEC 330 , MEC 433', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mec-227-mechanical-engineering-descriptions/400/mec-435'),
  ('MTH120', 'Survey of Mathematics', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/100/mth-120'),
  ('MTH121', 'Mathematics for Early and Middle Grade Teachers I', 3, null::smallint, array[]::text[], array['fall']::text[], '[]'::jsonb, null, null, '{"fall":"every"}'::jsonb, 'Every fall', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/100/mth-121'),
  ('MTH122', 'Mathematics for Early and Middle Grade Teachers II', 3, null::smallint, array[]::text[], array['spring']::text[], '[]'::jsonb, null, null, '{"spring":"every"}'::jsonb, 'Every spring', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/100/mth-122'),
  ('MTH123', 'MATH/AYA Mathematics', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/100/mth-123'),
  ('MTH155', 'Finite Mathematics', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, '1 year of high school algebra', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/100/mth-155'),
  ('MTH156', 'Applied Calculus', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, '2 years of high school algebra', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/100/mth-156'),
  ('MTH160', 'Precalculus', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, '2 years of high school mathematics including algebra and plane geometry', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/100/mth-160'),
  ('MTH161', 'Analytic Geometry and Calculus I', 4, null::smallint, array[]::text[], array[]::text[], '[{"courses":["MTH160"],"other":"three years of high school mathematics including two years of algebra"}]'::jsonb, 'Three years of high school mathematics including two years of algebra or MTH 160', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/100/mth-161'),
  ('MTH162', 'Analytic Geometry and Calculus II', 4, null::smallint, array[]::text[], array[]::text[], '[{"courses":["MTH161"]}]'::jsonb, 'MTH 161', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/100/mth-162'),
  ('MTH171', 'Matrix Theory I', 1, null::smallint, array['MTH161']::text[], array[]::text[], '[]'::jsonb, null, 'MTH 161', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/100/mth-171'),
  ('MTH172', 'Matrix Theory II', 1, null::smallint, array['MTH162']::text[], array[]::text[], '[{"courses":["MTH171"]}]'::jsonb, 'MTH 171', 'MTH 162', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/100/mth-172'),
  ('MTH179', 'History of Mathematics', 1, null::smallint, array[]::text[], array['spring']::text[], '[]'::jsonb, null, null, '{"spring":"even"}'::jsonb, 'Even spring', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/100/mth-179'),
  ('MTH204', 'Research Statistics', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["MTH155"],"other":"two years of high school mathematics including algebra"}]'::jsonb, 'Two years of high school mathematics including high school algebra, or MTH 155', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/200/mth-204'),
  ('MTH210', 'Euclidean and Non-Euclidean Geometry', 3, null::smallint, array[]::text[], array['fall']::text[], '[]'::jsonb, 'One year of high school geometry or MTH 134', null, '{"fall":"every"}'::jsonb, 'Every fall', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/200/mth-210'),
  ('MTH220', 'Discrete Mathematics', 3, null::smallint, array[]::text[], array['fall']::text[], '[{"courses":["MTH161"]}]'::jsonb, 'MTH 161', null, '{"fall":"every"}'::jsonb, 'Every fall', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/200/mth-220'),
  ('MTH261', 'Analytic Geometry and Calculus III', 4, null::smallint, array[]::text[], array[]::text[], '[{"courses":["MTH162"]}]'::jsonb, 'MTH 162', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/200/mth-261'),
  ('MTH265', 'Differential Equations', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["MTH162"]}]'::jsonb, 'MTH 162', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/200/mth-265'),
  ('MTH270', 'Chaos and Fractals', 3, null::smallint, array[]::text[], array['fall']::text[], '[{"courses":["MTH162"]},{"courses":["MTH172"]}]'::jsonb, 'MTH 162 , MTH 172 and at least 1 computer course', null, '{"fall":"every"}'::jsonb, 'Every fall', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/200/mth-270'),
  ('MTH305', 'Introduction to Abstract Algebra', 3, null::smallint, array[]::text[], array['fall']::text[], '[{"courses":["MTH161"]},{"courses":["MTH162"]},{"courses":["MTH220"]}]'::jsonb, 'MTH 161 - MTH 162 , MTH 220', null, '{"fall":"every"}'::jsonb, 'Every fall', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/300/mth-305'),
  ('MTH311', 'Linear Programming', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["MTH220"]}]'::jsonb, 'MTH 220', null, '{}'::jsonb, 'By demand', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/300/mth-311'),
  ('MTH315', 'Introduction to Data Science', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["MTH204","MTH401","ECO212"]}]'::jsonb, 'MTH 204 , MTH 401 , or ECO 212 .', 'Computer Science Elective', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/300/mth-315'),
  ('MTH320', 'Graph Theory', 3, null::smallint, array[]::text[], array['spring']::text[], '[{"courses":["MTH172"]},{"courses":["MTH220"]}]'::jsonb, 'MTH 172 , MTH 220', null, '{"spring":"every"}'::jsonb, 'Every spring', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/300/mth-320'),
  ('MTH330', 'Cryptography', 3, null::smallint, array[]::text[], array['spring']::text[], '[{"courses":["CSC141","CSC144","CSC171","CSC280"]},{"courses":["MTH155","MTH220"]}]'::jsonb, 'CSC 141 , CSC 144 , CSC 171 or CSC 280 ; and MTH 155 or MTH 220 , Crosslisted as CSC 330', null, '{"spring":"every"}'::jsonb, 'Every spring', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/300/mth-330'),
  ('MTH333', 'Intermediate Linear Algebra', 3, null::smallint, array[]::text[], array['spring']::text[], '[{"courses":["MTH162"]},{"courses":["MTH172"]},{"courses":["MTH220"]}]'::jsonb, 'MTH 162 , MTH 172 , MTH 220', null, '{"spring":"every"}'::jsonb, 'Every spring', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/300/mth-333'),
  ('MTH335', 'Junior Seminar', 1, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/300/mth-335'),
  ('MTH391', 'Advanced Calculus for Applications', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["MTH265"]}]'::jsonb, 'MTH 265', null, '{}'::jsonb, 'By demand', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/300/mth-391'),
  ('MTH400', 'Internship', 1, 6::smallint, array[]::text[], array[]::text[], '[]'::jsonb, 'Mathematical science junior or senior standing and permission of the department chair. Internships must be pre-approved.', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/400/mth-400'),
  ('MTH401', 'Mathematical Statistics I', 3, null::smallint, array[]::text[], array['fall']::text[], '[{"courses":["MTH161"]},{"courses":["MTH162"]}]'::jsonb, 'MTH 161 - MTH 162', null, '{"fall":"every"}'::jsonb, 'Every fall', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/400/mth-401'),
  ('MTH402', 'Mathematical Statistics II', 3, null::smallint, array[]::text[], array['spring']::text[], '[{"courses":["MTH401"]}]'::jsonb, 'MTH 401', null, '{"spring":"even"}'::jsonb, 'Even spring', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/400/mth-402'),
  ('MTH408', 'Introduction to Functions of a Complex Variable', 3, null::smallint, array[]::text[], array['fall']::text[], '[{"courses":["MTH261"]}]'::jsonb, 'MTH 261', null, '{"fall":"odd"}'::jsonb, 'Odd fall', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/400/mth-408'),
  ('MTH420', 'Introduction to Real Analysis', 3, null::smallint, array[]::text[], array['fall']::text[], '[{"courses":["MTH220"]},{"courses":["MTH261"]}]'::jsonb, 'MTH 220 and MTH 261', null, '{"fall":"even"}'::jsonb, 'Even fall', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/400/mth-420'),
  ('MTH430', 'Numerical Analysis', 3, null::smallint, array[]::text[], array['spring']::text[], '[{"courses":["MTH161"]},{"courses":["MTH162"]},{"courses":["CSC141","CSC144","CSC280"]}]'::jsonb, 'MTH 161 - MTH 162 and either CSC 141 , CSC 144 or CSC 280', null, '{"spring":"odd"}'::jsonb, 'Odd spring', 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/400/mth-430'),
  ('MTH434', 'Senior Thesis', 1, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/mth-mathematics-course-descriptions/400/mth-434'),
  ('PHL113', 'Philosophy of the Human Person', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/100/phl-113'),
  ('PHL211', 'Metaphysics', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/200/phl-211'),
  ('PHL212', 'Foundations of Ethics', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/200/phl-212'),
  ('PHL301', 'Logic', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/300/phl-301'),
  ('PHL306', 'Epistemology', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/300/phl-306'),
  ('PHL308', 'Philosophy of Religion', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/300/phl-308'),
  ('PHL310', 'Selected Problems in Ethics', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/300/phl-310'),
  ('PHL311', 'Ancient Greek Philosophy', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/300/phl-311'),
  ('PHL312', 'Medieval Philosophy', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/300/phl-312'),
  ('PHL317', 'Modern Philosophy', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/300/phl-317'),
  ('PHL325', 'The Thomistic Tradition in Philosophy', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/300/phl-325'),
  ('PHL332', 'Introduction to Eastern Philosophy', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/300/phl-332'),
  ('PHL340', 'The Franciscan Tradition in Philosophy', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/300/phl-340'),
  ('PHL350', 'Social & Political Philosophy', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/300/phl-350'),
  ('PHL391', 'Ancient/Medieval Political Philosophy', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/300/phl-391'),
  ('PHL392', 'Modern Political Philosophy', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/300/phl-392'),
  ('PHL393', 'Contemporary Political Philosophy', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/300/phl-393'),
  ('PHL411', 'Aesthetics', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/400/phl-411'),
  ('PHL412', 'Contemporary Philosophy', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/400/phl-412'),
  ('PHL420', 'Existentialism', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/400/phl-420'),
  ('PHL422', 'Philosophy of Community', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/400/phl-422'),
  ('PHL423', 'Philosophy in Literature', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/400/phl-423'),
  ('PHL424', 'Philosophy of Science', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/400/phl-424'),
  ('PHL425', 'Philosophy of God', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/400/phl-425'),
  ('PHL426', 'Philosophy of Law', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/400/phl-426'),
  ('PHL428', 'The Nature of Love', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/400/phl-428'),
  ('PHL430', 'Philosophical Texts', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/400/phl-430'),
  ('PHL432', 'Philosophy of Language', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/400/phl-432'),
  ('PHL435', 'Senior Seminar and Thesis', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phl-philosophy-course-descriptions/400/phl-435'),
  ('PHY105', 'Survey of Physical Science', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phy-physics-course-descriptions/100/phy-105'),
  ('PHY106', 'Survey of Earth and Space Science', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phy-physics-course-descriptions/100/phy-106'),
  ('PHY111', 'General Physics I', 3, null::smallint, array['PHY112']::text[], array[]::text[], '[{"courses":["MTH160"]}]'::jsonb, 'MTH 160', 'Science majors co-requisite: PHY 112 (not required but strongly encouraged for non-science majors).', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phy-physics-course-descriptions/100/phy-111'),
  ('PHY112', 'General Physics I Lab', 1, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phy-physics-course-descriptions/100/phy-112'),
  ('PHY113', 'General Physics II', 3, null::smallint, array['PHY114']::text[], array[]::text[], '[{"courses":["PHY111"]}]'::jsonb, 'PHY 111', 'Science majors co-requisite: PHY 114 (not required but strongly encouraged for non-science majors).', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phy-physics-course-descriptions/100/phy-113'),
  ('PHY114', 'General Physics II Lab', 1, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phy-physics-course-descriptions/100/phy-114'),
  ('PHY220', 'University Physics I', 3, null::smallint, array['PHY221']::text[], array[]::text[], '[{"courses":["MTH161"]}]'::jsonb, 'MTH 161 with grade of C- or higher', 'Science majors co-requisite (not required but strongly encouraged for non-science majors): PHY 221', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phy-physics-course-descriptions/200/phy-220'),
  ('PHY221', 'University Physics I Lab', 1, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phy-physics-course-descriptions/200/phy-221'),
  ('PHY222', 'University Physics II', 3, null::smallint, array['PHY223']::text[], array[]::text[], '[{"courses":["PHY220"]},{"courses":["MTH162"]}]'::jsonb, 'PHY 220 , MTH 162', 'Science majors co-requisite (not required but strongly encouraged for non-science majors): PHY 223', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phy-physics-course-descriptions/200/phy-222'),
  ('PHY223', 'University Physics II Lab', 1, null::smallint, array['PHY222']::text[], array[]::text[], '[{"courses":["PHY221"]}]'::jsonb, 'PHY 221', 'PHY 222', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phy-physics-course-descriptions/200/phy-223'),
  ('PHY224', 'University Physics III', 3, null::smallint, array['PHY225']::text[], array[]::text[], '[{"courses":["PHY220"]},{"courses":["MTH162"]}]'::jsonb, 'PHY 220 , MTH 162', 'Science majors co-requisite (not required but strongly encouraged for non-science majors): PHY 225', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phy-physics-course-descriptions/200/phy-224'),
  ('PHY225', 'University Physics III Lab', 1, null::smallint, array['PHY224']::text[], array[]::text[], '[{"courses":["PHY221"]}]'::jsonb, 'PHY 221', 'PHY 224', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/phy-physics-course-descriptions/200/phy-225'),
  ('SCI110', 'Modern Science and the Catholic Faith', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sci-science-course-descriptions/100/sci-110'),
  ('SCI147', 'Catholicism, Science, and Technology I', 1, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sci-science-course-descriptions/100/sci-147'),
  ('SCI247', 'Catholicism, Science, and Technology II', 1, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sci-science-course-descriptions/200/sci-247'),
  ('SCI347', 'Catholicism, Science, and Technology III', 1, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sci-science-course-descriptions/300/sci-347'),
  ('SCI447', 'Catholicism, Science, and Technology IV', 1, null::smallint, array[]::text[], array[]::text[], '[{"courses":["SCI147"]},{"courses":["SCI247","SCI347"]}]'::jsonb, 'SCI 147 and (247 or 347)', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sci-science-course-descriptions/400/sci-447'),
  ('SFE112', 'Introduction to Software Engineering', 2, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/100/sfe-112'),
  ('SFE128', 'Linux and Scripting', 3, null::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/100/sfe-128'),
  ('SFE204', 'Software Architecture and Patterns', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["SFE112"]},{"courses":["CSC141","CSC144","CSC171"]}]'::jsonb, 'SFE 112 and one of the following: CSC 141 , CSC 144 , or CSC 171', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/200/sfe-204'),
  ('SFE224', 'Requirements Analysis', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC141","CSC144","CSC171","EGR160"]}]'::jsonb, 'One of the following: CSC 141 , CSC 144 , , CSC 171 , or EGR 160', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/200/sfe-224'),
  ('SFE240', 'Intro to Cybersecurity and Networking', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["SFE128"]}]'::jsonb, 'SFE 128', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/200/sfe-240'),
  ('SFE256', 'Networking/Telecommunications', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC141","CSC144"]}]'::jsonb, 'CSC 141 or CSC 144', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/200/sfe-256'),
  ('SFE261', 'Database Systems', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["CSC141","CSC171","CSC144"]}]'::jsonb, 'CSC 141 , CSC 171 or CSC 144', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/200/sfe-261'),
  ('SFE305', 'Virtue, Technology, and Society', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["PHL212"]}]'::jsonb, 'PHL 212', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/300/sfe-305'),
  ('SFE330', 'Cryptography', 3, null::smallint, array['CSC330', 'MTH330']::text[], array[]::text[], '[{"courses":["CSC141","CSC144","CSC171","CSC280"]},{"courses":["MTH220"]}]'::jsonb, 'CSC 141 , CSC 144 , CSC 171 , or CSC 280 ; and MTH 220', 'CSC 330 , MTH 330', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/300/sfe-330'),
  ('SFE340', 'Mathematical Foundations of AI and ML', 2, null::smallint, array[]::text[], array[]::text[], '[{"courses":["MTH162"]},{"courses":["MTH172"]},{"courses":["SFE128"]}]'::jsonb, 'MTH 162 , MTH 172 and SFE 128', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/300/sfe-340'),
  ('SFE364', 'Cybersecurity I: Computer Security', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["SFE240"]}]'::jsonb, 'SFE 240', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/300/sfe-364'),
  ('SFE365', 'Cybersecurity II: Network Security and Management', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["SFE240"]}]'::jsonb, 'SFE 240', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/300/sfe-365'),
  ('SFE366', 'Cybersecurity III: Software and Security', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["SFE240"]},{"courses":["CSC144"]}]'::jsonb, 'SFE 240 , CSC 144', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/300/sfe-366'),
  ('SFE384', 'Software Process and Quality Assurance', 3, null::smallint, array['SFE385']::text[], array[]::text[], '[{"courses":["SFE204"]},{"courses":["SFE224"]}]'::jsonb, 'SFE 204 , SFE 224', 'SFE 385', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/300/sfe-384'),
  ('SFE385', 'Software Process and Quality Assurance Lab', 1, null::smallint, array['SFE384']::text[], array[]::text[], '[]'::jsonb, null, 'SFE 384', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/300/sfe-385'),
  ('SFE401', 'Computer Architecture and Operating Systems', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["MTH220"]},{"courses":["CSC145","CSC171"]}]'::jsonb, 'MTH 220 and CSC 145 or CSC 171', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/400/sfe-401'),
  ('SFE403', 'Software Factory Pipelines', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["SFE240"]},{"courses":["SFE384","CSC391","CSC392"]}]'::jsonb, 'SFE 240 , SFE 384 or CSC 391 or CSC 392', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/400/sfe-403'),
  ('SFE404', 'Special Problems in Software Engineering', 1, 3::smallint, array[]::text[], array[]::text[], '[]'::jsonb, null, null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/400/sfe-404'),
  ('SFE438', 'Senior Capstone Project I', 3, null::smallint, array['SFE204', 'SFE384']::text[], array[]::text[], '[{"courses":["SFE204"],"concurrent":true},{"courses":["SFE384","CSC391","CSC392"],"concurrent":true}]'::jsonb, 'SFE 204 and ( SFE 384 or CSC 391 or CSC 392 ). SFE 204 and SFE384 may be taken as a pre-requisite or co-requisite.', 'SFE 204 , SFE 384', '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/400/sfe-438'),
  ('SFE439', 'Senior Capstone Project II', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["SFE438"]}]'::jsonb, 'SFE 438', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/400/sfe-439'),
  ('SFE448', 'Software Testing', 2, null::smallint, array[]::text[], array[]::text[], '[{"courses":["SFE384"]},{"courses":["MTH204"],"other":"an equivalent statistics course"}]'::jsonb, 'SFE 384 and MTH 204 or equivalent', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/400/sfe-448'),
  ('SFE471', 'Digital Forensics in Practice', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["SFE112"]},{"courses":["CSC141","CSC144","CSC171"]}]'::jsonb, 'SFE 112 and one of the following: CSC 141 , CSC 144 , or CSC 171', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/400/sfe-471'),
  ('SFE472', 'Digital Forensics Policy and Law', 3, null::smallint, array[]::text[], array[]::text[], '[{"courses":["SFE471"]}]'::jsonb, 'SFE 471', null, '{}'::jsonb, null, 'https://franciscan.smartcatalogiq.com/en/2025-2026/undergraduate-catalog-2025-2026/courses/sfe-software-engineering-course-descriptions/400/sfe-472')
) as v (id, title, credits, credits_max, corequisites, offered, prerequisite_groups, prerequisite_text,
  corequisite_text, offered_years, offered_text, catalog_url)
where c.id = v.id;

-- Check every course's references now (they'd otherwise wait for the end of the transaction),
-- then retire the old single-list column, which prerequisite_groups replaces.
set constraints all immediate;
alter table public.planner_courses drop column prerequisites;
