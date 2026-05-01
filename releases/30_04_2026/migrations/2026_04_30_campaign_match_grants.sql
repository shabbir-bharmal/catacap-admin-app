-- Migration: Campaign investment matching grants
-- Date: 2026-04-30
-- Purpose:
--   Enables per-campaign "matching" where a designated donor's wallet is
--   automatically drawn on whenever another investor's recommendation is
--   approved for a campaign covered by the match grant, up to a configured
--   total cap and optional per-investment ceiling.
--
--   Type notes:
--     users.id        -> character varying(450)
--     campaigns.id    -> integer
--     recommendations.id -> integer
--
--   Tables:
--     campaign_match_grants            – The grant configuration
--     campaign_match_grant_campaigns   – Which campaigns this grant covers
--     campaign_match_grant_activity    – Log of every triggered match
--
--   Trigger location: adminRecommendations.ts PUT /:id after COMMIT when
--   status transitions to "approved".
--
--   Idempotent: all CREATE TABLE/INDEX wrapped with IF NOT EXISTS.

BEGIN;

-- ------------------------------------------------------------------ --
-- 1. campaign_match_grants
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS campaign_match_grants (
    id                  SERIAL PRIMARY KEY,
    name                TEXT NOT NULL DEFAULT '',
    donor_user_id       VARCHAR(450) NOT NULL,   -- references users(id)
    total_cap           NUMERIC(15,2) NULL,       -- NULL = unlimited
    amount_used         NUMERIC(15,2) NOT NULL DEFAULT 0,
    match_type          TEXT NOT NULL DEFAULT 'full'
                            CHECK (match_type IN ('full', 'capped')),
    per_investment_cap  NUMERIC(15,2) NULL,        -- used when match_type = 'capped'
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    notes               TEXT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'campaign_match_grants'
          AND constraint_name = 'campaign_match_grants_donor_user_id_fkey'
    ) THEN
        ALTER TABLE campaign_match_grants
            ADD CONSTRAINT campaign_match_grants_donor_user_id_fkey
            FOREIGN KEY (donor_user_id) REFERENCES users(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cmg_donor_user
    ON campaign_match_grants (donor_user_id);
CREATE INDEX IF NOT EXISTS idx_cmg_is_active
    ON campaign_match_grants (is_active);

-- ------------------------------------------------------------------ --
-- 2. campaign_match_grant_campaigns  (which campaigns a grant covers)
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS campaign_match_grant_campaigns (
    id              SERIAL PRIMARY KEY,
    match_grant_id  INTEGER NOT NULL,   -- references campaign_match_grants(id)
    campaign_id     INTEGER NOT NULL,   -- references campaigns(id)
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'campaign_match_grant_campaigns'
          AND constraint_name = 'campaign_match_grant_campaigns_mgid_fkey'
    ) THEN
        ALTER TABLE campaign_match_grant_campaigns
            ADD CONSTRAINT campaign_match_grant_campaigns_mgid_fkey
            FOREIGN KEY (match_grant_id) REFERENCES campaign_match_grants(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'campaign_match_grant_campaigns'
          AND constraint_name = 'campaign_match_grant_campaigns_cid_fkey'
    ) THEN
        ALTER TABLE campaign_match_grant_campaigns
            ADD CONSTRAINT campaign_match_grant_campaigns_cid_fkey
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'campaign_match_grant_campaigns'
          AND constraint_name = 'campaign_match_grant_campaigns_unique'
    ) THEN
        ALTER TABLE campaign_match_grant_campaigns
            ADD CONSTRAINT campaign_match_grant_campaigns_unique
            UNIQUE (match_grant_id, campaign_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cmgc_grant
    ON campaign_match_grant_campaigns (match_grant_id);
CREATE INDEX IF NOT EXISTS idx_cmgc_campaign
    ON campaign_match_grant_campaigns (campaign_id);

-- ------------------------------------------------------------------ --
-- 3. campaign_match_grant_activity  (audit log of every triggered match)
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS campaign_match_grant_activity (
    id                              SERIAL PRIMARY KEY,
    match_grant_id                  INTEGER NOT NULL,    -- references campaign_match_grants(id)
    campaign_id                     INTEGER NULL,         -- which campaign triggered the match
    triggered_by_user_id            VARCHAR(450) NULL,    -- the investor who triggered the match
    triggered_by_recommendation_id  INTEGER NULL,         -- the investor's recommendation id
    donor_recommendation_id         INTEGER NULL,         -- the auto-created rec for the donor
    amount                          NUMERIC(15,2) NOT NULL,
    created_at                      TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'campaign_match_grant_activity'
          AND constraint_name = 'campaign_match_grant_activity_mgid_fkey'
    ) THEN
        ALTER TABLE campaign_match_grant_activity
            ADD CONSTRAINT campaign_match_grant_activity_mgid_fkey
            FOREIGN KEY (match_grant_id) REFERENCES campaign_match_grants(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cmga_grant
    ON campaign_match_grant_activity (match_grant_id);
CREATE INDEX IF NOT EXISTS idx_cmga_campaign
    ON campaign_match_grant_activity (campaign_id);
CREATE INDEX IF NOT EXISTS idx_cmga_triggered_by
    ON campaign_match_grant_activity (triggered_by_user_id);

COMMIT;

-- Rollback (uncomment to revert):
-- BEGIN;
-- DROP TABLE IF EXISTS campaign_match_grant_activity;
-- DROP TABLE IF EXISTS campaign_match_grant_campaigns;
-- DROP TABLE IF EXISTS campaign_match_grants;
-- COMMIT;
