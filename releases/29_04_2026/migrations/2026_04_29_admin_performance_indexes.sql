-- Migration: Admin performance indexes
-- Date: 2026-04-29
-- Purpose:
--   Add B-tree / expression indexes on the foreign-key and join columns
--   used by the most frequent admin-side queries (Dashboard, Investments
--   list, Users list, Groups list, Pending Grants list, Investment notes,
--   Consolidated Finances).
--
--   Before this migration the database had only PRIMARY KEY indexes on
--   these tables. As a result every admin page forced PostgreSQL to do
--   sequential scans on the joined / filtered tables, and the cost of
--   each query grew linearly with table size. The two heaviest pages
--   (Dashboard summary and Consolidated Finances) compounded this by
--   issuing many such queries serially within a single request.
--
--   All statements use CREATE INDEX IF NOT EXISTS so this migration is
--   safe to run repeatedly and safe to run on environments that already
--   have some of the indexes (for example, environments where the
--   on-startup helper `ensureAdminPerformanceIndexes` in server/src/db.ts
--   has already created them).
--
--   These are pure read-path optimisations: no table data is altered,
--   no columns or constraints are added, dropped, or renamed.
--
-- Run BEFORE or alongside deploying the matching application code; the
-- application does not require these indexes to function, but query
-- latency will be substantially higher without them.

BEGIN;

-- recommendations: aggregated by campaign_id and joined on LOWER(user_email)
CREATE INDEX IF NOT EXISTS idx_recommendations_campaign_id
    ON recommendations (campaign_id);

CREATE INDEX IF NOT EXISTS idx_recommendations_lower_email
    ON recommendations (LOWER(user_email));

CREATE INDEX IF NOT EXISTS idx_recommendations_status
    ON recommendations (status);

-- users: joined via LOWER(email) in dashboard, finance, top-donors, etc.
CREATE INDEX IF NOT EXISTS idx_users_lower_email
    ON users (LOWER(email));

-- user_roles: joined on both sides in nearly every admin query
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id
    ON user_roles (role_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
    ON user_roles (user_id);

-- requests: lookups by group + status (Groups members count) and by owner
-- (Users list filter)
CREATE INDEX IF NOT EXISTS idx_requests_group_status
    ON requests (group_to_follow_id, status);

CREATE INDEX IF NOT EXISTS idx_requests_owner
    ON requests (request_owner_id);

-- pending_grants and notes
CREATE INDEX IF NOT EXISTS idx_pending_grants_user_id
    ON pending_grants (user_id);

CREATE INDEX IF NOT EXISTS idx_pending_grants_campaign_id
    ON pending_grants (campaign_id);

CREATE INDEX IF NOT EXISTS idx_pending_grant_notes_grant_id
    ON pending_grant_notes (pending_grant_id);

-- investment_notes: scanned by campaign_id when building the Investments list
CREATE INDEX IF NOT EXISTS idx_investment_notes_campaign_id
    ON investment_notes (campaign_id);

-- account_balance_change_logs and group_account_balances
CREATE INDEX IF NOT EXISTS idx_acl_user_id
    ON account_balance_change_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_acl_group_id
    ON account_balance_change_logs (group_id);

CREATE INDEX IF NOT EXISTS idx_gab_user_id
    ON group_account_balances (user_id);

CREATE INDEX IF NOT EXISTS idx_gab_group_id
    ON group_account_balances (group_id);

-- campaign_groups: PK already covers (campaigns_id, groups_id) — adding the
-- reverse direction so lookups by group are index-backed.
CREATE INDEX IF NOT EXISTS idx_campaign_groups_groups_id
    ON campaign_groups (groups_id);

-- campaigns: deleted_by lookup join + group_for_private_access_id used in
-- Groups list UNION
CREATE INDEX IF NOT EXISTS idx_campaigns_deleted_by
    ON campaigns (deleted_by);

CREATE INDEX IF NOT EXISTS idx_campaigns_private_access_group
    ON campaigns (group_for_private_access_id);

-- groups: owner_id IN (...) lookup in Consolidated Finances
CREATE INDEX IF NOT EXISTS idx_groups_owner_id
    ON groups (owner_id);

-- asset_based_payment_requests: filtered by user_id IN (...) in Consolidated
-- Finances
CREATE INDEX IF NOT EXISTS idx_asset_based_payment_requests_user_id
    ON asset_based_payment_requests (user_id);

COMMIT;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- These indexes are non-destructive read-path optimisations. To revert this
-- migration, drop the indexes individually. Application code does not depend
-- on their existence.
--
-- BEGIN;
--
-- DROP INDEX IF EXISTS idx_recommendations_campaign_id;
-- DROP INDEX IF EXISTS idx_recommendations_lower_email;
-- DROP INDEX IF EXISTS idx_recommendations_status;
-- DROP INDEX IF EXISTS idx_users_lower_email;
-- DROP INDEX IF EXISTS idx_user_roles_role_id;
-- DROP INDEX IF EXISTS idx_user_roles_user_id;
-- DROP INDEX IF EXISTS idx_requests_group_status;
-- DROP INDEX IF EXISTS idx_requests_owner;
-- DROP INDEX IF EXISTS idx_pending_grants_user_id;
-- DROP INDEX IF EXISTS idx_pending_grants_campaign_id;
-- DROP INDEX IF EXISTS idx_pending_grant_notes_grant_id;
-- DROP INDEX IF EXISTS idx_investment_notes_campaign_id;
-- DROP INDEX IF EXISTS idx_acl_user_id;
-- DROP INDEX IF EXISTS idx_acl_group_id;
-- DROP INDEX IF EXISTS idx_gab_user_id;
-- DROP INDEX IF EXISTS idx_gab_group_id;
-- DROP INDEX IF EXISTS idx_campaign_groups_groups_id;
-- DROP INDEX IF EXISTS idx_campaigns_deleted_by;
-- DROP INDEX IF EXISTS idx_campaigns_private_access_group;
-- DROP INDEX IF EXISTS idx_groups_owner_id;
-- DROP INDEX IF EXISTS idx_asset_based_payment_requests_user_id;
--
-- COMMIT;
-- =============================================================================
