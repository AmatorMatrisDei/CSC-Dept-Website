-- Admin edits are logged with what changed, and there is always at least one admin.
begin;
\ir _helpers.psql
select pg_temp.create_test_projects();
select plan(7);

select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');
update public.projects set title = 'Retitled by an admin' where id = 'b0000000-0000-4000-8000-000000000001';
insert into public.site_content (key, value) values ('about.title', 'About C&E');
update public.planner_courses set title = 'Data Structures (edited)' where id = 'CSC145';
reset role;

select results_eq(
  $$ select details -> 'changes' -> 'title' from public.audit_log
     where action = 'admin_edited' and target_type = 'projects' and actor_id = 'a0000000-0000-4000-8000-000000000001' $$,
  $$ values ('{"from": "Published project", "to": "Retitled by an admin"}'::jsonb) $$,
  'an admin''s direct edit is logged with the old and new value'
);

select isnt_empty(
  $$ select 1 from public.audit_log where action = 'admin_created' and target_type = 'site_content' and details ->> 'key' = 'about.title' $$,
  'page text an admin adds is logged by its key'
);

select isnt_empty(
  $$ select 1 from public.audit_log where action = 'admin_edited' and target_type = 'planner_courses' and details ->> 'key' = 'CSC145' $$,
  'planner catalog edits are logged'
);

select is_empty(
  $$ select 1 from public.audit_log where action like 'admin_%' and actor_id <> 'a0000000-0000-4000-8000-000000000001' $$,
  'only the admin''s own edits are logged as admin edits'
);

-- Changes applied through review are logged by the review queue, not twice.
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');
insert into public.pending_changes (target_type, action, proposed_data) values ('profile', 'update', '{"headline": "Reviewed"}');
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');
select public.review_change(id, 'approved') from public.pending_changes where submitter_id = 'a0000000-0000-4000-8000-000000000003';
reset role;

select is_empty(
  $$ select 1 from public.audit_log where action like 'admin_%' and target_type = 'profiles' $$,
  'approved submissions are not logged again as admin edits'
);

-- At least one admin ----------------------------------------------------------------------------

-- Leave test.admin as the only admin (the local sample accounts include another).
update public.profiles set role = 'student' where role = 'admin' and id <> 'a0000000-0000-4000-8000-000000000001';
select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

select throws_ok(
  $$ update public.profiles set role = 'student' where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '23514', 'There must always be at least one admin. Make someone else an admin first.',
  'the last admin cannot step down'
);

update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-000000000002';

select lives_ok(
  $$ update public.profiles set role = 'student' where id = 'a0000000-0000-4000-8000-000000000001' $$,
  'once there is another admin, they can'
);

select * from finish();
rollback;
