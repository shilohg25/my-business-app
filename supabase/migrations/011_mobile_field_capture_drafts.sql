-- Mobile field capture draft foundation

create table if not exists public.fuel_shift_capture_sessions (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.fuel_stations(id),
  shift_label text not null,
  report_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'ready_for_review', 'published', 'voided')),
  opened_by uuid not null references auth.users(id),
  opening_confirmed_by uuid references auth.users(id),
  opening_confirmed_at timestamptz,
  closing_confirmed_by uuid references auth.users(id),
  closing_confirmed_at timestamptz,
  previous_session_id uuid references public.fuel_shift_capture_sessions(id),
  draft_payload jsonb not null default '{}'::jsonb,
  calculated_summary jsonb not null default '{}'::jsonb,
  published_shift_report_id uuid references public.fuel_shift_reports(id),
  void_reason text,
  voided_by uuid references auth.users(id),
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fuel_shift_capture_sessions_station_date
on public.fuel_shift_capture_sessions(station_id, report_date desc);

create index if not exists idx_fuel_shift_capture_sessions_opened_by_created
on public.fuel_shift_capture_sessions(opened_by, created_at desc);

create index if not exists idx_fuel_shift_capture_sessions_status
on public.fuel_shift_capture_sessions(status);

create index if not exists idx_fuel_shift_capture_sessions_published_shift_report
on public.fuel_shift_capture_sessions(published_shift_report_id);

