-- Tells reviewers when a submission arrives, and when one comes back after they asked for changes:
-- the database calls the notify-reviewers Edge Function, which posts to the team's chat (#54). The
-- site's own banner reads the queue directly and needs nothing here.
--
-- The call reads two Vault secrets, set once per project (docs/backend-setup.md):
--   notify_function_url  e.g. https://<project ref>.supabase.co/functions/v1/notify-reviewers
--   notify_secret        the same value as the function's NOTIFY_SECRET
-- Until both exist, nothing is sent. pg_net sends the request after the submission commits, so a
-- slow or failing chat never holds up or undoes a submission, and a rolled-back one sends nothing.
--
-- The request carries what kind of submission it is and its project or internship title, never
-- who sent it: chats are outside the university's systems.

create function private.notify_reviewers()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  function_url text;
  secret text;
begin
  select decrypted_secret into function_url from vault.decrypted_secrets where name = 'notify_function_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'notify_secret';
  if function_url is null or secret is null then
    return null;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    body := jsonb_build_object(
      'id', new.id,
      'target_type', new.target_type,
      'action', new.action,
      'title', coalesce(new.proposed_data ->> 'title', new.proposed_data ->> 'company'),
      'resubmitted', tg_op = 'UPDATE'
    )
  );
  return null;
end;
$$;

revoke execute on function private.notify_reviewers() from public, anon, authenticated;

create trigger notify_reviewers_of_submission
  after insert on public.pending_changes
  for each row when (new.status = 'pending')
  execute function private.notify_reviewers();

create trigger notify_reviewers_of_resubmission
  after update of status on public.pending_changes
  for each row when (old.status = 'changes_requested' and new.status = 'pending')
  execute function private.notify_reviewers();
