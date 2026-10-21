-- Account verification: proving that an account's email address belongs to the person using it.
--
-- Sign-ups are confirmed at once, because Supabase's own emails can't reach students, so anyone
-- could create an account with someone else's university address. An account is now verified
-- when its owner signs in with Google or GitHub using that address, or clicks a link we email
-- through Google Firebase (supabase/functions/verify-email and password-reset). Until then it can
-- sign in, browse and save degree plans, but it can't submit anything, give permission to show
-- information, confirm a project listing, or act as a reviewer or admin. Leaving the directory,
-- withdrawing a submission and withdrawing a permission always work. Existing accounts verify
-- once.

create table private.account_verifications (
  user_id uuid primary key references auth.users (id) on delete cascade,
  method text not null check (method in ('google', 'github', 'email', 'admin')),
  verified_at timestamptz not null default now(),
  -- Set when a Google or GitHub sign-in verified an account that already had a password. The
  -- password was removed, because whoever chose it may not own the address.
  password_removed boolean not null default false
);

comment on table private.account_verifications is
  'One row per verified account: how and when its email address was proven. "admin" is a manual verification by the team, with mark_account_verified() and the secret key.';

-- Requests to the verification and password-reset functions: their rate limits, and the proof
-- that a link was asked for before it is accepted.
create table private.verification_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('verify_send', 'verify_check', 'reset_send', 'reset_finish')),
  created_at timestamptz not null default now()
);

create index verification_requests_recent_idx on private.verification_requests (user_id, kind, created_at desc);

-- The Firebase account our functions last made for each account's address. A password reset can
-- only finish on that account, so one someone else made with Firebase's public key never counts.
create table private.firebase_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  firebase_uid text not null,
  created_at timestamptz not null default now()
);

alter table private.account_verifications enable row level security;
alter table private.verification_requests enable row level security;
alter table private.firebase_accounts enable row level security;
revoke all on private.account_verifications, private.verification_requests, private.firebase_accounts
  from public, anon, authenticated;

create function private.is_verified(account uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.account_verifications v where v.user_id = account)
$$;

-- Access rules and the triggers below call it while running as the signed-in user.
grant execute on function private.is_verified(uuid) to authenticated, service_role;

-- Reviewers and admins must be verified too. An existing reviewer or admin regains the role's
-- powers as soon as they verify.
create or replace function private.is_reviewer()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.current_app_role() in ('reviewer', 'admin'), false)
    and private.is_verified((select auth.uid()))
$$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.current_app_role() = 'admin', false)
    and private.is_verified((select auth.uid()))
$$;

-- Only a verified account can be made a reviewer or admin. Making someone a student always works.
create function private.require_verified_staff()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role in ('reviewer', 'admin') and not private.is_verified(new.id) then
    raise exception 'Only verified accounts can be reviewers or admins. Ask them to verify their email address on their account page first.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger require_verified_staff before update of role on public.profiles
  for each row when (old.role is distinct from new.role)
  execute function private.require_verified_staff();

-- Submissions -----------------------------------------------------------------------------------
-- Runs beside validate_pending_change(). Reviewers act through review_change(), which runs as the
-- table owner and skips this.
create function private.require_verified_submitter()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') or new.status <> 'pending' then
    return new;  -- includes every withdrawal
  end if;
  if tg_op = 'UPDATE' and old.status = 'pending' then
    return new;  -- validate_pending_change() allows nothing here except withdrawing
  end if;
  if new.target_type = 'profile' and new.action = 'delete' then
    return new;  -- leaving the directory always works
  end if;
  if not private.is_verified((select auth.uid())) then
    raise exception 'Verify your email address before you submit anything. Your account page shows how.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger require_verified_submitter before insert or update on public.pending_changes
  for each row execute function private.require_verified_submitter();

-- Permissions to show information ----------------------------------------------------------------
-- The policy is the rule; the trigger runs first and says why in words.
create function private.require_verified_consent()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not private.is_verified((select auth.uid())) then
    raise exception 'Verify your email address before you give permission to show your information. Your account page shows how.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger require_verified_consent before insert on public.consents
  for each row execute function private.require_verified_consent();

drop policy "Students grant consent for themselves" on public.consents;

create policy "Verified students grant consent for themselves"
  on public.consents for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and revoked_at is null
    and (select private.is_verified((select auth.uid())))
  );

-- Confirming a project listing puts the student's name on a public page; declining always works.
create or replace function public.respond_to_listing(listing_id uuid, accept boolean)
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
    if not private.is_verified((select auth.uid())) then
      raise exception 'Verify your email address before you confirm a project listing. Your account page shows how.'
        using errcode = '42501';
    end if;
    update public.contributions set confirmed = true where id = listing_id;
  else
    delete from public.contributions where id = listing_id;
  end if;
end;
$$;

