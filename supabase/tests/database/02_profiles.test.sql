begin;
\ir _helpers.psql
select plan(10);

select results_eq(
  $$ select role::text, full_name, is_public from public.profiles
     where id = 'a0000000-0000-4000-8000-000000000004' $$,
  $$ values ('student', 'test.private', false) $$,
  'a new account gets a private student profile named from sign-up'
);

-- Signed-out visitors
select pg_temp.login_anon();

select results_eq(
  $$ select id from public.profiles
     where id in ('a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004') $$,
  $$ values ('a0000000-0000-4000-8000-000000000003'::uuid) $$,
  'visitors see public profiles and not private ones'
);

-- A student with a private profile
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000004');

select isnt_empty(
  $$ select 1 from public.profiles where id = 'a0000000-0000-4000-8000-000000000004' $$,
  'students see their own private profile'
);

select is_empty(
  $$ select 1 from public.profiles where id = 'a0000000-0000-4000-8000-000000000005' $$,
  'students do not see other private profiles'
);

select results_eq(
  $$ update public.profiles set bio = 'Hello' where id = 'a0000000-0000-4000-8000-000000000004' returning bio $$,
  $$ values ('Hello') $$,
  'students edit their own profile'
);

select is_empty(
  $$ update public.profiles set bio = 'Hacked' where id = 'a0000000-0000-4000-8000-000000000003' returning id $$,
  'students cannot edit someone else''s profile'
);

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-000000000004' $$,
  '42501', 'Only admins can change roles',
  'students cannot change their own role'
);

select throws_ok(
  $$ update public.profiles set avatar_path = 'avatars/a0000000-0000-4000-8000-000000000003/me.jpg'
     where id = 'a0000000-0000-4000-8000-000000000004' $$,
  '23514', null,
  'a profile photo must be in the user''s own avatars folder'
);

-- Faculty
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');

select isnt_empty(
  $$ select 1 from public.profiles where id = 'a0000000-0000-4000-8000-000000000004' $$,
  'faculty see private profiles, e.g. to add students to projects'
);

-- Admin
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

select results_eq(
  $$ update public.profiles set role = 'faculty' where id = 'a0000000-0000-4000-8000-000000000004' returning role::text $$,
  $$ values ('faculty') $$,
  'admins change other users'' roles'
);

select * from finish();
rollback;
