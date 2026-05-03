alter table public.station_tanks
  add column if not exists calibration_mode text not null default 'verified_profile';

alter table public.station_tanks
  drop constraint if exists station_tanks_calibration_mode_check;
alter table public.station_tanks
  add constraint station_tanks_calibration_mode_check
  check (calibration_mode in ('verified_profile', 'manual_table', 'historical_emptying'));

alter table public.station_tanks
  alter column calibration_profile_id drop not null;

alter table public.station_tanks
  drop constraint if exists station_tanks_calibration_profile_required_check;
alter table public.station_tanks
  add constraint station_tanks_calibration_profile_required_check
  check (
    (calibration_mode = 'historical_emptying' and calibration_profile_id is null)
    or
    (calibration_mode in ('verified_profile', 'manual_table') and calibration_profile_id is not null)
  );

create table if not exists public.tank_empirical_calibration_points (
  id uuid primary key default gen_random_uuid(),
  station_tank_id uuid not null references public.station_tanks(id) on delete cascade,
  audit_date date not null,
  reading_cm numeric not null,
  observed_liters numeric not null,
  actual_pulled_liters numeric not null,
  remaining_after_pullout_liters numeric not null default 0,
  base_calibration_profile_id uuid null references public.tank_calibration_profiles(id),
  base_expected_liters numeric null,
  variance_liters numeric null,
  status text null check (status in ('balanced', 'short', 'surplus', 'anchor_only')),
  confidence text not null default 'exact_at_anchor',
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

alter table public.tank_empirical_calibration_points enable row level security;
grant select, insert, update on public.tank_empirical_calibration_points to authenticated;

drop policy if exists tank_empirical_calibration_points_select_owner_coowner on public.tank_empirical_calibration_points;
create policy tank_empirical_calibration_points_select_owner_coowner on public.tank_empirical_calibration_points
for select to authenticated using (public.fuel_current_role() in ('Owner', 'Co-Owner'));

drop policy if exists tank_empirical_calibration_points_insert_owner on public.tank_empirical_calibration_points;
create policy tank_empirical_calibration_points_insert_owner on public.tank_empirical_calibration_points
for insert to authenticated with check (public.fuel_current_role() = 'Owner');

drop policy if exists tank_empirical_calibration_points_update_owner on public.tank_empirical_calibration_points;
create policy tank_empirical_calibration_points_update_owner on public.tank_empirical_calibration_points
for update to authenticated using (public.fuel_current_role() = 'Owner') with check (public.fuel_current_role() = 'Owner');
