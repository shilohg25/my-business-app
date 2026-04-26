-- Publish preparation stub for mobile field capture sessions

create or replace function public.fuel_publish_shift_capture_session(capture_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  session_row public.fuel_shift_capture_sessions%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.fuel_can_write() then
    raise exception 'Not allowed to publish field capture sessions';
  end if;

  select * into session_row
  from public.fuel_shift_capture_sessions
  where id = capture_session_id;

  if session_row.id is null then
    raise exception 'Capture session not found';
  end if;

  if session_row.status <> 'ready_for_review' then
    raise exception 'Capture session must be ready_for_review before publishing';
  end if;

  raise exception 'Publishing field capture sessions is not enabled yet.';
end;
$$;

grant execute on function public.fuel_publish_shift_capture_session(uuid) to authenticated;
