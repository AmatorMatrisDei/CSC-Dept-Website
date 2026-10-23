-- The database asks the notify-reviewers function to post to the team's chat when a submission
-- arrives or comes back after changes, and at no other time (#54).
begin;
\ir _helpers.psql
select plan(12);

-- The requests this test queues, oldest first.
create temp table seen as select coalesce(max(id), 0) as last_id from net.http_request_queue;
create temp view sent as
  select url, headers, convert_from(body, 'utf8')::jsonb as body
  from net.http_request_queue where id > (select last_id from seen) order by id;

-- Without the Vault secrets: test.outsider submits, and nothing is sent.
select pg_temp.login_as('a0000000-0000-4000-8000-000000000005');
insert into public.pending_changes (target_type, action, proposed_data)
values ('internship', 'create', '{"company": "Globex", "term": "Summer 2026"}');
reset role;
select is((select count(*)::int from sent), 0, 'nothing is sent until the Vault secrets exist');

-- With them: test.student submits an internship ----------------------------------------------------
select vault.create_secret('http://functions.test/notify-reviewers', 'notify_function_url');
select vault.create_secret('test-notify-secret', 'notify_secret');

select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');
insert into public.pending_changes (target_type, action, proposed_data)
values ('internship', 'create', '{"company": "Acme", "term": "Summer 2026"}');
reset role;

select is((select count(*)::int from sent), 1, 'a new submission sends one request');
select ok(
  (select url = 'http://functions.test/notify-reviewers' and headers ->> 'Authorization' = 'Bearer test-notify-secret' from sent),
  'it goes to the function, with the secret'
);
select is(
  (select body - 'id' from sent),
  '{"target_type": "internship", "action": "create", "title": "Acme", "resubmitted": false}'::jsonb,
  'it says what kind of submission it is, and its title'
);
select is(
  (select (body ->> 'id')::uuid from sent),
  (select id from public.pending_changes where submitter_id = 'a0000000-0000-4000-8000-000000000003'),
  'it names the submission, for the link to its review page'
);
select is(
  (select array(select jsonb_object_keys(body) order by 1) from sent),
  array['action', 'id', 'resubmitted', 'target_type', 'title'],
  'it carries nothing about who sent it'
);

-- A reviewer sends it back: nothing. The student resubmits: one more, marked as resubmitted.
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');
select public.review_change(
  (select id from public.pending_changes where submitter_id = 'a0000000-0000-4000-8000-000000000003'), 'changes_requested', 'Use the full company name');
reset role;
select is((select count(*)::int from sent), 1, 'sending a submission back sends nothing');

select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');
update public.pending_changes set proposed_data = '{"company": "Acme Corporation", "term": "Summer 2026"}', status = 'pending'
where submitter_id = 'a0000000-0000-4000-8000-000000000003';
reset role;
select results_eq(
  $$ select body ->> 'title', (body ->> 'resubmitted')::boolean from sent $$,
  $$ values ('Acme', false), ('Acme Corporation', true) $$,
  'a resubmission sends one more, marked as resubmitted, with the new title'
);

-- Approving sends nothing.
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');
select public.review_change((select id from public.pending_changes where submitter_id = 'a0000000-0000-4000-8000-000000000003'), 'approved');
reset role;
select is((select count(*)::int from sent), 2, 'approving sends nothing');

-- test.outsider sends a profile change, then withdraws everything.
select pg_temp.login_as('a0000000-0000-4000-8000-000000000005');
insert into public.pending_changes (target_type, action, proposed_data)
values ('profile', 'update', '{"headline": "Robotics, Class of 2027"}');
update public.pending_changes set status = 'withdrawn' where submitter_id = 'a0000000-0000-4000-8000-000000000005';
reset role;
select is((select count(*)::int from sent), 3, 'withdrawing sends nothing');
select is(
  (select body - 'id' from sent where body ->> 'target_type' = 'profile'),
  '{"target_type": "profile", "action": "update", "title": null, "resubmitted": false}'::jsonb,
  'a profile change is sent without a title'
);

select ok(
  not has_function_privilege('authenticated', 'private.notify_reviewers()', 'EXECUTE')
    and not has_function_privilege('anon', 'private.notify_reviewers()', 'EXECUTE'),
  'users cannot call the notification function'
);

select * from finish();
rollback;