create table if not exists public.fuel_shift_capture_photos (
  id uuid primary key default gen_random_uuid(),
  capture_session_id uuid not null references public.fuel_shift_capture_sessions(id) on delete cascade,
  station_id uuid not null references public.fuel_stations(id),
  uploaded_by uuid not null references auth.users(id),
  photo_type text not null check (photo_type in ('meter_reading','credit_receipt','expense_receipt','fuel_delivery_receipt','cash_count_evidence','other')),
  storage_path text,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  ocr_status text not null default 'not_started' check (ocr_status in ('not_started', 'queued', 'processed', 'failed', 'confirmed')),
  ocr_result jsonb not null default '{}'::jsonb,
  ocr_confidence numeric,
  confirmed_value jsonb not null default '{}'::jsonb,
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fuel_shift_capture_photos_session
on public.fuel_shift_capture_photos(capture_session_id);

create index if not exists idx_fuel_shift_capture_photos_station
on public.fuel_shift_capture_photos(station_id);

create table if not exists public.fuel_shift_capture_events (
  id uuid primary key default gen_random_uuid(),
  capture_session_id uuid references public.fuel_shift_capture_sessions(id) on delete cascade,
  station_id uuid references public.fuel_stations(id),
  actor_id uuid references auth.users(id),
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_fuel_shift_capture_events_session_created
on public.fuel_shift_capture_events(capture_session_id, created_at desc);

create index if not exists idx_fuel_shift_capture_events_station_created
on public.fuel_shift_capture_events(station_id, created_at desc);

alter table public.fuel_shift_capture_sessions enable row level security;
alter table public.fuel_shift_capture_photos enable row level security;
alter table public.fuel_shift_capture_events enable row level security;

revoke all on table public.fuel_shift_capture_sessions from anon;
revoke all on table public.fuel_shift_capture_photos from anon;
revoke all on table public.fuel_shift_capture_events from anon;

grant select, insert, update on table public.fuel_shift_capture_sessions to authenticated;
grant select, insert, update on table public.fuel_shift_capture_photos to authenticated;
grant select, insert, update on table public.fuel_shift_capture_events to authenticated;

drop policy if exists fuel_shift_capture_sessions_read on public.fuel_shift_capture_sessions;
create policy fuel_shift_capture_sessions_read on public.fuel_shift_capture_sessions
for select using (public.fuel_can_read());

drop policy if exists fuel_shift_capture_sessions_insert on public.fuel_shift_capture_sessions;
create policy fuel_shift_capture_sessions_insert on public.fuel_shift_capture_sessions
for insert
with check (
  auth.uid() is not null
  and opened_by = auth.uid()
  and public.fuel_can_read()
);

drop policy if exists fuel_shift_capture_sessions_update on public.fuel_shift_capture_sessions;
create policy fuel_shift_capture_sessions_update on public.fuel_shift_capture_sessions
for update
using (
  (
    public.fuel_can_write()
    and status in ('draft', 'ready_for_review', 'published', 'voided')
  )
  or (
    opened_by = auth.uid()
    and status = 'draft'
  )
)
with check (
  (
    public.fuel_can_write()
    and status in ('draft', 'ready_for_review', 'published', 'voided')
  )
  or (
    opened_by = auth.uid()
    and status = 'draft'
  )
);

drop policy if exists fuel_shift_capture_photos_read on public.fuel_shift_capture_photos;
create policy fuel_shift_capture_photos_read on public.fuel_shift_capture_photos
for select using (public.fuel_can_read());

drop policy if exists fuel_shift_capture_photos_insert on public.fuel_shift_capture_photos;
create policy fuel_shift_capture_photos_insert on public.fuel_shift_capture_photos
for insert
with check (
  auth.uid() is not null
  and uploaded_by = auth.uid()
  and exists (
    select 1
    from public.fuel_shift_capture_sessions s
    where s.id = capture_session_id
      and s.status = 'draft'
      and (s.opened_by = auth.uid() or public.fuel_can_write())
  )
);

drop policy if exists fuel_shift_capture_photos_update on public.fuel_shift_capture_photos;
create policy fuel_shift_capture_photos_update on public.fuel_shift_capture_photos
for update
using (
  public.fuel_can_write()
  or exists (
    select 1
    from public.fuel_shift_capture_sessions s
    where s.id = capture_session_id
      and s.status = 'draft'
      and uploaded_by = auth.uid()
  )
)
with check (
  public.fuel_can_write()
  or exists (
    select 1
    from public.fuel_shift_capture_sessions s
    where s.id = capture_session_id
      and s.status = 'draft'
      and uploaded_by = auth.uid()
  )
);

drop policy if exists fuel_shift_capture_events_read on public.fuel_shift_capture_events;
create policy fuel_shift_capture_events_read on public.fuel_shift_capture_events
for select using (public.fuel_can_read());

drop policy if exists fuel_shift_capture_events_insert on public.fuel_shift_capture_events;
create policy fuel_shift_capture_events_insert on public.fuel_shift_capture_events
for insert
with check (auth.uid() is not null);

create or replace function public.fuel_start_shift_capture_session(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  station_id_value uuid := nullif(payload->>'station_id', '')::uuid;
  shift_label_value text := trim(coalesce(payload->>'shift_label', ''));
  report_date_value date := coalesce(nullif(payload->>'report_date', '')::date, current_date);
  previous_session_id_value uuid := nullif(payload->>'previous_session_id', '')::uuid;
  session_id_value uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.fuel_can_read() then raise exception 'Not allowed to read fuel operations'; end if;
  if station_id_value is null then raise exception 'station_id is required'; end if;
  if shift_label_value = '' then raise exception 'shift_label is required'; end if;

  if not exists (
    select 1 from public.fuel_stations s where s.id = station_id_value and coalesce(s.is_active, false) = true
  ) then
    raise exception 'Station not found or inactive';
  end if;

  insert into public.fuel_shift_capture_sessions (
    station_id,
    shift_label,
    report_date,
    opened_by,
    previous_session_id,
    draft_payload
  ) values (
    station_id_value,
    shift_label_value,
    report_date_value,
    actor_id,
    previous_session_id_value,
    jsonb_build_object(
      'meter_readings', '[]'::jsonb,
      'cash_count', '[]'::jsonb,
      'expenses', '[]'::jsonb,
      'credit_receipts', '[]'::jsonb,
      'lubricant_sales', '[]'::jsonb,
      'fuel_deliveries', '[]'::jsonb
    )
  ) returning id into session_id_value;

  insert into public.fuel_shift_capture_events(capture_session_id, station_id, actor_id, event_type, event_payload)
  values (session_id_value, station_id_value, actor_id, 'session_started', jsonb_build_object('shift_label', shift_label_value, 'report_date', report_date_value));

  return session_id_value;
end;
$$;

create or replace function public.fuel_update_shift_capture_draft(
  capture_session_id uuid,
  patch jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  session_row public.fuel_shift_capture_sessions%rowtype;
  patch_value jsonb := coalesce(patch, '{}'::jsonb);
begin
  if actor_id is null then raise exception 'Authentication required'; end if;

  select * into session_row
  from public.fuel_shift_capture_sessions
  where id = capture_session_id;

  if session_row.id is null then raise exception 'Capture session not found'; end if;
  if session_row.status <> 'draft' then raise exception 'Only draft sessions can be updated'; end if;
  if session_row.opened_by <> actor_id and not public.fuel_can_write() then raise exception 'Not allowed to update this draft session'; end if;

  update public.fuel_shift_capture_sessions
  set draft_payload = coalesce(draft_payload, '{}'::jsonb) || patch_value,
      calculated_summary = case when patch_value ? 'calculated_summary' then coalesce(patch_value->'calculated_summary', '{}'::jsonb) else calculated_summary end,
      updated_at = now()
  where id = capture_session_id;

  insert into public.fuel_shift_capture_events(capture_session_id, station_id, actor_id, event_type, event_payload)
  values (capture_session_id, session_row.station_id, actor_id, 'draft_updated', jsonb_build_object('keys', (select coalesce(jsonb_agg(key), '[]'::jsonb) from jsonb_object_keys(patch_value) as key)));

  return capture_session_id;
end;
$$;

create or replace function public.fuel_mark_shift_capture_ready(capture_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  session_row public.fuel_shift_capture_sessions%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;

  select * into session_row
  from public.fuel_shift_capture_sessions
  where id = capture_session_id;

  if session_row.id is null then raise exception 'Capture session not found'; end if;
  if session_row.status <> 'draft' then raise exception 'Only draft sessions can be marked ready'; end if;
  if session_row.opened_by <> actor_id and not public.fuel_can_write() then raise exception 'Not allowed to mark this draft ready'; end if;
  if session_row.station_id is null then raise exception 'station_id is required'; end if;
  if trim(coalesce(session_row.shift_label, '')) = '' then raise exception 'shift_label is required'; end if;
  if not (coalesce(session_row.draft_payload, '{}'::jsonb) ? 'meter_readings') then raise exception 'draft_payload.meter_readings is required'; end if;

  update public.fuel_shift_capture_sessions
  set status = 'ready_for_review',
      closing_confirmed_by = actor_id,
      closing_confirmed_at = now(),
      updated_at = now()
  where id = capture_session_id;

  insert into public.fuel_shift_capture_events(capture_session_id, station_id, actor_id, event_type, event_payload)
  values (capture_session_id, session_row.station_id, actor_id, 'ready_for_review', '{}'::jsonb);

  return capture_session_id;
end;
$$;

create or replace function public.fuel_void_shift_capture_session(
  capture_session_id uuid,
  reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  session_row public.fuel_shift_capture_sessions%rowtype;
  reason_value text := trim(coalesce(reason, ''));
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if reason_value = '' then raise exception 'reason is required'; end if;

  select * into session_row
  from public.fuel_shift_capture_sessions
  where id = capture_session_id;

  if session_row.id is null then raise exception 'Capture session not found'; end if;

  if not (
    (session_row.opened_by = actor_id and session_row.status = 'draft')
    or public.fuel_can_write()
  ) then
    raise exception 'Not allowed to void this session';
  end if;

  update public.fuel_shift_capture_sessions
  set status = 'voided',
      void_reason = reason_value,
      voided_by = actor_id,
      voided_at = now(),
      updated_at = now()
  where id = capture_session_id;

  insert into public.fuel_shift_capture_events(capture_session_id, station_id, actor_id, event_type, event_payload)
  values (capture_session_id, session_row.station_id, actor_id, 'session_voided', jsonb_build_object('reason', reason_value));

  return capture_session_id;
end;
$$;

create or replace function public.fuel_publish_shift_capture_session(capture_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Publishing mobile shift capture is not enabled yet.';
  return capture_session_id;
end;
$$;

grant execute on function public.fuel_start_shift_capture_session(jsonb) to authenticated;
grant execute on function public.fuel_update_shift_capture_draft(uuid, jsonb) to authenticated;
grant execute on function public.fuel_mark_shift_capture_ready(uuid) to authenticated;
grant execute on function public.fuel_void_shift_capture_session(uuid, text) to authenticated;
grant execute on function public.fuel_publish_shift_capture_session(uuid) to authenticated;

notify pgrst, 'reload schema';
