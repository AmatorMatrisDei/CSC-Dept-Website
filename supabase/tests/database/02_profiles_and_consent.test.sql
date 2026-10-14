-- Profiles and consent (FR-2.1, FR-2.2, NFR-3).
begin;
\ir _helpers.psql
select plan(14);

select results_eq(
  $$ select role::text, name, visible from public.profiles where id = 'a0000000-0000-4000-8000-000000000004' $$,
  $$ values ('student', 'test.private', false) $$,
  'a new account gets an unlisted student profile named from sign-up'
);

-- Consent-gated fields

select throws_ok(
  $$ update public.profiles set contact_email = 'private@franciscan.edu' where id = 'a0000000-0000-4000-8000-000000000004' $$,
  '23514', 'The student has not consented to showing an email address',
  'the database refuses an email address the student has not agreed to show'
);

insert into public.consents (student_id, scope) values ('a0000000-0000-4000-8000-000000000003', 'email');
update public.profiles set contact_email = 'student@franciscan.edu' where id = 'a0000000-0000-4000-8000-000000000003';

select is(
  (select contact_email from public.profiles where id = 'a0000000-0000-4000-8000-000000000003'),
  'student@franciscan.edu',
  'with consent, the email address is stored'
);

-- Signed-out visitors
select pg_temp.login_anon();

select results_eq(
  $$ select id from public.profiles
     where id in ('a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004') $$,
  $$ values ('a0000000-0000-4000-8000-000000000003'::uuid) $$,
  'visitors see listed students and not unlisted ones'
);

-- test.student, listed
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');

select is_empty(
  $$ update public.profiles set headline = 'Edited directly' where id = 'a0000000-0000-4000-8000-000000000003' returning id $$,
  'students cannot edit their live profile directly; they submit changes for review'
);

select throws_ok(
  $$ insert into public.consents (student_id, scope) values ('a0000000-0000-4000-8000-000000000004', 'photo') $$,
  '42501', null,
  'students cannot grant consent for someone else'
);

select lives_ok(
  $$ update public.consents set revoked_at = now()
     where student_id = 'a0000000-0000-4000-8000-000000000003' and scope = 'email' and revoked_at is null $$,
  'students revoke their own consent'
);

reset role;

select is(
  (select contact_email from public.profiles where id = 'a0000000-0000-4000-8000-000000000003'),
  null,
  'revoking email consent removes the email address from the profile at once'
);

select throws_ok(
  $$ update public.consents set revoked_at = now()
     where student_id = 'a0000000-0000-4000-8000-000000000003' and scope = 'email' $$,
  '42501', 'A consent record can only be revoked, once',
  'a revoked consent stays revoked; granting again adds a new record'
);

select throws_ok(
  $$ delete from public.consents where student_id = 'a0000000-0000-4000-8000-000000000003' $$,
  '42501', 'Consent records cannot be deleted; revoke them instead',
  'consent records are never deleted'
);

update public.consents set revoked_at = now()
where student_id = 'a0000000-0000-4000-8000-000000000003' and scope = 'directory' and revoked_at is null;

select pg_temp.login_anon();

select is_empty(
  $$ select 1 from public.profiles where id = 'a0000000-0000-4000-8000-000000000003' $$,
  'withdrawing directory consent hides the student at once'
);

-- Reviewers and admins
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');

select isnt_empty(
  $$ select 1 from public.profiles where id = 'a0000000-0000-4000-8000-000000000004' $$,
  'reviewers see unlisted profiles, to review requests'
);

select is_empty(
  $$ update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-000000000002' returning id $$,
  'reviewers cannot change roles, including their own'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

select results_eq(
  $$ update public.profiles set role = 'reviewer' where id = 'a0000000-0000-4000-8000-000000000004' returning role::text $$,
  $$ values ('reviewer') $$,
  'admins change roles'
);

select * from finish();
rollback;
