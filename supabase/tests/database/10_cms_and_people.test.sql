-- The admin editing tools: editable page text (site_content) and the People page (list_people,
-- role changes).
begin;
\ir _helpers.psql
select plan(8);

insert into public.site_content (key, value) values ('about.title', 'About the department');

-- Page text -------------------------------------------------------------------------------------

select pg_temp.login_anon();

select results_eq(
  $$ select value from public.site_content where key = 'about.title' $$,
  $$ values ('About the department') $$,
  'visitors read the page text'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');

select throws_ok(
  $$ insert into public.site_content (key, value) values ('home.title', 'Taken over') $$,
  '42501', null,
  'students cannot add page text'
);

update public.site_content set value = 'Taken over' where key = 'about.title';

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.site_content (key, value) values ('about.title', 'About C&E')
     on conflict (key) do update set value = excluded.value $$,
  'admins change page text'
);

reset role;

select is(
  (select value from public.site_content where key = 'about.title'),
  'About C&E',
  'only the admin''s change took effect'
);

-- People and roles ------------------------------------------------------------------------------

select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

select ok(
  (select count(*) from public.list_people() where email = 'test.private@franciscan.edu') = 1,
  'admins see everyone with their sign-up email, listed or not'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');

select is_empty(
  $$ select * from public.list_people() $$,
  'reviewers get nobody from list_people'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');
update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-000000000003';
reset role;

select is(
  (select role::text from public.profiles where id = 'a0000000-0000-4000-8000-000000000003'),
  'student',
  'students cannot make themselves admins'
);

select ok(
  not has_function_privilege('anon', 'public.list_people()', 'EXECUTE'),
  'visitors cannot call list_people'
);

select * from finish();
rollback;
