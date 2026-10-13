-- The client's "From your coach" page shows when coaching started and the coach's photo, so
-- my_coaches() now also returns accepted_at and avatar_url. A function's return type cannot change in
-- place, hence drop and recreate with the same privileges (signed-in users only).

drop function public.my_coaches();

create function public.my_coaches()
returns table (
  id uuid, coach_id uuid, username text, name text, bio text, coach_tags text[], avatar_url text,
  status text, created_at timestamptz, accepted_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select l.id, l.coach_id, p.username, p.name, p.bio, p.coach_tags, p.avatar_url,
         l.status, l.created_at, l.accepted_at
  from coach_client_links l
  join profiles p on p.id = l.coach_id
  where l.client_id = auth.uid() and l.status in ('pending', 'accepted')
  order by l.created_at desc;
$$;

revoke all on function public.my_coaches() from public, anon;
grant execute on function public.my_coaches() to authenticated;
