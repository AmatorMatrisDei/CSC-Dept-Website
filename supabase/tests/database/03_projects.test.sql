begin;
\ir _helpers.psql
select pg_temp.create_test_projects();
select plan(15);

-- Signed-out visitors
select pg_temp.login_anon();

select results_eq(
  $$ select slug from public.projects where slug like 'test-%' $$,
  $$ values ('test-published') $$,
  'visitors see published projects only'
);

-- test.student: created test-draft
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');

select results_eq(
  $$ insert into public.projects (slug, title) values ('test-new', 'New project')
     returning publish_state::text, created_by $$,
  $$ values ('draft', 'a0000000-0000-4000-8000-000000000003'::uuid) $$,
  'students create projects, which start as their own drafts'
);

select throws_ok(
  $$ insert into public.projects (slug, title, publish_state) values ('test-sneaky', 'Sneaky', 'published') $$,
  '42501', 'Only faculty can publish or feature a project',
  'students cannot create a published project'
);

select throws_ok(
  $$ insert into public.projects (slug, title, created_by)
     values ('test-spoofed', 'Spoofed', 'a0000000-0000-4000-8000-000000000002') $$,
  '42501', null,
  'students cannot create a project in someone else''s name'
);

select results_eq(
  $$ update public.projects set publish_state = 'in_review' where slug = 'test-draft' returning publish_state::text $$,
  $$ values ('in_review') $$,
  'students submit their project for review'
);

select throws_ok(
  $$ update public.projects set publish_state = 'published' where slug = 'test-draft' $$,
  '42501', 'Only faculty can publish, unpublish or feature a project',
  'students cannot publish their own project'
);

select throws_ok(
  $$ update public.projects set is_featured = true where slug = 'test-published' $$,
  '42501', 'Only faculty can publish, unpublish or feature a project',
  'students cannot feature a project in the donor showcase'
);

select results_eq(
  $$ update public.projects set summary = 'Updated by the team' where slug = 'test-published' returning summary $$,
  $$ values ('Updated by the team') $$,
  'a member with edit rights updates a published project'
);

select is_empty(
  $$ delete from public.projects where slug = 'test-published' returning id $$,
  'students cannot delete a published project'
);

select isnt_empty(
  $$ delete from public.projects where slug = 'test-new' returning id $$,
  'students delete their own drafts'
);

-- test.private: member of test-draft without edit rights
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000004');

select isnt_empty(
  $$ select 1 from public.projects where slug = 'test-draft' $$,
  'team members see their unpublished project'
);

select is_empty(
  $$ update public.projects set title = 'Changed' where slug = 'test-draft' returning id $$,
  'team members without edit rights cannot change it'
);

-- test.outsider
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000005');

select is_empty(
  $$ select 1 from public.projects where slug = 'test-draft' $$,
  'other students do not see unpublished projects'
);

-- Faculty
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');

select results_eq(
  $$ update public.projects set publish_state = 'published' where slug = 'test-draft'
     returning publish_state::text, published_at is not null $$,
  $$ values ('published', true) $$,
  'faculty publish a project, which records when'
);

reset role;
select pg_temp.login_anon();

select isnt_empty(
  $$ select 1 from public.projects where slug = 'test-draft' $$,
  'visitors see it once published'
);

select * from finish();
rollback;
