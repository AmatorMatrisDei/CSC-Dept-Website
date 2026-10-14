begin;
\ir _helpers.psql
select pg_temp.create_test_projects();
select plan(14);

-- Sign-up hook

select is(
  public.hook_before_user_created('{"user": {"email": "new.student@franciscan.edu"}}'),
  '{}'::jsonb,
  'university addresses may sign up'
);

select is(
  public.hook_before_user_created('{"user": {"email": "New.Student@Student.Franciscan.EDU"}}'),
  '{}'::jsonb,
  'subdomains are allowed, in any letter case'
);

select is(
  public.hook_before_user_created('{"user": {"email": "someone@gmail.com"}}') -> 'error' ->> 'http_code',
  '403',
  'other addresses are rejected'
);

select is(
  public.hook_before_user_created('{"user": {"email": "someone@notfranciscan.edu"}}') -> 'error' ->> 'http_code',
  '403',
  'look-alike domains are rejected'
);

-- Sign-up trigger

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('c0000000-0000-4000-8000-000000000001', 'jordan@franciscan.edu', 'authenticated', 'authenticated',
   '{"full_name": "Jordan Example"}'),
  ('c0000000-0000-4000-8000-000000000002', 'casey@franciscan.edu', 'authenticated', 'authenticated',
   '{"name": "Casey Microsoft"}');

select results_eq(
  $$ select full_name from public.profiles
     where id in ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002')
     order by full_name $$,
  $$ values ('Casey Microsoft'), ('Jordan Example') $$,
  'profiles take the name from the sign-up form or the identity provider'
);

-- Storage folders. Uploads themselves are covered by the API tests.

select pg_temp.login_anon();

select ok(
  not private.can_manage_media('avatars/a0000000-0000-4000-8000-000000000003/me.jpg'),
  'visitors cannot upload'
);

-- test.student: created test-draft
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');

select ok(
  private.can_manage_media('avatars/a0000000-0000-4000-8000-000000000003/me.jpg'),
  'users manage their own avatars folder'
);

select ok(
  not private.can_manage_media('avatars/a0000000-0000-4000-8000-000000000004/me.jpg'),
  'users cannot touch someone else''s avatars'
);

select ok(
  private.can_manage_media('projects/b0000000-0000-4000-8000-000000000002/photo.jpg'),
  'project editors manage the project''s folder'
);

select ok(
  not private.can_manage_media('projects/not-a-uuid/photo.jpg'),
  'malformed project folders are refused without an error'
);

select ok(
  not private.can_manage_media('posts/b0000000-0000-4000-8000-000000000009/cover.jpg'),
  'students cannot upload news images'
);

select ok(
  not private.can_manage_media('elsewhere/photo.jpg'),
  'files outside the known folders are refused'
);

-- test.outsider
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000005');

select ok(
  not private.can_manage_media('projects/b0000000-0000-4000-8000-000000000002/photo.jpg'),
  'other students cannot upload to a project'
);

-- Faculty
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');

select ok(
  private.can_manage_media('posts/b0000000-0000-4000-8000-000000000009/cover.jpg'),
  'faculty upload news images'
);

select * from finish();
rollback;
