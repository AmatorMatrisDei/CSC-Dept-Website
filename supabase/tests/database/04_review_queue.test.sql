-- The review queue (guide 2.4, FR-3.1 to FR-3.8).
begin;
\ir _helpers.psql
select pg_temp.create_test_projects();
select plan(28);

-- test.student submits changes ------------------------------------------------------------------
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');

select lives_ok(
  $$ insert into public.pending_changes (target_type, action, proposed_data)
     values ('profile', 'update', '{"headline": "New headline", "skills": ["SQL", "Go"]}') $$,
  'students submit profile changes'
);

select throws_ok(
  $$ insert into public.pending_changes (target_type, action, proposed_data)
     values ('profile', 'update', '{"visible": true}') $$,
  '22023', 'Unknown field: visible',
  'students cannot propose fields that only admins set'
);

select throws_ok(
  $$ insert into public.pending_changes (target_type, action, proposed_data)
     values ('profile', 'update', '{"photo_path": "avatars/a0000000-0000-4000-8000-000000000004/me.jpg"}') $$,
  '22023', 'Upload your photo to your own avatars folder first',
  'a profile photo must come from the student''s own folder'
);

select throws_ok(
  $$ select public.review_change(
       (select id from public.pending_changes where submitter_id = 'a0000000-0000-4000-8000-000000000003' limit 1), 'approved') $$,
  '42501', 'Only reviewers can review submissions',
  'students cannot approve submissions'
);

select throws_ok(
  $$ update public.pending_changes set status = 'approved' where submitter_id = 'a0000000-0000-4000-8000-000000000003' $$,
  '42501', 'A submission waiting for review can only be withdrawn',
  'students cannot mark their own submission approved'
);

reset role;

select is(
  (select headline from public.profiles where id = 'a0000000-0000-4000-8000-000000000003'),
  '',
  'the live profile does not change until the submission is reviewed'
);

-- test.private asks to be added to the directory -----------------------------------------------
select pg_temp.login_as('a0000000-0000-4000-8000-000000000004');

select throws_ok(
  $$ insert into public.pending_changes (target_type, action, proposed_data)
     values ('profile', 'create', '{"headline": "Hello"}') $$,
  '23514', 'Agree to be listed in the directory before asking to be added',
  'asking to be added needs directory consent first'
);

insert into public.consents (scope) values ('directory');

select lives_ok(
  $$ insert into public.pending_changes (target_type, action, proposed_data)
     values ('profile', 'create', '{"headline": "Hello", "major": "Computer Science"}') $$,
  'with consent, students ask to be added'
);

-- The reviewer decides --------------------------------------------------------------------------
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');

select throws_ok(
  $$ select public.review_change(
       (select id from public.pending_changes where submitter_id = 'a0000000-0000-4000-8000-000000000003' and target_type = 'profile'), 'rejected') $$,
  '22023', 'Give a reason when rejecting or asking for changes',
  'rejecting needs a reason'
);

select is(
  (public.review_change(
     (select id from public.pending_changes where submitter_id = 'a0000000-0000-4000-8000-000000000003' and target_type = 'profile'), 'approved')).status::text,
  'approved',
  'reviewers approve submissions'
);

select is(
  (select headline from public.profiles where id = 'a0000000-0000-4000-8000-000000000003'),
  'New headline',
  'approving applies the change to the live profile'
);

select isnt_empty(
  $$ select 1 from public.audit_log where action = 'submission_approved' and target_id = 'a0000000-0000-4000-8000-000000000003' $$,
  'approvals are recorded in the audit log'
);

select public.review_change(
  (select id from public.pending_changes where submitter_id = 'a0000000-0000-4000-8000-000000000004'), 'approved');

reset role;
select pg_temp.login_anon();

select isnt_empty(
  $$ select 1 from public.profiles where id = 'a0000000-0000-4000-8000-000000000004' and major = 'Computer Science' $$,
  'an approved request to be added lists the student'
);

-- Send back and resubmit ------------------------------------------------------------------------
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');
insert into public.pending_changes (target_type, action, proposed_data)
values ('internship', 'create', '{"company": "Acme", "term": "Summer 2026"}');

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');
select public.review_change(
  (select id from public.pending_changes where submitter_id = 'a0000000-0000-4000-8000-000000000003' and target_type = 'internship'), 'changes_requested', 'Use the full company name');

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');

