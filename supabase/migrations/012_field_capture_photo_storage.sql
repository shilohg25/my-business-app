-- Secure field capture photo storage foundation

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'field-capture-photos',
  'field-capture-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.fuel_storage_capture_session_id_from_path(path text)
returns uuid
language plpgsql
stable
as $$
declare
  parts text[] := string_to_array(coalesce(path, ''), '/');
  capture_session_text text;
begin
  if array_length(parts, 1) is null then
    return null;
  end if;

  if parts[1] = 'field-capture-photos' then
    capture_session_text := parts[3];
  else
    capture_session_text := parts[2];
  end if;

  if capture_session_text is null or capture_session_text = '' then
    return null;
  end if;

  begin
    return capture_session_text::uuid;
  exception when others then
    return null;
  end;
end;
$$;

create or replace function public.fuel_can_insert_capture_photo_object(path text)
returns boolean
language plpgsql
stable
as $$
declare
  actor_id uuid := auth.uid();
  capture_session_id_value uuid := public.fuel_storage_capture_session_id_from_path(path);
begin
  if actor_id is null then
    return false;
  end if;

  if capture_session_id_value is null then
    return false;
  end if;

  return exists (
    select 1
    from public.fuel_shift_capture_sessions s
    where s.id = capture_session_id_value
      and s.status = 'draft'
      and (s.opened_by = actor_id or public.fuel_can_write())
  );
end;
$$;

create or replace function public.fuel_can_read_capture_photo_object(path text)
returns boolean
language plpgsql
stable
as $$
declare
  capture_session_id_value uuid := public.fuel_storage_capture_session_id_from_path(path);
begin
  if not public.fuel_can_read() then
    return false;
  end if;

  if capture_session_id_value is null then
    return false;
  end if;

  return exists (
    select 1
    from public.fuel_shift_capture_sessions s
    where s.id = capture_session_id_value
  );
end;
$$;

drop policy if exists field_capture_photo_storage_insert on storage.objects;
create policy field_capture_photo_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'field-capture-photos'
  and auth.uid() is not null
  and public.fuel_can_insert_capture_photo_object(name)
);

drop policy if exists field_capture_photo_storage_read on storage.objects;
create policy field_capture_photo_storage_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'field-capture-photos'
  and public.fuel_can_read_capture_photo_object(name)
);

drop policy if exists field_capture_photo_storage_update on storage.objects;
create policy field_capture_photo_storage_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'field-capture-photos'
  and public.fuel_can_insert_capture_photo_object(name)
)
with check (
  bucket_id = 'field-capture-photos'
  and public.fuel_can_insert_capture_photo_object(name)
);

create or replace function public.fuel_create_shift_capture_photo_record(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  capture_session_id_value uuid := nullif(payload->>'capture_session_id', '')::uuid;
  photo_type_value text := trim(coalesce(payload->>'photo_type', ''));
  original_file_name_value text := nullif(trim(coalesce(payload->>'original_file_name', '')), '');
  mime_type_value text := nullif(trim(coalesce(payload->>'mime_type', '')), '');
  file_size_bytes_value bigint := coalesce(nullif(payload->>'file_size_bytes', '')::bigint, 0);
  notes_value text := nullif(trim(coalesce(payload->>'notes', '')), '');
  session_row public.fuel_shift_capture_sessions%rowtype;
  photo_row public.fuel_shift_capture_photos%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if capture_session_id_value is null then raise exception 'capture_session_id is required'; end if;
  if photo_type_value = '' then raise exception 'photo_type is required'; end if;

  if photo_type_value not in ('meter_reading','credit_receipt','expense_receipt','fuel_delivery_receipt','cash_count_evidence','other') then
    raise exception 'Invalid photo_type';
  end if;

  select * into session_row
  from public.fuel_shift_capture_sessions s
  where s.id = capture_session_id_value;

  if session_row.id is null then raise exception 'Capture session not found'; end if;
  if session_row.status <> 'draft' then raise exception 'Only draft sessions can accept photos'; end if;
  if session_row.opened_by <> actor_id and not public.fuel_can_write() then raise exception 'Not allowed to upload photo for this draft'; end if;

  insert into public.fuel_shift_capture_photos (
    capture_session_id,
    station_id,
    uploaded_by,
    photo_type,
    original_file_name,
    mime_type,
    file_size_bytes,
    notes,
    ocr_status,
    storage_path
  ) values (
    session_row.id,
    session_row.station_id,
    actor_id,
    photo_type_value,
    original_file_name_value,
    mime_type_value,
    file_size_bytes_value,
    notes_value,
    'not_started',
    null
  ) returning * into photo_row;

  insert into public.fuel_shift_capture_events(capture_session_id, station_id, actor_id, event_type, event_payload)
  values (
    photo_row.capture_session_id,
    photo_row.station_id,
    actor_id,
    'photo_record_created',
    jsonb_build_object(
      'photo_id', photo_row.id,
      'photo_type', photo_row.photo_type
    )
  );

  return jsonb_build_object(
    'photo_id', photo_row.id,
    'station_id', photo_row.station_id,
    'capture_session_id', photo_row.capture_session_id,
    'photo_type', photo_row.photo_type
  );
end;
$$;

grant execute on function public.fuel_create_shift_capture_photo_record(jsonb) to authenticated;

create or replace function public.fuel_attach_shift_capture_photo_storage_path(
  photo_id uuid,
  storage_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  photo_row public.fuel_shift_capture_photos%rowtype;
  session_row public.fuel_shift_capture_sessions%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if photo_id is null then raise exception 'photo_id is required'; end if;
  if nullif(trim(coalesce(storage_path, '')), '') is null then raise exception 'storage_path is required'; end if;
  if storage_path not like 'field-capture-photos/%' then raise exception 'storage_path must start with field-capture-photos/'; end if;

  select * into photo_row
  from public.fuel_shift_capture_photos
  where id = photo_id;

  if photo_row.id is null then raise exception 'Photo record not found'; end if;

  select * into session_row
  from public.fuel_shift_capture_sessions
  where id = photo_row.capture_session_id;

  if session_row.id is null then raise exception 'Capture session not found'; end if;
  if session_row.status <> 'draft' then raise exception 'Only draft sessions can update photo storage path'; end if;
  if photo_row.uploaded_by <> actor_id and not public.fuel_can_write() then raise exception 'Not allowed to attach storage path to this photo'; end if;
  if position(photo_row.capture_session_id::text in storage_path) = 0 then raise exception 'storage_path must include capture_session_id'; end if;

  update public.fuel_shift_capture_photos
  set storage_path = fuel_attach_shift_capture_photo_storage_path.storage_path,
      updated_at = now()
  where id = photo_row.id;

  insert into public.fuel_shift_capture_events(capture_session_id, station_id, actor_id, event_type, event_payload)
  values (
    photo_row.capture_session_id,
    photo_row.station_id,
    actor_id,
    'photo_attached',
    jsonb_build_object(
      'photo_id', photo_row.id,
      'photo_type', photo_row.photo_type,
      'storage_path', storage_path
    )
  );

  return photo_row.id;
end;
$$;

grant execute on function public.fuel_attach_shift_capture_photo_storage_path(uuid, text) to authenticated;
