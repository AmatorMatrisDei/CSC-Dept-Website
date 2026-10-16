-- The degree planner: who reads and writes what, catalog years, the safeguards on courses and
-- programs, planner_catalog_issues(), and spot checks that the data matches each year's catalog.
begin;
\ir _helpers.psql
select plan(37);

-- Reference checks normally wait for the end of the transaction; run them per statement here.
set constraints all immediate;

-- Who reads and writes ----------------------------------------------------------------------------

select pg_temp.login_anon();

select results_eq(
  $$ select year from public.planner_catalogs order by year $$,
  $$ values ('2022-2023'), ('2023-2024'), ('2024-2025'), ('2025-2026'), ('2026-2027') $$,
  'visitors see the five catalog years'
);

select ok(
  (select count(*) from public.planner_courses where catalog_year = '2025-2026') > 200
    and (select count(*) from public.planner_degrees where catalog_year = '2025-2026') >= 6,
  'visitors read each year''s courses and programs'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');

select throws_ok(
  $$ insert into public.planner_courses (catalog_year, id, code, title, credits) values ('2025-2026', 'XYZ101', 'XYZ 101', 'Mine', 3) $$,
  '42501', null,
  'students cannot change the catalog'
);

select throws_ok(
  $$ insert into public.planner_catalogs (year, name) values ('2027-2028', 'Mine') $$,
  '42501', null,
  'or add a catalog year'
);

select lives_ok(
  $$ insert into public.planner_plans (user_id, state) values ('a0000000-0000-4000-8000-000000000003', '{"catalog": "2024-2025", "degree": "BS_CS"}') $$,
  'students save their own plan'
);

select throws_ok(
  $$ insert into public.planner_plans (user_id, state) values ('a0000000-0000-4000-8000-000000000005', '{}') $$,
  '42501', null,
  'but not anyone else''s'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000005');

select is_empty(
  $$ select * from public.planner_plans where user_id = 'a0000000-0000-4000-8000-000000000003' $$,
  'nobody reads another student''s plan'
);

-- Safeguards on courses (as an admin) -------------------------------------------------------------

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.planner_courses (catalog_year, id, code, title, credits, prerequisite_groups)
     values ('2025-2026', 'TST201', 'TST 201', 'Test course', 3, '[{"courses": ["CSC144", "CSC171"]}, {"courses": ["MTH220"]}]') $$,
  'admins add a course whose prerequisites are in its catalog'
);

select lives_ok(
  $$ insert into public.planner_courses (catalog_year, id, code, title, credits)
     values ('2024-2025', 'TST201', 'TST 201', 'Test course, an older version', 4) $$,
  'the same course can be in another catalog year, with different details'
);

select throws_ok(
  $$ insert into public.planner_courses (catalog_year, id, code, title, credits)
     values ('2025-2026', 'TST299', 'TST 201', 'Same code', 3) $$,
  '23505', null,
  'but a code is used once per catalog year'
);

select throws_ok(
  $$ insert into public.planner_courses (catalog_year, id, code, title, credits, prerequisite_groups)
     values ('2025-2026', 'TST202', 'TST 202', 'Bad', 3, '[{"courses": ["NOPE999"]}]') $$,
  '23503', null,
  'a prerequisite must be in the catalog'
);

select throws_ok(
  $$ insert into public.planner_courses (catalog_year, id, code, title, credits, prerequisite_groups)
     values ('2022-2023', 'TST202', 'TST 202', 'Bad', 3, '[{"courses": ["CSC142"]}]') $$,
  '23503', null,
  'in the same catalog year: CSC 142 is not in the 2022-2023 catalog'
);

select throws_ok(
  $$ insert into public.planner_courses (catalog_year, id, code, title, credits, prerequisite_groups)
     values ('2025-2026', 'TST203', 'TST 203', 'Bad', 3, '[{"course": "CSC144"}]') $$,
  '22023', null,
  'prerequisite groups must have the right shape'
);

select throws_ok(
  $$ update public.planner_courses set prerequisite_groups = '[{"courses": ["TST201"]}]'
     where catalog_year = '2025-2026' and id = 'TST201' $$,
  '23503', null,
  'a course cannot require itself'
);

select throws_ok(
  $$ update public.planner_courses set prerequisite_groups = '[{"courses": ["TST201"]}]'
     where catalog_year = '2025-2026' and id = 'MTH220' $$,
  '23514', null,
  'hard prerequisites cannot loop (MTH 220 -> TST 201 -> MTH 220)'
);

select throws_ok(
  $$ delete from public.planner_courses where catalog_year = '2025-2026' and id = 'MTH220' $$,
  '23503', null,
  'a course other courses or programs use cannot be deleted'
);

select throws_ok(
  $$ update public.planner_courses set id = 'TST299' where catalog_year = '2025-2026' and id = 'TST201' $$,
  '22023', null,
  'a course''s id cannot change'
);

select throws_ok(
  $$ update public.planner_courses set catalog_year = '2026-2027' where catalog_year = '2025-2026' and id = 'TST201' $$,
  '22023', null,
  'nor its catalog year'
);

select lives_ok(
  $$ delete from public.planner_courses where catalog_year = '2025-2026' and id = 'TST201' $$,
  'an unused course can be deleted'
);

select is(
  (select title from public.planner_courses where catalog_year = '2024-2025' and id = 'TST201'),
  'Test course, an older version',
  'and only from its own catalog year'
);

-- Safeguards on programs --------------------------------------------------------------------------

select throws_ok(
  $$ update public.planner_degrees set semesters = '[{"year": 1, "term": "Fall", "entries": [{"course": "NOPE999"}]}]'
     where catalog_year = '2025-2026' and id = 'BS_CS' $$,
  '23503', null,
  'a suggested plan can only use courses of its catalog'
);

select throws_ok(
  $$ update public.planner_degrees set semesters = '[{"year": 1, "term": "Autumn", "entries": []}]'
     where catalog_year = '2025-2026' and id = 'BS_CS' $$,
  '22023', null,
  'suggested plans must have the right shape'
);

select throws_ok(
  $$ update public.planner_degrees set requirements = '[{"options": [["CSC142"]]}]'
     where catalog_year = '2022-2023' and id = 'BS_CS' $$,
  '23503', null,
  'requirements can only name courses of the program''s catalog'
);

select throws_ok(
  $$ update public.planner_degrees set requirements = '[{"options": ["CSC144"]}]'
     where catalog_year = '2025-2026' and id = 'BS_CS' $$,
  '22023', null,
  'requirements must have the right shape (options are lists of courses)'
);

select throws_ok(
  $$ delete from public.planner_courses where catalog_year = '2025-2026' and id = 'SFE330' $$,
  '23503', null,
  'a course a minor requires cannot be deleted'
);

-- Checking suggested plans ----------------------------------------------------------------------

update public.planner_degrees set semesters =
  '[{"year": 1, "term": "Fall", "entries": [{"course": "CSC401"}, {"course": "MTH161"}]},
    {"year": 1, "term": "Spring", "entries": [{"course": "MTH220"}]},
    {"year": 2, "term": "Fall", "entries": [{"course": "CHM225"}]}]'
