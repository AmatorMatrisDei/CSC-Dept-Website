-- Guard rails that apply to the whole schema, so a new table or function can't quietly skip them.
begin;
\ir _helpers.psql
select plan(10);

select is_empty(
  $$ select c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every table in public has row level security turned on'
);

select is_empty(
  $$ select r.rolname, c.relname
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     cross join (values ('anon'), ('web_reader')) as r (rolname)
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
       and (has_any_column_privilege(r.rolname, c.oid, 'INSERT')
            or has_any_column_privilege(r.rolname, c.oid, 'UPDATE')
            or has_table_privilege(r.rolname, c.oid, 'DELETE')
            or has_table_privilege(r.rolname, c.oid, 'TRUNCATE')) $$,
  'signed-out visitors and web_reader cannot write to any table'
);

select is_empty(
  $$ select c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and not coalesce('security_invoker=true' = any (c.reloptions), false) $$,
  'every view runs with the caller''s permissions, so row level security applies'
);

select ok(
  not has_any_column_privilege('authenticated', 'public.profiles', 'INSERT'),
  'users cannot create profiles directly; the sign-up trigger does'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE'),
  'nobody can change a profile''s id through the API'
);

select ok(
  not has_table_privilege('authenticated', 'public.audit_log', 'INSERT')
    and not has_table_privilege('authenticated', 'public.consents', 'DELETE'),
  'the audit log and consents cannot be written or deleted directly'
);

select ok(
  not has_function_privilege('anon', 'public.hook_before_user_created(jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'EXECUTE'),
  'the sign-up hook cannot be called through the API'
);

select ok(
  not has_function_privilege('anon', 'public.review_change(uuid, public.change_status, text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.respond_to_listing(uuid, boolean)', 'EXECUTE'),
  'visitors cannot call the review functions'
);

select ok(
  not has_function_privilege('authenticated', 'public.save_carousel(date, uuid[], uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.carousel_candidates(date)', 'EXECUTE'),
  'only the carousel function (service role) can read candidates and save picks'
);

select ok(
  pg_has_role('web_reader', 'anon', 'USAGE')
    and (select not (rolsuper or rolbypassrls) from pg_roles where rolname = 'web_reader'),
  'web_reader has exactly the anon role''s access and is subject to row level security'
);

select * from finish();
rollback;
