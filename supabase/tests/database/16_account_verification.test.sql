-- Account verification: what an account can do before and after its email address is proven, the
-- Google and GitHub sign-in safeguard, and the helpers the verify-email and password-reset
-- functions use.
begin;
\ir _helpers.psql
select plan(31);

-- e0000000-...-01  test.new       a new sign-up, not verified, with a password and a session
-- e0000000-...-02  test.existing  listed in the directory from before verification existed
-- e0000000-...-03  test.oauth     created by a GitHub sign-in, no password
select pg_temp.create_user('e0000000-0000-4000-8000-000000000001', 'test.new@franciscan.edu', 'student', false, false);
select pg_temp.create_user('e0000000-0000-4000-8000-000000000002', 'test.existing@franciscan.edu', 'student', true, false);
insert into auth.users (id, email, aud, role, raw_user_meta_data)
values ('e0000000-0000-4000-8000-000000000003', 'test.oauth@franciscan.edu', 'authenticated', 'authenticated', '{}');
update auth.users set encrypted_password = extensions.crypt('chosen-by-someone', extensions.gen_salt('bf'))
where id = 'e0000000-0000-4000-8000-000000000001';
insert into auth.sessions (id, user_id) values ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001');
select pg_temp.create_test_projects();
insert into public.contributions (id, project_id, student_id, role, can_edit, confirmed) values
  ('f1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Tester', false, false),
  ('f1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'Writer', false, false);

-- Before verifying ---------------------------------------------------------------------------------

select pg_temp.login_as('e0000000-0000-4000-8000-000000000001');

select is(
  (select row(verified, method) from public.my_verification()),
  row(false, null::text),
  'a new account is not verified'
);

select throws_ok(
  $$ insert into public.pending_changes (target_type, action, proposed_data)
     values ('internship', 'create', '{"company": "Acme"}') $$,
  '42501',
  'Verify your email address before you submit anything. Your account page shows how.',
  'an unverified account cannot submit'
);

select throws_ok(
  $$ insert into public.consents (student_id, scope) values ('e0000000-0000-4000-8000-000000000001', 'directory') $$,
  '42501',
  'Verify your email address before you give permission to show your information. Your account page shows how.',
  'an unverified account cannot give permission to be listed'
);

select throws_ok(
  $$ select public.respond_to_listing('f1000000-0000-4000-8000-000000000001', true) $$,
  '42501',
  'Verify your email address before you confirm a project listing. Your account page shows how.',
  'an unverified account cannot confirm a project listing'
);

reset role;
select pg_temp.login_as('e0000000-0000-4000-8000-000000000002');

select lives_ok(
  $$ select public.respond_to_listing('f1000000-0000-4000-8000-000000000002', false) $$,
  'an unverified account can still say a listing is not them'
);

select lives_ok(
  $$ update public.consents set revoked_at = now() where student_id = 'e0000000-0000-4000-8000-000000000002' and scope = 'directory' $$,
  'an unverified account can still withdraw a permission'
);

select lives_ok(
  $$ insert into public.pending_changes (target_type, action) values ('profile', 'delete') $$,
  'an unverified account can still ask to leave the directory'
);

select lives_ok(
  $$ update public.pending_changes set status = 'withdrawn'
     where submitter_id = 'e0000000-0000-4000-8000-000000000002' and status = 'pending' $$,
  'and withdraw a submission'
);

reset role;

-- Reviewers and admins -------------------------------------------------------------------------------

select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');
insert into public.pending_changes (target_type, action, proposed_data)
values ('internship', 'create', '{"company": "Initech"}');
reset role;

-- test.reviewer as if their role predated verification.
delete from private.account_verifications where user_id = 'a0000000-0000-4000-8000-000000000002';
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');
select ok(not private.is_reviewer(), 'an unverified reviewer has no reviewer powers');
select is_empty(
  $$ select id from public.pending_changes where submitter_id <> 'a0000000-0000-4000-8000-000000000002' $$,
  'and cannot see other people''s submissions'
);
reset role;
select public.mark_account_verified('a0000000-0000-4000-8000-000000000002', 'admin');
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');
select ok(private.is_reviewer(), 'once verified, the reviewer''s powers return');
reset role;

select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ update public.profiles set role = 'reviewer' where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '23514',
  'Only verified accounts can be reviewers or admins. Ask them to verify their email address on their account page first.',
  'an admin cannot make an unverified account a reviewer'
);
select is(
  (select verified from public.list_people() where id = 'e0000000-0000-4000-8000-000000000001'),
  false,
  'the people page shows who is not verified'
);
select is(
  (select verified from public.list_people() where id = 'a0000000-0000-4000-8000-000000000003'),
  true,
  'and who is'
);
reset role;

