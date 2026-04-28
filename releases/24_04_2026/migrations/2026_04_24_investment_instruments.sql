-- Migration: Rename "Investment Types" to "Investment Instruments"
-- Date: 2026-04-24
-- Purpose:
--   The product is renaming the concept "Investment Types" to
--   "Investment Instruments". This migration applies that rename to the
--   database in two places so every server query that previously read
--   from / wrote to "investment_types" now targets "investment_instruments":
--
--     1. The lookup table `investment_types` is renamed to
--        `investment_instruments`.
--     2. The `investment_types` column on `campaigns` (which stores the
--        comma-separated list of selected lookup IDs for a campaign) is
--        renamed to `investment_instruments`.
--
--   IMPORTANT: This migration does NOT touch the
--   `investment_requests.investment_types` column on the public RaiseMoney
--   submissions table. That column is intentionally left in place.
--
-- Run this BEFORE deploying the application code that has been updated
-- to query `investment_instruments`.

BEGIN;

-- 1) Rename the lookup table investment_types -> investment_instruments
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'investment_types'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'investment_instruments'
    ) THEN
        ALTER TABLE investment_types RENAME TO investment_instruments;
    END IF;
END $$;

-- 2) Rename the column campaigns.investment_types -> campaigns.investment_instruments
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'campaigns'
          AND column_name = 'investment_types'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'campaigns'
          AND column_name = 'investment_instruments'
    ) THEN
        ALTER TABLE campaigns RENAME COLUMN investment_types TO investment_instruments;
    END IF;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- To revert this migration, run the statements below (wrapped in a transaction).
-- This will rename the lookup table and the campaigns column back to their
-- previous names.
--
-- BEGIN;
--
-- DO $$
-- BEGIN
--     IF EXISTS (
--         SELECT 1 FROM information_schema.columns
--         WHERE table_schema = 'public'
--           AND table_name = 'campaigns'
--           AND column_name = 'investment_instruments'
--     ) AND NOT EXISTS (
--         SELECT 1 FROM information_schema.columns
--         WHERE table_schema = 'public'
--           AND table_name = 'campaigns'
--           AND column_name = 'investment_types'
--     ) THEN
--         ALTER TABLE campaigns RENAME COLUMN investment_instruments TO investment_types;
--     END IF;
-- END $$;
--
-- DO $$
-- BEGIN
--     IF EXISTS (
--         SELECT 1 FROM information_schema.tables
--         WHERE table_schema = 'public'
--           AND table_name = 'investment_instruments'
--     ) AND NOT EXISTS (
--         SELECT 1 FROM information_schema.tables
--         WHERE table_schema = 'public'
--           AND table_name = 'investment_types'
--     ) THEN
--         ALTER TABLE investment_instruments RENAME TO investment_types;
--     END IF;
-- END $$;
--
-- COMMIT;
-- =============================================================================
