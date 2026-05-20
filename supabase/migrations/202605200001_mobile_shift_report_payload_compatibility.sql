-- Harden mobile shift report submission payload compatibility and evidence storage.
--
-- Canonical mobile payload keys are snake_case. The submission RPC also accepts
-- legacy camelCase keys from older mobile builds so selected stations do not fail
-- with "station_id is required".

alter table public.fuel_meter_readings
  add column if not exists opening_reading_source text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fuel-meter-evidence',
  'fuel-meter-evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.fuel_storage_meter_evidence_station_id_from_path(path text)
returns uuid
language plpgsql
stable
as $$
declare
  parts text[] := string_to_array(coalesce(path, ''), '/');
  station_text text;
begin
  if array_length(parts, 1) is null then
    return null;
  end if;

  if parts[1] = 'fuel-meter-evidence' then
    station_text := parts[2];
  else
    station_text := parts[1];
  end if;

  if station_text is null or station_text = '' then
    return null;
  end if;

  begin
    return station_text::uuid;
  exception when others then
    return null;
  end;
end;
$$;

create or replace function public.fuel_can_write_meter_evidence_object(path text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  station_id_value uuid := public.fuel_storage_meter_evidence_station_id_from_path(path);
  role_value text := public.fuel_current_role();
begin
  if actor_id is null or station_id_value is null then
    return false;
  end if;

  if role_value in ('Owner', 'Admin') then
    return true;
  end if;

  return exists (
    select 1
    from public.fuel_user_station_assignments a
    where a.user_id = actor_id
      and a.station_id = station_id_value
      and a.is_active = true
  );
end;
$$;

create or replace function public.fuel_can_read_meter_evidence_object(path text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  station_id_value uuid := public.fuel_storage_meter_evidence_station_id_from_path(path);
  role_value text := public.fuel_current_role();
begin
  if actor_id is null or station_id_value is null then
    return false;
  end if;

  if role_value in ('Owner', 'Admin') then
    return true;
  end if;

  return exists (
    select 1
    from public.fuel_user_station_assignments a
    where a.user_id = actor_id
      and a.station_id = station_id_value
      and a.is_active = true
  );
end;
$$;

drop policy if exists fuel_meter_evidence_storage_insert on storage.objects;
create policy fuel_meter_evidence_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'fuel-meter-evidence'
  and public.fuel_can_write_meter_evidence_object(name)
);

drop policy if exists fuel_meter_evidence_storage_update on storage.objects;
create policy fuel_meter_evidence_storage_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'fuel-meter-evidence'
  and public.fuel_can_write_meter_evidence_object(name)
)
with check (
  bucket_id = 'fuel-meter-evidence'
  and public.fuel_can_write_meter_evidence_object(name)
);

drop policy if exists fuel_meter_evidence_storage_read on storage.objects;
create policy fuel_meter_evidence_storage_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'fuel-meter-evidence'
  and public.fuel_can_read_meter_evidence_object(name)
);

