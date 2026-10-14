-- Security hardening from the review of schema v2.
--
--   1. Links must be https:// and emails and phone numbers well-formed, so a profile or project
--      link can't carry a javascript: URL (cross-site scripting).
--   2. Limits on text length, submission size and open submissions, so one account can't flood
--      the review queue or the database.
--   3. A submission waiting for review can only be withdrawn, not edited, so what a reviewer
--      approves is what they saw. Edits happen after a reviewer sends it back.
--   4. Role changes are written to the audit log.
--   5. Internal functions are no longer callable by every database role. Postgres lets anyone
--      execute a new function by default; the writers below run with the owner's rights, so
--      calling them directly would bypass every access rule.

-- 1. Well-formed links, emails and phone numbers ------------------------------------------------
-- Domains are checked wherever a value is converted to them, including when a submission's JSON
-- is validated, so bad links are refused when submitted, not only when approved.

create domain public.https_url as text
  check (value ~* '^https://[^[:space:]]+$' and length(value) <= 500);

create domain public.email_address as text
  check (value ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and length(value) <= 254);

create domain public.phone_number as text
  check (value ~ '^[0-9+(). -]{7,25}$');

alter table public.profiles
  alter column website_url type public.https_url,
  alter column github_url type public.https_url,
  alter column linkedin_url type public.https_url,
  alter column contact_email type public.email_address,
  alter column contact_phone type public.phone_number;

alter table public.projects
  alter column repo_url type public.https_url,
  alter column demo_url type public.https_url,
  alter column poster_url type public.https_url,
  alter column primary_contact_email type public.email_address,
  alter column primary_contact_phone type public.phone_number;

alter table public.organizations alter column url type public.https_url;
alter table public.faculty alter column email type public.email_address;

-- 2. Limits -------------------------------------------------------------------------------------

alter table public.profiles
  add constraint profiles_name_length check (length(name) <= 120),
  add constraint profiles_headline_length check (length(headline) <= 200),
  add constraint profiles_background_length check (length(background) <= 5000),
  add constraint profiles_major_length check (length(major) <= 100),
  add constraint profiles_skills_count check (cardinality(skills) <= 30),
  add constraint profiles_clubs_roles_count check (cardinality(clubs_roles) <= 20);

alter table public.projects
  add constraint projects_slug_length check (length(slug) <= 100),
  add constraint projects_title_length check (length(title) <= 200),
  add constraint projects_summary_length check (length(summary) <= 500),
  add constraint projects_description_length check (length(description) <= 20000),
  add constraint projects_tags_count check (cardinality(tags) <= 20);

alter table public.contributions
  add constraint contributions_role_length check (length(role) <= 100),
  add constraint contributions_term_length check (length(term) <= 50),
  add constraint contributions_external_name_length check (length(external_name) <= 120);

alter table public.project_images
  add constraint project_images_alt_text_length check (length(alt_text) <= 300),
  add constraint project_images_caption_length check (length(caption) <= 500);

alter table public.internships
  add constraint internships_company_length check (length(company) <= 200),
  add constraint internships_term_length check (length(term) <= 50),
  add constraint internships_description_length check (length(description) <= 2000);

alter table public.posts
  add constraint posts_title_length check (length(title) <= 200),
  add constraint posts_summary_length check (length(summary) <= 500),
  add constraint posts_body_length check (length(body) <= 50000);

alter table public.alumni_stories
  add constraint alumni_stories_name_length check (length(name) <= 120),
  add constraint alumni_stories_job_title_length check (length(job_title) <= 200),
  add constraint alumni_stories_employer_length check (length(employer) <= 200),
  add constraint alumni_stories_story_length check (length(story) <= 10000);

alter table public.pending_changes
  add constraint pending_changes_size check (octet_length(proposed_data::text) <= 65536),
  add constraint pending_changes_reason_length check (length(reason) <= 2000);

-- 3. Pending submissions are frozen; plus the open-submission limit ---------------------------

create or replace function private.validate_pending_change()
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
    if (select count(*) from public.pending_changes p
        where p.submitter_id = me and p.status in ('pending', 'changes_requested')) >= 20 then
      raise exception 'You have 20 submissions open already; wait for reviews or withdraw some' using errcode = '54000';
    end if;
  else
    if old.status = 'pending' then
      if new.status <> 'withdrawn' or new.proposed_data is distinct from old.proposed_data then
        raise exception 'A submission waiting for review can only be withdrawn' using errcode = '42501';
      end if;
      return new;
    end if;
    if old.status <> 'changes_requested' then
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

-- 4. Audit role changes -------------------------------------------------------------------------

create function private.audit_role_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.audit('role_changed', 'profile', new.id,
    jsonb_build_object('from', old.role, 'to', new.role));
  return new;
end;
$$;

create trigger audit_role_change after update of role on public.profiles
  for each row when (old.role is distinct from new.role)
  execute function private.audit_role_change();

-- 5. Least privilege for internal functions ----------------------------------------------------
-- Take execute away from everyone, then give back only the helpers that access rules, storage
-- rules and submission checks call while running as the user. Trigger functions need no grant.
-- 01_schema.test.sql fails if anything else in `private` becomes callable again.

revoke execute on all functions in schema private from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema private revoke execute on functions from public;

grant execute on function
  private.current_app_role(),
  private.is_reviewer(),
  private.is_admin(),
  private.has_consent(uuid, public.consent_scope),
  private.is_listed_student(uuid),
  private.can_submit_for_project(uuid),
  private.can_view_project(uuid),
  private.is_project_published(uuid),
  private.is_on_project_team(uuid),
  private.can_manage_media(text),
  private.is_existing_project_photo(uuid, text),
  private.check_submitted_photo(text, uuid),
  private.validate_project_submission(jsonb, uuid),
  private.require_keys_within(jsonb, text[]),
  private.uuid_array(jsonb),
  private.profile_fields(),
  private.project_fields(),
  private.project_link_keys(),
  private.internship_fields()
to anon, authenticated, service_role;
