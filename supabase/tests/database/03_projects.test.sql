-- Projects and what links to them: who can see and change them (FR-1.2, FR-1.3, FR-2.6, FR-3.7, FR-6.1, FR-6.2).
begin;
\ir _helpers.psql
select pg_temp.create_test_projects();
select plan(16);

-- Signed-out visitors
select pg_temp.login_anon();

select results_eq(
  $$ select slug from public.projects where slug like 'test-%' $$,
  $$ values ('test-published') $$,
  'visitors see published projects only'
);

select set_eq(
  $$ select coalesce(student_id::text, external_name) from public.contributions
     where project_id = 'b0000000-0000-4000-8000-000000000001' $$,
  $$ values ('Outside mentor'), ('a0000000-0000-4000-8000-000000000003') $$,
  'visitors see confirmed listed students and external names, not unlisted or unconfirmed students'
);

select isnt_empty(
  $$ select 1 from public.advising where project_id = 'b0000000-0000-4000-8000-000000000001' $$,
  'visitors see a published project''s advisors'
);

select is_empty(
  $$ select 1 from public.contributions where project_id = 'b0000000-0000-4000-8000-000000000002' $$,
  'visitors see nothing of an unpublished project''s team'
);

-- test.student: on both projects
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');

select isnt_empty(
  $$ select 1 from public.projects where slug = 'test-draft' $$,
  'team members see their unpublished project'
);

select throws_ok(
  $$ insert into public.projects (slug, title, category_id, sub_department_id)
     values ('test-direct', 'Direct', pg_temp.category('class'), pg_temp.sub_department('computer-science')) $$,
  '42501', null,
  'students cannot create projects directly; they submit them for review'
);

select is_empty(
  $$ update public.projects set title = 'Edited directly' where slug = 'test-published' returning id $$,
  'students cannot edit a live project directly'
);

select is_empty(
  $$ update public.contributions set confirmed = true where student_id = 'a0000000-0000-4000-8000-000000000005' returning id $$,
  'students cannot confirm someone else''s listing'
);

-- test.outsider: listed on test-published but has not confirmed
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000005');

select is_empty(
  $$ select 1 from public.projects where slug = 'test-draft' $$,
  'other students do not see unpublished projects'
);

select isnt_empty(
  $$ select 1 from public.contributions where student_id = 'a0000000-0000-4000-8000-000000000005' and not confirmed $$,
  'students see listings waiting for their confirmation'
);

select lives_ok(
  $$ select public.respond_to_listing(
       (select id from public.contributions where student_id = 'a0000000-0000-4000-8000-000000000005'), true) $$,
  'students confirm being listed'
);

select throws_ok(
  $$ select public.respond_to_listing(
       (select id from public.contributions where project_id = 'b0000000-0000-4000-8000-000000000002'), false) $$,
  '42501', 'This listing is not yours',
  'students cannot answer for someone else''s listing'
);

reset role;
select pg_temp.login_anon();

select isnt_empty(
  $$ select 1 from public.contributions where student_id = 'a0000000-0000-4000-8000-000000000005' $$,
  'once confirmed, the listing is public'
);

-- Admins
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

select results_eq(
  $$ update public.projects set priority = 8, is_pinned = true where slug = 'test-draft' returning priority, is_pinned $$,
  $$ values (8::smallint, true) $$,
  'admins set priority and pin projects'
);

select throws_ok(
  $$ update public.projects set priority = 11 where slug = 'test-draft' $$,
  '23514', null,
  'priority is limited to 1 to 10'
);

select results_eq(
  $$ update public.projects set published = true where slug = 'test-draft' returning published_at is not null $$,
  $$ values (true) $$,
  'publishing records when it happened'
);

select * from finish();
rollback;
