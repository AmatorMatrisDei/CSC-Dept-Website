-- Page text editing, step one: only known keys, tidy values, drafts that are published together,
-- and a history of every replaced value.
--
-- Who may edit page text is decided in one place, private.can_edit_site(). Faculty get the same
-- access once that role exists: add it to this function and nothing else changes.

create function private.can_edit_site()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_admin()
$$;

-- Keys and values ---------------------------------------------------------------------------------

-- Removes control characters (keeping line breaks and tabs) and spaces at the ends.
create function private.tidy_text(value text)
returns text
language sql immutable set search_path = ''
as $$
  select btrim(regexp_replace(value, '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'))
$$;

-- Keys ending in ".items" hold a list: a JSON array of {title, text, url}. Anything else in an
-- item is dropped, a url must be a web address or a path on this site, and the list is capped.
create function private.clean_site_list(raw text)
returns text
language plpgsql stable set search_path = ''
as $$
declare
  parsed jsonb;
  item jsonb;
  cleaned jsonb := '[]'::jsonb;
  item_title text;
  item_text text;
  item_url text;
begin
  begin
    parsed := raw::jsonb;
  exception when others then
    raise exception 'A list must be a JSON array' using errcode = '23514';
  end;
  if jsonb_typeof(parsed) <> 'array' or jsonb_array_length(parsed) > 30 then
    raise exception 'A list must be an array of at most 30 items' using errcode = '23514';
  end if;
  for item in select * from jsonb_array_elements(parsed) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Each list item must be an object' using errcode = '23514';
    end if;
    item_title := left(private.tidy_text(coalesce(item ->> 'title', '')), 120);
    item_text := left(private.tidy_text(coalesce(item ->> 'text', '')), 2000);
    item_url := private.tidy_text(coalesce(item ->> 'url', ''));
    -- A site address, or a path on this site. "//host" and "/\host" would leave the site.
    if item_url !~ '^(https?://[^[:space:]]{1,255}|/([^/\\[:space:]][^[:space:]]{0,254})?)$' then
      item_url := '';
    end if;
    cleaned := cleaned || jsonb_build_array(jsonb_build_object('title', item_title, 'text', item_text, 'url', item_url));
  end loop;
  return cleaned::text;
end;
$$;

-- A page can only use keys that start with one of its section names.
create function private.clean_site_text()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.key !~ '^(home|about|students|faculty|projects|footer)\.[a-z0-9][a-z0-9._-]{0,80}$' then
    raise exception 'Unknown page text "%"', new.key using errcode = '23514';
  end if;
  if new.key like '%.items' then
    new.value := private.clean_site_list(new.value);
  else
    new.value := private.tidy_text(new.value);
    if new.value = '' then
      raise exception 'Page text cannot be empty. Remove the edit to go back to the default wording.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger clean_site_text before insert or update of key, value on public.site_content
  for each row execute function private.clean_site_text();

-- History -----------------------------------------------------------------------------------------

create table public.site_content_history (
  id bigint generated always as identity primary key,
  key text not null,
  value text not null,
  replaced_at timestamptz not null default now(),
  replaced_by uuid references public.profiles (id) on delete set null
);
create index site_content_history_key on public.site_content_history (key, replaced_at desc);

alter table public.site_content_history enable row level security;
revoke all on public.site_content_history from anon, authenticated;
grant select on public.site_content_history to authenticated;
create policy "Editors read the history"
  on public.site_content_history for select to authenticated using ((select private.can_edit_site()));

-- Keeps the value being replaced or deleted, however the change was made.
create function private.keep_site_text_history()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or new.value is distinct from old.value then
    insert into public.site_content_history (key, value, replaced_by)
    values (old.key, old.value, (select auth.uid()));
  end if;
  return null;
end;
$$;

create trigger keep_history after update or delete on public.site_content
  for each row execute function private.keep_site_text_history();

-- Drafts ------------------------------------------------------------------------------------------

