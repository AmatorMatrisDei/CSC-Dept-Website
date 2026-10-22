-- Events: everyone reads them, only admins write, and what is written is checked and logged.
begin;
\ir _helpers.psql
select pg_temp.create_test_projects(); -- also creates the test admin, reviewer and students
select plan(19);

-- Admins write ----------------------------------------------------------------------------------

select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.events (title, event_date, start_time, end_time, place, link_url, sub_department_id)
     values (E'  Senior\x01 showcase ', '2026-12-04', '18:00', '19:30', 'Science Hall', 'https://example.org/showcase',
             pg_temp.sub_department('computer-science')) $$,
  'an admin adds an event'
);
select is((select title from public.events), 'Senior showcase', 'the title is tidied');

select lives_ok(
  $$ insert into public.events (title, event_date, end_date) values ('Hackathon', '2026-11-14', '2026-11-15') $$,
  'an event can last several days and have no time'
);
select lives_ok($$ update public.events set place = 'Gallery' where title = 'Hackathon' $$, 'an admin edits an event');

-- Checks ----------------------------------------------------------------------------------------

select throws_ok($$ insert into public.events (title, event_date) values ('   ', '2026-12-04') $$,
  '23514', null, 'an event needs a title');
select throws_ok($$ insert into public.events (title, event_date, end_date) values ('Backwards', '2026-12-04', '2026-12-01') $$,
  '23514', null, 'an event cannot end before it starts');
select throws_ok($$ insert into public.events (title, event_date, end_time) values ('Ends only', '2026-12-04', '17:00') $$,
  '23514', null, 'an end time needs a start time');
select throws_ok($$ insert into public.events (title, event_date, link_url) values ('Bad link', '2026-12-04', 'javascript:alert(1)') $$,
  '23514', null, 'a link must be a web address');
select throws_ok($$ insert into public.events (title, event_date, link_url) values ('Spaced link', '2026-12-04', 'https://example.org/a b') $$,
  '23514', null, 'a link cannot contain spaces');
select throws_ok($$ insert into public.events (title, event_date) values (repeat('x', 201), '2026-12-04') $$,
  '23514', null, 'a title over 200 characters is refused');

-- The log -----------------------------------------------------------------------------------------

reset role;
select isnt_empty(
  $$ select 1 from public.audit_log where action = 'admin_created' and target_type = 'events'
       and details -> 'changes' -> 'title' ->> 'to' = 'Senior showcase' $$,
  'adding an event is logged'
);
select isnt_empty(
  $$ select 1 from public.audit_log where action = 'admin_edited' and target_type = 'events'
       and details -> 'changes' -> 'place' ->> 'to' = 'Gallery' $$,
  'editing an event is logged with what changed'
);

-- Everyone reads --------------------------------------------------------------------------------------

select pg_temp.login_anon();
select is((select count(*) from public.events), 2::bigint, 'a signed-out visitor reads every event');

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');
select is((select count(*) from public.events), 2::bigint, 'a student reads every event');

-- Nobody else writes -------------------------------------------------------------------------------------

select throws_ok($$ insert into public.events (title, event_date) values ('By a student', '2026-12-04') $$,
  '42501', null, 'a student cannot add an event');
update public.events set title = 'Hijacked';
delete from public.events where title = 'Hackathon';
reset role;
select is((select count(*) from public.events where title = 'Hijacked'), 0::bigint, 'a student cannot change an event');
select is((select count(*) from public.events), 2::bigint, 'a student cannot delete an event');

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');
select throws_ok($$ insert into public.events (title, event_date) values ('By a reviewer', '2026-12-04') $$,
  '42501', null, 'a reviewer cannot add an event either');

select pg_temp.login_anon();
select throws_ok($$ insert into public.events (title, event_date) values ('By a visitor', '2026-12-04') $$,
  '42501', null, 'a signed-out visitor cannot add an event');

select * from finish();
rollback;
