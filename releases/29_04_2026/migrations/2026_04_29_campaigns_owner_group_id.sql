-- Migration: Campaign owning group + auto-enrol flag
-- Date: 2026-04-29
-- Purpose:
--   Add two columns to `campaigns` that let an admin designate a single
--   "owning" group for a campaign and (independently) opt-in to having
--   every investor in that campaign automatically added to the owning
--   group as an accepted member.
--
--     * owner_group_id        INTEGER  NULL  -> FK to groups(id)
--                                              The group that "owns"
--                                              this campaign. NULL means
--                                              no owning group (default
--                                              behaviour, identical to
--                                              today's app).
--     * auto_enroll_investors BOOLEAN  NOT NULL DEFAULT FALSE
--                                              When TRUE *and* there is
--                                              an owner_group_id, every
--                                              new investor in this
--                                              campaign gets an
--                                              accepted membership row
--                                              inserted into `requests`
--                                              for the owning group, if
--                                              they are not already a
--                                              member.
--
--   Membership is recorded in `requests`
--     (request_owner_id, group_to_follow_id, status='accepted',
--      is_deleted=false). That table is the source of truth for the
--   "Members" list and the "Total group members" KPI — see
--   `server/src/routes/adminGroups.ts` `fetchMembers` and
--   `server/src/routes/finance.ts` `membersCount`.
--
--   Group-owner-managed promotion/display links between campaigns and
--   groups continue to live in `campaign_groups` and are unaffected by
--   this migration. The new owner_group_id is admin-controlled only
--   (gated server-side by the existing admin role check on
--   `PUT /api/admin/investment/:id`).
--
--   Both columns use ADD COLUMN IF NOT EXISTS so the migration is safe
--   to run repeatedly and on environments that already have one or both
--   columns. The FK constraint and supporting partial index are
--   wrapped in DO blocks so they only fire when missing.
--
-- Run BEFORE deploying the matching application code (or alongside it
-- for environments that already deployed the code without the columns).

BEGIN;

ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS owner_group_id        INTEGER,
    ADD COLUMN IF NOT EXISTS auto_enroll_investors BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name   = 'campaigns'
          AND constraint_name = 'campaigns_owner_group_id_fkey'
    ) THEN
        ALTER TABLE campaigns
            ADD CONSTRAINT campaigns_owner_group_id_fkey
            FOREIGN KEY (owner_group_id) REFERENCES groups(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_campaigns_owner_group_id
    ON campaigns (owner_group_id)
    WHERE owner_group_id IS NOT NULL;

COMMIT;

-- Rollback (uncomment to revert):
-- BEGIN;
-- DROP INDEX IF EXISTS idx_campaigns_owner_group_id;
-- ALTER TABLE campaigns
--     DROP CONSTRAINT IF EXISTS campaigns_owner_group_id_fkey,
--     DROP COLUMN     IF EXISTS auto_enroll_investors,
--     DROP COLUMN     IF EXISTS owner_group_id;
-- COMMIT;
