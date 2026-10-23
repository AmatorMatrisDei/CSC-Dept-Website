-- Grouping the history by publish, and undoing one record draft at a time.
--
-- Everything one Publish replaces is written in a single transaction, so the transaction id is a
-- ready-made "which publish was this" label. The three history tables record it; the History
-- panel groups its entries by it. Entries from before this change have no label (null) and are
-- grouped by the time they were written instead.

alter table public.site_content_history add column batch bigint;
alter table public.record_history add column batch bigint;
alter table public.record_photo_history add column batch bigint;

alter table public.site_content_history alter column batch set default txid_current();
alter table public.record_history alter column batch set default txid_current();
alter table public.record_photo_history alter column batch set default txid_current();

-- Undo for one or more record drafts ("projects/campus-robot"), or all of them when none are
-- named. The old no-argument call keeps working. Returns the photo files the discarded drafts
-- added that nothing uses, for the site to delete.
drop function public.discard_record_drafts();

create function public.discard_record_drafts(only_rows text[] default null)
returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  locked public.record_draft[] := '{}';
  candidates text[] := '{}'::text[];
  r public.record_draft;
begin
  if not private.can_edit_site() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  for r in select * from public.record_draft
    where only_rows is null or (table_name || '/' || row_slug) = any (only_rows)
    order by table_name, row_slug for update loop
    locked := locked || r;
    candidates := candidates
      || array(select g ->> 'path' from jsonb_array_elements(coalesce(r.gallery, '[]'::jsonb)) g)
      || array[r.patch ->> 'thumbnail_path', r.patch ->> 'photo_path'];
  end loop;
  delete from public.record_draft d using unnest(locked) as l
  where d.table_name = l.table_name and d.row_slug = l.row_slug;
  return private.unused_files(candidates);
end;
$$;

revoke execute on function public.discard_record_drafts(text[]) from public, anon;
grant execute on function public.discard_record_drafts(text[]) to authenticated;
