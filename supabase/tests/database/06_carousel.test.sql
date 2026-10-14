-- The carousel's storage and API (FR-5.4 to FR-5.8). The pick itself is tested by the
-- Algorithms team with their function.
begin;
\ir _helpers.psql
select pg_temp.create_test_projects();
select plan(15);

select is(
  public.carousel_day(),
  (now() at time zone 'America/New_York')::date,
  'carousel days run on Eastern time'
);

-- Candidates

select ok(
  exists (select 1 from public.carousel_candidates('2099-02-01') where project_id = 'b0000000-0000-4000-8000-000000000001')
    and not exists (select 1 from public.carousel_candidates('2099-02-01') where project_id = 'b0000000-0000-4000-8000-000000000002'),
  'with no pool for the month, candidates are the most recently updated published projects'
);

insert into public.monthly_pool (month, project_id) values
  ('2099-01', 'b0000000-0000-4000-8000-000000000001'),
  ('2099-01', 'b0000000-0000-4000-8000-000000000002');

select results_eq(
  $$ select project_id from public.carousel_candidates('2099-01-15') $$,
  $$ values ('b0000000-0000-4000-8000-000000000001'::uuid) $$,
  'with a pool, candidates are its published projects'
);

-- Saving picks

select public.save_carousel('2099-01-15', array['b0000000-0000-4000-8000-000000000001']::uuid[]);

select results_eq(
  $$ select position, project_id from public.daily_carousel where day = '2099-01-15' $$,
  $$ values (1::smallint, 'b0000000-0000-4000-8000-000000000001'::uuid) $$,
  'a pick is stored in display order'
);

select throws_ok(
  $$ select public.save_carousel('2099-01-15', array_fill('b0000000-0000-4000-8000-000000000001'::uuid, array[8])) $$,
  '22023', 'The carousel holds at most 7 projects',
  'a pick holds at most 7 projects'
);

select public.save_carousel('2099-01-15', array['b0000000-0000-4000-8000-000000000001']::uuid[], 'a0000000-0000-4000-8000-000000000001');
select public.save_carousel('2099-01-15', array['b0000000-0000-4000-8000-000000000001']::uuid[], 'a0000000-0000-4000-8000-000000000001');

select is(
  (select reshuffles from public.carousel_state where day = '2099-01-15'),
  2,
  'each re-shuffle bumps the day''s count, which changes the random seed'
);

select isnt_empty(
  $$ select 1 from public.audit_log where action = 'carousel_reshuffled' and actor_id = 'a0000000-0000-4000-8000-000000000001' $$,
  're-shuffles are recorded in the audit log'
);

-- What visitors get

delete from public.daily_carousel where day = public.carousel_day();
select public.save_carousel(public.carousel_day(), array[
  'b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001']::uuid[]);

select pg_temp.login_anon();

select results_eq(
  $$ select id from public.carousel_today $$,
  $$ values ('b0000000-0000-4000-8000-000000000001'::uuid) $$,
  'visitors only get published projects'
);

select is(
  (select array(select m ->> 'name' from public.carousel_today c, jsonb_array_elements(c.members) m order by 1)),
  array['Outside mentor', 'test.student'],
  'cards list confirmed listed students and external names only'
);

select is(
  (select array(select a ->> 'name' from public.carousel_today c, jsonb_array_elements(c.advisors) a)),
  array['Test Faculty'],
  'cards list advisors'
);

reset role;
delete from public.daily_carousel where day = public.carousel_day();
select public.save_carousel(public.carousel_day() - 1, array['b0000000-0000-4000-8000-000000000001']::uuid[]);
select pg_temp.login_anon();

select results_eq(
  $$ select id from public.carousel_today $$,
  $$ values ('b0000000-0000-4000-8000-000000000001'::uuid) $$,
  'if today has not been picked yet, the home page shows the most recent pick'
);

select isnt_empty(
  $$ select 1 from public.daily_carousel $$,
  'the daily carousel is public'
);

-- Managing the monthly pool

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');

select throws_ok(
  $$ insert into public.monthly_pool (month, project_id) values ('2099-03', 'b0000000-0000-4000-8000-000000000001') $$,
  '42501', null,
  'students cannot change the monthly pool'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.monthly_pool (month, project_id) values ('2099-03', 'b0000000-0000-4000-8000-000000000001') $$,
  'admins pick the monthly pool'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');

select isnt_empty(
  $$ select 1 from public.monthly_pool where month = '2099-03' $$,
  'reviewers see the monthly pool'
);

select * from finish();
rollback;
