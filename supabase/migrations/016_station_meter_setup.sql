-- Station meter setup, role-aware access, and owner/admin management RPCs.

create table if not exists public.fuel_station_meters (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.fuel_stations(id) on delete cascade,
  product_type text not null,
  meter_label text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fuel_station_meters_product_type_check check (product_type in ('DIESEL', 'SPECIAL', 'UNLEADED')),
  constraint fuel_station_meters_display_order_check check (display_order >= 0),
  constraint fuel_station_meters_meter_label_nonblank_check check (length(trim(meter_label)) > 0)
);

create unique index if not exists idx_fuel_station_meters_unique_active_label
  on public.fuel_station_meters(station_id, product_type, lower(trim(meter_label)))
  where is_active = true;

create index if not exists idx_fuel_station_meters_station_id
  on public.fuel_station_meters(station_id);

create index if not exists idx_fuel_station_meters_station_active
  on public.fuel_station_meters(station_id, is_active);

create index if not exists idx_fuel_station_meters_station_product_order
  on public.fuel_station_meters(station_id, product_type, display_order);

alter table public.fuel_station_meters enable row level security;
revoke all on table public.fuel_station_meters from anon;
grant select, insert, update on table public.fuel_station_meters to authenticated;

create or replace function public.fuel_user_can_access_station(target_station_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  role_value text := public.fuel_current_role();
begin
  if actor_id is null or target_station_id is null then
    return false;
  end if;

  if role_value in ('Owner', 'Admin') then
    return true;
  end if;

  if role_value = 'User' then
    return exists (
      select 1
      from public.fuel_user_station_assignments a
      where a.user_id = actor_id
        and a.station_id = target_station_id
        and a.is_active = true
    );
  end if;

  return false;
end;
$$;

grant execute on function public.fuel_user_can_access_station(uuid) to authenticated;

drop policy if exists fuel_station_meters_select on public.fuel_station_meters;
create policy fuel_station_meters_select on public.fuel_station_meters
for select using (
  auth.uid() is not null
  and (
    public.fuel_can_write()
    or (
      is_active = true
      and public.fuel_user_can_access_station(station_id)
    )
  )
);

drop policy if exists fuel_station_meters_insert on public.fuel_station_meters;
create policy fuel_station_meters_insert on public.fuel_station_meters
for insert with check (public.fuel_can_write());

drop policy if exists fuel_station_meters_update on public.fuel_station_meters;
create policy fuel_station_meters_update on public.fuel_station_meters
for update using (public.fuel_can_write())
with check (public.fuel_can_write());

create or replace function public.fuel_get_station_meters(target_station_id uuid)
returns table (
  id uuid,
  station_id uuid,
  product_type text,
  meter_label text,
  display_order integer,
  is_active boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if target_station_id is null then
    raise exception 'target_station_id is required';
  end if;

  if not public.fuel_user_can_access_station(target_station_id) then
    raise exception 'Not allowed to view station meters';
  end if;

  return query
  select m.id, m.station_id, m.product_type, m.meter_label, m.display_order, m.is_active
  from public.fuel_station_meters m
  where m.station_id = target_station_id
    and m.is_active = true
  order by m.product_type asc, m.display_order asc, m.meter_label asc;
end;
$$;

grant execute on function public.fuel_get_station_meters(uuid) to authenticated;

create or replace function public.fuel_upsert_station_meter(payload jsonb)
returns public.fuel_station_meters
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  meter_id uuid := nullif(trim(coalesce(payload->>'id', '')), '')::uuid;
  station_id_value uuid := nullif(trim(coalesce(payload->>'station_id', '')), '')::uuid;
  product_type_value text := upper(trim(coalesce(payload->>'product_type', '')));
  meter_label_value text := trim(coalesce(payload->>'meter_label', ''));
  display_order_value integer := coalesce((payload->>'display_order')::integer, 0);
  is_active_value boolean := coalesce((payload->>'is_active')::boolean, true);
  result_row public.fuel_station_meters;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.fuel_can_write() then
    raise exception 'Only Owner/Admin can configure station meters';
  end if;

  if station_id_value is null then
    raise exception 'station_id is required';
  end if;

  if not exists (select 1 from public.fuel_stations s where s.id = station_id_value) then
    raise exception 'Station not found';
  end if;

  if product_type_value not in ('DIESEL', 'SPECIAL', 'UNLEADED') then
    raise exception 'product_type must be DIESEL, SPECIAL, or UNLEADED';
  end if;

  if meter_label_value = '' then
    raise exception 'meter_label is required';
  end if;

  if display_order_value < 0 then
    raise exception 'display_order must be greater than or equal to zero';
  end if;

  if meter_id is null then
    insert into public.fuel_station_meters (station_id, product_type, meter_label, display_order, is_active, updated_at)
    values (station_id_value, product_type_value, meter_label_value, display_order_value, is_active_value, now())
    returning * into result_row;
  else
    update public.fuel_station_meters m
    set station_id = station_id_value,
        product_type = product_type_value,
        meter_label = meter_label_value,
        display_order = display_order_value,
        is_active = is_active_value,
        updated_at = now()
    where m.id = meter_id
    returning * into result_row;

    if result_row.id is null then
      raise exception 'Meter not found';
    end if;
  end if;

  return result_row;
end;
$$;

grant execute on function public.fuel_upsert_station_meter(jsonb) to authenticated;

create or replace function public.fuel_archive_station_meter(meter_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  archived_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.fuel_can_write() then
    raise exception 'Only Owner/Admin can archive station meters';
  end if;

  if meter_id is null then
    raise exception 'meter_id is required';
  end if;

  update public.fuel_station_meters
  set is_active = false,
      updated_at = now()
  where id = meter_id
  returning id into archived_id;

  if archived_id is null then
    raise exception 'Meter not found';
  end if;

  return archived_id;
end;
$$;

grant execute on function public.fuel_archive_station_meter(uuid) to authenticated;
