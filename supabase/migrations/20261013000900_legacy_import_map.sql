-- Bookkeeping for importing history from the retired MongoDB database (see db/legacy/).
--
-- One row per imported source record. A rerun looks a source record up here instead of inserting it
-- again, and compares source_hash to notice that the source changed since it was imported.
--
--   source       stable identifier of the source database, without credentials (e.g. 'mongo:<cluster>/<db>')
--   collection   source collection (profile, exercise, workout, workout_exercise, set, ...)
--   source_id    the source _id; nested records are qualified with their parents ('<workout>/<index>')
--   target_table / target_id   what it became in Postgres
--   owner_id     the user the record was imported for
--   source_hash  hash of the source content that was imported
--
-- Row Level Security is on and there are deliberately NO policies and no API grants: only the
-- service role and direct database connections (the import script, tests) can touch this table.

create table public.legacy_import_map (
  source text not null,
  collection text not null,
  source_id text not null,
  target_table text not null,
  target_id uuid not null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  source_hash text not null,
  imported_at timestamptz not null default now(),
  primary key (source, collection, source_id)
);

create index legacy_import_map_owner_id_idx on public.legacy_import_map (owner_id);
create index legacy_import_map_target_idx on public.legacy_import_map (target_table, target_id);

alter table public.legacy_import_map enable row level security;
revoke all on public.legacy_import_map from anon, authenticated;
