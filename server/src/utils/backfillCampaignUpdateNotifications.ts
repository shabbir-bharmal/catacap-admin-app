import type pg from "pg";

/**
 * Backfill in-app Investment Update notifications for an investor that just
 * joined a campaign.
 *
 * Why this exists:
 * Campaign Updates fan out their `user_notifications` rows ONCE — either at
 * creation time (in `routes/adminInvestment.ts`) or by the daily scheduler
 * (`scheduler/campaignUpdateNotifications.ts`) once `start_date` is reached.
 * Each fan-out reads `user_investments` at that moment and stamps
 * `campaign_updates.notifications_sent_at`. As a result, an investor who
 * joins AFTER an update has already fired never sees that update in their
 * notification feed, because no code path re-evaluates past updates.
 *
 * This helper closes that gap. It's safe to call any time a new
 * `user_investments` row is inserted for a (user, campaign) pair. For each
 * already-broadcast, not-yet-expired update on the campaign, it inserts a
 * notification for this user, deduped by the originating
 * `campaign_update_id` so repeated calls (re-enrollment, status flips,
 * legacy fan-out collisions) never produce duplicates AND two updates
 * with the same subject still each produce their own notification.
 *
 * Filters mirror the existing scheduler:
 *   - update is not soft-deleted
 *   - notifications have already been broadcast (`notifications_sent_at IS NOT NULL`)
 *   - update has not expired (`end_date IS NULL OR end_date >= NOW()`)
 *
 * Pass the same client used for the surrounding INSERT/UPDATE so the
 * backfill writes inside the caller's transaction.
 */
export async function backfillCampaignUpdateNotifications(
  client: pg.PoolClient,
  userId: string | null | undefined,
  campaignId: number | null | undefined,
): Promise<number> {
  if (!userId || !campaignId) return 0;

  const result = await client.query(
    `INSERT INTO user_notifications
        (title, description, url_to_redirect, is_read, target_user_id,
         picture_file_name, campaign_update_id)
     SELECT
        cu.subject,
        COALESCE(
          NULLIF(TRIM(cu.short_description), ''),
          LEFT(regexp_replace(COALESCE(cu.description, ''), '<[^>]*>', '', 'g'), 240)
        ),
        '/investments/' || COALESCE(NULLIF(TRIM(c.property), ''), c.id::text),
        false,
        $1::varchar,
        COALESCE(c.image_file_name, c.tile_image_file_name),
        cu.id
       FROM campaign_updates cu
       JOIN campaigns c ON c.id = cu.campaign_id
      WHERE cu.campaign_id = $2
        AND (cu.is_deleted IS NULL OR cu.is_deleted = false)
        AND cu.notifications_sent_at IS NOT NULL
        AND (cu.end_date IS NULL OR cu.end_date >= NOW())
        AND NOT EXISTS (
          SELECT 1 FROM user_notifications un
           WHERE un.target_user_id    = $1::varchar
             AND un.campaign_update_id = cu.id
        )`,
    [userId, campaignId],
  );

  return result.rowCount ?? 0;
}
