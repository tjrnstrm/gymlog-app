-- Every auth account must have a profile. The signup trigger only covers accounts created after it
-- was installed, so accounts that predate it (or were created while it was broken) get one here.
--
-- Idempotent. Only the id is set: no username, admin flag or coach access is inferred from user
-- metadata. A user without a username is asked to choose one on first load.
insert into public.profiles (id)
select u.id
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
