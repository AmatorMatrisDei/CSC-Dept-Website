-- The people page for admins: everyone with an account, with the email they signed up with.
-- Sign-up emails live in the auth schema, which the API can't read, so this function reads them
-- and returns nothing unless the caller is an admin.

create function public.list_people()
returns table (id uuid, name text, role public.app_role, email text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, p.role, u.email::text
  from public.profiles p
  join auth.users u on u.id = p.id
  where (select private.is_admin())
  order by p.name, u.email
$$;

revoke execute on function public.list_people() from public, anon;
grant execute on function public.list_people() to authenticated;
