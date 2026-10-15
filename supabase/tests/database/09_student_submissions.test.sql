-- Safeguards for the student submission forms: project slugs made at approval, and photos that
-- students cannot swap once something uses them.
begin;
\ir _helpers.psql
select pg_temp.create_test_projects();
select plan(15);

-- Project slugs -----------------------------------------------------------------------------------

select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');

select lives_ok(
  $$ insert into public.pending_changes (target_type, action, proposed_data)
     values ('project', 'create', jsonb_build_object(
       'title', 'Campus Delivery Robot', 'category_id', pg_temp.category('capstone'),
       'sub_department_id', pg_temp.sub_department('computer-science'))) $$,
  'a new project can be submitted without a slug'
);

insert into public.pending_changes (target_type, action, proposed_data)
values ('project', 'create', jsonb_build_object(
  'title', 'Another project', 'slug', 'test-published', 'category_id', pg_temp.category('class'),
  'sub_department_id', pg_temp.sub_department('computer-science')));

select throws_ok(
  $$ insert into public.pending_changes (target_type, action, proposed_data)
     values ('project', 'create', jsonb_build_object(
       'category_id', pg_temp.category('class'), 'sub_department_id', pg_temp.sub_department('computer-science'))) $$,
  '22023', 'A new project needs a title, category_id and sub_department_id',
  'a new project still needs a title, category and sub-department'
);

select throws_ok(
  $$ insert into public.pending_changes (target_type, action, target_id, proposed_data)
     values ('project', 'update', 'b0000000-0000-4000-8000-000000000001', '{"title": "   "}') $$,
  '22023', 'A project needs a title',
  'a title cannot be blanked out'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000005');

insert into public.pending_changes (target_type, action, proposed_data)
values ('project', 'create', jsonb_build_object(
  'title', 'Campus Delivery Robot', 'category_id', pg_temp.category('personal'),
  'sub_department_id', pg_temp.sub_department('software-engineering')));

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');
select public.review_change(id, 'approved') from public.pending_changes
where submitter_id = 'a0000000-0000-4000-8000-000000000003' and proposed_data ->> 'title' = 'Campus Delivery Robot';
select public.review_change(id, 'approved') from public.pending_changes
where submitter_id = 'a0000000-0000-4000-8000-000000000005' and proposed_data ->> 'title' = 'Campus Delivery Robot';
select public.review_change(id, 'approved') from public.pending_changes
where proposed_data ->> 'title' = 'Another project';
reset role;

select results_eq(
  $$ select slug from public.projects where created_by = 'a0000000-0000-4000-8000-000000000003' order by created_at, slug $$,
  $$ values ('campus-delivery-robot'), ('test-published-2') $$,
  'approval makes the slug from the title, or numbers a proposed slug that is taken'
);

select is(
  (select slug from public.projects where created_by = 'a0000000-0000-4000-8000-000000000005'),
  'campus-delivery-robot-2',
  'a second project with the same title gets a numbered slug instead of failing'
);

select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');
insert into public.pending_changes (target_type, action, target_id, proposed_data)
values ('project', 'update', 'b0000000-0000-4000-8000-000000000001', '{"slug": "Campus Delivery Robot"}');
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');
select public.review_change(id, 'approved') from public.pending_changes
where target_id = 'b0000000-0000-4000-8000-000000000001' and status = 'pending';
reset role;

select is(
  (select slug from public.projects where id = 'b0000000-0000-4000-8000-000000000001'),
  'campus-delivery-robot-3',
  'a slug proposed in an edit is tidied and numbered too'
);

-- Photos in use -----------------------------------------------------------------------------------

select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');

select ok(
  private.can_replace_media('submissions/a0000000-0000-4000-8000-000000000003/unused.jpg'),
  'students may replace or delete their own files that nothing uses'
);

insert into public.pending_changes (target_type, action, proposed_data)
values ('project', 'create', jsonb_build_object(
  'title', 'Photo project', 'category_id', pg_temp.category('class'),
  'sub_department_id', pg_temp.sub_department('computer-science'),
  'images', jsonb_build_array(jsonb_build_object(
    'storage_path', 'submissions/a0000000-0000-4000-8000-000000000003/team.jpg', 'alt_text', 'The team'))));

select ok(
  not private.can_replace_media('submissions/a0000000-0000-4000-8000-000000000003/team.jpg'),
  'a photo in a submission waiting for review cannot be swapped'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000002');
select public.review_change(id, 'approved') from public.pending_changes where proposed_data ->> 'title' = 'Photo project';
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');

select ok(
  not private.can_replace_media('submissions/a0000000-0000-4000-8000-000000000003/team.jpg'),
  'an approved project photo cannot be swapped'
);

reset role;
update public.projects
set thumbnail_path = 'submissions/a0000000-0000-4000-8000-000000000003/thumb.jpg', thumbnail_alt = 'Thumbnail'
where id = 'b0000000-0000-4000-8000-000000000002';
insert into public.consents (student_id, scope) values ('a0000000-0000-4000-8000-000000000003', 'photo');
update public.profiles set photo_path = 'avatars/a0000000-0000-4000-8000-000000000003/me.jpg'
where id = 'a0000000-0000-4000-8000-000000000003';
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');

select ok(
  not private.can_replace_media('submissions/a0000000-0000-4000-8000-000000000003/thumb.jpg'),
  'a project thumbnail cannot be swapped'
);

select ok(
  not private.can_replace_media('avatars/a0000000-0000-4000-8000-000000000003/me.jpg'),
  'an approved profile photo cannot be swapped'
);

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000005');
insert into public.pending_changes (target_type, action, proposed_data)
values ('project', 'create', jsonb_build_object(
  'title', 'Withdrawn project', 'category_id', pg_temp.category('class'),
  'sub_department_id', pg_temp.sub_department('computer-science'),
  'images', jsonb_build_array(jsonb_build_object(
    'storage_path', 'submissions/a0000000-0000-4000-8000-000000000005/draft.jpg', 'alt_text', 'Draft'))));
update public.pending_changes set status = 'withdrawn' where proposed_data ->> 'title' = 'Withdrawn project';

select ok(
  private.can_replace_media('submissions/a0000000-0000-4000-8000-000000000005/draft.jpg'),
  'withdrawing a submission frees its photos'
);

reset role;
insert into public.project_images (project_id, storage_path, alt_text)
values ('b0000000-0000-4000-8000-000000000001', 'projects/b0000000-0000-4000-8000-000000000001/live.jpg', 'Live');
select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

select ok(
  private.can_replace_media('projects/b0000000-0000-4000-8000-000000000001/live.jpg'),
  'admins still manage live photos in their folders'
);

reset role;

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd in ('UPDATE', 'DELETE')
     and qual like '%can_replace_media%'),
  2,
  'replacing and deleting files both go through can_replace_media'
);

select ok(
  not has_function_privilege('authenticated', 'private.is_media_in_use(text)', 'EXECUTE')
    and not has_function_privilege('anon', 'private.is_media_in_use(text)', 'EXECUTE'),
  'users cannot call is_media_in_use directly'
);

select * from finish();
rollback;
