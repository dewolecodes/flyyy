-- Migration: add plan column to organization
-- Adds a NOT NULL text column `plan` with default 'free'. Idempotent.

BEGIN;

ALTER TABLE IF EXISTS organization
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';

COMMIT;
