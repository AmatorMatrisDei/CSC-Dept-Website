-- Schema v2, part 3 of 4: the review queue and audit log.
-- Follows the Requirements and Team Guide v1.4, section 2.4 and FR-3.1 to FR-3.8.
--
-- Students never write to live tables. They insert a row into pending_changes: a profile, project
-- or internship to create, update or delete, with the proposed values as JSON. The live site
-- doesn't change until a reviewer calls review_change(...) to approve it, which applies the change.
--
--   target     action  meaning                                  proposed_data
--   profile    create  request to be added to the directory     profile fields (FR-3.1)
--   profile    update  edit my profile                          profile fields
--   profile    delete  remove me (hidden at once)               {} (FR-3.2)
--   project    create  submit a new project                     project fields and links
--   project    update  edit a project I can submit for          project fields and links
--   project    delete  remove a project I can submit for        {}
--   internship create / update / delete for my own internships  company, term, description
--
-- Project "links" are optional keys that replace the whole set when present:
--   members:          [{"student_id": uuid} or {"external_name": text}, plus "role", "term", "can_edit"]
--   advisor_ids:      [faculty id, ...]
--   organization_ids: [organization id, ...]
--   images:           [{"storage_path", "alt_text", "caption"}], in display order
-- Students listed by someone else must confirm before they appear (respond_to_listing, FR-3.7).

create type public.change_target as enum ('profile', 'project', 'internship');
create type public.change_action as enum ('create', 'update', 'delete');
create type public.change_status as enum ('pending', 'approved', 'rejected', 'changes_requested', 'withdrawn');

create table public.pending_changes (
  id uuid primary key default gen_random_uuid(),
  submitter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type public.change_target not null,
  action public.change_action not null,
  target_id uuid,
  proposed_data jsonb not null default '{}'::jsonb check (jsonb_typeof(proposed_data) = 'object'),
  status public.change_status not null default 'pending',
  reviewer_id uuid references public.profiles (id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (action = 'create' or target_id is not null)
);

comment on column public.pending_changes.target_id is 'The row changed. For a create, filled in when it is approved.';
comment on column public.pending_changes.reason is 'Required when a reviewer rejects or asks for changes.';

create index pending_changes_queue_idx on public.pending_changes (status, created_at);
create index pending_changes_submitter_idx on public.pending_changes (submitter_id);

create trigger set_updated_at before update on public.pending_changes
  for each row execute function private.set_updated_at();

-- Audit log (FR-3.8) ---------------------------------------------------------------------------
-- Written only by the functions in this file and the carousel. actor_id has no foreign key, so
-- entries survive when an account is deleted.

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target_type text,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_idx on public.audit_log (created_at desc);

create function private.keep_audit_log_append_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'The audit log cannot be changed' using errcode = '42501';
end;
$$;

create trigger keep_audit_log_append_only before update or delete on public.audit_log
  for each row execute function private.keep_audit_log_append_only();

create function private.audit(action text, target_type text, target_id uuid, details jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), action, target_type, target_id, details)
$$;

-- Which fields each kind of submission may set -------------------------------------------------
-- Anything else (role, visible, priority, is_pinned, published, ...) stays with admins.

create function private.profile_fields()
returns text[]
language sql immutable set search_path = ''
as $$
  select array['name', 'headline', 'background', 'major', 'class_year', 'photo_path', 'contact_email',
    'contact_phone', 'website_url', 'github_url', 'linkedin_url', 'skills', 'clubs_roles']
$$;

create function private.project_fields()
returns text[]
language sql immutable set search_path = ''
as $$
  select array['slug', 'title', 'summary', 'description', 'status', 'category_id', 'sub_department_id',
    'date_started', 'date_finished', 'thumbnail_path', 'tags', 'repo_url', 'demo_url', 'poster_url',
    'primary_contact_email', 'primary_contact_phone', 'primary_contact_student_id', 'open_to_contributors']
$$;

create function private.project_link_keys()
returns text[]
language sql immutable set search_path = ''
as $$
  select array['members', 'advisor_ids', 'organization_ids', 'images']
$$;

create function private.internship_fields()
returns text[]
language sql immutable set search_path = ''
as $$
  select array['company', 'term', 'description']
$$;

create function private.uuid_array(value jsonb)
returns uuid[]
language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(element::uuid), '{}') from jsonb_array_elements_text(value) as element
$$;