-- Changes waiting to be published. base_updated_at is when the live text was last changed at the
-- time the draft was started, so publishing can tell if someone else changed it in the meantime.
create table public.site_content_draft (
  key text primary key,
  value text not null check (char_length(value) <= 20000),
  base_updated_at timestamptz,
  edited_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger clean_site_text before insert or update of key, value on public.site_content_draft
  for each row execute function private.clean_site_text();

alter table public.site_content_draft enable row level security;
revoke all on public.site_content_draft from anon, authenticated;
grant select on public.site_content_draft to authenticated;
create policy "Editors read drafts"
  on public.site_content_draft for select to authenticated using ((select private.can_edit_site()));

-- seen_updated_at is the updated_at of the live text as the editor saw it (null if they saw
-- the default wording). The oldest one seen is kept, and publishing compares it with the live
-- text, so a change someone else made in between is never silently overwritten, even when a
-- second editor started from a stale copy.
create function public.save_site_draft(draft_key text, draft_value text, seen_updated_at timestamptz default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.can_edit_site() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.site_content_draft (key, value, base_updated_at, edited_by)
  values (draft_key, draft_value, seen_updated_at, (select auth.uid()))
  on conflict (key) do update
    set value = excluded.value, edited_by = excluded.edited_by, updated_at = now(),
        base_updated_at = case when public.site_content_draft.base_updated_at is null then null
          else least(public.site_content_draft.base_updated_at, excluded.base_updated_at) end;
end;
$$;

-- Publishes drafts (all of them, or just the given keys) in one step. If the live text of any of
-- them changed after the draft was started, nothing is published and those keys are returned.
-- The rows involved are locked, so two people publishing at once take turns, and a draft saved
-- while this runs is never lost: it waits, then becomes a new draft.
create function public.publish_site_drafts(only_keys text[] default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  conflicts text[];
  done int;
  locked_keys text[] := '{}'::text[];
  k text;
begin
  if not private.can_edit_site() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  -- Lock the drafts first, and only ever publish or delete the ones locked here.
  for k in select d.key from public.site_content_draft d
    where only_keys is null or d.key = any (only_keys)
    order by d.key for update loop
    locked_keys := locked_keys || k;
  end loop;

  perform 1 from public.site_content c where c.key = any (locked_keys) order by c.key for update;

  -- Live text that changed (or appeared) since the draft was started.
  select coalesce(array_agg(d.key order by d.key), '{}') into conflicts
  from public.site_content_draft d
  join public.site_content c on c.key = d.key
  where d.key = any (locked_keys)
    and c.updated_at is distinct from d.base_updated_at;

  if cardinality(conflicts) > 0 then
    return jsonb_build_object('published', 0, 'conflicts', to_jsonb(conflicts));
  end if;

  with taken as (
    delete from public.site_content_draft d
    where d.key = any (locked_keys)
    returning d.key, d.value
  )
  insert into public.site_content (key, value)
  select key, value from taken
  on conflict (key) do update set value = excluded.value;
  get diagnostics done = row_count;

  perform private.audit('site_text_published', 'site_content', null, jsonb_build_object('count', done, 'keys', only_keys));
  return jsonb_build_object('published', done, 'conflicts', '[]'::jsonb);
end;
$$;

create function public.discard_site_drafts(only_keys text[] default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  done int;
begin
  if not private.can_edit_site() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  delete from public.site_content_draft where only_keys is null or key = any (only_keys);
  get diagnostics done = row_count;
  return done;
end;
$$;

-- Puts an earlier value back as a draft, so it can be looked over and published like any edit.
create function public.restore_site_text(history_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  old_row public.site_content_history;
begin
  if not private.can_edit_site() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into old_row from public.site_content_history where id = history_id;
  if not found then
    raise exception 'That version no longer exists' using errcode = 'P0002';
  end if;
  perform public.save_site_draft(old_row.key, old_row.value,
    (select c.updated_at from public.site_content c where c.key = old_row.key));
end;
$$;

revoke execute on function public.save_site_draft(text, text, timestamptz), public.publish_site_drafts(text[]),
  public.discard_site_drafts(text[]), public.restore_site_text(bigint) from public, anon;
grant execute on function public.save_site_draft(text, text, timestamptz), public.publish_site_drafts(text[]),
  public.discard_site_drafts(text[]), public.restore_site_text(bigint) to authenticated;
revoke execute on function private.can_edit_site(), private.clean_site_text(), private.keep_site_text_history(),
  private.tidy_text(text), private.clean_site_list(text)
  from public, anon, authenticated;
grant execute on function private.can_edit_site() to authenticated;

-- Writes to the live table now go through the same rule.
drop policy "Admins manage site text" on public.site_content;
create policy "Editors manage site text"
  on public.site_content for all to authenticated
  using ((select private.can_edit_site())) with check ((select private.can_edit_site()));
