-- Migration: ensure `subscription_status` column exists on lowercase organization
-- Adds a nullable text column `subscription_status`. Idempotent.

BEGIN;

ALTER TABLE IF EXISTS organization
  ADD COLUMN IF NOT EXISTS subscription_status text;

COMMIT;
