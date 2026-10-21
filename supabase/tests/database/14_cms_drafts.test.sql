-- Page text: allowed keys, cleaned values, drafts, publishing with the conflict check, history.
begin;
\ir _helpers.psql
select plan(20);

insert into public.site_content (key, value) values ('about.title', 'About C&E');

-- Keys and values ---------------------------------------------------------------------------------

select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

select throws_ok(
  $$ insert into public.site_content (key, value) values ('secret.thing', 'x') $$,
  '23514', null, 'unknown page text keys are refused'
);

select throws_ok(
  $$ insert into public.site_content (key, value) values ('home.title', '   ') $$,
  '23514', null, 'empty page text is refused'
);

insert into public.site_content (key, value) values ('home.title', E'  Hello\x01 there  ');
select is((select value from public.site_content where key = 'home.title'), 'Hello there',
  'control characters and outer spaces are removed');

-- Lists ---------------------------------------------------------------------------------------------

insert into public.site_content (key, value) values ('about.facts.items',
  '[{"title":" A ","text":"t","url":"javascript:alert(1)","evil":1},{"title":"B","text":"","url":"/projects"},{"title":"","text":""}]');
select is((select value::jsonb from public.site_content where key = 'about.facts.items'),
  '[{"title":"A","text":"t","url":""},{"title":"B","text":"","url":"/projects"},{"title":"","text":"","url":""}]'::jsonb,
  'list items keep only title, text and a safe url');

insert into public.site_content (key, value) values ('about.links.items',
  '[{"title":"A","url":"//evil.example"},{"title":"B","url":"/\\evil.example"},{"title":"C","url":"https://example.org/x"}]');
select is((select (value::jsonb -> 0 ->> 'url') || (value::jsonb -> 1 ->> 'url') from public.site_content where key = 'about.links.items'), '',
  'links that leave the site by "//" or a backslash are blanked');
select is((select value::jsonb -> 2 ->> 'url' from public.site_content where key = 'about.links.items'), 'https://example.org/x',
  'a web address stays');

select throws_ok(
  $$ insert into public.site_content (key, value) values ('about.more.items', 'not json') $$,
  '23514', null, 'a list that is not JSON is refused'
);
select throws_ok(
  $$ insert into public.site_content (key, value)
     values ('about.more.items', (select jsonb_agg(jsonb_build_object('title', n))::text from generate_series(1, 31) n)) $$,
  '23514', null, 'a list of more than 30 items is refused'
);
select throws_ok(
  $$ insert into public.site_content (key, value) values ('about.more.items', '{"title":"x"}') $$,
  '23514', null, 'a list must be an array'
);

-- Drafts and publishing -------------------------------------------------------------------------

select lives_ok($$ select public.save_site_draft('about.title', 'About the department', (select updated_at from public.site_content where key = 'about.title')) $$, 'admins save drafts');
select is((select value from public.site_content where key = 'about.title'), 'About C&E',
  'a draft does not change the live text');

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000003');
select throws_ok($$ select public.save_site_draft('about.title', 'Mine', null) $$, '42501', null, 'students cannot save drafts');
select is_empty($$ select * from public.site_content_draft $$, 'students cannot read drafts');

reset role;
select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

-- Someone changes the live text after the draft was started (everything here runs in one
-- transaction, so the draft's starting point is moved back to stand in for the time passing).
reset role;
update public.site_content_draft set base_updated_at = base_updated_at - interval '1 minute' where key = 'about.title';
update public.site_content set value = 'Changed elsewhere' where key = 'about.title';
select pg_temp.login_as('a0000000-0000-4000-8000-000000000001');

select is((select public.publish_site_drafts() -> 'conflicts'), '["about.title"]'::jsonb,
  'publishing reports a draft whose live text changed since it was started');
select is((select value from public.site_content where key = 'about.title'), 'Changed elsewhere',
  'and publishes nothing');

select public.discard_site_drafts();
select public.save_site_draft('about.title', 'Fresh draft', (select updated_at from public.site_content where key = 'about.title'));
select is((select (public.publish_site_drafts() ->> 'published')::int), 1, 'a current draft publishes');
select is((select count(*)::int from public.site_content_draft), 0, 'published drafts are cleared');

-- History -----------------------------------------------------------------------------------------

select is((select value from public.site_content_history where key = 'about.title' order by id desc limit 1),
  'Changed elsewhere', 'the replaced text is kept in the history');

select public.restore_site_text((select id from public.site_content_history where key = 'about.title' order by id desc limit 1));
select is((select value from public.site_content_draft where key = 'about.title'), 'Changed elsewhere',
  'restoring puts the old text back as a draft');

reset role;
select pg_temp.login_anon();
select throws_ok($$ select public.publish_site_drafts() $$, '42501', null, 'visitors cannot publish');

select * from finish();
rollback;
