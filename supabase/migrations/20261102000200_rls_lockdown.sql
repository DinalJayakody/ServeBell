-- Supabase only: the backend API is the only data path to application tables.
-- RLS is enabled on every table and the client roles (anon = publishable key without a session,
-- authenticated = signed-in app user) get no privileges, so the Data API exposes nothing even if
-- someone uses the publishable key directly. The backend connects as the database owner and keeps
-- its own explicit authorisation (guards + tenant-scoped queries).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
-- Tables created later by migrations (run as postgres) start locked down too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- Guard rail for future migrations: list application tables without RLS (must return no rows).
CREATE OR REPLACE VIEW public.servebell_tables_without_rls AS
  SELECT c.relname AS table_name
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
REVOKE ALL ON public.servebell_tables_without_rls FROM anon, authenticated;
