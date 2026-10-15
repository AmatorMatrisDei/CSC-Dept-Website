-- Fix: deleting an account failed ("Database error deleting user") after the admin-edit audit
-- (20261015800000). Supabase Auth deletes the account as its own role, the delete cascades to
-- the profile, and the audit trigger then called private.is_admin(), which that role may not
-- run. The trigger now returns before calling anything unless the edit came through the Data
-- API (an admin, or the secret key).

create or replace function private.audit_admin_edit()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  -- Supabase Auth, the review queue's own functions and migrations stop here, before any helper
  -- is called (PL/pgSQL only looks up a function when its line first runs).
  if current_user not in ('authenticated', 'service_role') then
    return null;
  end if;
  if current_user = 'authenticated' and not private.is_admin() then
    return null;
  end if;
  perform private.log_admin_edit(tg_table_name, tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end;
$$;
