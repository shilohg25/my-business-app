grant select on public.tank_calibration_profiles to authenticated;
grant select on public.tank_calibration_table_rows to authenticated;
grant select, insert, update on public.station_tanks to authenticated;
grant select, insert on public.tank_stick_readings to authenticated;
grant select, insert on public.tank_reconciliation_audits to authenticated;
grant select, insert on public.empty_tank_audits to authenticated;

alter table public.tank_calibration_profiles enable row level security;
alter table public.tank_calibration_table_rows enable row level security;
alter table public.station_tanks enable row level security;
alter table public.tank_stick_readings enable row level security;
alter table public.tank_reconciliation_audits enable row level security;
alter table public.empty_tank_audits enable row level security;

drop policy if exists tank_calibration_profiles_select_owner_coowner on public.tank_calibration_profiles;
create policy tank_calibration_profiles_select_owner_coowner
on public.tank_calibration_profiles
for select
to authenticated
using (public.fuel_current_role() in ('Owner', 'Co-Owner'));

drop policy if exists tank_calibration_profiles_insert_owner on public.tank_calibration_profiles;
create policy tank_calibration_profiles_insert_owner
on public.tank_calibration_profiles
for insert
to authenticated
with check (public.fuel_current_role() = 'Owner');

drop policy if exists tank_calibration_profiles_update_owner on public.tank_calibration_profiles;
create policy tank_calibration_profiles_update_owner
on public.tank_calibration_profiles
for update
to authenticated
using (public.fuel_current_role() = 'Owner')
with check (public.fuel_current_role() = 'Owner');

drop policy if exists tank_calibration_table_rows_select_owner_coowner on public.tank_calibration_table_rows;
create policy tank_calibration_table_rows_select_owner_coowner on public.tank_calibration_table_rows for select to authenticated using (public.fuel_current_role() in ('Owner', 'Co-Owner'));
drop policy if exists tank_calibration_table_rows_insert_owner on public.tank_calibration_table_rows;
create policy tank_calibration_table_rows_insert_owner on public.tank_calibration_table_rows for insert to authenticated with check (public.fuel_current_role() = 'Owner');
drop policy if exists tank_calibration_table_rows_update_owner on public.tank_calibration_table_rows;
create policy tank_calibration_table_rows_update_owner on public.tank_calibration_table_rows for update to authenticated using (public.fuel_current_role() = 'Owner') with check (public.fuel_current_role() = 'Owner');

drop policy if exists station_tanks_select_owner_coowner on public.station_tanks;
create policy station_tanks_select_owner_coowner on public.station_tanks for select to authenticated using (public.fuel_current_role() in ('Owner', 'Co-Owner'));
drop policy if exists station_tanks_insert_owner on public.station_tanks;
create policy station_tanks_insert_owner on public.station_tanks for insert to authenticated with check (public.fuel_current_role() = 'Owner');
drop policy if exists station_tanks_update_owner on public.station_tanks;
create policy station_tanks_update_owner on public.station_tanks for update to authenticated using (public.fuel_current_role() = 'Owner') with check (public.fuel_current_role() = 'Owner');

drop policy if exists tank_stick_readings_select_owner_coowner on public.tank_stick_readings;
create policy tank_stick_readings_select_owner_coowner on public.tank_stick_readings for select to authenticated using (public.fuel_current_role() in ('Owner', 'Co-Owner'));
drop policy if exists tank_stick_readings_insert_owner_coowner on public.tank_stick_readings;
create policy tank_stick_readings_insert_owner_coowner on public.tank_stick_readings for insert to authenticated with check (public.fuel_current_role() in ('Owner', 'Co-Owner'));

drop policy if exists tank_reconciliation_audits_owner_only on public.tank_reconciliation_audits;
create policy tank_reconciliation_audits_owner_only on public.tank_reconciliation_audits for all to authenticated using (public.fuel_current_role() = 'Owner') with check (public.fuel_current_role() = 'Owner');

drop policy if exists empty_tank_audits_owner_only on public.empty_tank_audits;
create policy empty_tank_audits_owner_only on public.empty_tank_audits for all to authenticated using (public.fuel_current_role() = 'Owner') with check (public.fuel_current_role() = 'Owner');

create or replace function public.fuel_ensure_verified_tank_calibration_profiles()
returns table (
  id uuid,
  profile_key text,
  name text,
  formula_type text,
  diameter_cm numeric,
  radius_cm numeric,
  length_cm numeric,
  max_dipstick_cm numeric,
  nominal_label text,
  calculated_full_liters numeric,
  rounded_full_liters integer,
  is_verified boolean,
  is_owner_only boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.fuel_current_role() <> 'Owner' then
    raise exception 'Only Owner profiles can prepare tank calibration profiles.';
  end if;

  insert into public.tank_calibration_profiles (
    profile_key, name, formula_type, diameter_cm, radius_cm, length_cm, max_dipstick_cm, nominal_label, calculated_full_liters, rounded_full_liters, is_verified, is_owner_only
  )
  values
    ('ugt_16kl_202x488','16KL nominal / 4000 USG horizontal UGT — 202 cm diameter × 488 cm length','horizontal_cylinder',202,101,488,202,'16KL / 4000 USG',15639.1246897235,15639,true,true),
    ('ugt_12kl_split_half_203x183','12KL split tank half-compartment — 203 cm diameter × 183 cm length','horizontal_cylinder',203,101.5,183,203,'6KL compartment inside 12KL split tank',5922.8815435265,5923,true,true),
    ('ugt_12kl_single_203x366','12KL single horizontal UGT — 203 cm diameter × 366 cm length','horizontal_cylinder',203,101.5,366,203,'12KL single tank',11845.7630870530,11846,true,true)
  on conflict (profile_key) do update
  set
    name = excluded.name,
    formula_type = excluded.formula_type,
    diameter_cm = excluded.diameter_cm,
    radius_cm = excluded.radius_cm,
    length_cm = excluded.length_cm,
    max_dipstick_cm = excluded.max_dipstick_cm,
    nominal_label = excluded.nominal_label,
    calculated_full_liters = excluded.calculated_full_liters,
    rounded_full_liters = excluded.rounded_full_liters,
    is_verified = excluded.is_verified,
    is_owner_only = excluded.is_owner_only,
    updated_at = now()
  where public.tank_calibration_profiles.is_verified = true;

  return query
  select tcp.id, tcp.profile_key, tcp.name, tcp.formula_type, tcp.diameter_cm, tcp.radius_cm, tcp.length_cm, tcp.max_dipstick_cm, tcp.nominal_label, tcp.calculated_full_liters, tcp.rounded_full_liters, tcp.is_verified, tcp.is_owner_only
  from public.tank_calibration_profiles tcp
  where tcp.profile_key in ('ugt_16kl_202x488','ugt_12kl_split_half_203x183','ugt_12kl_single_203x366')
    and tcp.archived_at is null
  order by tcp.name;
end;
$$;

grant execute on function public.fuel_ensure_verified_tank_calibration_profiles() to authenticated;