select lives_ok(
  $$ update public.pending_changes set proposed_data = '{"company": "Acme Corporation", "term": "Summer 2026"}', status = 'pending'
     where submitter_id = 'a0000000-0000-4000-8000-000000000003' and target_type = 'internship' $$,
  'students fix a sent-back submission and resubmit it'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');
select public.review_change((select id from public.pending_changes where submitter_id = 'a0000000-0000-4000-8000-000000000003' and target_type = 'internship'), 'approved');

reset role;
select pg_temp.login_anon();

select results_eq(
  $$ select company from public.internships where student_id = 'a0000000-0000-4000-8000-000000000003' $$,
  $$ values ('Acme Corporation') $$,
  'the resubmitted version is what goes live'
);

-- A new project with teammates, an advisor and a photo ------------------------------------------
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000005');

insert into public.pending_changes (target_type, action, proposed_data)
values ('project', 'create', jsonb_build_object(
  'title', 'Submitted project', 'slug', 'test-submitted', 'status', 'active',
  'category_id', pg_temp.category('capstone'), 'sub_department_id', pg_temp.sub_department('business-ai'),
  'members', jsonb_build_array(
    jsonb_build_object('student_id', 'a0000000-0000-4000-8000-000000000005', 'role', 'Lead'),
    jsonb_build_object('student_id', 'a0000000-0000-4000-8000-000000000003', 'role', 'Helper')),
  'advisor_ids', jsonb_build_array('c0000000-0000-4000-8000-000000000001'),
  'images', jsonb_build_array(jsonb_build_object(
    'storage_path', 'submissions/a0000000-0000-4000-8000-000000000005/team.jpg', 'alt_text', 'The team'))));

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');
select public.review_change((select id from public.pending_changes where submitter_id = 'a0000000-0000-4000-8000-000000000005' and target_type = 'project'), 'approved');
reset role;

select results_eq(
  $$ select published, created_by from public.projects where slug = 'test-submitted' $$,
  $$ values (true, 'a0000000-0000-4000-8000-000000000005'::uuid) $$,
  'an approved project goes live, credited to the student who submitted it'
);

select results_eq(
  $$ select c.student_id, c.confirmed from public.contributions c join public.projects p on p.id = c.project_id
     where p.slug = 'test-submitted' order by c.sort_order $$,
  $$ values ('a0000000-0000-4000-8000-000000000005'::uuid, true), ('a0000000-0000-4000-8000-000000000003'::uuid, false) $$,
  'the submitter is listed at once; teammates they added must confirm first'
);

select isnt_empty(
  $$ select 1 from public.advising a join public.projects p on p.id = a.project_id where p.slug = 'test-submitted' $$,
  'the advisor is linked'
);

select isnt_empty(
  $$ select 1 from public.project_images i join public.projects p on p.id = i.project_id
     where p.slug = 'test-submitted' and i.alt_text = 'The team' $$,
  'the photo is linked with its alt text'
);

-- Limits on project submissions -----------------------------------------------------------------
select pg_temp.login_as('a0000000-0000-4000-8000-000000000004');

select throws_ok(
  $$ insert into public.pending_changes (target_type, action, target_id, proposed_data)
     values ('project', 'update', 'b0000000-0000-4000-8000-000000000001', '{"title": "Taken over"}') $$,
  '42501', 'You cannot submit changes to this project',
  'only the project''s creator and members with edit rights submit changes'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');

select throws_ok(
  $$ insert into public.pending_changes (target_type, action, target_id, proposed_data)
     values ('project', 'update', 'b0000000-0000-4000-8000-000000000001', jsonb_build_object('images', jsonb_build_array(
       jsonb_build_object('storage_path', 'submissions/a0000000-0000-4000-8000-000000000005/team.jpg', 'alt_text', 'Borrowed')))) $$,
  '22023', null,
  'a submission cannot use photos from someone else''s folder'
);

-- Reviewers may approve their own submissions, and the audit log says so --------------------------
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');
insert into public.pending_changes (target_type, action, proposed_data) values ('profile', 'update', '{"headline": "Reviewer"}');

select lives_ok(
  $$ select public.review_change(
       (select id from public.pending_changes where submitter_id = 'a0000000-0000-4000-8000-000000000002'), 'approved') $$,
  'reviewers can approve their own submissions'
);

reset role;

select ok(
  (select headline = 'Reviewer' from public.profiles where id = 'a0000000-0000-4000-8000-000000000002')
    and exists (select 1 from public.audit_log
                where actor_id = 'a0000000-0000-4000-8000-000000000002' and details ->> 'self_review' = 'true'),
  'a self-approved change goes live and is marked as a self-review in the audit log'
);

-- Removal (FR-3.2) ------------------------------------------------------------------------------
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');
insert into public.pending_changes (target_type, action) values ('profile', 'delete');

reset role;
select pg_temp.login_anon();

select is_empty(
  $$ select 1 from public.profiles where id = 'a0000000-0000-4000-8000-000000000003' $$,
  'a removal request hides the student at once, before review'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');
select public.review_change(
  (select id from public.pending_changes where submitter_id = 'a0000000-0000-4000-8000-000000000003' and action = 'delete'), 'approved');
reset role;

select is_empty(
  $$ select 1 from public.contributions where student_id = 'a0000000-0000-4000-8000-000000000003' $$,
  'confirming the removal deletes the student''s project listings'
);

select is_empty(
  $$ select 1 from public.consents where student_id = 'a0000000-0000-4000-8000-000000000003' and revoked_at is null $$,
  'and withdraws every consent'
);

-- Audit log -------------------------------------------------------------------------------------

select throws_ok(
  $$ update public.audit_log set action = 'tampered' $$,
  '42501', 'The audit log cannot be changed',
  'the audit log is append-only'
);

select pg_temp.login_as('a0000000-0000-4000-8000-000000000005');

select is_empty(
  $$ select 1 from public.audit_log $$,
  'students cannot read the audit log'
);

select * from finish();
rollback;
