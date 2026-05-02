create table if not exists public.tank_calibration_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null unique,
  name text not null,
  formula_type text not null check (formula_type in ('horizontal_cylinder', 'manual_table')),
  diameter_cm numeric(12,4),
  radius_cm numeric(12,4),
  length_cm numeric(12,4),
  max_dipstick_cm numeric(12,4) not null check (max_dipstick_cm >= 0),
  nominal_label text,
  calculated_full_liters numeric(14,6) not null check (calculated_full_liters >= 0),
  rounded_full_liters integer not null check (rounded_full_liters >= 0),
  is_verified boolean not null default false,
  is_owner_only boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.tank_calibration_table_rows (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.tank_calibration_profiles(id) on delete cascade,
  reading_cm numeric(12,4) not null,
  liters numeric(14,6) not null,
  created_at timestamptz not null default now(),
  unique (profile_id, reading_cm)
);

create table if not exists public.station_tanks (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.fuel_stations(id) on delete cascade,
  product_type text not null,
  tank_name text not null,
  calibration_profile_id uuid not null references public.tank_calibration_profiles(id),
  physical_tank_group_id text,
  compartment_label text,
  reorder_threshold_liters numeric(14,4),
  low_stock_warning_liters numeric(14,4),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.tank_stick_readings (
  id uuid primary key default gen_random_uuid(),
  station_tank_id uuid not null references public.station_tanks(id) on delete cascade,
  report_date date not null,
  reading_cm numeric(12,4) not null,
  entered_by uuid references auth.users(id),
  entered_at timestamptz not null default now(),
  source text not null,
  notes text
);

create table if not exists public.tank_reconciliation_audits (
  id uuid primary key default gen_random_uuid(),
  station_tank_id uuid not null references public.station_tanks(id) on delete cascade,
  report_date date not null,
  opening_reading_cm numeric(12,4) not null,
  opening_liters numeric(14,6) not null,
  delivery_liters numeric(14,6) not null,
  pump_meter_sales_liters numeric(14,6) not null,
  closing_reading_cm numeric(12,4) not null,
  closing_liters numeric(14,6) not null,
  expected_closing_liters numeric(14,6) not null,
  variance_liters numeric(14,6) not null,
  status text not null check (status in ('balanced', 'short', 'surplus')),
  tolerance_liters numeric(14,6) not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  explanation text
);

create table if not exists public.empty_tank_audits (
  id uuid primary key default gen_random_uuid(),
  station_tank_id uuid not null references public.station_tanks(id) on delete cascade,
  reading_cm_before_empty numeric(12,4) not null,
  calculated_liters_before_empty numeric(14,6) not null,
  actual_drained_liters numeric(14,6) not null,
  variance_liters numeric(14,6) not null,
  status text not null check (status in ('balanced', 'short', 'surplus')),
  performed_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  audit_date date not null,
  notes text,
  created_at timestamptz not null default now()
);
