-- Mobile shift report evidence + secure submission RPC.

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
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.fuel_meter_photo_evidence (
  id uuid primary key default gen_random_uuid(),
  shift_report_id uuid not null references public.fuel_shift_reports(id) on delete cascade,
  station_id uuid not null references public.fuel_stations(id),
  pump_id uuid references public.fuel_pumps(id),
  product_code_snapshot text not null,
  phase text not null check (phase in ('opening', 'closing')),
  storage_bucket text not null default 'fuel-meter-evidence',
  storage_path text not null,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  captured_at timestamptz,
  uploaded_by uuid not null references auth.users(id),
  ocr_status text not null default 'not_started',
  ocr_reading numeric,
  user_confirmed_reading numeric,
  created_at timestamptz not null default now()
);

create index if not exists idx_fuel_meter_photo_evidence_shift_report on public.fuel_meter_photo_evidence(shift_report_id);
create index if not exists idx_fuel_meter_photo_evidence_station on public.fuel_meter_photo_evidence(station_id);
create index if not exists idx_fuel_meter_photo_evidence_pump_phase on public.fuel_meter_photo_evidence(pump_id, phase);
create unique index if not exists idx_fuel_meter_photo_evidence_unique_phase_per_meter
  on public.fuel_meter_photo_evidence(shift_report_id, coalesce(pump_id, '00000000-0000-0000-0000-000000000000'::uuid), product_code_snapshot, phase);

alter table public.fuel_meter_photo_evidence enable row level security;
revoke all on public.fuel_meter_photo_evidence from anon;
grant select, insert on public.fuel_meter_photo_evidence to authenticated;

drop policy if exists fuel_meter_photo_evidence_insert on public.fuel_meter_photo_evidence;
create policy fuel_meter_photo_evidence_insert on public.fuel_meter_photo_evidence
for insert with check (
  auth.uid() is not null
  and uploaded_by = auth.uid()
  and exists (
    select 1
    from public.fuel_user_station_assignments a
    where a.user_id = auth.uid()
      and a.station_id = fuel_meter_photo_evidence.station_id
      and a.is_active = true
  )
);

drop policy if exists fuel_meter_photo_evidence_select on public.fuel_meter_photo_evidence;
create policy fuel_meter_photo_evidence_select on public.fuel_meter_photo_evidence
for select using (
  auth.uid() is not null
  and (
    coalesce(public.fuel_current_role(), '') in ('Owner', 'Admin')
    or exists (
      select 1
      from public.fuel_user_station_assignments a
      where a.user_id = auth.uid()
        and a.station_id = fuel_meter_photo_evidence.station_id
        and a.is_active = true
    )
  )
);

create or replace function public.fuel_submit_mobile_shift_report(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  station_id_value uuid := nullif(trim(coalesce(payload->>'station_id', '')), '')::uuid;
  report_date_value date := coalesce(nullif(payload->>'report_date', '')::date, timezone('utc', now())::date);
  duty_name_value text := coalesce(nullif(trim(payload->>'duty_name'), ''), 'Mobile User');
  shift_time_label_value text := coalesce(nullif(trim(payload->>'shift_time_label'), ''), 'Unspecified Shift');
  report_id_value uuid;
  meter_row record;
  evidence_row record;
  meter_reading_id uuid;
  before_value numeric;
  after_value numeric;
  reading_source_value fuel_entry_source;
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
    where a.user_id = actor_id and a.station_id = station_id_value and a.is_active = true
  ) and coalesce(public.fuel_current_role(), '') not in ('Owner', 'Admin') then
    raise exception 'User is not assigned to this station';
  end if;

  insert into public.fuel_shift_reports (
    station_id, report_date, duty_name, cashier_user_id, shift_time_label, source, status, submitted_at, created_by, updated_by
  ) values (
    station_id_value, report_date_value, duty_name_value, actor_id, shift_time_label_value, 'mobile_submission', 'submitted', now(), actor_id, actor_id
  ) returning id into report_id_value;

  for meter_row in
    select *
    from jsonb_to_recordset(coalesce(payload->'meter_readings', '[]'::jsonb)) as x(
      pump_id uuid,
      pump_label text,
      product_code text,
      opening_reading numeric,
      closing_reading numeric,
      calibration_liters numeric,
      opening_reading_source text,
      opening_photo_path text,
      closing_photo_path text,
      opening_photo jsonb,
      closing_photo jsonb
    )
  loop
    before_value := coalesce(meter_row.opening_reading, 0);
    after_value := coalesce(meter_row.closing_reading, before_value);

    reading_source_value := case
      when lower(coalesce(meter_row.opening_reading_source, '')) = 'mobile_submission' then 'mobile_submission'::fuel_entry_source
      when lower(coalesce(meter_row.opening_reading_source, '')) = 'excel_import' then 'excel_import'::fuel_entry_source
      else 'web_manual'::fuel_entry_source
    end;

    insert into public.fuel_meter_readings (
      shift_report_id,
      pump_id,
      pump_label_snapshot,
      product_code_snapshot,
      before_reading,
      after_reading,
      calibration_liters,
      source
    ) values (
      report_id_value,
      meter_row.pump_id,
      coalesce(nullif(trim(meter_row.pump_label), ''), 'Unknown Pump'),
      public.fuel_normalize_product_code(coalesce(meter_row.product_code, 'OTHER')),
      before_value,
      after_value,
      coalesce(meter_row.calibration_liters, 0),
      reading_source_value
    ) returning id into meter_reading_id;

    for evidence_row in
      select *
      from (
        values
          ('opening'::text, coalesce(meter_row.opening_photo_path, meter_row.opening_photo->>'storage_path'), meter_row.opening_photo),
          ('closing'::text, coalesce(meter_row.closing_photo_path, meter_row.closing_photo->>'storage_path'), meter_row.closing_photo)
      ) as e(phase, storage_path, photo_meta)
      where nullif(trim(coalesce(storage_path, '')), '') is not null
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
        meter_row.pump_id,
        public.fuel_normalize_product_code(coalesce(meter_row.product_code, 'OTHER')),
        evidence_row.phase,
        coalesce(nullif(evidence_row.photo_meta->>'storage_bucket', ''), 'fuel-meter-evidence'),
        evidence_row.storage_path,
        nullif(evidence_row.photo_meta->>'original_file_name', ''),
        nullif(evidence_row.photo_meta->>'mime_type', ''),
        nullif(evidence_row.photo_meta->>'file_size_bytes', '')::bigint,
        nullif(evidence_row.photo_meta->>'captured_at', '')::timestamptz,
        actor_id,
        coalesce(nullif(evidence_row.photo_meta->>'ocr_status', ''), 'not_started'),
        nullif(evidence_row.photo_meta->>'ocr_reading', '')::numeric,
        nullif(evidence_row.photo_meta->>'user_confirmed_reading', '')::numeric
      );
    end loop;
  end loop;

  return report_id_value;
end;
$$;

revoke all on function public.fuel_submit_mobile_shift_report(jsonb) from anon;
grant execute on function public.fuel_submit_mobile_shift_report(jsonb) to authenticated;
