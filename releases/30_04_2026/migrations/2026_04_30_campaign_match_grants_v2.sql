-- Migration v2: Escrow + expiry for campaign match grants
-- Date: 2026-04-30
-- Adds two columns to campaign_match_grants:
--
--   reserved_amount  NUMERIC(15,2)  The exact amount deducted from the donor's
--                                   wallet at grant-creation time.  Drawn down
--                                   as matches fire; unused portion returned to
--                                   donor on deletion or expiry.
--
--   expires_at       TIMESTAMP      Optional deadline.  After this moment the
--                                   daily ExpireMatchGrants scheduler job
--                                   deactivates the grant and returns unused
--                                   funds to the donor's wallet.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS is safe to re-run.

BEGIN;

ALTER TABLE campaign_match_grants
  ADD COLUMN IF NOT EXISTS reserved_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expires_at      TIMESTAMP NULL;

COMMIT;

-- Rollback (uncomment to revert):
-- BEGIN;
-- ALTER TABLE campaign_match_grants
--   DROP COLUMN IF EXISTS reserved_amount,
--   DROP COLUMN IF EXISTS expires_at;
-- COMMIT;
