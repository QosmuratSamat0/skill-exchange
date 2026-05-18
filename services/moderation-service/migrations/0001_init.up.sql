CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL,
  reporter_user_id UUID NOT NULL,
  reported_user_id UUID NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_reported_created ON reports(reported_user_id, created_at);

