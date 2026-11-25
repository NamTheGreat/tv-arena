-- Staging table for AI-generated weekly newsletter drafts (#198).
-- Rollback: DROP TABLE newsletter_drafts;
-- Access: server side only. RLS is enabled with no policies and anon/authenticated have no grants,
-- so drafts are invisible to the public API. service_role (the generator workflow) may read, insert
-- and update, but not delete.
BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

CREATE TABLE newsletter_drafts (
  week_start DATE PRIMARY KEY CHECK (EXTRACT(ISODOW FROM week_start) = 1),
  markdown TEXT NOT NULL CHECK (length(markdown) BETWEEN 1 AND 20000),
  facts JSONB NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE newsletter_drafts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON newsletter_drafts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON newsletter_drafts TO service_role;

COMMIT;
