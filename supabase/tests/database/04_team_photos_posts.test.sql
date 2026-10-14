begin;
\ir _helpers.psql
select pg_temp.create_test_projects();
select plan(11);

-- Signed-out visitors
select pg_temp.login_anon();

select isnt_empty(
  $$ select 1 from public.project_members where project_id = 'b0000000-0000-4000-8000-000000000001' $$,
  'visitors see the team of a published project'
);

select is_empty(
  $$ select 1 from public.project_members where project_id = 'b0000000-0000-4000-8000-000000000002' $$,
  'visitors do not see the team of a draft'
);

-- test.student: created test-draft
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');

select results_eq(
  $$ insert into public.project_members (project_id, profile_id, role_title, term)
     values ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000005', 'Designer', 'Fall 2026')
     returning role_title $$,
  $$ values ('Designer') $$,
  'project editors add team members with their role'
);

select lives_ok(
  $$ insert into public.project_images (project_id, storage_path, alt_text)
     values ('b0000000-0000-4000-8000-000000000002',
             'projects/b0000000-0000-4000-8000-000000000002/team.jpg', 'The team at work') $$,
  'project editors add photos'
);

select throws_ok(
  $$ insert into public.project_images (project_id, storage_path, alt_text)
     values ('b0000000-0000-4000-8000-000000000002',
             'projects/b0000000-0000-4000-8000-000000000002/blank.jpg', '  ') $$,
  '23514', null,
  'every photo needs alt text'
);

select throws_ok(
  $$ insert into public.project_images (project_id, storage_path, alt_text)
     values ('b0000000-0000-4000-8000-000000000002',
             'projects/b0000000-0000-4000-8000-000000000001/other.jpg', 'Wrong folder') $$,
  '23514', null,
  'a photo must be in its own project''s folder'
);

select throws_ok(
  $$ insert into public.posts (slug, title) values ('test-student-post', 'Student post') $$,
  '42501', null,
  'students cannot write news posts'
);

-- test.private: member of test-draft without edit rights
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000004');

select throws_ok(
  $$ insert into public.project_members (project_id, profile_id, role_title)
     values ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000004', 'Lead') $$,
  '42501', null,
  'team members without edit rights cannot change the team'
);

-- Faculty
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');

select results_eq(
  $$ insert into public.posts (slug, title, publish_state) values ('test-news', 'News', 'published')
     returning author_id, published_at is not null $$,
  $$ values ('a0000000-0000-4000-8000-000000000002'::uuid, true) $$,
  'faculty publish news posts'
);

select lives_ok(
  $$ insert into public.posts (slug, title) values ('test-news-draft', 'Draft news') $$,
  'faculty save draft posts'
);

reset role;
select pg_temp.login_anon();

select results_eq(
  $$ select slug from public.posts where slug like 'test-%' $$,
  $$ values ('test-news') $$,
  'visitors see published posts only'
);

select * from finish();
rollback;
