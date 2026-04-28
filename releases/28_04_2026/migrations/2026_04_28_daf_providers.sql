-- Migration: DAF Providers master table + seed
-- Date: 2026-04-28
-- Purpose:
--   Create the `daf_providers` table that the Node.js Postgres-backed
--   admin Site Configuration and Pending Grants routes already read
--   from / write to. The table did not previously exist in Postgres
--   (the canonical seed lived only in the .NET backend at
--   `Back-End/Invest.Repo/Data/DAFProviderData.cs`), so the Pending
--   Grants DAF Provider filter dropdown was empty and the
--   `GET /api/admin/site-configuration/daf-providers` endpoint was
--   returning HTTP 500.
--
--   This migration creates the table with the columns the existing
--   route code expects (`id`, `provider_name`, `provider_url`,
--   `is_active`) and seeds it with the same 8 providers (and same
--   integer ids) as the .NET seed source.
--
-- Idempotency:
--   - `CREATE TABLE IF NOT EXISTS` so re-running is safe.
--   - The seed `INSERT` joins against `daf_providers` with a
--     case-insensitive / trimmed match on `provider_name` and only
--     inserts rows that are missing, so re-running won't duplicate.
--   - After seeding we reset `daf_providers_id_seq` to
--     `MAX(id) + 1` so future inserts via the Site Configuration
--     "Add DAF Provider" flow get a fresh id that won't collide
--     with the seeded ones.
--
-- Run BEFORE deploying the application code that depends on the
-- table being populated.

BEGIN;

CREATE TABLE IF NOT EXISTS daf_providers (
    id            SERIAL PRIMARY KEY,
    provider_name TEXT    NOT NULL,
    provider_url  TEXT,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

-- Seed the 8 known providers, mirroring the canonical .NET seed in
-- `Back-End/Invest.Repo/Data/DAFProviderData.cs`. Skip any provider
-- whose name already exists (case-insensitive, trimmed) so re-runs
-- are no-ops and don't conflict with rows admins may have already
-- added through the Site Configuration UI.
INSERT INTO daf_providers (id, provider_name, provider_url, is_active)
SELECT v.id, v.provider_name, v.provider_url, v.is_active
FROM (VALUES
    (1, 'Fidelity Charitable',                   'https://charitablegift.fidelity.com/public/login/donor',         TRUE),
    (2, 'Jewish Foundation',                     'https://www.iphiview.com/ujef/Home/tabid/326/Default.aspx',      TRUE),
    (3, 'ImpactAssets',                          'https://iphi.stellartechsol.com/calvert/LogIn/tabid/444/Default.aspx', TRUE),
    (4, 'National Philanthropic Trust',          'https://nptgivingpoint.org/',                                    TRUE),
    (5, 'DAFgiving360: Charles Schwab',          'https://www.schwab.com/',                                        TRUE),
    (6, 'Silicon Valley Community Foundation',   'https://donor.siliconvalleycf.org/s/login/',                     TRUE),
    (7, 'Vanguard Charitable',                   'https://www.vanguardcharitable.org/',                            TRUE),
    (8, 'Bay Area Jewish Federation',            'https://jewishfed.my.site.com/portal/s/login/',                  TRUE)
) AS v(id, provider_name, provider_url, is_active)
WHERE NOT EXISTS (
    SELECT 1 FROM daf_providers d
    WHERE LOWER(TRIM(d.provider_name)) = LOWER(TRIM(v.provider_name))
);

-- Move the sequence past the largest existing id so subsequent
-- inserts via the Site Configuration "Add DAF Provider" flow don't
-- collide with the seeded ids above.
SELECT setval(
    pg_get_serial_sequence('daf_providers', 'id'),
    GREATEST((SELECT COALESCE(MAX(id), 0) FROM daf_providers), 1),
    TRUE
);

COMMIT;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DROP TABLE IF EXISTS daf_providers;
-- COMMIT;
-- =============================================================================
