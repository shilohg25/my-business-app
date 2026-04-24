-- AKY Fuel Operations schema
-- Designed for a shared Supabase database. Uses fuel_* prefix to avoid collisions.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'fuel_entry_source') then
    create type fuel_entry_source as enum ('web_manual', 'excel_import', 'mobile_submission');
  end if;
  if not exists (select 1 from pg_type where typname = 'fuel_shift_status') then
    create type fuel_shift_status as enum ('draft', 'submitted', 'reviewed', 'approved', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'fuel_stock_movement_type') then
    create type fuel_stock_movement_type as enum ('purchase', 'transfer_in', 'transfer_out', 'sale', 'adjustment', 'return');
  end if;
end $$;

create table if not exists public.fuel_stations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  official_report_header text,
  logo_storage_path text,
  address text,
  is_active boolean not null default true,
  archived_at timestamptz,
  archived_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fuel_station_profiles (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.fuel_stations(id) on delete cascade,
  effective_from date not null default current_date,
  report_header text,
  tin text,
  business_permit text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.fuel_shift_templates (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.fuel_stations(id) on delete cascade,
  name text not null,
  start_time time,
  end_time time,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_fuel_shift_templates_station_name
  on public.fuel_shift_templates(station_id, name);

create table if not exists public.fuel_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  unit text not null default 'liter',
  is_fuel boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.fuel_station_products (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.fuel_stations(id) on delete cascade,
  product_id uuid not null references public.fuel_products(id),
  is_active boolean not null default true,
  unique (station_id, product_id)
);

create table if not exists public.fuel_prices (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.fuel_stations(id) on delete cascade,
  product_id uuid not null references public.fuel_products(id),
  price numeric(12,4) not null check (price >= 0),
  effective_at timestamptz not null default now(),
  source text not null default 'manual',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.fuel_pumps (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.fuel_stations(id) on delete cascade,
  pump_label text not null,
  display_order int not null default 0,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (station_id, pump_label)
);

create table if not exists public.fuel_pump_product_assignments (
  id uuid primary key default gen_random_uuid(),
  pump_id uuid not null references public.fuel_pumps(id) on delete cascade,
  product_id uuid not null references public.fuel_products(id),
  nozzle_label text,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  is_active boolean not null default true
);

create table if not exists public.fuel_shift_reports (
  id uuid primary key default gen_random_uuid(),
  station_id uuid references public.fuel_stations(id),
  shift_template_id uuid references public.fuel_shift_templates(id),
  report_date date not null,
  duty_name text not null,
  cashier_user_id uuid references auth.users(id),
  shift_time_label text not null,
  source fuel_entry_source not null default 'web_manual',
  status fuel_shift_status not null default 'draft',
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  calculated_totals jsonb not null default '{}'::jsonb,
  discrepancy_amount numeric(14,4) not null default 0,
  edit_reason text,
  imported_batch_id uuid,
  archived_at timestamptz,
  archived_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fuel_meter_readings (
  id uuid primary key default gen_random_uuid(),
  shift_report_id uuid not null references public.fuel_shift_reports(id) on delete cascade,
  pump_id uuid references public.fuel_pumps(id),
  pump_label_snapshot text not null,
  product_id uuid references public.fuel_products(id),
  product_code_snapshot text not null,
  before_reading numeric(14,4) not null,
  after_reading numeric(14,4) not null,
  liters_sold numeric(14,4) generated always as (after_reading - before_reading) stored,
  calibration_liters numeric(14,4) not null default 0,
  source fuel_entry_source not null default 'web_manual',
  created_at timestamptz not null default now()
);

create table if not exists public.fuel_credit_receipts (
  id uuid primary key default gen_random_uuid(),
  shift_report_id uuid not null references public.fuel_shift_reports(id) on delete cascade,
  product_id uuid references public.fuel_products(id),
  product_code_snapshot text not null,
  customer_id uuid references public.customers(id) on delete set null,
  company_name text not null,
  external_reference text,
  receipt_number text,
  liters numeric(14,4) not null,
  amount numeric(14,4),
  attachment_path text,
  source fuel_entry_source not null default 'web_manual',
  created_at timestamptz not null default now()
);

create table if not exists public.fuel_expenses (
  id uuid primary key default gen_random_uuid(),
  shift_report_id uuid not null references public.fuel_shift_reports(id) on delete cascade,
  category text,
  description text not null,
  amount numeric(14,4) not null,
  receipt_reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.fuel_cash_counts (
  id uuid primary key default gen_random_uuid(),
  shift_report_id uuid not null references public.fuel_shift_reports(id) on delete cascade,
  denomination numeric(12,2) not null,
  quantity numeric(12,2) not null default 0,
  amount numeric(14,4) not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.fuel_lubricant_products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  unit text not null default 'piece',
  default_unit_price numeric(12,4) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.fuel_lubricant_sales (
  id uuid primary key default gen_random_uuid(),
  shift_report_id uuid not null references public.fuel_shift_reports(id) on delete cascade,
  lubricant_product_id uuid references public.fuel_lubricant_products(id),
  product_name_snapshot text not null,
  quantity numeric(14,4) not null,
  unit_price numeric(12,4) not null,
  amount numeric(14,4) generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.fuel_station_lubricant_inventory (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.fuel_stations(id) on delete cascade,
  lubricant_product_id uuid not null references public.fuel_lubricant_products(id),
  quantity_on_hand numeric(14,4) not null default 0,
  reorder_level numeric(14,4) not null default 0,
  updated_at timestamptz not null default now(),
  unique (station_id, lubricant_product_id)
);

create table if not exists public.fuel_warehouse_lubricant_inventory (
  id uuid primary key default gen_random_uuid(),
  lubricant_product_id uuid not null references public.fuel_lubricant_products(id),
  quantity_on_hand numeric(14,4) not null default 0,
  reorder_level numeric(14,4) not null default 0,
  updated_at timestamptz not null default now(),
  unique (lubricant_product_id)
);

create table if not exists public.fuel_lubricant_stock_movements (
  id uuid primary key default gen_random_uuid(),
  lubricant_product_id uuid not null references public.fuel_lubricant_products(id),
  movement_type fuel_stock_movement_type not null,
  quantity numeric(14,4) not null,
  from_station_id uuid references public.fuel_stations(id),
  to_station_id uuid references public.fuel_stations(id),
  shift_report_id uuid references public.fuel_shift_reports(id),
  reference text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.fuel_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_file_name text not null,
  source_file_hash text,
  parser_version text not null,
  status text not null default 'previewed',
  warnings jsonb not null default '[]'::jsonb,
  parsed_payload jsonb not null default '{}'::jsonb,
  committed_report_id uuid references public.fuel_shift_reports(id),
  imported_by uuid references auth.users(id),
  imported_at timestamptz not null default now()
);

do $$
begin
  alter table public.fuel_shift_reports
    add constraint fuel_shift_reports_imported_batch_fk
    foreign key (imported_batch_id) references public.fuel_import_batches(id) deferrable initially deferred;
exception when duplicate_object then null;
end $$;

create table if not exists public.fuel_report_exports (
  id uuid primary key default gen_random_uuid(),
  shift_report_id uuid references public.fuel_shift_reports(id),
  report_type text not null,
  export_format text not null,
  storage_path text,
  exported_by uuid references auth.users(id),
  exported_at timestamptz not null default now()
);

create index if not exists idx_fuel_shift_reports_date on public.fuel_shift_reports(report_date desc);
create index if not exists idx_fuel_shift_reports_station on public.fuel_shift_reports(station_id, report_date desc);
create index if not exists idx_fuel_meter_readings_report on public.fuel_meter_readings(shift_report_id);
create index if not exists idx_fuel_credit_receipts_report on public.fuel_credit_receipts(shift_report_id);
create index if not exists idx_fuel_prices_station_product on public.fuel_prices(station_id, product_id, effective_at desc);
-- Role helpers and RLS policies.

create or replace function public.fuel_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'User')
$$;

create or replace function public.fuel_can_read()
returns boolean
language sql
stable
as $$
  select public.fuel_current_role() in ('Owner', 'Co-Owner', 'Admin', 'User')
$$;

create or replace function public.fuel_can_write()
returns boolean
language sql
stable
as $$
  select public.fuel_current_role() in ('Owner', 'Admin')
$$;

create or replace function public.fuel_is_owner()
returns boolean
language sql
stable
as $$
  select public.fuel_current_role() = 'Owner'
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_fuel_stations_updated_at on public.fuel_stations;
create trigger trg_fuel_stations_updated_at
before update on public.fuel_stations
for each row execute function public.touch_updated_at();

drop trigger if exists trg_fuel_shift_reports_updated_at on public.fuel_shift_reports;
create trigger trg_fuel_shift_reports_updated_at
before update on public.fuel_shift_reports
for each row execute function public.touch_updated_at();

create or replace function public.require_admin_edit_reason()
returns trigger
language plpgsql
as $$
begin
  if public.fuel_current_role() = 'Admin'
     and tg_op = 'UPDATE'
     and coalesce(new.edit_reason, '') = '' then
    raise exception 'Admin edits require edit_reason.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fuel_shift_reports_admin_edit_reason on public.fuel_shift_reports;
create trigger trg_fuel_shift_reports_admin_edit_reason
before update on public.fuel_shift_reports
for each row execute function public.require_admin_edit_reason();

-- Existing public.audit_logs table is reused. Add fallback if it does not exist.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  action_type text not null,
  entity_type text not null,
  entity_id text,
  details text,
  explanation text,
  old_snapshot jsonb,
  new_snapshot jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.write_fuel_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role_value text;
begin
  actor_role_value := public.fuel_current_role();

  insert into public.audit_logs (
    actor_id,
    actor_role,
    action_type,
    entity_type,
    entity_id,
    details,
    old_snapshot,
    new_snapshot
  )
  values (
    auth.uid(),
    actor_role_value,
    lower(tg_op),
    tg_table_name,
    coalesce(new.id::text, old.id::text),
    'fuel_ops automatic row audit',
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_fuel_shift_reports_audit on public.fuel_shift_reports;
create trigger trg_fuel_shift_reports_audit
after insert or update on public.fuel_shift_reports
for each row execute function public.write_fuel_audit();

alter table public.fuel_stations enable row level security;
alter table public.fuel_station_profiles enable row level security;
alter table public.fuel_shift_templates enable row level security;
alter table public.fuel_products enable row level security;
alter table public.fuel_station_products enable row level security;
alter table public.fuel_prices enable row level security;
alter table public.fuel_pumps enable row level security;
alter table public.fuel_pump_product_assignments enable row level security;
alter table public.fuel_shift_reports enable row level security;
alter table public.fuel_meter_readings enable row level security;
alter table public.fuel_credit_receipts enable row level security;
alter table public.fuel_expenses enable row level security;
alter table public.fuel_cash_counts enable row level security;
alter table public.fuel_lubricant_products enable row level security;
alter table public.fuel_lubricant_sales enable row level security;
alter table public.fuel_station_lubricant_inventory enable row level security;
alter table public.fuel_warehouse_lubricant_inventory enable row level security;
alter table public.fuel_lubricant_stock_movements enable row level security;
alter table public.fuel_import_batches enable row level security;
alter table public.fuel_report_exports enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'fuel_stations',
    'fuel_station_profiles',
    'fuel_shift_templates',
    'fuel_products',
    'fuel_station_products',
    'fuel_prices',
    'fuel_pumps',
    'fuel_pump_product_assignments',
    'fuel_shift_reports',
    'fuel_meter_readings',
    'fuel_credit_receipts',
    'fuel_expenses',
    'fuel_cash_counts',
    'fuel_lubricant_products',
    'fuel_lubricant_sales',
    'fuel_station_lubricant_inventory',
    'fuel_warehouse_lubricant_inventory',
    'fuel_lubricant_stock_movements',
    'fuel_import_batches',
    'fuel_report_exports'
  ]
  loop
    execute format('drop policy if exists fuel_read on public.%I', table_name);
    execute format('create policy fuel_read on public.%I for select using (public.fuel_can_read())', table_name);

    execute format('drop policy if exists fuel_insert on public.%I', table_name);
    execute format('create policy fuel_insert on public.%I for insert with check (public.fuel_can_write())', table_name);

    execute format('drop policy if exists fuel_update on public.%I', table_name);
    execute format('create policy fuel_update on public.%I for update using (public.fuel_can_write()) with check (public.fuel_can_write())', table_name);
  end loop;
end $$;

-- No delete policies. Use archived_at / archived_by for owner-controlled archival.

-- Explicit grants for Supabase PostgREST access. RLS policies above still enforce the actual role rules.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'fuel_stations',
    'fuel_station_profiles',
    'fuel_shift_templates',
    'fuel_products',
    'fuel_station_products',
    'fuel_prices',
    'fuel_pumps',
    'fuel_pump_product_assignments',
    'fuel_shift_reports',
    'fuel_meter_readings',
    'fuel_credit_receipts',
    'fuel_expenses',
    'fuel_cash_counts',
    'fuel_lubricant_products',
    'fuel_lubricant_sales',
    'fuel_station_lubricant_inventory',
    'fuel_warehouse_lubricant_inventory',
    'fuel_lubricant_stock_movements',
    'fuel_import_batches',
    'fuel_report_exports'
  ]
  loop
    execute format('grant select, insert, update on public.%I to authenticated', table_name);
    execute format('grant select on public.%I to anon', table_name);
  end loop;
end $$;

drop policy if exists fuel_audit_read on public.audit_logs;
create policy fuel_audit_read on public.audit_logs
for select using (entity_type like 'fuel_%' and public.fuel_can_read());

grant select on public.audit_logs to authenticated;
insert into public.fuel_products (code, name, unit, is_fuel)
values
  ('DIESEL', 'Diesel', 'liter', true),
  ('SPECIAL', 'Special', 'liter', true),
  ('UNLEADED', 'Unleaded', 'liter', true)
on conflict (code) do update set name = excluded.name, unit = excluded.unit, is_fuel = excluded.is_fuel;

insert into public.fuel_stations (code, name, official_report_header)
values ('AKY-MAIN', 'AKY Main Station', 'AKY Fuel Station Shift Report')
on conflict (code) do nothing;

insert into public.fuel_station_products (station_id, product_id)
select s.id, p.id
from public.fuel_stations s
cross join public.fuel_products p
where s.code = 'AKY-MAIN'
on conflict (station_id, product_id) do nothing;

insert into public.fuel_shift_templates (station_id, name, start_time, end_time, display_order)
select id, '1-9pm', '13:00', '21:00', 1
from public.fuel_stations
where code = 'AKY-MAIN'
on conflict do nothing;

insert into public.fuel_pumps (station_id, pump_label, display_order)
select s.id, pump_label, display_order
from public.fuel_stations s
cross join (values ('A', 1), ('B', 2), ('A2', 3), ('B2', 4)) as p(pump_label, display_order)
where s.code = 'AKY-MAIN'
on conflict (station_id, pump_label) do nothing;

insert into public.fuel_lubricant_products (sku, name, unit, default_unit_price)
values
  ('AX7', 'AX7', 'piece', 390)
on conflict (sku) do update set name = excluded.name, default_unit_price = excluded.default_unit_price;
-- Browser-safe RPC layer for the GitHub Pages build.
-- Critical calculations are repeated in PostgreSQL before any report is committed.

create or replace function public.fuel_calculate_shift_report(payload jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  product_code text;
  price numeric := 0;
  gross_liters numeric := 0;
  credit_liters numeric := 0;
  calibration_liters numeric := 0;
  net_cash_liters numeric := 0;
  fuel_cash_amount numeric := 0;
  credit_amount numeric := 0;
  products jsonb := '[]'::jsonb;
  total_gross_liters numeric := 0;
  total_credit_liters numeric := 0;
  total_calibration_liters numeric := 0;
  total_net_cash_liters numeric := 0;
  total_fuel_cash_sales numeric := 0;
  total_credit_amount numeric := 0;
  total_lubricant_sales numeric := 0;
  total_expenses numeric := 0;
  total_cash_count numeric := 0;
  expected_cash_before_expenses numeric := 0;
  workbook_style_discrepancy numeric := 0;
  operational_net_remittance numeric := 0;
begin
  for product_code in
    select distinct code
    from (
      select "productCode" as code from jsonb_to_recordset(coalesce(payload->'prices', '[]'::jsonb)) as x("productCode" text, price numeric)
      union all
      select "productCode" as code from jsonb_to_recordset(coalesce(payload->'meterReadings', '[]'::jsonb)) as x("productCode" text)
      union all
      select "productCode" as code from jsonb_to_recordset(coalesce(payload->'creditReceipts', '[]'::jsonb)) as x("productCode" text)
    ) codes
    where code is not null and btrim(code) <> ''
  loop
    select coalesce(max(x.price), 0)
      into price
    from jsonb_to_recordset(coalesce(payload->'prices', '[]'::jsonb)) as x("productCode" text, price numeric)
    where x."productCode" = product_code;

    select coalesce(sum(x."afterReading" - x."beforeReading"), 0),
           coalesce(sum(coalesce(x."calibrationLiters", 0)), 0)
      into gross_liters, calibration_liters
    from jsonb_to_recordset(coalesce(payload->'meterReadings', '[]'::jsonb))
      as x("productCode" text, "beforeReading" numeric, "afterReading" numeric, "calibrationLiters" numeric)
    where x."productCode" = product_code;

    select coalesce(sum(x.liters), 0),
           coalesce(sum(coalesce(x.amount, x.liters * price)), 0)
      into credit_liters, credit_amount
    from jsonb_to_recordset(coalesce(payload->'creditReceipts', '[]'::jsonb))
      as x("productCode" text, liters numeric, amount numeric)
    where x."productCode" = product_code;

    net_cash_liters := gross_liters - credit_liters - calibration_liters;
    fuel_cash_amount := round(net_cash_liters * price, 2);

    products := products || jsonb_build_array(jsonb_build_object(
      'productCode', product_code,
      'grossLiters', round(gross_liters, 3),
      'creditLiters', round(credit_liters, 3),
      'calibrationLiters', round(calibration_liters, 3),
      'netCashLiters', round(net_cash_liters, 3),
      'price', round(price, 4),
      'fuelCashAmount', fuel_cash_amount,
      'creditAmount', round(credit_amount, 2)
    ));

    total_gross_liters := total_gross_liters + gross_liters;
    total_credit_liters := total_credit_liters + credit_liters;
    total_calibration_liters := total_calibration_liters + calibration_liters;
    total_net_cash_liters := total_net_cash_liters + net_cash_liters;
    total_fuel_cash_sales := total_fuel_cash_sales + fuel_cash_amount;
    total_credit_amount := total_credit_amount + credit_amount;
  end loop;

  select coalesce(sum(x.quantity * x."unitPrice"), 0)
    into total_lubricant_sales
  from jsonb_to_recordset(coalesce(payload->'lubricantSales', '[]'::jsonb))
    as x("productName" text, quantity numeric, "unitPrice" numeric);

  select coalesce(sum(x.amount), 0)
    into total_expenses
  from jsonb_to_recordset(coalesce(payload->'expenses', '[]'::jsonb))
    as x(description text, amount numeric);

  select coalesce(sum(coalesce(x."lineAmount", x.denomination * x.quantity)), 0)
    into total_cash_count
  from jsonb_to_recordset(coalesce(payload->'cashCounts', '[]'::jsonb))
    as x(denomination numeric, quantity numeric, "lineAmount" numeric);

  total_cash_count := total_cash_count + coalesce(nullif(payload->>'coinsAmount', '')::numeric, 0);
  expected_cash_before_expenses := round(total_fuel_cash_sales + total_lubricant_sales, 2);
  workbook_style_discrepancy := round(total_cash_count - expected_cash_before_expenses, 2);
  operational_net_remittance := round(total_cash_count - total_lubricant_sales - total_expenses, 2);

  return jsonb_build_object(
    'products', products,
    'totalGrossLiters', round(total_gross_liters, 3),
    'totalCreditLiters', round(total_credit_liters, 3),
    'totalCalibrationLiters', round(total_calibration_liters, 3),
    'totalNetCashLiters', round(total_net_cash_liters, 3),
    'totalFuelCashSales', round(total_fuel_cash_sales, 2),
    'totalCreditAmount', round(total_credit_amount, 2),
    'totalLubricantSales', round(total_lubricant_sales, 2),
    'totalExpenses', round(total_expenses, 2),
    'totalCashCount', round(total_cash_count, 2),
    'expectedCashBeforeExpenses', expected_cash_before_expenses,
    'workbookStyleDiscrepancy', workbook_style_discrepancy,
    'operationalNetRemittance', operational_net_remittance
  );
end;
$$;

create or replace function public.fuel_commit_shift_report(payload jsonb, import_context jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  report_id uuid;
  batch_id uuid;
  totals jsonb;
  source_value text := coalesce(nullif(payload->>'source', ''), 'web_manual');
  station_value uuid := nullif(payload->>'stationId', '')::uuid;
  shift_template_value uuid := nullif(payload->>'shiftTemplateId', '')::uuid;
  reading record;
  credit record;
  expense record;
  cash record;
  lubricant record;
  product_value uuid;
  pump_value uuid;
  lube_value uuid;
  coins numeric;
begin
  if not public.fuel_can_write() then
    raise exception 'Only Owner and Admin profiles can create or edit fuel reports.';
  end if;

  if coalesce(nullif(payload->>'reportDate', ''), '') = '' then
    raise exception 'reportDate is required.';
  end if;

  if coalesce(nullif(payload->>'dutyName', ''), '') = '' then
    raise exception 'dutyName is required.';
  end if;

  if coalesce(nullif(payload->>'shiftTimeLabel', ''), '') = '' then
    raise exception 'shiftTimeLabel is required.';
  end if;

  totals := public.fuel_calculate_shift_report(payload);

  if import_context is not null then
    insert into public.fuel_import_batches (
      source_file_name,
      parser_version,
      status,
      warnings,
      parsed_payload,
      imported_by
    ) values (
      coalesce(import_context->>'sourceFileName', 'uploaded workbook'),
      coalesce(import_context->>'parserVersion', 'osr-v1-client'),
      'committing',
      coalesce(import_context->'warnings', '[]'::jsonb),
      jsonb_build_object('payload', payload, 'workbookTotals', import_context->'workbookTotals'),
      auth.uid()
    ) returning id into batch_id;
  end if;

  insert into public.fuel_shift_reports (
    station_id,
    shift_template_id,
    report_date,
    duty_name,
    shift_time_label,
    source,
    status,
    calculated_totals,
    discrepancy_amount,
    edit_reason,
    imported_batch_id,
    created_by,
    updated_by
  ) values (
    station_value,
    shift_template_value,
    (payload->>'reportDate')::date,
    payload->>'dutyName',
    payload->>'shiftTimeLabel',
    source_value::public.fuel_entry_source,
    'draft',
    totals,
    coalesce((totals->>'workbookStyleDiscrepancy')::numeric, 0),
    nullif(payload->>'editReason', ''),
    batch_id,
    auth.uid(),
    auth.uid()
  ) returning id into report_id;

  for reading in
    select * from jsonb_to_recordset(coalesce(payload->'meterReadings', '[]'::jsonb))
      as x("pumpId" text, "pumpLabel" text, "productCode" text, "beforeReading" numeric, "afterReading" numeric, "calibrationLiters" numeric)
  loop
    select id into product_value from public.fuel_products where code = reading."productCode" limit 1;
    pump_value := nullif(reading."pumpId", '')::uuid;

    insert into public.fuel_meter_readings (
      shift_report_id,
      pump_id,
      pump_label_snapshot,
      product_id,
      product_code_snapshot,
      before_reading,
      after_reading,
      calibration_liters,
      source
    ) values (
      report_id,
      pump_value,
      coalesce(nullif(reading."pumpLabel", ''), 'Unlabeled pump'),
      product_value,
      coalesce(nullif(reading."productCode", ''), 'UNKNOWN'),
      coalesce(reading."beforeReading", 0),
      coalesce(reading."afterReading", 0),
      coalesce(reading."calibrationLiters", 0),
      source_value::public.fuel_entry_source
    );
  end loop;

  for credit in
    select * from jsonb_to_recordset(coalesce(payload->'creditReceipts', '[]'::jsonb))
      as x("productCode" text, "companyName" text, "receiptNumber" text, liters numeric, amount numeric, "externalCustomerId" text, "externalReference" text, "attachmentPath" text)
  loop
    select id into product_value from public.fuel_products where code = credit."productCode" limit 1;
    insert into public.fuel_credit_receipts (
      shift_report_id,
      product_id,
      product_code_snapshot,
      customer_id,
      company_name,
      external_reference,
      receipt_number,
      liters,
      amount,
      attachment_path,
      source
    ) values (
      report_id,
      product_value,
      coalesce(nullif(credit."productCode", ''), 'UNKNOWN'),
      nullif(credit."externalCustomerId", '')::uuid,
      coalesce(nullif(credit."companyName", ''), 'Unknown credit customer'),
      nullif(credit."externalReference", ''),
      nullif(credit."receiptNumber", ''),
      coalesce(credit.liters, 0),
      credit.amount,
      nullif(credit."attachmentPath", ''),
      source_value::public.fuel_entry_source
    );
  end loop;

  for expense in
    select * from jsonb_to_recordset(coalesce(payload->'expenses', '[]'::jsonb))
      as x(description text, category text, amount numeric)
  loop
    insert into public.fuel_expenses (shift_report_id, category, description, amount)
    values (report_id, nullif(expense.category, ''), coalesce(nullif(expense.description, ''), 'Unlabeled expense'), coalesce(expense.amount, 0));
  end loop;

  for cash in
    select * from jsonb_to_recordset(coalesce(payload->'cashCounts', '[]'::jsonb))
      as x(denomination numeric, quantity numeric, "lineAmount" numeric)
  loop
    insert into public.fuel_cash_counts (shift_report_id, denomination, quantity, amount)
    values (report_id, coalesce(cash.denomination, 0), coalesce(cash.quantity, 0), coalesce(cash."lineAmount", coalesce(cash.denomination, 0) * coalesce(cash.quantity, 0)));
  end loop;

  coins := coalesce(nullif(payload->>'coinsAmount', '')::numeric, 0);
  if coins <> 0 then
    insert into public.fuel_cash_counts (shift_report_id, denomination, quantity, amount, note)
    values (report_id, 1, coins, coins, 'Coins / loose cash');
  end if;

  for lubricant in
    select * from jsonb_to_recordset(coalesce(payload->'lubricantSales', '[]'::jsonb))
      as x("productName" text, quantity numeric, "unitPrice" numeric)
  loop
    select id into lube_value from public.fuel_lubricant_products where lower(name) = lower(lubricant."productName") limit 1;
    insert into public.fuel_lubricant_sales (shift_report_id, lubricant_product_id, product_name_snapshot, quantity, unit_price)
    values (report_id, lube_value, coalesce(nullif(lubricant."productName", ''), 'Unlabeled lubricant'), coalesce(lubricant.quantity, 0), coalesce(lubricant."unitPrice", 0));
  end loop;

  if batch_id is not null then
    update public.fuel_import_batches
    set status = 'committed', committed_report_id = report_id
    where id = batch_id;

    insert into public.audit_logs (actor_id, actor_role, action_type, entity_type, entity_id, details, new_snapshot)
    values (auth.uid(), public.fuel_current_role(), 'import', 'fuel_import_batches', batch_id::text, 'Excel workbook imported into fuel shift report', jsonb_build_object('reportId', report_id, 'context', import_context));
  end if;

  return report_id;
end;
$$;

grant execute on function public.fuel_calculate_shift_report(jsonb) to authenticated;
grant execute on function public.fuel_commit_shift_report(jsonb, jsonb) to authenticated;
