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
