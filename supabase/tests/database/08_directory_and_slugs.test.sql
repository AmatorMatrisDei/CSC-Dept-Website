-- The listed_students directory view, URL slugs, and thumbnail alt text.
begin;
\ir _helpers.psql
select pg_temp.create_test_projects();
select plan(11);

-- Slugs -------------------------------------------------------------------------------------------

insert into public.faculty (name) values ('Dr. Ada Lovelace'), ('Dr. Ada Lovelace');

select results_eq(
  $$ select slug from public.faculty where name = 'Dr. Ada Lovelace' order by slug $$,
  $$ values ('dr-ada-lovelace'), ('dr-ada-lovelace-2') $$,
  'faculty get a slug from their name, numbered when the name is taken'
);

select is(
  (select slug from public.profiles where id = 'a0000000-0000-4000-8000-000000000003'),
  'test-student',
  'new accounts get a slug from their name'
);

select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');

select throws_ok(
  $$ insert into public.pending_changes (target_type, action, proposed_data)
     values ('profile', 'update', '{"slug": "chosen-by-me"}') $$,
  '22023', 'Unknown field: slug',
  'students cannot choose their own slug'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

select throws_ok(
  $$ update public.faculty set slug = 'Not A Slug!' where name = 'Test Faculty' $$,
  '23514', null,
  'slugs must be lowercase words joined by hyphens'
);

-- The directory -----------------------------------------------------------------------------------

reset role;
select pg_temp.login_anon();

select set_eq(
  $$ select slug from public.listed_students where slug like 'test-%' $$,
  $$ values ('test-student'), ('test-outsider') $$,
  'visitors see listed students in the directory'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');

select is_empty(
  $$ select 1 from public.listed_students where id = 'a0000000-0000-4000-8000-000000000004' $$,
  'a signed-in reviewer does not see unlisted students in the directory either'
);

select isnt_empty(
  $$ select 1 from public.profiles where id = 'a0000000-0000-4000-8000-000000000004' $$,
  'while still seeing them in profiles, for reviewing'
);

reset role;
update public.consents set revoked_at = now()
where student_id = 'a0000000-0000-4000-8000-000000000005' and scope = 'directory' and revoked_at is null;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');

select is_empty(
  $$ select 1 from public.listed_students where id = 'a0000000-0000-4000-8000-000000000005' $$,
  'withdrawing consent removes a student from the directory for everyone'
);

-- Thumbnail alt text ------------------------------------------------------------------------------

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

select throws_ok(
  $$ update public.projects set thumbnail_path = 'projects/b0000000-0000-4000-8000-000000000001/cover.jpg'
     where slug = 'test-published' $$,
  '23514', null,
  'a thumbnail cannot be saved without alt text'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');

select throws_ok(
  $$ insert into public.pending_changes (target_type, action, target_id, proposed_data)
     values ('project', 'update', 'b0000000-0000-4000-8000-000000000001',
       '{"thumbnail_path": "submissions/a0000000-0000-4000-8000-000000000003/cover.jpg"}') $$,
  '22023', 'A thumbnail needs alt text (thumbnail_alt)',
  'a submitted thumbnail without alt text is refused when submitted'
);

select lives_ok(
  $$ insert into public.pending_changes (target_type, action, target_id, proposed_data)
     values ('project', 'update', 'b0000000-0000-4000-8000-000000000001',
       '{"thumbnail_path": "submissions/a0000000-0000-4000-8000-000000000003/cover.jpg",
         "thumbnail_alt": "The team presenting at the showcase"}') $$,
  'a thumbnail with alt text is accepted'
);

select * from finish();
rollback;
