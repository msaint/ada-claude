-- Defense in depth for hosted Postgres (e.g. Supabase), where the public
-- schema can be exposed through an auto-generated REST/GraphQL Data API.
-- Ada never uses that API: it connects as the table owner, and owners bypass
-- RLS (it isn't FORCEd). Enabling RLS with no policies means the anon and
-- authenticated API roles can read or write nothing.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
