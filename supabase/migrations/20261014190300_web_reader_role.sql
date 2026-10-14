-- A read-only database login for server-side rendering through Cloudflare Hyperdrive.
--
-- It is a member of `anon`, so the policies written for signed-out visitors apply to it: it sees
-- published content and public profiles, and cannot write anything. Use it instead of the
-- `postgres` user, which bypasses row level security.
--
-- The role is created without a password so none ends up in git. Set one on each database as
-- described in docs/backend-setup.md; supabase/seed.sql sets a local-only one.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'web_reader') then
    create role web_reader nologin;
  end if;
end;
$$;

grant anon to web_reader;