-- Copies the allowed keys of `data` onto a row, or into a new row, converting types the way
-- jsonb_populate_record does. Table and column names come from the lists above, never from data.
create function private.write_fields(tbl regclass, allowed text[], data jsonb, row_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  assignments text;
begin
  select string_agg(format('%I = r.%I', key, key), ', ') into assignments
  from jsonb_object_keys(data) as key
  where key = any (allowed);

  if assignments is not null then
    execute format('update %s t set %s from jsonb_populate_record(null::%s, $1) r where t.id = $2',
      tbl, assignments, tbl)
    using data, row_id;
  end if;
end;
$$;

create function private.insert_fields(tbl regclass, allowed text[], data jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  columns text;
  new_id uuid;
begin
  select string_agg(format('%I', key), ', ') into columns
  from jsonb_object_keys(data) as key
  where key = any (allowed);

  execute format('insert into %s (%s) select %s from jsonb_populate_record(null::%s, $1) returning id',
    tbl, columns, columns, tbl)
  using data into new_id;
  return new_id;
end;
$$;

-- Validation when a submission is made or edited -----------------------------------------------

create function private.require_keys_within(data jsonb, allowed text[])
returns void
language plpgsql immutable set search_path = ''
as $$
declare
  unknown text;
begin
  select key into unknown from jsonb_object_keys(data) as key where key <> all (allowed) limit 1;
  if unknown is not null then
    raise exception 'Unknown field: %', unknown using errcode = '22023';
  end if;
end;
$$;

create function private.is_existing_project_photo(target_project uuid, path text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.project_images i where i.project_id = target_project and i.storage_path = path)
    or exists (select 1 from public.projects p where p.id = target_project and p.thumbnail_path = path)
$$;

-- A submission may use photos the submitter uploaded to submissions/<their id>/, or photos the
-- project already has.
create function private.check_submitted_photo(path text, target_project uuid)
returns void
language plpgsql stable set search_path = ''
as $$
begin
  if path is null
     or path like 'submissions/' || (select auth.uid())::text || '/%'
     or (target_project is not null and private.is_existing_project_photo(target_project, path)) then
    return;
  end if;
  raise exception 'Upload photos to your own submissions folder first: %', path using errcode = '22023';
end;
$$;

create function private.validate_project_submission(data jsonb, target_project uuid)
returns void
language plpgsql stable set search_path = ''
as $$
declare
  image record;
begin
  perform private.require_keys_within(data, private.project_fields() || private.project_link_keys());
  perform jsonb_populate_record(null::public.projects, data);

  if target_project is null and not (data ?& array['title', 'slug', 'category_id', 'sub_department_id']) then
    raise exception 'A new project needs a title, slug, category_id and sub_department_id' using errcode = '22023';
  end if;

  perform private.check_submitted_photo(data ->> 'thumbnail_path', target_project);

  if data ? 'members' then
    if exists (
      select 1 from jsonb_to_recordset(data -> 'members') as m (student_id uuid, external_name text, role text, term text, can_edit boolean)
      where (m.student_id is null) = (nullif(trim(m.external_name), '') is null)
         or coalesce(trim(m.role), '') = ''
    ) then
      raise exception 'Each member needs a role and either a student_id or an external_name' using errcode = '22023';
    end if;
  end if;

  if data ? 'advisor_ids' then
    perform private.uuid_array(data -> 'advisor_ids');
  end if;
  if data ? 'organization_ids' then
    perform private.uuid_array(data -> 'organization_ids');
  end if;

  if data ? 'images' then
    for image in select * from jsonb_to_recordset(data -> 'images') as m (storage_path text, alt_text text, caption text) loop
      if coalesce(trim(image.alt_text), '') = '' then
        raise exception 'Every photo needs alt text' using errcode = '22023';
      end if;
      perform private.check_submitted_photo(coalesce(image.storage_path, ''), target_project);
    end loop;
  end if;
end;
$$;

create function private.validate_pending_change()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  -- Reviewers act through review_change(), which runs as the table owner and skips these checks.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.reviewer_id is not null or new.reason is not null or new.reviewed_at is not null then
      raise exception 'New submissions start as pending' using errcode = '42501';
    end if;
  else
    if old.status not in ('pending', 'changes_requested') then
      raise exception 'This submission has already been reviewed' using errcode = '42501';
    end if;
    if new.status not in ('pending', 'withdrawn') then
      raise exception 'Submissions can only be resubmitted or withdrawn' using errcode = '42501';
    end if;
    if new.status = 'withdrawn' then
      return new;
    end if;
  end if;

  case new.target_type
    when 'profile' then
      if tg_op = 'INSERT' then
        new.target_id := me;
      end if;
      if new.action = 'delete' then
        new.proposed_data := '{}'::jsonb;
        return new;
      end if;
      if new.action = 'create' and not private.has_consent(me, 'directory') then
        raise exception 'Agree to be listed in the directory before asking to be added' using errcode = '23514';
      end if;
      perform private.require_keys_within(new.proposed_data, private.profile_fields());
      perform jsonb_populate_record(null::public.profiles, new.proposed_data);
      if new.proposed_data ->> 'photo_path' is not null
         and new.proposed_data ->> 'photo_path' not like 'avatars/' || me::text || '/%' then
        raise exception 'Upload your photo to your own avatars folder first' using errcode = '22023';
      end if;
      if new.proposed_data ->> 'photo_path' is not null and not private.has_consent(me, 'photo') then
        raise exception 'Agree to showing your photo before adding one' using errcode = '23514';
      end if;
      if new.proposed_data ->> 'contact_email' is not null and not private.has_consent(me, 'email') then
        raise exception 'Agree to showing your email address before adding one' using errcode = '23514';
      end if;
      if new.proposed_data ->> 'contact_phone' is not null and not private.has_consent(me, 'phone') then
        raise exception 'Agree to showing your phone number before adding one' using errcode = '23514';
      end if;

    when 'project' then
      if new.action = 'create' then
        if new.target_id is not null then
          raise exception 'A new project has no target_id' using errcode = '22023';
        end if;
      elsif not private.can_submit_for_project(new.target_id) then
        raise exception 'You cannot submit changes to this project' using errcode = '42501';
      end if;
      if new.action = 'delete' then
        new.proposed_data := '{}'::jsonb;
      else
        perform private.validate_project_submission(new.proposed_data, new.target_id);
      end if;

    when 'internship' then
      if new.action = 'create' then
        if new.target_id is not null then
          raise exception 'A new internship has no target_id' using errcode = '22023';
        end if;
        if coalesce(trim(new.proposed_data ->> 'company'), '') = '' then
          raise exception 'An internship needs a company' using errcode = '22023';
        end if;
      elsif not exists (select 1 from public.internships i where i.id = new.target_id and i.student_id = me) then
        raise exception 'You can only change your own internships' using errcode = '42501';
      end if;
      if new.action = 'delete' then
        new.proposed_data := '{}'::jsonb;
      else
        perform private.require_keys_within(new.proposed_data, private.internship_fields());
        perform jsonb_populate_record(null::public.internships, new.proposed_data);
      end if;
  end case;

  return new;
end;
$$;

create trigger validate_pending_change before insert or update on public.pending_changes
  for each row execute function private.validate_pending_change();

-- Only proposed_data and status are writable by submitters (see the grants below); this blocks
-- the other columns at the row level too, so the rule holds whatever the grants say.
create function private.freeze_pending_change_fields()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.submitter_id, new.target_type, new.action, new.target_id, new.reviewer_id, new.reason, new.reviewed_at, new.created_at)
         is distinct from (old.submitter_id, old.target_type, old.action, old.target_id, old.reviewer_id, old.reason, old.reviewed_at, old.created_at) then
    raise exception 'Only the proposed data and status of a submission can be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger freeze_pending_change_fields before update on public.pending_changes
  for each row execute function private.freeze_pending_change_fields();

-- A removal request hides the profile straight away (FR-3.2).
create function private.hide_profile_on_removal_request()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.target_type = 'profile' and new.action = 'delete' then
    update public.profiles set visible = false where id = new.submitter_id;
    perform private.audit('removal_requested', 'profile', new.submitter_id, jsonb_build_object('change_id', new.id));
  end if;
  return new;
end;
$$;

create trigger hide_profile_on_removal_request after insert on public.pending_changes
  for each row execute function private.hide_profile_on_removal_request();

-- Applying an approved change ------------------------------------------------------------------

create function private.sync_project_links(target_project uuid, data jsonb, submitter uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if data ? 'members' then
    delete from public.contributions c
    where c.project_id = target_project
      and not exists (
        select 1 from jsonb_to_recordset(data -> 'members') as m (student_id uuid, external_name text, role text)
        where m.student_id is not distinct from c.student_id
          and nullif(trim(m.external_name), '') is not distinct from c.external_name
          and trim(m.role) = c.role
      );

    update public.contributions c set
      term = coalesce(m.term, ''),
      can_edit = coalesce(m.can_edit, false),
      sort_order = m.ordinal - 1
    from rows from (
      jsonb_to_recordset(data -> 'members') as (student_id uuid, external_name text, role text, term text, can_edit boolean)
    ) with ordinality as m (student_id, external_name, role, term, can_edit, ordinal)
    where c.project_id = target_project
      and m.student_id is not distinct from c.student_id
      and nullif(trim(m.external_name), '') is not distinct from c.external_name
      and trim(m.role) = c.role;

    insert into public.contributions (project_id, student_id, external_name, role, term, can_edit, confirmed, sort_order)
    select target_project, m.student_id, nullif(trim(m.external_name), ''), trim(m.role), coalesce(m.term, ''),
      coalesce(m.can_edit, false), m.student_id is null or m.student_id = submitter, m.ordinal - 1
    from rows from (
      jsonb_to_recordset(data -> 'members') as (student_id uuid, external_name text, role text, term text, can_edit boolean)
    ) with ordinality as m (student_id, external_name, role, term, can_edit, ordinal)
    where not exists (
      select 1 from public.contributions c
      where c.project_id = target_project
        and c.student_id is not distinct from m.student_id
        and c.external_name is not distinct from nullif(trim(m.external_name), '')
        and c.role = trim(m.role)
    );
  end if;

  if data ? 'advisor_ids' then
    delete from public.advising a
    where a.project_id = target_project and a.faculty_id <> all (private.uuid_array(data -> 'advisor_ids'));
    insert into public.advising (project_id, faculty_id)
    select target_project, f from unnest(private.uuid_array(data -> 'advisor_ids')) as f
    on conflict do nothing;
  end if;

  if data ? 'organization_ids' then
    delete from public.project_organizations o
    where o.project_id = target_project and o.organization_id <> all (private.uuid_array(data -> 'organization_ids'));
    insert into public.project_organizations (project_id, organization_id)
    select target_project, o from unnest(private.uuid_array(data -> 'organization_ids')) as o
    on conflict do nothing;
  end if;

  if data ? 'images' then
    delete from public.project_images i
    where i.project_id = target_project
      and not exists (
        select 1 from jsonb_to_recordset(data -> 'images') as m (storage_path text)
        where m.storage_path = i.storage_path
      );

    insert into public.project_images (project_id, storage_path, alt_text, caption, sort_order, uploaded_by)
    select target_project, m.storage_path, trim(m.alt_text), coalesce(m.caption, ''), m.ordinal - 1, submitter
    from rows from (
      jsonb_to_recordset(data -> 'images') as (storage_path text, alt_text text, caption text)
    ) with ordinality as m (storage_path, alt_text, caption, ordinal)
    on conflict (storage_path) do update set
      alt_text = excluded.alt_text,
      caption = excluded.caption,
      sort_order = excluded.sort_order
    where project_images.project_id = target_project;
  end if;
end;
$$;

-- Removing a student from the directory: hide them, withdraw every consent (which clears the
-- consent-gated fields), and delete their listings and internships. The account itself stays,
-- so they can ask to be added again.
create function private.remove_student(student uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.consents set revoked_at = now() where student_id = student and revoked_at is null;
  update public.profiles set
    visible = false, headline = '', background = '', major = null, class_year = null,
    website_url = null, github_url = null, linkedin_url = null, skills = '{}', clubs_roles = '{}'
  where id = student;
  delete from public.internships where student_id = student;
  delete from public.contributions where student_id = student;
end;
$$;

create function private.apply_change(change public.pending_changes)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  target uuid := change.target_id;
  data jsonb := change.proposed_data;
begin
  case change.target_type
    when 'profile' then
      target := change.submitter_id;
      if change.action = 'delete' then
        perform private.remove_student(target);
      else
        perform private.write_fields('public.profiles', private.profile_fields(), data, target);
        if change.action = 'create' then
          if not private.has_consent(target, 'directory') then
            raise exception 'The student has withdrawn consent to be listed' using errcode = '23514';
          end if;
          update public.profiles set visible = true where id = target;
        end if;
      end if;

    when 'project' then
      if change.action = 'delete' then
        delete from public.projects where id = target;
      else
        if change.action = 'create' then
          target := private.insert_fields('public.projects', private.project_fields(), data);
          update public.projects set created_by = change.submitter_id, published = true where id = target;
        else
          perform private.write_fields('public.projects', private.project_fields(), data, target);
        end if;
        perform private.sync_project_links(target, data, change.submitter_id);
      end if;

    when 'internship' then
      if change.action = 'delete' then
        delete from public.internships where id = target and student_id = change.submitter_id;
      elsif change.action = 'create' then
        target := private.insert_fields('public.internships', private.internship_fields() || array['student_id'],
          data || jsonb_build_object('student_id', change.submitter_id));
      else
        perform private.write_fields('public.internships', private.internship_fields(), data, target);
      end if;
  end case;

  return target;
end;
$$;

-- What reviewers and students call ---------------------------------------------------------------

-- Approve, reject or send back a pending submission. Approving applies it to the live site.
create function public.review_change(change_id uuid, decision public.change_status, note text default null)
returns public.pending_changes
language plpgsql security definer set search_path = ''
as $$
declare
  change public.pending_changes;
  applied_target uuid;
begin
  if not private.is_reviewer() then
    raise exception 'Only reviewers can review submissions' using errcode = '42501';
  end if;
  if decision not in ('approved', 'rejected', 'changes_requested') then
    raise exception 'A review must approve, reject or request changes' using errcode = '22023';
  end if;

  select * into change from public.pending_changes where id = change_id for update;
  if not found then
    raise exception 'No such submission' using errcode = 'P0002';
  end if;
  if change.status <> 'pending' then
    raise exception 'This submission is not waiting for review' using errcode = '22023';
  end if;
  if change.submitter_id = (select auth.uid()) then
    raise exception 'You cannot review your own submission' using errcode = '42501';
  end if;
  if decision <> 'approved' and coalesce(trim(note), '') = '' then
    raise exception 'Give a reason when rejecting or asking for changes' using errcode = '22023';
  end if;

  if decision = 'approved' then
    applied_target := private.apply_change(change);
  end if;

  update public.pending_changes set
    status = decision,
    reviewer_id = (select auth.uid()),
    reason = nullif(trim(note), ''),
    reviewed_at = now(),
    target_id = coalesce(target_id, applied_target)
  where id = change_id
  returning * into change;

  perform private.audit(
    'submission_' || decision::text, change.target_type::text, change.target_id,
    jsonb_build_object('change_id', change.id, 'action', change.action, 'submitter_id', change.submitter_id, 'reason', change.reason)
  );
  return change;
end;
$$;

-- A student confirms or declines being listed on a project someone else submitted (FR-3.7).
create function public.respond_to_listing(listing_id uuid, accept boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.contributions c where c.id = listing_id and c.student_id = (select auth.uid())
  ) then
    raise exception 'This listing is not yours' using errcode = '42501';
  end if;

  if accept then
    update public.contributions set confirmed = true where id = listing_id;
  else
    delete from public.contributions where id = listing_id;
  end if;
end;
$$;

revoke execute on function public.review_change(uuid, public.change_status, text) from public, anon;
revoke execute on function public.respond_to_listing(uuid, boolean) from public, anon;
grant execute on function public.review_change(uuid, public.change_status, text) to authenticated;
grant execute on function public.respond_to_listing(uuid, boolean) to authenticated;

-- Grants and row level security ----------------------------------------------------------------

revoke all on public.pending_changes, public.audit_log from anon, authenticated;

grant select, insert on public.pending_changes to authenticated;
grant update (proposed_data, status) on public.pending_changes to authenticated;
grant select on public.audit_log to authenticated;
grant all on public.pending_changes, public.audit_log to service_role;

-- Admins edit profiles directly; these columns are new since version 1's grants.
grant update (contact_email, contact_phone, skills, clubs_roles) on public.profiles to authenticated;

alter table public.pending_changes enable row level security;
alter table public.audit_log enable row level security;

create policy "Submitters see their submissions and reviewers see all"
  on public.pending_changes for select to authenticated
  using (submitter_id = (select auth.uid()) or (select private.is_reviewer()));

create policy "Users submit changes as themselves"
  on public.pending_changes for insert to authenticated
  with check (submitter_id = (select auth.uid()));

create policy "Submitters edit or withdraw their own submissions"
  on public.pending_changes for update to authenticated
  using (submitter_id = (select auth.uid()))
  with check (submitter_id = (select auth.uid()));

create policy "Reviewers read the audit log"
  on public.audit_log for select to authenticated
  using ((select private.is_reviewer()));