create or replace function public.fuel_submit_mobile_shift_report(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.fuel_current_role();
  station_id_value uuid := nullif(trim(coalesce(payload->>'station_id', payload->>'stationId', '')), '')::uuid;
  report_date_value date := coalesce(nullif(trim(coalesce(payload->>'report_date', payload->>'reportDate', '')), '')::date, timezone('utc', now())::date);
  duty_name_value text := coalesce(nullif(trim(coalesce(payload->>'duty_name', payload->>'dutyName', '')), ''), 'Mobile User');
  shift_time_label_value text := coalesce(nullif(trim(coalesce(payload->>'shift_time_label', payload->>'shiftLabel', '')), ''), 'Unspecified Shift');
  meter_items jsonb := coalesce(payload->'meter_readings', payload->'meterReadings', '[]'::jsonb);
  report_id_value uuid;
  meter_item jsonb;
  evidence_row record;
  meter_reading_id uuid;
  pump_id_value uuid;
  pump_label_value text;
  product_code_value text;
  opening_value numeric;
  closing_value numeric;
  calibration_value numeric;
  opening_source_value text;
  opening_photo_path_value text;
  closing_photo_path_value text;
  opening_photo_meta jsonb;
  closing_photo_meta jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if station_id_value is null then
    raise exception 'station_id is required';
  end if;

  if not exists (
    select 1
    from public.fuel_user_station_assignments a
    where a.user_id = actor_id
      and a.station_id = station_id_value
      and a.is_active = true
  ) and actor_role not in ('Owner', 'Admin') then
    raise exception 'User is not assigned to this station';
  end if;

  if jsonb_typeof(meter_items) <> 'array' then
    raise exception 'meter_readings must be an array';
  end if;

  insert into public.fuel_shift_reports (
    station_id,
    report_date,
    duty_name,
    cashier_user_id,
    shift_time_label,
    source,
    status,
    submitted_at,
    created_by,
    updated_by
  ) values (
    station_id_value,
    report_date_value,
    duty_name_value,
    actor_id,
    shift_time_label_value,
    'mobile_submission',
    'submitted',
    now(),
    actor_id,
    actor_id
  ) returning id into report_id_value;

  for meter_item in select value from jsonb_array_elements(meter_items)
  loop
    pump_id_value := nullif(trim(coalesce(meter_item->>'pump_id', meter_item->>'pumpId', '')), '')::uuid;
    pump_label_value := coalesce(nullif(trim(coalesce(meter_item->>'pump_label', meter_item->>'pumpLabel', '')), ''), 'Unknown Pump');
    product_code_value := public.fuel_normalize_product_code(coalesce(nullif(trim(coalesce(meter_item->>'product_code', meter_item->>'productCode', '')), ''), 'OTHER'));
    opening_value := nullif(trim(coalesce(meter_item->>'opening_reading', meter_item->>'openingReading', meter_item->>'before_reading', '')), '')::numeric;
    closing_value := nullif(trim(coalesce(meter_item->>'closing_reading', meter_item->>'closingReading', meter_item->>'after_reading', '')), '')::numeric;
    calibration_value := coalesce(nullif(trim(coalesce(meter_item->>'calibration_liters', meter_item->>'calibrationLiters', '')), '')::numeric, 0);
    opening_source_value := nullif(trim(coalesce(meter_item->>'opening_reading_source', meter_item->>'openingReadingSource', '')), '');
    opening_photo_meta := coalesce(meter_item->'opening_photo', meter_item->'openingPhoto', '{}'::jsonb);
    closing_photo_meta := coalesce(meter_item->'closing_photo', meter_item->'closingPhoto', '{}'::jsonb);
    opening_photo_path_value := nullif(trim(coalesce(
      meter_item->>'opening_photo_path',
      meter_item->>'openingPhotoPath',
      opening_photo_meta->>'storage_path',
      opening_photo_meta->>'storagePath',
      ''
    )), '');
    closing_photo_path_value := nullif(trim(coalesce(
      meter_item->>'closing_photo_path',
      meter_item->>'closingPhotoPath',
      closing_photo_meta->>'storage_path',
      closing_photo_meta->>'storagePath',
      ''
    )), '');

    if opening_value is null then
      raise exception 'opening_reading is required';
    end if;

    if closing_value is null then
      raise exception 'closing_reading is required';
    end if;

    if closing_value < opening_value then
      raise exception 'closing_reading must be greater than or equal to opening_reading';
    end if;

    if opening_photo_path_value is not null
      and public.fuel_storage_meter_evidence_station_id_from_path(opening_photo_path_value) is distinct from station_id_value then
      raise exception 'opening_photo_path must be under station_id';
    end if;

    if closing_photo_path_value is not null
      and public.fuel_storage_meter_evidence_station_id_from_path(closing_photo_path_value) is distinct from station_id_value then
      raise exception 'closing_photo_path must be under station_id';
    end if;

    insert into public.fuel_meter_readings (
      shift_report_id,
      pump_id,
      pump_label_snapshot,
      product_code_snapshot,
      before_reading,
      after_reading,
      calibration_liters,
      source,
      opening_reading_source
    ) values (
      report_id_value,
      pump_id_value,
      pump_label_value,
      product_code_value,
      opening_value,
      closing_value,
      calibration_value,
      'mobile_submission',
      opening_source_value
    ) returning id into meter_reading_id;

    for evidence_row in
      select *
      from (
        values
          ('opening'::text, opening_photo_path_value, opening_photo_meta, opening_value),
          ('closing'::text, closing_photo_path_value, closing_photo_meta, closing_value)
      ) as e(phase, storage_path, photo_meta, confirmed_reading)
      where storage_path is not null
    loop
      insert into public.fuel_meter_photo_evidence (
        shift_report_id,
        station_id,
        pump_id,
        product_code_snapshot,
        phase,
        storage_bucket,
        storage_path,
        original_file_name,
        mime_type,
        file_size_bytes,
        captured_at,
        uploaded_by,
        ocr_status,
        ocr_reading,
        user_confirmed_reading
      ) values (
        report_id_value,
        station_id_value,
        pump_id_value,
        product_code_value,
        evidence_row.phase,
        'fuel-meter-evidence',
        evidence_row.storage_path,
        nullif(coalesce(evidence_row.photo_meta->>'original_file_name', evidence_row.photo_meta->>'originalFileName'), ''),
        nullif(coalesce(evidence_row.photo_meta->>'mime_type', evidence_row.photo_meta->>'mimeType'), ''),
        nullif(coalesce(evidence_row.photo_meta->>'file_size_bytes', evidence_row.photo_meta->>'fileSizeBytes'), '')::bigint,
        nullif(coalesce(evidence_row.photo_meta->>'captured_at', evidence_row.photo_meta->>'capturedAt'), '')::timestamptz,
        actor_id,
        coalesce(nullif(coalesce(evidence_row.photo_meta->>'ocr_status', evidence_row.photo_meta->>'ocrStatus'), ''), 'not_started'),
        nullif(coalesce(evidence_row.photo_meta->>'ocr_reading', evidence_row.photo_meta->>'ocrReading'), '')::numeric,
        coalesce(
          nullif(coalesce(evidence_row.photo_meta->>'user_confirmed_reading', evidence_row.photo_meta->>'userConfirmedReading'), '')::numeric,
          evidence_row.confirmed_reading
        )
      );
    end loop;
  end loop;

  return report_id_value;
end;
$$;

revoke all on function public.fuel_submit_mobile_shift_report(jsonb) from anon;
grant execute on function public.fuel_submit_mobile_shift_report(jsonb) to authenticated;

grant execute on function public.fuel_storage_meter_evidence_station_id_from_path(text) to authenticated;
grant execute on function public.fuel_can_write_meter_evidence_object(text) to authenticated;
grant execute on function public.fuel_can_read_meter_evidence_object(text) to authenticated;

notify pgrst, 'reload schema';