-- Google and GitHub sign-in ---------------------------------------------------------------------
-- Both providers only give us an address their owner has verified, so a sign-in with either
-- verifies the account. Supabase joins it to an existing account with the same address. If that
-- account was made with a password and never verified, whoever chose the password may not own
-- the address: remove the password and end the account's sessions, as Supabase itself does for
-- unconfirmed accounts. (With email confirmation off, Supabase treats every account as
-- confirmed, so it doesn't do this for us.) The owner can choose a new password afterwards.
create function private.verify_from_identity()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  had_password boolean;
begin
  if new.provider not in ('google', 'github') or private.is_verified(new.user_id) then
    return new;
  end if;
  select coalesce(u.encrypted_password, '') <> '' into had_password from auth.users u where u.id = new.user_id;
  if had_password then
    update auth.users set encrypted_password = null where id = new.user_id;
    delete from auth.sessions where user_id = new.user_id;
  end if;
  insert into private.account_verifications (user_id, method, password_removed)
  values (new.user_id, new.provider, coalesce(had_password, false))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger verify_from_identity after insert on auth.identities
  for each row execute function private.verify_from_identity();

-- Accounts that already signed in with Google or GitHub.
insert into private.account_verifications (user_id, method, verified_at)
select distinct on (i.user_id) i.user_id, i.provider, coalesce(i.created_at, now())
from auth.identities i
where i.provider in ('google', 'github')
order by i.user_id, i.created_at
on conflict (user_id) do nothing;

-- For the signed-in person ------------------------------------------------------------------------

create function public.my_verification()
returns table (verified boolean, method text, verified_at timestamptz, password_removed boolean)
language sql stable security definer set search_path = ''
as $$
  select v.user_id is not null, v.method, v.verified_at, coalesce(v.password_removed, false)
  from (select (select auth.uid()) as id) me
  left join private.account_verifications v on v.user_id = me.id
  where me.id is not null
$$;

-- The account page explains a removed password until the person sets a new one or dismisses it.
create function public.dismiss_password_notice()
returns void
language sql security definer set search_path = ''
as $$
  update private.account_verifications set password_removed = false where user_id = (select auth.uid())
$$;

revoke execute on function public.my_verification(), public.dismiss_password_notice() from public, anon;
grant execute on function public.my_verification(), public.dismiss_password_notice() to authenticated;

-- The people page shows who is verified, since only they can be promoted. The return type
-- changes, so the function is replaced.
drop function public.list_people();

create function public.list_people()
returns table (id uuid, name text, role public.app_role, email text, verified boolean)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, p.role, u.email::text, private.is_verified(p.id)
  from public.profiles p
  join auth.users u on u.id = p.id
  where (select private.is_admin())
  order by p.name, u.email
$$;

revoke execute on function public.list_people() from public, anon;
grant execute on function public.list_people() to authenticated;

-- For the verify-email and password-reset functions (secret key only) ---------------------------

-- Also how the team verifies someone by hand, e.g. when the emails can't reach them:
--   select public.mark_account_verified('<account id>', 'admin');
create function public.mark_account_verified(account uuid, how text)
returns void
language sql security definer set search_path = ''
as $$
  insert into private.account_verifications (user_id, method) values (account, how)
  on conflict (user_id) do nothing
$$;

create function public.account_is_verified(account uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_verified(account)
$$;

-- The account that signs in with this address, if any.
create function public.account_for_email(address text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(address)) limit 1
$$;

-- Records a request, or returns false without recording it when the account has asked too often:
-- at most `per_day` of a kind in 24 hours, and `gap` apart.
create function public.allow_verification_request(account uuid, request_kind text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  per_day int;
  gap interval;
  recent int;
  latest timestamptz;
begin
  select l.per_day, l.gap into per_day, gap
  from (values
    ('verify_send', 5, interval '1 minute'),
    ('verify_check', 100, interval '2 seconds'),
    ('reset_send', 5, interval '1 minute'),
    ('reset_finish', 10, interval '2 seconds')
  ) as l (kind, per_day, gap)
  where l.kind = request_kind;
  if per_day is null then
    raise exception 'Unknown request kind %', request_kind using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('verification_requests:' || account::text));
  select count(*), max(r.created_at) into recent, latest
  from private.verification_requests r
  where r.user_id = account and r.kind = request_kind and r.created_at > now() - interval '1 day';
  if recent >= per_day or latest > now() - gap then
    return false;
  end if;

  delete from private.verification_requests r where r.user_id = account and r.created_at < now() - interval '7 days';
  insert into private.verification_requests (user_id, kind) values (account, request_kind);
  return true;
end;
$$;

-- When the account last made this kind of request (kept for 7 days).
create function public.latest_verification_request(account uuid, request_kind text)
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select max(r.created_at) from private.verification_requests r
  where r.user_id = account and r.kind = request_kind
$$;

create function public.remember_firebase_account(account uuid, uid text)
returns void
language sql security definer set search_path = ''
as $$
  insert into private.firebase_accounts (user_id, firebase_uid) values (account, uid)
  on conflict (user_id) do update set firebase_uid = excluded.firebase_uid, created_at = now()
$$;

create function public.firebase_account_for(account uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select f.firebase_uid from private.firebase_accounts f where f.user_id = account
$$;

-- After a password reset: the person proved they read the account's email, so the account is
-- verified, and every earlier sign-in ends in case someone else had the old password.
create function public.complete_password_reset(account uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from auth.sessions where user_id = account;
  insert into private.account_verifications (user_id, method) values (account, 'email')
  on conflict (user_id) do nothing;
$$;

revoke execute on function
  public.mark_account_verified(uuid, text),
  public.remember_firebase_account(uuid, text),
  public.firebase_account_for(uuid),
  public.account_is_verified(uuid),
  public.account_for_email(text),
  public.allow_verification_request(uuid, text),
  public.latest_verification_request(uuid, text),
  public.complete_password_reset(uuid)
from public, anon, authenticated;

grant execute on function
  public.mark_account_verified(uuid, text),
  public.remember_firebase_account(uuid, text),
  public.firebase_account_for(uuid),
  public.account_is_verified(uuid),
  public.account_for_email(text),
  public.allow_verification_request(uuid, text),
  public.latest_verification_request(uuid, text),
  public.complete_password_reset(uuid)
to service_role;
