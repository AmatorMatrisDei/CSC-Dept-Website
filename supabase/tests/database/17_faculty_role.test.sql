-- The faculty role: reviewer powers plus editing nearly all content, but never roles or the
-- settings that shape the site, and nothing for an unverified account.
begin;
\ir _helpers.psql
select plan(19);

select pg_temp.create_test_projects();
select pg_temp.create_user('a0000000-0000-4000-8000-000000000006', 'test.faculty@franciscan.edu', 'faculty');

insert into public.site_content (key, value) values ('about.title', 'About C&E');

-- Editing content ---------------------------------------------------------------------------------

select pg_temp.login_as('a0000000-0000-4000-8000-000000000006');

select ok(private.can_edit_site() and private.can_edit_content(), 'faculty can use Edit mode');
select ok(private.is_reviewer() and not private.is_admin(), 'faculty have reviewer powers and are not admins');

select lives_ok(
  $$ select public.save_site_draft('about.title', 'About the department', (select updated_at from public.site_content where key = 'about.title')) $$,
  'faculty save page text drafts'
);
select lives_ok($$ select public.publish_site_drafts() $$, 'faculty publish page text');
select is((select value from public.site_content where key = 'about.title'), 'About the department',
  'a faculty member''s published text goes live');

update public.projects set title = 'Renamed by faculty' where id = 'b0000000-0000-4000-8000-000000000001';
select is((select title from public.projects where id = 'b0000000-0000-4000-8000-000000000001'), 'Renamed by faculty',
  'faculty edit projects directly');

update public.profiles set headline = 'Edited by faculty' where id = 'a0000000-0000-4000-8000-000000000004';
select is((select headline from public.profiles where id = 'a0000000-0000-4000-8000-000000000004'), 'Edited by faculty',
  'faculty edit student profiles');

select lives_ok($$ insert into public.categories (name, slug) values ('Faculty topic', 'faculty-topic') $$,
  'faculty add content such as categories');

select lives_ok($$ insert into public.events (title, event_date) values ('Faculty talk', '2026-12-04') $$,
  'faculty add events');

select ok(private.can_manage_media('projects/b0000000-0000-4000-8000-000000000001/cover.jpg'),
  'faculty can manage project photos');

select ok(
  exists (select 1 from public.audit_log
          where action = 'admin_edited' and target_type = 'projects' and actor_id = 'a0000000-0000-4000-8000-000000000006'),
  'a faculty member''s edit is written to the audit log under their name'
);

-- What stays with admins -------------------------------------------------------------------------

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-000000000006' $$,
  '42501', null, 'faculty cannot make themselves admins'
);
select throws_ok(
  $$ update public.profiles set role = 'faculty' where id = 'a0000000-0000-4000-8000-000000000004' $$,
  '42501', null, 'faculty cannot change anyone''s role'
);
select is_empty($$ select 1 from public.list_people() $$, 'faculty cannot list people and roles');
select throws_ok(
  $$ insert into public.planner_catalogs (year, name) values (2099, 'Faculty year') $$,
  '42501', null, 'faculty cannot change the planner''s catalog years'
);
select throws_ok(
  $$ insert into public.advising (faculty_id, project_id) values ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'faculty cannot change advising'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');
update public.profiles set role = 'faculty' where id = 'a0000000-0000-4000-8000-000000000003';
reset role;
select is((select role from public.profiles where id = 'a0000000-0000-4000-8000-000000000003'), 'student'::public.app_role,
  'a student cannot give themselves the faculty role');

-- Verification ------------------------------------------------------------------------------------

reset role;
select throws_ok(
  $$ select pg_temp.create_user('a0000000-0000-4000-8000-000000000007', 'unverified.faculty@franciscan.edu', 'faculty', false, false) $$,
  '23514', null, 'an unverified account cannot be made faculty'
);

delete from private.account_verifications where user_id = 'a0000000-0000-4000-8000-000000000006';
select pg_temp.login_as('a0000000-0000-4000-8000-000000000006');
select ok(not private.can_edit_content() and not private.is_reviewer(),
  'a faculty member who is not verified has no powers');

select * from finish();
rollback;
