-- Enable extension if needed (pgcrypto may already be enabled by earlier migrations)

CREATE TABLE IF NOT EXISTS ai_usage (
  organization_id text NOT NULL,
  period text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add a unique constraint to ensure one row per org+period
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_org_period_key'
  ) THEN
    ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_org_period_key UNIQUE (organization_id, period);
  END IF;
END$$;

-- Optional index to speed up lookups by organization
CREATE INDEX IF NOT EXISTS ai_usage_org_idx ON ai_usage (organization_id);
