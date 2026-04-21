import type { PoolClient } from "pg";

export interface RestoredUserInfo {
  id: string;
  email: string | null;
}

/**
 * Restore the given soft-deleted users by flipping their `users` row back
 * to `is_deleted = false` (clearing `deleted_at` / `deleted_by`). Must run
 * inside an existing transaction (the caller is responsible for
 * BEGIN/COMMIT/ROLLBACK).
 *
 * No related records are touched in either direction. The user soft-delete
 * does not cascade to child records, and restoring a child record does not
 * cascade back to the parent user. Restoring a user only affects the
 * `users` row itself; the only entry point that touches user rows is the
 * explicit user restore endpoint.
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
