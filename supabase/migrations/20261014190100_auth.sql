-- Accounts: who may sign up, and the profile row every account gets.

-- Email domains allowed to create accounts. Subdomains are allowed too, so `franciscan.edu`
-- also admits `student.franciscan.edu`. Add more with an INSERT in a new migration.
create table private.allowed_email_domains (
  domain text primary key check (domain = lower(domain))
);

insert into private.allowed_email_domains (domain) values ('franciscan.edu');

-- Supabase Auth calls this before creating any user. Enabled locally in supabase/config.toml;
-- on the hosted project it is enabled under Authentication > Hooks (see docs/backend-setup.md).
create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  email_domain text := lower(split_part(event -> 'user' ->> 'email', '@', 2));
begin
  if exists (
    select 1 from private.allowed_email_domains d
    where email_domain = d.domain or email_domain like '%.' || d.domain
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Please sign up with your Franciscan University email address.'
  ));
end;
$$;

grant usage on schema private to supabase_auth_admin;
grant select on private.allowed_email_domains to supabase_auth_admin;
grant execute on function public.hook_before_user_created to supabase_auth_admin;
revoke execute on function public.hook_before_user_created from authenticated, anon, public;

-- Every new account gets a private student profile. Names come from the sign-up form's
-- `full_name`, or from the identity provider's `name` (e.g. Microsoft sign-in).
create function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1),
      ''
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
