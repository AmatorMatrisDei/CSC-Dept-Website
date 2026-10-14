-- Guard rails that apply to the whole schema, so a new table can't quietly skip them.
begin;
\ir _helpers.psql
select plan(7);

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

select ok(
  not has_any_column_privilege('authenticated', 'public.profiles', 'INSERT'),
  'users cannot create profiles directly; the sign-up trigger does'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE'),
  'users cannot change a profile''s id'
);

select ok(
  not has_function_privilege('anon', 'public.hook_before_user_created(jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'EXECUTE'),
  'the sign-up hook cannot be called through the API'
);

select ok(pg_has_role('web_reader', 'anon', 'USAGE'), 'web_reader has the anon role''s access');

select ok(
  (select not (rolsuper or rolbypassrls) from pg_roles where rolname = 'web_reader'),
  'web_reader is subject to row level security'
);

select * from finish();
rollback;
