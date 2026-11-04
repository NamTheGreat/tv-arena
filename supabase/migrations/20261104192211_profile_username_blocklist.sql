BEGIN;

SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_not_blocked
  CHECK (lower(username) NOT IN (
    'admin', 'administrator', 'help', 'moderator', 'mod', 'official', 'owner',
    'root', 'security', 'staff', 'support', 'system', 'tv_arena', 'tvarena',
    'verified', 'nigger', 'nigga', 'faggot', 'tranny', 'retard', 'kike',
    'spic', 'chink', 'coon', 'wetback'
  )) NOT VALID;

COMMIT;
