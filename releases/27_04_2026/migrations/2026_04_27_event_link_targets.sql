-- Migration: Event link targets via junction table
-- Date: 2026-04-27
-- Purpose:
--   Allow admins to link an event to one or more Investments, Groups,
--   or Custom Pages (static pages, identified by slug) directly from
--   the event create/edit dialog.
--
--   The target is polymorphic:
--     * integer-id-backed entities use `target_id` (investments / groups)
--     * slug-backed entities use `target_slug` (custom-pages, which come
--       from a static page list keyed by slug, not by database id)
--
--   A CHECK constraint enforces that each row populates exactly one of
--   the two and that the choice matches `target_type`.
--
-- Run BEFORE deploying the application code that reads/writes via the
-- new junction table.

BEGIN;

CREATE TABLE IF NOT EXISTS event_links (
    id          BIGSERIAL PRIMARY KEY,
    event_id    INTEGER NOT NULL,
    target_type TEXT    NOT NULL,
    target_id   INTEGER NULL,
    target_slug TEXT    NULL,
    created_at  TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_event_links_event
        FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
    CONSTRAINT chk_event_links_target_type
        CHECK (target_type IN ('investments', 'groups', 'custom-pages')),
    CONSTRAINT chk_event_links_target_shape CHECK (
        (target_type IN ('investments', 'groups')
            AND target_id   IS NOT NULL
            AND target_slug IS NULL)
        OR
        (target_type = 'custom-pages'
            AND target_slug IS NOT NULL
            AND target_id   IS NULL)
    )
);

-- Partial unique indexes so NULL handling for the unused side is
-- correct on every Postgres version (no dependency on PG 15+
-- NULLS NOT DISTINCT).
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_links_id_target
    ON event_links (event_id, target_type, target_id)
    WHERE target_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_links_slug_target
    ON event_links (event_id, target_type, target_slug)
    WHERE target_slug IS NOT NULL;

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_event_links_event_id
    ON event_links (event_id);

CREATE INDEX IF NOT EXISTS idx_event_links_target_id
    ON event_links (target_type, target_id)
    WHERE target_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_links_target_slug
    ON event_links (target_type, target_slug)
    WHERE target_slug IS NOT NULL;

COMMIT;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DROP TABLE IF EXISTS event_links;
-- COMMIT;
-- =============================================================================
