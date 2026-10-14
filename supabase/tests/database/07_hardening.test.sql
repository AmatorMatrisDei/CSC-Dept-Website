-- Security hardening: internal functions, frozen submissions, link and size rules, limits,
-- and audited role changes.
begin;
\ir _helpers.psql
select pg_temp.create_test_projects();
select plan(12);

-- Internal functions -----------------------------------------------------------------------------
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');

select throws_ok(
  $$ select private.write_fields('public.profiles', array['role'], '{"role": "admin"}',
       'a0000000-0000-4000-8000-000000000003') $$,
  '42501', null,
  'a student cannot call the internal writer to make themselves admin'
);

reset role;

select ok(
  not has_function_privilege('authenticated', 'private.insert_fields(regclass, text[], jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.apply_change(public.pending_changes)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.sync_project_links(uuid, jsonb, uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.remove_student(uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.audit(text, text, uuid, jsonb)', 'EXECUTE'),
  'none of the internal writers can be called by users'
);

-- Frozen submissions -----------------------------------------------------------------------------
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');
insert into public.pending_changes (target_type, action, proposed_data)
values ('profile', 'update', '{"headline": "What the reviewer sees"}');

select throws_ok(
  $$ update public.pending_changes set proposed_data = '{"headline": "Swapped after review started"}'
     where submitter_id = 'a0000000-0000-4000-8000-000000000003' $$,
  '42501', 'A submission waiting for review can only be withdrawn',
  'a submission waiting for review cannot be changed, so reviewers approve what they saw'
);

select lives_ok(
  $$ update public.pending_changes set status = 'withdrawn'
     where submitter_id = 'a0000000-0000-4000-8000-000000000003' $$,
  'it can be withdrawn'
);

-- Links, emails, sizes ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.pending_changes (target_type, action, proposed_data)
     values ('profile', 'update', '{"linkedin_url": "javascript:alert(document.cookie)"}') $$,
  '23514', null,
  'a javascript: link is refused when submitted'
);

select lives_ok(
  $$ insert into public.pending_changes (target_type, action, proposed_data)
     values ('profile', 'update', '{"linkedin_url": "https://www.linkedin.com/in/example"}') $$,
  'an https link is accepted'
);

select throws_ok(
  $$ insert into public.pending_changes (target_type, action, proposed_data)
     values ('profile', 'update', jsonb_build_object('background', repeat('x', 70000))) $$,
  '23514', null,
  'oversized submissions are refused'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

select throws_ok(
  $$ update public.projects set repo_url = 'http://example.com/repo' where slug = 'test-published' $$,
  '23514', null,
  'links must use https, even for admins'
);

select throws_ok(
  $$ update public.faculty set email = 'not an email' where id = 'c0000000-0000-4000-8000-000000000001' $$,
  '23514', null,
  'emails must be well-formed'
);

select throws_ok(
  $$ update public.projects set description = repeat('x', 20001) where slug = 'test-published' $$,
  '23514', null,
  'text fields have length limits'
);

-- Open-submission limit --------------------------------------------------------------------------
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000005');

do $$
begin
  for i in 1..20 loop
    insert into public.pending_changes (target_type, action, proposed_data)
    values ('profile', 'update', jsonb_build_object('headline', 'Draft ' || i));
  end loop;
end;
$$;

select throws_ok(
  $$ insert into public.pending_changes (target_type, action, proposed_data)
     values ('profile', 'update', '{"headline": "One too many"}') $$,
  '54000', null,
  'a student can have at most 20 submissions open'
);

-- Role changes are audited -----------------------------------------------------------------------
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');
update public.profiles set role = 'reviewer' where id = 'a0000000-0000-4000-8000-000000000004';
reset role;

select results_eq(
  $$ select actor_id, details ->> 'from', details ->> 'to' from public.audit_log
     where action = 'role_changed' and target_id = 'a0000000-0000-4000-8000-000000000004' $$,
  $$ values ('a0000000-0000-4000-8000-000000000001'::uuid, 'student', 'reviewer') $$,
  'role changes are recorded with who made them'
);

select * from finish();
rollback;
