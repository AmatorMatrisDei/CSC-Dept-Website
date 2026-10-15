-- Reviewers and admins may decide on their own submissions, for example a reviewer updating
-- their own profile. Students still can't: only reviewers and admins call review_change.
-- Self-reviews stay visible: the audit log entry carries "self_review": true.

create or replace function public.review_change(change_id uuid, decision public.change_status, note text default null)
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
    jsonb_build_object('change_id', change.id, 'action', change.action, 'submitter_id', change.submitter_id,
      'reason', change.reason, 'self_review', change.submitter_id = (select auth.uid()))
  );
  return change;
end;
$$;