-- Google and GitHub sign-in --------------------------------------------------------------------------

-- Someone signs in with Google as test.new: Supabase joins the identity to the existing account.
insert into auth.identities (provider_id, user_id, identity_data, provider)
values ('google-1', 'e0000000-0000-4000-8000-000000000001', '{"sub": "google-1", "email": "test.new@franciscan.edu"}', 'google');

select is(
  (select row(method, password_removed) from private.account_verifications where user_id = 'e0000000-0000-4000-8000-000000000001'),
  row('google'::text, true),
  'a Google sign-in verifies the account'
);
select ok(
  (select encrypted_password is null from auth.users where id = 'e0000000-0000-4000-8000-000000000001'),
  'and removes the password someone else may have chosen'
);
select is_empty(
  $$ select id from auth.sessions where user_id = 'e0000000-0000-4000-8000-000000000001' $$,
  'and ends the sessions made with it'
);

insert into auth.identities (provider_id, user_id, identity_data, provider)
values ('github-1', 'e0000000-0000-4000-8000-000000000003', '{"sub": "github-1", "email": "test.oauth@franciscan.edu"}', 'github');
select is(
  (select row(method, password_removed) from private.account_verifications where user_id = 'e0000000-0000-4000-8000-000000000003'),
  row('github'::text, false),
  'an account made by a GitHub sign-in is verified, with nothing removed'
);

update auth.users set encrypted_password = extensions.crypt('their-own', extensions.gen_salt('bf'))
where id = 'a0000000-0000-4000-8000-000000000003';
insert into auth.identities (provider_id, user_id, identity_data, provider)
values ('google-2', 'a0000000-0000-4000-8000-000000000003', '{"sub": "google-2", "email": "test.student@franciscan.edu"}', 'google');
select ok(
  (select encrypted_password is not null from auth.users where id = 'a0000000-0000-4000-8000-000000000003'),
  'an already verified account keeps its password when it adds Google'
);

-- After verifying --------------------------------------------------------------------------------------

select pg_temp.login_as('e0000000-0000-4000-8000-000000000001');
select public.dismiss_password_notice();
reset role;
select is(
  (select password_removed from private.account_verifications where user_id = 'e0000000-0000-4000-8000-000000000001'),
  false,
  'the person can dismiss the note about the removed password'
);

select pg_temp.login_as('e0000000-0000-4000-8000-000000000001');
select lives_ok(
  $$ insert into public.pending_changes (target_type, action, proposed_data)
     values ('internship', 'create', '{"company": "Acme"}') $$,
  'a verified account can submit'
);
select lives_ok(
  $$ insert into public.consents (student_id, scope) values ('e0000000-0000-4000-8000-000000000001', 'directory') $$,
  'and give permissions'
);
select lives_ok(
  $$ select public.respond_to_listing('f1000000-0000-4000-8000-000000000001', true) $$,
  'and confirm a listing'
);
reset role;

select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');
select lives_ok(
  $$ update public.profiles set role = 'reviewer' where id = 'e0000000-0000-4000-8000-000000000001' $$,
  'and be made a reviewer'
);
reset role;

-- The functions' helpers (secret key) ----------------------------------------------------------------

select is(
  public.account_for_email('  Test.Existing@Franciscan.edu '),
  'e0000000-0000-4000-8000-000000000002'::uuid,
  'the sign-in address is found whatever its capitals and spaces'
);
select ok(public.account_for_email('nobody@franciscan.edu') is null, 'an unknown address finds nothing');

select ok(
  public.allow_verification_request('e0000000-0000-4000-8000-000000000002', 'verify_send'),
  'a first verification email is allowed'
);
select ok(
  not public.allow_verification_request('e0000000-0000-4000-8000-000000000002', 'verify_send'),
  'another within the minute is not'
);
insert into private.verification_requests (user_id, kind, created_at)
select 'e0000000-0000-4000-8000-000000000003', 'reset_send', now() - interval '1 hour' * n from generate_series(1, 5) n;
select ok(
  not public.allow_verification_request('e0000000-0000-4000-8000-000000000003', 'reset_send'),
  'nor a sixth reset email in a day'
);
select is(
  public.latest_verification_request('e0000000-0000-4000-8000-000000000002', 'verify_send'),
  now(),
  'the functions can see when the last email was asked for'
);

insert into auth.sessions (id, user_id) values ('f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002');
select public.complete_password_reset('e0000000-0000-4000-8000-000000000002');
select ok(
  private.is_verified('e0000000-0000-4000-8000-000000000002')
    and not exists (select 1 from auth.sessions where user_id = 'e0000000-0000-4000-8000-000000000002'),
  'finishing a password reset verifies the account and ends its other sessions'
);

select * from finish();
rollback;
