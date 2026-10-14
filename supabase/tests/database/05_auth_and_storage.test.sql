-- Sign-up rules and upload folders (NFR-4, guide 6.3).
begin;
\ir _helpers.psql
select pg_temp.create_test_projects();
select plan(15);

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
  ('d0000000-0000-4000-8000-000000000001', 'jordan@franciscan.edu', 'authenticated', 'authenticated',
   '{"full_name": "Jordan Example"}'),
  ('d0000000-0000-4000-8000-000000000002', 'casey@franciscan.edu', 'authenticated', 'authenticated',
   '{"name": "Casey Microsoft"}');

select results_eq(
  $$ select name from public.profiles
     where id in ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002')
     order by name $$,
  $$ values ('Casey Microsoft'), ('Jordan Example') $$,
  'profiles take the name from the sign-up form or the identity provider'
);

-- Upload folders. Uploads themselves are covered by the API tests.

select pg_temp.login_anon();

select ok(
  not private.can_manage_media('submissions/a0000000-0000-4000-8000-000000000003/photo.jpg'),
  'visitors cannot upload'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');

select ok(
  private.can_manage_media('avatars/a0000000-0000-4000-8000-000000000003/me.jpg'),
  'students upload to their own avatars folder'
);

select ok(
  private.can_manage_media('submissions/a0000000-0000-4000-8000-000000000003/photo.jpg'),
  'students upload to their own submissions folder'
);

select ok(
  not private.can_manage_media('avatars/a0000000-0000-4000-8000-000000000004/me.jpg')
    and not private.can_manage_media('submissions/a0000000-0000-4000-8000-000000000004/photo.jpg'),
  'students cannot touch someone else''s folders'
);

select ok(
  not private.can_manage_media('projects/b0000000-0000-4000-8000-000000000001/photo.jpg'),
  'students cannot write to project folders, even on their own project; they submit photos for review'
);

select ok(
  not private.can_manage_media('submissions/not-a-user/photo.jpg') and not private.can_manage_media('photo.jpg'),
  'malformed paths are refused without an error'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');

select ok(
  not private.can_manage_media('projects/b0000000-0000-4000-8000-000000000001/photo.jpg'),
  'reviewers do not write project photos directly either'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

select ok(
  private.can_manage_media('projects/b0000000-0000-4000-8000-000000000001/photo.jpg'),
  'admins write project photos'
);

select ok(
  private.can_manage_media('posts/e0000000-0000-4000-8000-000000000001/cover.jpg')
    and private.can_manage_media('faculty/c0000000-0000-4000-8000-000000000001/portrait.jpg')
    and private.can_manage_media('alumni/e0000000-0000-4000-8000-000000000002/portrait.jpg'),
  'admins write news, faculty and alumni photos'
);

select ok(
  not private.can_manage_media('elsewhere/photo.jpg'),
  'files outside the known folders are refused, even for admins'
);

select * from finish();
rollback;