where catalog_year = '2025-2026' and id = 'BS_CS';
reset role;

select results_eq(
  $$ select issue from public.planner_catalog_issues()
     where catalog_year = '2025-2026' and degree_id = 'BS_CS' and course_id = 'CSC401' order by issue $$,
  $$ values ('Needs CSC 144 or CSC 171 first'), ('Needs MTH 220 first') $$,
  'a course before its prerequisites is flagged, one line per unmet group'
);

select is_empty(
  $$ select 1 from public.planner_catalog_issues() where course_id = 'MTH161' $$,
  'MTH 161 needs nothing planned: high school math counts'
);

select results_eq(
  $$ select issue from public.planner_catalog_issues()
     where catalog_year = '2025-2026' and degree_id = 'BS_CS' and course_id = 'MTH220' $$,
  $$ values ('Only offered in fall') $$,
  'a course in a term it is not offered is flagged'
);

select results_eq(
  $$ select issue from public.planner_catalog_issues()
     where catalog_year = '2025-2026' and degree_id = 'BS_CS' and course_id = 'CHM225' and issue like 'Only offered%' $$,
  $$ values ('Only offered in odd years (fall 2026 is not)') $$,
  'a course offered in odd falls is flagged in an even fall, counting from the catalog year'
);

select is_empty(
  $$ select 1 from public.planner_catalog_issues() where catalog_year = '2026-2027' and degree_id = 'BS_CS' and course_id = 'CSC401' $$,
  'other catalog years keep their own plans'
);

-- The catalog data ------------------------------------------------------------------------------

select is(
  (select prerequisite_groups from public.planner_courses where catalog_year = '2025-2026' and id = 'CSC401'),
  '[{"courses": ["MTH220"]}, {"courses": ["CSC144", "CSC171"]}]'::jsonb,
  'CSC 401: MTH 220 and either CSC 144 or CSC 171, as the catalog says'
);

select is(
  (select prerequisite_groups from public.planner_courses where catalog_year = '2022-2023' and id = 'SFE448'),
  '[{"courses": ["SFE224"]}, {"courses": ["CSC144", "CSC171"]}]'::jsonb,
  'SFE 448 in 2022-2023: SFE 224, and CSC 144 or CSC 171'
);

select is(
  (select offered_years from public.planner_courses where catalog_year = '2025-2026' and id = 'CHM225'),
  '{"fall": "odd", "spring": "every"}'::jsonb,
  'CHM 225: odd falls, every spring'
);

select ok(
  (select requirements @> '[{"options": [["SFE331"]]}]' and not requirements @> '[{"options": [["CSC265"]]}]'
   from public.planner_degrees where catalog_year = '2026-2027' and id = 'BS_CS')
  and (select requirements @> '[{"options": [["CSC265"]]}]'
       from public.planner_degrees where catalog_year = '2025-2026' and id = 'BS_CS'),
  'Computer Science: 2026-2027 requires SFE 331 where 2025-2026 required CSC 265'
);

select results_eq(
  $$ select catalog_year from public.planner_degrees where id = 'BS_CIS' order by 1 $$,
  $$ values ('2022-2023'), ('2023-2024') $$,
  'Computer Information Science is only in the catalogs that offered it'
);

select results_eq(
  $$ select kind, count(*)::integer, min(jsonb_array_length(semesters)), max(jsonb_array_length(semesters))
     from public.planner_degrees where catalog_year = '2026-2027' group by kind order by kind $$,
  $$ values ('major', 6, 8, 8), ('minor', 4, 0, 0), ('pre_engineering', 14, 4, 6) $$,
  'majors plan 8 semesters, pre-engineering 4 or 6 at Franciscan, minors only list requirements'
);

select is(
  (select count(*)::integer from public.planner_degrees where catalog_year = '2025-2026' and auto_generated),
  0,
  'every suggested plan is the catalog''s own'
);

select * from finish();
rollback;
