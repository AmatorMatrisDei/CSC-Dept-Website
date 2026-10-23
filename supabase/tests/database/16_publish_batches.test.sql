-- One Publish is one batch in the history, and a single record draft can be undone on its own.
-- (A whole test runs in one transaction, so two publishes here would share a batch; in the
-- site each publish is its own transaction and so its own batch.)
begin;
\ir _helpers.psql
select plan(9);

insert into public.site_content (key, value) values ('about.title', 'About C&E');

-- Start from an empty history, so leftovers from other runs don't count.
delete from public.site_content_history;
delete from public.record_history;

select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');
select public.discard_site_drafts();
select public.discard_record_drafts();

-- Publishing text and a record together writes history rows that share one batch ------------------

select public.save_site_draft('about.title', 'Batch title', (select updated_at from public.site_content where key = 'about.title'));
select public.save_record_draft('projects', 'campus-robot', '{"title": "Batch project"}');
select public.publish_site_drafts();

select is((select count(*)::int from public.site_content_history where key = 'about.title'), 1,
  'publishing wrote a text history row');
select is((select count(*)::int from public.record_history where row_slug = 'campus-robot'), 1,
  'publishing wrote a record history row');
select isnt((select batch from public.site_content_history where key = 'about.title'), null,
  'the text history row carries a batch');
select is(
  (select batch from public.site_content_history where key = 'about.title'),
  (select batch from public.record_history where row_slug = 'campus-robot'),
  'text and record history from one publish share a batch'
);

-- Undoing one record draft at a time ----------------------------------------------------------------

select public.save_record_draft('projects', 'campus-robot', '{"title": "Draft one"}');

select is((select count(*)::int from public.record_draft), 1, 'one record draft is waiting');
select lives_ok($$ select public.discard_record_drafts(array['projects/someone-else']) $$,
  'naming a row with no draft is harmless');
select is((select count(*)::int from public.record_draft), 1, 'rows that were not named keep their drafts');
select public.discard_record_drafts(array['projects/campus-robot']);
select is((select count(*)::int from public.record_draft), 0, 'the named row is discarded');

-- Not everyone may undo -----------------------------------------------------------------------------

select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');
select throws_ok($$ select public.discard_record_drafts(array['projects/campus-robot']) $$, '42501', null,
  'students cannot discard drafts');

select * from finish();
rollback;
