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
 * No related records are touched: the user delete no longer cascades, so
 * there is nothing to un-cascade on restore. Only users whose
 * `is_deleted = true` are processed. Returns the list of users that were
 * actually restored, so callers can log audit entries.
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


/**
 * Find soft-deleted parent user IDs for a given set of child records by
 * matching the user's email to a column on the child table (case-insensitive).
 * Only considers child rows that are themselves currently soft-deleted, so a
 * caller cannot accidentally restore a parent user when the child being
 * restored is not actually deleted.
 */
export async function findDeletedParentUserIdsByEmail(
  client: PoolClient,
  childTable: string,
  childIdColumn: string,
  childEmailColumn: string,
  childIds: Array<number | string>
): Promise<string[]> {
  if (!childIds.length) return [];
  const r = await client.query(
    `SELECT DISTINCT u.id
     FROM ${childTable} c
     JOIN users u ON LOWER(TRIM(u.email)) = LOWER(TRIM(c.${childEmailColumn}))
     WHERE c.${childIdColumn} = ANY($1)
       AND c.is_deleted = true
       AND u.is_deleted = true`,
    [childIds]
  );
  return r.rows.map((row: { id: string }) => row.id);
}

/**
 * Find soft-deleted parent user IDs for a given set of child records by
 * a direct foreign-key column on the child table. Only considers child rows
 * that are themselves currently soft-deleted.
 */
export async function findDeletedParentUserIdsByFk(
  client: PoolClient,
  childTable: string,
  childIdColumn: string,
  fkColumn: string,
  childIds: Array<number | string>
): Promise<string[]> {
  if (!childIds.length) return [];
  const r = await client.query(
    `SELECT DISTINCT u.id
     FROM ${childTable} c
     JOIN users u ON u.id = c.${fkColumn}
     WHERE c.${childIdColumn} = ANY($1)
       AND c.is_deleted = true
       AND u.is_deleted = true`,
    [childIds]
  );
  return r.rows.map((row: { id: string }) => row.id);
}

/**
 * Find soft-deleted parent user IDs for a given set of child records by
 * matching either a direct FK column OR a case-insensitive email column on
 * the child table. Useful for legacy tables (e.g. recommendations) that may
 * carry one or both linkages to the owning user. Only considers child rows
 * that are themselves currently soft-deleted.
 */
export async function findDeletedParentUserIdsByFkOrEmail(
  client: PoolClient,
  childTable: string,
  childIdColumn: string,
  fkColumn: string,
  emailColumn: string,
  childIds: Array<number | string>
): Promise<string[]> {
  if (!childIds.length) return [];
  const r = await client.query(
    `SELECT DISTINCT u.id
     FROM ${childTable} c
     JOIN users u
       ON u.id = c.${fkColumn}
       OR LOWER(TRIM(u.email)) = LOWER(TRIM(c.${emailColumn}))
     WHERE c.${childIdColumn} = ANY($1)
       AND c.is_deleted = true
       AND u.is_deleted = true`,
    [childIds]
  );
  return r.rows.map((row: { id: string }) => row.id);
}
