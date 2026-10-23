-- What a faculty member can do. Faculty can do everything a reviewer can, and can edit nearly all
-- of the site's content like an admin: page wording (Edit mode), projects, students, faculty,
-- posts, alumni stories, partners, categories and sub-departments, with their photos. Admins keep
-- the rest: changing roles, the People page, and the settings that shape the site itself (the
-- planner's catalogs, courses and suggested plans, advising and the carousel's monthly pool).
--
-- Like an admin, a faculty member must have a verified account (see account verification).
-- Nothing here lets faculty see students-only content: that is decided by its own rules, which
-- name students and admins and nobody else.

-- Edit rights: faculty or admin, and verified. private.is_admin() is unchanged and still means
-- admin only.
create function private.can_edit_content()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.current_app_role() in ('faculty', 'admin'), false)
    and private.is_verified((select auth.uid()))
$$;

revoke execute on function private.can_edit_content() from public, anon;
grant execute on function private.can_edit_content() to authenticated, service_role;

-- Reviewer rights now include faculty (and still admins).
create or replace function private.is_reviewer()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.current_app_role() in ('reviewer', 'faculty', 'admin'), false)
    and private.is_verified((select auth.uid()))
$$;

-- Edit mode: site wording, drafts, history and record drafts all ask this one question.
create or replace function private.can_edit_site()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.can_edit_content()
$$;

-- Faculty are staff, so only a verified account can hold the role.
create or replace function private.require_verified_staff()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role in ('reviewer', 'faculty', 'admin') and not private.is_verified(new.id) then
    raise exception 'Only verified accounts can be reviewers or admins. Ask them to verify their email address on their account page first.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Tables faculty can edit. The policy keeps its shape; it asks the new question.
do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('alumni_stories', 'Admins manage alumni stories', 'Faculty and admins manage alumni stories'),
      ('categories', 'Admins manage categories', 'Faculty and admins manage categories'),
      ('contributions', 'Admins manage contributions', 'Faculty and admins manage contributions'),
      ('faculty', 'Admins manage faculty', 'Faculty and admins manage faculty'),
      ('internships', 'Admins manage internships', 'Faculty and admins manage internships'),
      ('organizations', 'Admins manage organizations', 'Faculty and admins manage organizations'),
      ('posts', 'Admins manage posts', 'Faculty and admins manage posts'),
      ('profiles', 'Admins edit profiles', 'Faculty and admins edit profiles'),
      ('project_images', 'Admins manage project photos', 'Faculty and admins manage project photos'),
      ('project_organizations', 'Admins manage project partners', 'Faculty and admins manage project partners'),
      ('projects', 'Admins manage projects', 'Faculty and admins manage projects'),
      ('sub_departments', 'Admins manage sub-departments', 'Faculty and admins manage sub-departments')
    ) as t (tbl, old_name, new_name)
  loop
    execute format(
      'alter policy %I on public.%I using ((select private.can_edit_content())) with check ((select private.can_edit_content()))',
      p.old_name, p.tbl);
    execute format('alter policy %I on public.%I rename to %I', p.old_name, p.tbl, p.new_name);
  end loop;
end;
$$;

-- Role changes stay with admins: guard_profile_changes() and keep_an_admin() are not touched, so a
-- faculty member can edit a student's profile but never anyone's role, their own included.

-- Photos and files -------------------------------------------------------------------------------

create or replace function private.can_manage_media(object_name text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  folders text[] := storage.foldername(object_name);
begin
  if (select auth.uid()) is null or cardinality(folders) < 2 then
    return false;
  end if;

  case folders[1]
    when 'avatars' then
      return folders[2] = (select auth.uid())::text or private.can_edit_content();
    when 'submissions' then
      return folders[2] = (select auth.uid())::text;
    when 'projects', 'posts', 'faculty', 'alumni', 'organizations' then
      return private.can_edit_content();
    else
      return false;
  end case;
end;
$$;

create or replace function private.can_replace_media(object_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.can_manage_media(object_name)
    and (private.can_edit_content() or not private.is_media_in_use(object_name))
$$;

create or replace function private.can_submit_for_project(target_project uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.can_edit_content()
    or exists (
      select 1 from public.projects p
      where p.id = target_project and p.created_by = (select auth.uid())
    )
    or exists (
      select 1 from public.contributions c
      where c.project_id = target_project and c.student_id = (select auth.uid()) and c.can_edit and c.confirmed
    )
$$;

-- The audit log ----------------------------------------------------------------------------------
-- A faculty member's edits are logged like an admin's, under the same admin_* actions; the log
-- entry already names who made the edit.

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
  if current_user = 'authenticated' and not private.can_edit_content() then
    return null;
  end if;
  perform private.log_admin_edit(tg_table_name, tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end;
$$;

create or replace function private.log_admin_edit(tbl text, op text, before_row jsonb, after_row jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  ident text;
  changes jsonb;
  row_now jsonb := coalesce(after_row, before_row);
begin
  if not (private.can_edit_content() or current_setting('role', true) = 'service_role') then
    return;
  end if;
  ident := row_now ->> coalesce(
    (select k from unnest(array['id', 'key', 'user_id', 'year']) k where row_now ? k limit 1), 'id');

  select coalesce(jsonb_object_agg(k, jsonb_build_object(
           'from', private.audit_clip(before_row -> k), 'to', private.audit_clip(after_row -> k))), '{}')
  into changes
  from jsonb_object_keys(row_now) k
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
      || case when tbl <> 'planner_catalogs' and row_now ? 'catalog_year'
              then jsonb_build_object('catalog_year', row_now ->> 'catalog_year') else '{}'::jsonb end
  );
end;
$$;
