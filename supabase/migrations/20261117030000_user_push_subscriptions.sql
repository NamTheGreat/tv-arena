-- Migration: 20261117030000_user_push_subscriptions.sql
-- Opt-in browser push notification subscriptions for watchlisted show breakouts

SET LOCAL lock_timeout = '2s';

CREATE TABLE IF NOT EXISTS user_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  is_paused BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON user_push_subscriptions(user_id);

ALTER TABLE user_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own push subscriptions" ON user_push_subscriptions;
CREATE POLICY "Users can manage own push subscriptions"
  ON user_push_subscriptions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON user_push_subscriptions TO authenticated;

-- Delivery tracking to ensure retries never send duplicate push notifications
CREATE TABLE IF NOT EXISTS user_push_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  breakout_date DATE NOT NULL,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_push_delivery UNIQUE (user_id, series_id, breakout_date)
);

CREATE INDEX IF NOT EXISTS idx_push_deliveries_lookup ON user_push_deliveries(user_id, series_id, breakout_date);

ALTER TABLE user_push_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own push deliveries" ON user_push_deliveries;
CREATE POLICY "Users can view own push deliveries"
  ON user_push_deliveries
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON user_push_deliveries TO authenticated;
