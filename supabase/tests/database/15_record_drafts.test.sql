-- Project, student and faculty edits (and project photos) wait as drafts and go live on publish.
begin;
\ir _helpers.psql
select plan(39);

-- A project with one photo and a cover photo already live.
insert into public.project_images (project_id, storage_path, alt_text, sort_order)
values ('10000000-0000-4000-8000-000000000002', 'projects/10000000-0000-4000-8000-000000000002/old.jpg', 'An old photo', 0);
update public.projects set thumbnail_path = 'projects/10000000-0000-4000-8000-000000000002/cover-old.jpg', thumbnail_alt = 'Old cover'
where slug = 'campus-robot';

select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');
select public.discard_site_drafts();
select public.discard_record_drafts();

create temp table before_title as select title from public.projects where slug = 'campus-robot';
grant select on before_title to authenticated;

-- Saving ------------------------------------------------------------------------------------------

select lives_ok(
  $$ select public.save_record_draft('projects', 'campus-robot', '{"title": "  New title  "}') $$,
  'admins save a project draft'
);
select is((select title from public.projects where slug = 'campus-robot'), (select title from before_title),
  'a draft does not change the live project');
select is((select patch ->> 'title' from public.record_draft where row_slug = 'campus-robot'), 'New title',
  'the draft text is tidied');

select throws_ok($$ select public.save_record_draft('projects', 'campus-robot', '{"slug": "x"}') $$, '23514', null,
  'columns outside the allowed list are refused');
select throws_ok($$ select public.save_record_draft('projects', 'campus-robot', '{"title": 5}') $$, '23514', null,
  'values must be text');
select throws_ok($$ select public.save_record_draft('projects', 'no-such-project', '{"title": "x"}') $$, 'P0002', null,
  'a record that does not exist is refused');
select throws_ok(
  $$ select public.save_record_draft('projects', 'campus-robot', '{}',
       '[{"path": "projects/10000000-0000-4000-8000-000000000003/x.jpg", "alt_text": "x"}]') $$,
  '23514', null, 'a photo from another project is refused'
);
select throws_ok(
  $$ select public.save_record_draft('projects', 'campus-robot', '{}',
       '[{"path": "projects/10000000-0000-4000-8000-000000000002/x.jpg", "alt_text": "  "}]') $$,
  '23514', null, 'a photo without a description is refused'
);

-- Only editors ------------------------------------------------------------------------------------

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');
select throws_ok($$ select public.save_record_draft('projects', 'campus-robot', '{"title": "Mine"}') $$, '42501', null,
  'students cannot save record drafts');
select is_empty($$ select * from public.record_draft $$, 'students cannot read record drafts');
select throws_ok($$ select public.discard_record_drafts() $$, '42501', null, 'students cannot discard them');

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

-- Publishing --------------------------------------------------------------------------------------

select public.save_record_draft('projects', 'campus-robot',
  '{"thumbnail_path": "projects/10000000-0000-4000-8000-000000000002/cover-new.jpg", "thumbnail_alt": "New cover"}',
  '[{"path": "projects/10000000-0000-4000-8000-000000000002/new.jpg", "alt_text": "A new photo", "caption": "Look"}]');
select public.save_record_draft('profiles', 'riley-reviewer', '{"skills": ["SQL", "Testing"]}');
select public.save_record_draft('faculty', 'dr-pat-faculty', '{"title": "Professor of Computing"}');

create temp table result as select public.publish_site_drafts() as r;
grant select on result to authenticated;

select is((select (r ->> 'records')::int from result), 3, 'publishing applies every record draft');
select is((select title from public.projects where slug = 'campus-robot'), 'New title', 'the project text is live');
select is((select array_agg(storage_path) from public.project_images where project_id = '10000000-0000-4000-8000-000000000002'),
  array['projects/10000000-0000-4000-8000-000000000002/new.jpg'], 'the gallery is what the draft said');
