-- Department events: shown on the home page and the Events page, and kept up to date by editors
-- (admins now, faculty once private.can_edit_site() includes them).
--
-- Times are the clock time at the university, not an instant: an event "at 6:00 pm" is at 6:00 pm
-- for everyone, whatever their own time zone. So a day is a date, and a time is a plain time. An
-- event with no start time lasts all day.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 200),
  event_date date not null,
  end_date date check (end_date is null or end_date >= event_date),
  start_time time,
  end_time time check (end_time is null or start_time is not null),
  place text not null default '' check (length(place) <= 200),
  link_url text check (link_url is null or link_url ~ '^https?://\S{1,255}$'),
  description text not null default '' check (length(description) <= 2000),
  sub_department_id uuid references public.sub_departments (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.events is
  'Department events. event_date, end_date and the times are university clock time; no start_time means all day.';

create index events_date_idx on public.events (event_date, start_time);

-- Text typed by staff is tidied the way page text is, and a title cannot end up empty.
create function private.clean_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.title := private.tidy_text(new.title);
  new.place := private.tidy_text(new.place);
  new.description := private.tidy_text(new.description);
  new.link_url := nullif(private.tidy_text(coalesce(new.link_url, '')), '');
  if new.title = '' then
    raise exception 'An event needs a title' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger clean_event before insert or update on public.events
  for each row execute function private.clean_event();
create trigger set_updated_at before update on public.events
  for each row execute function private.set_updated_at();
create trigger audit_admin_edit after insert or update or delete on public.events
  for each row execute function private.audit_admin_edit();

alter table public.events enable row level security;

create policy "Events are public" on public.events for select to anon, authenticated using (true);
create policy "Editors manage events" on public.events for all to authenticated
  using ((select private.can_edit_site())) with check ((select private.can_edit_site()));

revoke all on public.events from anon, authenticated;
grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;
revoke execute on function private.clean_event() from public, anon, authenticated;
