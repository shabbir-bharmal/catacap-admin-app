-- Migration: Disbursal Requests metrics columns
-- Date: 2026-04-29
-- Purpose:
--   Add the four "metrics" columns to `disbursal_requests` that the
--   admin Node.js endpoints (`server/src/routes/adminDisbursalRequests.ts`)
--   already SELECT but that were never created in the live PostgreSQL
--   database. Their absence makes every read against the admin
--   disbursal-request list / detail / archived-list endpoints fail with
--   `column d.tracks_metrics does not exist`, which the frontend then
--   surfaces as "No disbursal requests found." on both the active and
--   the archived (recycle-bin) Disbursal Requests pages.
--
--   The column shapes mirror the .NET reference model
--   (`Back-End/Invest.Core/Models/DisbursalRequest.cs`):
--     * TracksMetrics       bool?      -> BOOLEAN NULL
--     * MetricsReport       string?    -> TEXT    NULL  (file URL/path)
--     * MetricsReportName   string?    -> TEXT    NULL  (display name)
--     * MetricsPairs        string?    -> TEXT    NULL  (JSON-encoded
--                                                       list of
--                                                       {key, value}
--                                                       pairs; the
--                                                       Node.js handler
--                                                       runs JSON.parse
--                                                       on the raw text)
--
--   All four columns are nullable with no default. Existing rows are
--   left untouched (NULLs are read back as `null`/missing in the API
--   response, which is exactly what the frontend already handles for
--   "no metrics tracked yet").
--
--   Every statement uses `ADD COLUMN IF NOT EXISTS` so this migration
--   is safe to run repeatedly and safe to run on environments that
--   already have some/all of the columns.
--
-- Run BEFORE deploying the matching application code (or alongside it
-- for environments that already deployed the code without the columns
-- and are now hitting the runtime error).

BEGIN;

ALTER TABLE disbursal_requests
    ADD COLUMN IF NOT EXISTS tracks_metrics      BOOLEAN NULL,
    ADD COLUMN IF NOT EXISTS metrics_report      TEXT    NULL,
    ADD COLUMN IF NOT EXISTS metrics_report_name TEXT    NULL,
    ADD COLUMN IF NOT EXISTS metrics_pairs       TEXT    NULL;

COMMIT;

-- Rollback (uncomment to revert):
-- BEGIN;
-- ALTER TABLE disbursal_requests
--     DROP COLUMN IF EXISTS metrics_pairs,
--     DROP COLUMN IF EXISTS metrics_report_name,
--     DROP COLUMN IF EXISTS metrics_report,
--     DROP COLUMN IF EXISTS tracks_metrics;
-- COMMIT;