select is((select r -> 'removed_paths' from result), '[]'::jsonb, 'replaced photos are kept, not deleted');
select is((select array_agg(storage_path order by id) from public.record_photo_history),
  array['projects/10000000-0000-4000-8000-000000000002/old.jpg', 'projects/10000000-0000-4000-8000-000000000002/cover-old.jpg'],
  'the replaced gallery photo and cover photo are in the photo history');
select is((select skills from public.profiles where slug = 'riley-reviewer'), array['SQL', 'Testing'], 'a student''s list is live');

-- Earlier values ------------------------------------------------------------------------------------

select is((select before ->> 'title' from public.record_history where row_slug = 'campus-robot'), (select title from before_title),
  'publishing keeps the replaced text');
select ok(not (select before ? 'thumbnail_path' from public.record_history where row_slug = 'campus-robot'),
  'and does not keep photos (their files are deleted)');
select is((select before -> 'skills' from public.record_history where row_slug = 'riley-reviewer'), '[]'::jsonb,
  'a student''s replaced list is kept');
select is((select count(*)::int from public.record_history where row_slug = 'dr-pat-faculty'), 1, 'one entry per changed record');

select public.restore_record_version((select id from public.record_history where row_slug = 'campus-robot'));
select is((select patch ->> 'title' from public.record_draft where row_slug = 'campus-robot'), (select title from before_title),
  'restoring puts the old text back as a draft');
select public.discard_record_drafts();

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');
select throws_ok($$ select public.restore_record_version(1) $$, '42501', null, 'students cannot restore, and cannot read the history');
reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

-- A record changed by someone else in the meantime ---------------------------------------------------

select public.save_record_draft('faculty', 'dr-pat-faculty', '{"title": "Mine"}');
reset role;
update public.record_draft set base_updated_at = base_updated_at - interval '1 minute';
select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');
select is((select public.publish_site_drafts() -> 'conflicts'), '["faculty/dr-pat-faculty"]'::jsonb,
  'publishing reports a record changed since the draft was started');
select is((select title from public.faculty where slug = 'dr-pat-faculty'), 'Professor of Computing', 'and publishes nothing');

-- Discarding --------------------------------------------------------------------------------------

select public.save_record_draft('projects', 'campus-robot', '{}',
  '[{"path": "projects/10000000-0000-4000-8000-000000000002/new.jpg", "alt_text": "A new photo"},
    {"path": "projects/10000000-0000-4000-8000-000000000002/unused.jpg", "alt_text": "Never published"}]');
select is((select public.discard_record_drafts()), array['projects/10000000-0000-4000-8000-000000000002/unused.jpg'],
  'discarding returns only the uploads nothing uses');
select is((select count(*)::int from public.record_draft), 0, 'and clears the drafts');

-- Only the newest three replaced photos are kept ------------------------------------------------------

select public.save_record_draft('projects', 'campus-robot', '{}',
  '[{"path": "projects/10000000-0000-4000-8000-000000000002/g1.jpg", "alt_text": "G1"}]');
select public.publish_site_drafts();
select public.save_record_draft('projects', 'campus-robot', '{}',
  '[{"path": "projects/10000000-0000-4000-8000-000000000002/g2.jpg", "alt_text": "G2"}]');
create temp table trim_result as select public.publish_site_drafts() as r;
grant select on trim_result to authenticated;

select is((select r -> 'removed_paths' from trim_result),
  '["projects/10000000-0000-4000-8000-000000000002/old.jpg"]'::jsonb, 'the oldest replaced photo is returned for deleting');
select is((select count(*)::int from public.record_photo_history), 3, 'three are kept');

-- Putting a kept photo back makes it live again and removes its history entry
select public.save_record_draft('projects', 'campus-robot', '{}',
  '[{"path": "projects/10000000-0000-4000-8000-000000000002/new.jpg", "alt_text": "A new photo"},
    {"path": "projects/10000000-0000-4000-8000-000000000002/g2.jpg", "alt_text": "G2"}]');
