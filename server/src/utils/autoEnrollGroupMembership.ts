import type pg from "pg";

/**
 * If the given campaign is configured with an owner_group_id and
 * auto_enroll_investors = TRUE, ensure the user has an accepted
 * membership row in `requests` for that owning group.
 *
 * Idempotent: a user that is already an accepted member is left alone.
 * Safe to call multiple times for the same (user, campaign) pair.
 *
 * Membership semantics match `server/src/routes/adminGroups.ts`
 * fetchMembers and `server/src/routes/finance.ts` membersCount:
 *   requests.request_owner_id   = userId
 *   requests.group_to_follow_id = owner_group_id
 *   requests.status             = 'accepted'
 *   requests.is_deleted         = false (or null)
 *
 * Pass the same client used for the surrounding INSERT/UPDATE so the
 * enrol writes inside the caller's transaction.
 */
export async function autoEnrollInvestorIfApplicable(
  client: pg.PoolClient,
  userId: string | null | undefined,
  campaignId: number | null | undefined,
): Promise<void> {
  if (!userId || !campaignId) return;

  await client.query(
    `INSERT INTO requests (request_owner_id, group_to_follow_id, status, created_at)
     SELECT $1, c.owner_group_id, 'accepted', NOW()
     FROM campaigns c
     WHERE c.id = $2
       AND c.owner_group_id IS NOT NULL
       AND c.auto_enroll_investors = TRUE
       AND NOT EXISTS (
         SELECT 1 FROM requests r
         WHERE r.request_owner_id = $1
           AND r.group_to_follow_id = c.owner_group_id
           AND r.status = 'accepted'
           AND (r.is_deleted IS NULL OR r.is_deleted = FALSE)
       )`,
    [userId, campaignId],
  );
}
