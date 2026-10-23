-- Admin editing (the click-to-edit CMS, the People page, the planner's catalog) writes straight to
-- the live tables, skipping the review queue and its audit entries. This logs those edits, with
-- what changed, and keeps at least one admin so the site can't be locked out.
--
-- Only edits made through the Data API are logged here (as the signed-in admin, or the secret key
-- for scripts). Changes applied by review_change already have their own entries, and migrations
-- and the dashboard are not logged.

-- Long values are shortened in the log; the live row holds the full text.
create function private.audit_clip(value jsonb)
returns jsonb
language sql immutable set search_path = ''
as $$
  select case
    when value is null then 'null'::jsonb
    when jsonb_typeof(value) = 'string' and char_length(value #>> '{}') > 300
      then to_jsonb(left(value #>> '{}', 300) || '…')
    when jsonb_typeof(value) in ('array', 'object') and char_length(value::text) > 1000
      then to_jsonb('(' || char_length(value::text) || ' characters)')
    else value
  end
$$;

-- Writes one entry. Runs with the owner's rights to reach audit_log, and checks again that the
-- caller is an admin (or the secret key) so it can't be used to write anything else.
create function private.log_admin_edit(tbl text, op text, before_row jsonb, after_row jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  ident text;
  changes jsonb;
begin
  if not (private.is_admin() or current_setting('role', true) = 'service_role') then
    return;
  end if;
  ident := coalesce(after_row, before_row) ->> coalesce(
    (select k from unnest(array['id', 'key', 'user_id']) k where coalesce(after_row, before_row) ? k limit 1), 'id');

  select coalesce(jsonb_object_agg(k, jsonb_build_object(
           'from', private.audit_clip(before_row -> k), 'to', private.audit_clip(after_row -> k))), '{}')
  into changes
  from jsonb_object_keys(coalesce(after_row, before_row)) k
  where k not in ('updated_at', 'created_at', 'search')
    and not (tbl = 'profiles' and k = 'role')  -- role changes have their own entry
    and (op <> 'UPDATE' or before_row -> k is distinct from after_row -> k);

  if op = 'UPDATE' and changes = '{}'::jsonb then
    return;
  end if;

  perform private.audit(
    case op when 'INSERT' then 'admin_created' when 'UPDATE' then 'admin_edited' else 'admin_deleted' end,
    tbl,
    case when ident ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then ident::uuid end,
    jsonb_build_object('key', ident, 'changes', changes)
  );
end;
$$;

-- Runs with the caller's rights, so it sees who made the change: an admin or the secret key
-- through the Data API, rather than review_change or a consent trigger working on their behalf.
create function private.audit_admin_edit()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user = 'service_role' or (current_user = 'authenticated' and private.is_admin()) then
    perform private.log_admin_edit(tg_table_name, tg_op,
      case when tg_op <> 'INSERT' then to_jsonb(old) end,
      case when tg_op <> 'DELETE' then to_jsonb(new) end);
  end if;
  return null;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['projects', 'profiles', 'faculty', 'organizations', 'posts', 'alumni_stories',
                              'site_content', 'planner_courses', 'planner_degrees'] loop
    execute format(
      'create trigger audit_admin_edit after insert or update or delete on public.%I
         for each row execute function private.audit_admin_edit()', tbl);
  end loop;
end;
$$;

-- At least one admin, always ---------------------------------------------------------------------

create function private.keep_an_admin()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'admin' and new.role is distinct from 'admin' then
    perform 1 from public.profiles where role = 'admin' for update;  -- two admins demoting each other
    if not exists (select 1 from public.profiles where role = 'admin' and id <> old.id) then
      raise exception 'There must always be at least one admin. Make someone else an admin first.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger keep_an_admin before update of role on public.profiles
  for each row execute function private.keep_an_admin();

revoke execute on function private.audit_clip(jsonb), private.log_admin_edit(text, text, jsonb, jsonb),
  private.audit_admin_edit(), private.keep_an_admin()
  from public, anon, authenticated, service_role;
-- The trigger above calls this while running as the signed-in admin or the secret key.
grant execute on function private.log_admin_edit(text, text, jsonb, jsonb) to authenticated, service_role;
