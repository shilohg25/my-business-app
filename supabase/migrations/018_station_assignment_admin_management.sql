-- Station assignment hardening and Owner/Admin management helpers.

create table if not exists public.fuel_user_station_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  station_id uuid not null references public.fuel_stations(id) on delete cascade,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  notes text,
  unique (user_id, station_id)
);

alter table public.fuel_user_station_assignments
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists assigned_by uuid references auth.users(id),
  add column if not exists assigned_at timestamptz not null default now();

update public.fuel_user_station_assignments
set created_by = coalesce(created_by, assigned_by),
    created_at = coalesce(created_at, assigned_at, now()),
    updated_at = coalesce(updated_at, now())
where created_by is null
   or created_at is null
   or updated_at is null;

alter table public.fuel_user_station_assignments alter column created_at set default now();
alter table public.fuel_user_station_assignments alter column updated_at set default now();

drop trigger if exists trg_fuel_user_station_assignments_updated_at on public.fuel_user_station_assignments;
create trigger trg_fuel_user_station_assignments_updated_at
before update on public.fuel_user_station_assignments
for each row execute function public.touch_updated_at();

alter table public.fuel_user_station_assignments enable row level security;
revoke all on table public.fuel_user_station_assignments from anon;
grant select, insert, update on table public.fuel_user_station_assignments to authenticated;

drop policy if exists fuel_user_station_assignments_select on public.fuel_user_station_assignments;
drop policy if exists fuel_user_station_assignments_admin_read on public.fuel_user_station_assignments;
create policy fuel_user_station_assignments_admin_read on public.fuel_user_station_assignments
for select using (public.fuel_can_write());

drop policy if exists fuel_user_station_assignments_user_read_own_active on public.fuel_user_station_assignments;
create policy fuel_user_station_assignments_user_read_own_active on public.fuel_user_station_assignments
for select using (
  user_id = auth.uid()
  and is_active = true
);

drop policy if exists fuel_user_station_assignments_insert on public.fuel_user_station_assignments;
create policy fuel_user_station_assignments_insert on public.fuel_user_station_assignments
for insert with check (public.fuel_can_write());

drop policy if exists fuel_user_station_assignments_update on public.fuel_user_station_assignments;
create policy fuel_user_station_assignments_update on public.fuel_user_station_assignments
for update using (public.fuel_can_write())
with check (public.fuel_can_write());

create or replace function public.fuel_get_my_station_assignments()
returns table (station_id uuid, station_name text, station_code text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id as station_id, s.name as station_name, s.code as station_code
  from public.fuel_user_station_assignments a
  join public.fuel_stations s on s.id = a.station_id
  where a.user_id = auth.uid()
    and a.is_active = true
    and s.is_active = true
  order by s.name
$$;

grant execute on function public.fuel_get_my_station_assignments() to authenticated;

create or replace function public.fuel_list_assignable_users()
returns table (
  user_id uuid,
  email text,
  username text,
  role text,
  is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id as user_id,
         coalesce(au.email::text, p.email) as email,
         p.username,
         p.role,
         p.is_active
  from public.profiles p
  left join auth.users au on au.id = p.id
  where public.fuel_can_write()
    and p.is_active = true
    and p.role = 'User'
  order by lower(coalesce(au.email::text, p.email, ''))
$$;

grant execute on function public.fuel_list_assignable_users() to authenticated;

create or replace function public.fuel_list_station_assignments()
returns table (
  id uuid,
  user_id uuid,
  user_email text,
  username text,
  station_id uuid,
  station_name text,
  station_code text,
  is_active boolean,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id,
         a.user_id,
         coalesce(au.email::text, p.email) as user_email,
         p.username,
         a.station_id,
         s.name as station_name,
         s.code as station_code,
         a.is_active,
         a.created_by,
         a.created_at,
         a.updated_at
  from public.fuel_user_station_assignments a
  join public.fuel_stations s on s.id = a.station_id
  left join public.profiles p on p.id = a.user_id
  left join auth.users au on au.id = a.user_id
  where public.fuel_can_write()
  order by lower(coalesce(au.email::text, p.email, '')), s.name
$$;

grant execute on function public.fuel_list_station_assignments() to authenticated;

create or replace function public.fuel_set_station_assignment(target_user_id uuid, target_station_id uuid, assignment_is_active boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_id uuid;
  actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.fuel_can_write() then raise exception 'Only Owner/Admin can manage station assignments'; end if;
  if target_user_id is null then raise exception 'target_user_id is required'; end if;
  if target_station_id is null then raise exception 'target_station_id is required'; end if;
  if not exists (select 1 from public.fuel_stations s where s.id = target_station_id) then
    raise exception 'Station not found';
  end if;
  if not exists (select 1 from public.profiles p where p.id = target_user_id and p.is_active = true) then
    raise exception 'User profile not found or inactive';
  end if;

  insert into public.fuel_user_station_assignments (user_id, station_id, is_active, created_by, created_at, updated_at, assigned_by, assigned_at)
  values (target_user_id, target_station_id, coalesce(assignment_is_active, true), actor_id, now(), now(), actor_id, now())
  on conflict (user_id, station_id)
  do update
    set is_active = coalesce(excluded.is_active, true),
        updated_at = now(),
        assigned_by = actor_id,
        assigned_at = now()
  returning id into assignment_id;

  return assignment_id;
end;
$$;

grant execute on function public.fuel_set_station_assignment(uuid, uuid, boolean) to authenticated;
