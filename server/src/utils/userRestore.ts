import type { PoolClient } from "pg";
import { logAudit } from "./auditLog.js";

export interface RestoredUserInfo {
  id: string;
  email: string | null;
}

/**
 * Helper for record-restore handlers. Given the owning user IDs of the
 * records being restored, restore any of those users that are currently
 * soft-deleted (and only those). Runs inside the caller's transaction and
 * emits the same audit log entries the direct user restore endpoint emits.
 *
 * Pass `null`/`undefined` user IDs are ignored. Duplicates are de-duplicated
 * so a single user is updated once even when many records share the owner.
 *
 * Returns the list of users that were actually restored.
 */
export async function restoreOwningUsersForRecordsInTx(
  client: PoolClient,
  userIds: ReadonlyArray<string | null | undefined>,
  updatedBy: string | null
): Promise<RestoredUserInfo[]> {
  const cleaned = Array.from(
    new Set(userIds.filter((id): id is string => typeof id === "string" && id.length > 0))
  );
  if (cleaned.length === 0) return [];

  const restored = await restoreUsersWithCascadeInTx(client, cleaned);

  for (const user of restored) {
    await logAudit({
      tableName: "users",
      recordId: user.id,
      actionType: "Modified",
      oldValues: { is_deleted: true },
      newValues: { is_deleted: false },
      updatedBy,
    });
  }

  return restored;
}

/**
 * Restore the given soft-deleted users by flipping their `users` row back
 * to `is_deleted = false` (clearing `deleted_at` / `deleted_by`). Must run
 * inside an existing transaction (the caller is responsible for
 * BEGIN/COMMIT/ROLLBACK).
 *
 * No related records are touched in either direction. The user soft-delete
 * does not cascade to child records, and restoring a child record does not
 * cascade back to the parent user from this function. Restoring a user only
 * affects the `users` row itself.
 *
 * Entry points that may flip a user back to `is_deleted = false`:
 *   - the explicit admin user restore endpoint, and
 *   - record-restore endpoints, via `restoreOwningUsersForRecordsInTx`,
 *     which auto-restore the owning user of any explicitly-restored record.
 *
 * Only users whose `is_deleted = true` are processed. Returns the list of
 * users that were actually restored, so callers can log audit entries.
 */
export async function restoreUsersWithCascadeInTx(
  client: PoolClient,
  userIds: string[]
): Promise<RestoredUserInfo[]> {
  if (!userIds || userIds.length === 0) return [];

  const usersResult = await client.query(
    `SELECT id, email
     FROM users
     WHERE id = ANY($1) AND is_deleted = true`,
    [userIds]
  );

  if (usersResult.rows.length === 0) return [];

  type DeletedUser = { id: string; email: string | null };
  const deletedUsers = usersResult.rows as DeletedUser[];

  await client.query(
    `UPDATE users SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
     WHERE id = ANY($1) AND is_deleted = true`,
    [deletedUsers.map((u) => u.id)]
  );

  return deletedUsers.map((u) => ({ id: u.id, email: u.email }));
}
