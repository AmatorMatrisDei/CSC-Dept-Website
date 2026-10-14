-- Runs the carousel function every hour (FR-5.5). The first run after midnight Eastern picks the
-- day's carousel; later runs that day do nothing. Running hourly instead of once at midnight means
-- daylight saving needs no handling and a missed run is retried.
--
-- The job reads two Vault secrets, set once per project (docs/backend-setup.md):
--   carousel_function_url  e.g. https://<project ref>.supabase.co/functions/v1/carousel
--   carousel_cron_secret   the same value as the function's CAROUSEL_CRON_SECRET
-- Until both exist, the job does nothing.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function private.request_carousel_refresh()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  function_url text;
  cron_secret text;
begin
  select decrypted_secret into function_url from vault.decrypted_secrets where name = 'carousel_function_url';
  select decrypted_secret into cron_secret from vault.decrypted_secrets where name = 'carousel_cron_secret';
  if function_url is null or cron_secret is null then
    return;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || cron_secret),
    body := '{"action": "refresh"}'::jsonb
  );
end;
$$;

revoke execute on function private.request_carousel_refresh() from public, anon, authenticated;

select cron.schedule('carousel-refresh', '5 * * * *', 'select private.request_carousel_refresh()');
