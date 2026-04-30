-- Supabase exposes the public schema through PostgREST by default.
-- Every table in an exposed schema should have RLS enabled, including
-- Prisma's migration metadata table. No permissive policy is added here:
-- browser/PostgREST clients stay denied by default, while the backend
-- continues to access data through its privileged Prisma connection.
DO $$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT c.oid::regclass AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', table_record.table_name);
  END LOOP;
END $$;
