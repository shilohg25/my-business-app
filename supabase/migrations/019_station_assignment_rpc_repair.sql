-- Restore station assignment RPCs required by the static GitHub Pages app.

create unique index if not exists idx_fuel_user_station_assignments_user_station_unique
  on public.fuel_user_station_assignments(user_id, station_id);

create or replace function public.fuel_is_assignment_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and coalesce(public.fuel_current_role(), '') in ('Owner', 'Admin')
$$;

grant execute on function public.fuel_is_assignment_manager() to authenticated;

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
  where public.fuel_is_assignment_manager()
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
  where public.fuel_is_assignment_manager()
  order by lower(coalesce(au.email::text, p.email, '')), s.name
$$;

grant execute on function public.fuel_list_station_assignments() to authenticated;

create or replace function public.fuel_set_station_assignment(
  target_user_id uuid,
  target_station_id uuid,
  assignment_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_id uuid;
  actor_id uuid := auth.uid();
  assignment_exists boolean := false;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.fuel_is_assignment_manager() then raise exception 'Only Owner/Admin can manage station assignments'; end if;
  if target_user_id is null then raise exception 'target_user_id is required'; end if;
  if target_station_id is null then raise exception 'target_station_id is required'; end if;

  if not exists (
    select 1 from public.fuel_stations s where s.id = target_station_id and s.is_active = true
  ) then
    raise exception 'Station not found or inactive';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = target_user_id and p.is_active = true and p.role = 'User'
  ) then
    raise exception 'User profile not found, inactive, or not assignable';
  end if;

  select true
    into assignment_exists
  from public.fuel_user_station_assignments existing
  where existing.user_id = target_user_id
    and existing.station_id = target_station_id;

  insert into public.fuel_user_station_assignments (
    user_id,
    station_id,
    is_active,
    created_by,
    assigned_by,
    assigned_at,
    created_at,
    updated_at
  )
  values (
    target_user_id,
    target_station_id,
    coalesce(assignment_is_active, true),
    actor_id,
    actor_id,
    now(),
    now(),
    now()
  )
  on conflict (user_id, station_id)
  do update
    set is_active = coalesce(excluded.is_active, true),
        updated_at = now(),
        assigned_by = actor_id,
        assigned_at = now()
  returning id into assignment_id;

  insert into public.audit_logs (
    actor_id,
    actor_role,
    action_type,
    entity_type,
    entity_id,
    details,
    new_snapshot
  )
  values (
    actor_id,
    public.fuel_current_role(),
    case when assignment_exists then 'update' else 'create' end,
    'fuel_user_station_assignments',
    assignment_id::text,
    case when assignment_exists then 'Station assignment updated' else 'Station assignment created' end,
    jsonb_build_object(
      'assignment_id', assignment_id,
      'user_id', target_user_id,
      'station_id', target_station_id,
      'is_active', coalesce(assignment_is_active, true)
    )
  );

  return assignment_id;
end;
$$;

grant execute on function public.fuel_set_station_assignment(uuid, uuid, boolean) to authenticated;
