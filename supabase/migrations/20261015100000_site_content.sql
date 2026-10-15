-- Editable page text for the staff editor (home page wording, About page, headings, footer).
-- The site ships with default wording; a row here replaces the default for its key.

create table public.site_content (
  key text primary key check (char_length(key) between 1 and 100),
  value text not null check (char_length(value) <= 20000),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.site_content
  for each row execute function private.set_updated_at();

alter table public.site_content enable row level security;

-- New tables start with every privilege for the API roles; keep only what is needed.
revoke all on public.site_content from anon, authenticated;
grant select on public.site_content to anon, authenticated;
grant insert, update, delete on public.site_content to authenticated;

create policy "Site text is public"
  on public.site_content for select to anon, authenticated using (true);
create policy "Admins manage site text"
  on public.site_content for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
