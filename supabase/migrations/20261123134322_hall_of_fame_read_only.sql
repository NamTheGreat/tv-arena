-- Restrict the Hall of Fame view to read-only access despite permissive default ACLs.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

REVOKE ALL ON series_hall_of_fame FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON series_hall_of_fame TO anon, authenticated;

COMMIT;
