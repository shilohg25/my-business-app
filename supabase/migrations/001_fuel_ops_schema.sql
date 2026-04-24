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