select is((select public.discard_record_drafts()), '{}'::text[], 'discarding does not delete photos in the history');
select public.save_record_draft('projects', 'campus-robot', '{}',
  '[{"path": "projects/10000000-0000-4000-8000-000000000002/new.jpg", "alt_text": "A new photo"},
    {"path": "projects/10000000-0000-4000-8000-000000000002/g2.jpg", "alt_text": "G2"}]');
select public.publish_site_drafts();
select is((select count(*)::int from public.record_photo_history where storage_path like '%/new.jpg'), 0,
  'a photo that is live again leaves the history');

-- Student and faculty photos ----------------------------------------------------------------------------

select throws_ok(
  $$ select public.save_record_draft('faculty', 'dr-pat-faculty', '{"photo_path": "faculty/20000000-0000-4000-8000-000000000002/x.jpg"}') $$,
  '23514', null, 'a photo from someone else''s folder is refused'
);
select throws_ok(
  $$ select public.save_record_draft('profiles', 'riley-reviewer', '{"photo_path": "avatars/00000000-0000-4000-8000-000000000002/a.jpg"}') $$,
  '23514', null, 'a student photo needs the student''s consent'
);

reset role;
insert into public.consents (student_id, scope) values ('00000000-0000-4000-8000-000000000002', 'photo');
select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

select public.save_record_draft('profiles', 'riley-reviewer', '{"photo_path": "avatars/00000000-0000-4000-8000-000000000002/a.jpg"}');
select public.publish_site_drafts();
select is((select photo_path from public.profiles where slug = 'riley-reviewer'), 'avatars/00000000-0000-4000-8000-000000000002/a.jpg',
  'a student''s photo goes live on publish');

select public.save_record_draft('faculty', 'dr-pat-faculty', '{"photo_path": "faculty/20000000-0000-4000-8000-000000000001/f1.jpg"}');
select public.publish_site_drafts();
select public.save_record_draft('faculty', 'dr-pat-faculty', '{"photo_path": "faculty/20000000-0000-4000-8000-000000000001/f2.jpg"}');
select public.publish_site_drafts();
select public.save_record_draft('faculty', 'dr-pat-faculty', '{"photo_path": "faculty/20000000-0000-4000-8000-000000000001/f3.jpg"}');
select public.publish_site_drafts();
select public.save_record_draft('faculty', 'dr-pat-faculty', '{"photo_path": "faculty/20000000-0000-4000-8000-000000000001/f4.jpg"}');
select public.publish_site_drafts();
select public.save_record_draft('faculty', 'dr-pat-faculty', '{"photo_path": "faculty/20000000-0000-4000-8000-000000000001/f5.jpg"}');
create temp table last_publish as select public.publish_site_drafts() as r;

select is((select photo_path from public.faculty where slug = 'dr-pat-faculty'), 'faculty/20000000-0000-4000-8000-000000000001/f5.jpg', 'a faculty photo goes live on publish');
select is((select r -> 'removed_paths' from last_publish), '["faculty/20000000-0000-4000-8000-000000000001/f1.jpg"]'::jsonb,
  'only the newest three replaced photos are kept; the oldest file is returned for deleting');
select is((select count(*)::int from public.record_history where row_slug = 'dr-pat-faculty' and before ->> 'photo_path' is not null), 3,
  'three replaced photos remain in the history');

select public.restore_record_version((select id from public.record_history where before ->> 'photo_path' = 'faculty/20000000-0000-4000-8000-000000000001/f2.jpg'));
select public.publish_site_drafts();
select is((select count(*)::int from public.record_history where before ->> 'photo_path' = 'faculty/20000000-0000-4000-8000-000000000001/f2.jpg'), 0,
  'a photo that is live again leaves the history');

select public.save_record_draft('faculty', 'dr-pat-faculty', '{"photo_path": "faculty/20000000-0000-4000-8000-000000000001/unused.jpg"}');
select is((select public.discard_record_drafts()), array['faculty/20000000-0000-4000-8000-000000000001/unused.jpg'], 'discarding returns a picked photo nothing uses');

select * from finish();
rollback;
