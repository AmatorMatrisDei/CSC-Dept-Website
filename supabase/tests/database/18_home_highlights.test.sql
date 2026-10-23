-- Home highlights: editors switch things on, everyone reads only what they could already see.
begin;
\ir _helpers.psql
select pg_temp.create_test_projects(); -- also creates the test admin, reviewer and students
select plan(22);

select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.highlights (kind, ref) values
       ('project', 'b0000000-0000-4000-8000-000000000001'),
       ('project', 'b0000000-0000-4000-8000-000000000002'),
       ('student', 'a0000000-0000-4000-8000-000000000003') $$,
  'an admin highlights projects and a listed student'
);
select throws_ok(
  $$ insert into public.highlights (kind, ref) values ('student', 'a0000000-0000-4000-8000-000000000004') $$,
  '23514', null, 'a student who is not listed cannot be highlighted, not even by an admin'
);
select lives_ok(
  $$ insert into public.alumni_stories (id, name, grad_year, job_title, employer, story, published)
     values ('d0000000-0000-4000-8000-000000000001', 'Alex Alumni', 2019, 'Engineer', 'Acme', 'Story', true),
            ('d0000000-0000-4000-8000-000000000002', 'Hidden Alum', 2018, '', '', 'Story', false) $$,
  'an admin adds alumni stories'
);
select lives_ok(
  $$ insert into public.highlights (kind, ref, blurb) values
       ('alumni', 'd0000000-0000-4000-8000-000000000001', 'Franciscan got me started.'),
       ('alumni', 'd0000000-0000-4000-8000-000000000002', 'Not published.') $$,
  'an admin highlights alumni stories with a one-line quote'
);
select throws_ok($$ insert into public.highlights (kind, ref) values ('post', gen_random_uuid()) $$,
  '23514', null, 'only known kinds can be highlighted');
select throws_ok(
  $$ insert into public.highlights (kind, ref, blurb) values ('alumni', gen_random_uuid(), repeat('x', 201)) $$,
  '23514', null, 'a blurb over 200 characters is refused');

reset role;
select isnt_empty(
  $$ select 1 from public.audit_log where action = 'admin_created' and target_type = 'highlights' $$,
  'switching a highlight on is logged'
);

-- Visitors only see what is already public ---------------------------------------------------------

select pg_temp.login_anon();
select is(
  (select array_agg(kind order by kind) from public.home_highlights),
  array['alumni', 'project', 'student']::text[],
  'a visitor sees the published project, the listed student and the published story'
);
select is((select blurb from public.home_highlights where kind = 'alumni'), 'Franciscan got me started.',
  'the quote comes along');
select is((select count(*) from public.highlights), 5::bigint, 'the pool itself is readable by anyone');

-- Highlighted projects feed the carousel -----------------------------------------------------------

reset role;
select is(
  (select array_agg(project_id) from public.carousel_candidates(current_date) where project_id = 'b0000000-0000-4000-8000-000000000001'),
  array['b0000000-0000-4000-8000-000000000001']::uuid[],
  'a highlighted published project is in the carousel pool'
);

-- Deleting removes the highlight --------------------------------------------------------------------

delete from public.alumni_stories where id = 'd0000000-0000-4000-8000-000000000002';
select is((select count(*) from public.highlights where kind = 'alumni'), 1::bigint,
  'deleting a story removes its highlight');

-- Nobody else writes -------------------------------------------------------------------------------

select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');
select throws_ok($$ insert into public.highlights (kind, ref) values ('student', 'a0000000-0000-4000-8000-000000000005') $$,
  '42501', null, 'a student cannot highlight anyone');
delete from public.highlights;
reset role;
select is((select count(*) from public.highlights), 4::bigint, 'a student cannot remove highlights');

select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');
select throws_ok($$ insert into public.highlights (kind, ref) values ('student', 'a0000000-0000-4000-8000-000000000005') $$,
  '42501', null, 'a reviewer cannot highlight either');

select pg_temp.login_anon();
select throws_ok($$ insert into public.highlights (kind, ref) values ('student', 'a0000000-0000-4000-8000-000000000005') $$,
  '42501', null, 'a signed-out visitor cannot highlight');

-- A hidden student leaves the pool ------------------------------------------------------------------

reset role;
select lives_ok($$ update public.profiles set visible = false where id = 'a0000000-0000-4000-8000-000000000003' $$,
  'a student is hidden');
select is((select count(*) from public.highlights where kind = 'student'), 0::bigint,
  'hiding a student removes their highlight');
update public.profiles set visible = true where id = 'a0000000-0000-4000-8000-000000000003';
select is((select count(*) from public.highlights where kind = 'student'), 0::bigint,
  'listing them again does not bring the highlight back');
select lives_ok($$ insert into public.highlights (kind, ref) values ('student', 'a0000000-0000-4000-8000-000000000003') $$,
  'an editor can choose them afresh once they are listed');

-- Event importance -----------------------------------------------------------------------------------

reset role;
select throws_ok($$ insert into public.events (title, event_date, importance) values ('Odd', '2026-12-04', 'huge') $$,
  '23514', null, 'importance is major, regular or minor');
with e as (insert into public.events (title, event_date) values ('Plain', '2026-12-04') returning importance)
select is((select importance from e), 'regular', 'importance defaults to regular');

select * from finish();
rollback;
