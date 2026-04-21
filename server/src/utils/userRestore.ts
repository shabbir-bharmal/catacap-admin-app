import type { PoolClient } from "pg";

export interface RestoredUserInfo {
  id: string;
  email: string | null;
}

interface TableMeta {
  exists: boolean;
  hasIsDeleted: boolean;
  hasDeletedAt: boolean;
  hasDeletedBy: boolean;
}

/**
 * Restore the given soft-deleted users along with the records that were
 * cascaded down by their delete event. Must run inside an existing
 * transaction (the caller is responsible for BEGIN/COMMIT/ROLLBACK).
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
    `SELECT id, email, deleted_at, deleted_by
     FROM users
     WHERE id = ANY($1) AND is_deleted = true`,
    [userIds]
  );

  if (usersResult.rows.length === 0) return [];

  type DeletedUser = {
    id: string;
    email: string | null;
    deleted_at: Date | string | null;
    deleted_by: string | null;
  };
  const deletedUsers = usersResult.rows as DeletedUser[];

  const tableMetaCache = new Map<string, TableMeta>();
  const tableMeta = async (table: string): Promise<TableMeta> => {
    const cached = tableMetaCache.get(table);
    if (cached) return cached;
    const t = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );
    const exists = t.rows.length > 0;
    let hasIsDeleted = false;
    let hasDeletedAt = false;
    let hasDeletedBy = false;
    if (exists) {
      const c = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
           AND column_name IN ('is_deleted', 'deleted_at', 'deleted_by')`,
        [table]
      );
      const cols = new Set(c.rows.map((r: { column_name: string }) => r.column_name));
      hasIsDeleted = cols.has("is_deleted");
      hasDeletedAt = cols.has("deleted_at");
      hasDeletedBy = cols.has("deleted_by");
    }
    const meta: TableMeta = { exists, hasIsDeleted, hasDeletedAt, hasDeletedBy };
    tableMetaCache.set(table, meta);
    return meta;
  };

  for (const user of deletedUsers) {
    const userId = user.id;
    const email = (user.email || "").trim().toLowerCase();
    const deletedAt = user.deleted_at;
    const deletedBy = user.deleted_by;

    const appendEventScope = (
      meta: { hasDeletedAt: boolean; hasDeletedBy: boolean },
      conds: string[],
      params: unknown[]
    ): void => {
      let idx = params.length + 1;
      if (meta.hasDeletedAt) {
        if (deletedAt === null) {
          conds.push(`deleted_at IS NULL`);
        } else {
          conds.push(`deleted_at = $${idx++}`);
          params.push(deletedAt);
        }
      }
      if (meta.hasDeletedBy) {
        if (deletedBy === null) {
          conds.push(`deleted_by IS NULL`);
        } else {
          conds.push(`deleted_by = $${idx++}`);
          params.push(deletedBy);
        }
      }
    };

    const collectIdsScoped = async (
      table: string,
      where: string,
      whereParams: unknown[]
    ): Promise<string[]> => {
      const meta = await tableMeta(table);
      if (!meta.exists || !meta.hasIsDeleted) return [];
      const conds: string[] = [`(${where})`, `is_deleted = true`];
      const params: unknown[] = [...whereParams];
      appendEventScope(meta, conds, params);
      const r = await client.query(
        `SELECT id FROM ${table} WHERE ${conds.join(" AND ")}`,
        params
      );
      return r.rows.map((row: { id: string }) => row.id);
    };

    const restoreScoped = async (
      table: string,
      where: string,
      whereParams: unknown[]
    ): Promise<void> => {
      const meta = await tableMeta(table);
      if (!meta.exists || !meta.hasIsDeleted) return;
      const setParts: string[] = ["is_deleted = false"];
      if (meta.hasDeletedAt) setParts.push("deleted_at = NULL");
      if (meta.hasDeletedBy) setParts.push("deleted_by = NULL");
      const conds: string[] = [`(${where})`, `is_deleted = true`];
      const params: unknown[] = [...whereParams];
      appendEventScope(meta, conds, params);
      await client.query(
        `UPDATE ${table} SET ${setParts.join(", ")} WHERE ${conds.join(" AND ")}`,
        params
      );
    };

    const restoreNotes = async (
      table: string,
      parentColumn: string,
      parentIds: string[]
    ): Promise<void> => {
      const meta = await tableMeta(table);
      if (!meta.exists) return;
      const conds: string[] = [`created_by = $1`];
      const params: unknown[] = [userId];
      if (parentIds.length > 0) {
        conds.push(`${parentColumn} = ANY($2)`);
        params.push(parentIds);
      }
      await restoreScoped(table, conds.join(" OR "), params);
    };

    // -------- Phase 1: collect IDs of every record cascaded in this delete event --------
    const campaignIds = await collectIdsScoped("campaigns", `user_id = $1`, [userId]);

    const ownedOrCampaignWhere = (idIdx: number, campaignIdx: number) =>
      campaignIds.length > 0
        ? `(user_id = $${idIdx} OR campaign_id = ANY($${campaignIdx}))`
        : `user_id = $${idIdx}`;
    const ownedOrCampaignParams = (): unknown[] =>
      campaignIds.length > 0 ? [userId, campaignIds] : [userId];

    const pendingGrantIds = await collectIdsScoped(
      "pending_grants",
      ownedOrCampaignWhere(1, 2),
      ownedOrCampaignParams()
    );
    const disbursalIds = await collectIdsScoped(
      "disbursal_requests",
      ownedOrCampaignWhere(1, 2),
      ownedOrCampaignParams()
    );
    const assetIds = await collectIdsScoped(
      "asset_based_payment_requests",
      ownedOrCampaignWhere(1, 2),
      ownedOrCampaignParams()
    );
    const completedIds = campaignIds.length
      ? await collectIdsScoped(
          "completed_investment_details",
          `campaign_id = ANY($1)`,
          [campaignIds]
        )
      : [];
    const returnMasterIds = campaignIds.length
      ? (
          await client.query(
            `SELECT id FROM return_masters WHERE campaign_id = ANY($1)`,
            [campaignIds]
          )
        ).rows.map((r: { id: string }) => r.id)
      : [];
    const formSubmissionIds = await collectIdsScoped(
      "form_submissions",
      `LOWER(TRIM(email)) = $1`,
      [email]
    );
    const groupIds = await collectIdsScoped("groups", `owner_id = $1`, [userId]);

    // -------- Phase 2: notes & log children --------
    {
      const conds: string[] = [`user_id = $1`];
      const params: unknown[] = [userId];
      let idx = 2;
      if (campaignIds.length) { conds.push(`campaign_id = ANY($${idx++})`); params.push(campaignIds); }
      if (assetIds.length) { conds.push(`asset_based_payment_request_id = ANY($${idx++})`); params.push(assetIds); }
      if (pendingGrantIds.length) { conds.push(`pending_grants_id = ANY($${idx++})`); params.push(pendingGrantIds); }
      await restoreScoped("account_balance_change_logs", conds.join(" OR "), params);
    }

    {
      const conds: string[] = [`user_id = $1`];
      const params: unknown[] = [userId];
      if (pendingGrantIds.length) { conds.push(`pending_grant_id = ANY($2)`); params.push(pendingGrantIds); }
      await restoreScoped("scheduled_email_logs", conds.join(" OR "), params);
    }

    {
      const conds: string[] = [`user_id = $1`];
      const params: unknown[] = [userId];
      let idx = 2;
      if (pendingGrantIds.length) { conds.push(`pending_grants_id = ANY($${idx++})`); params.push(pendingGrantIds); }
      if (campaignIds.length) { conds.push(`campaign_id = ANY($${idx++})`); params.push(campaignIds); }
      await restoreScoped("recommendations", conds.join(" OR "), params);
    }

    {
      const conds: string[] = [`user_id = $1`];
      const params: unknown[] = [userId];
      if (returnMasterIds.length) { conds.push(`return_master_id = ANY($2)`); params.push(returnMasterIds); }
      await restoreScoped("return_details", conds.join(" OR "), params);
    }

    await restoreNotes("pending_grant_notes", "pending_grant_id", pendingGrantIds);
    await restoreNotes("disbursal_request_notes", "disbursal_request_id", disbursalIds);
    await restoreNotes("asset_based_payment_request_notes", "request_id", assetIds);
    await restoreNotes("completed_investment_notes", "completed_investment_id", completedIds);
    await restoreNotes("investment_notes", "campaign_id", campaignIds);
    await restoreNotes("form_submission_notes", "form_submission_id", formSubmissionIds);

    // -------- Phase 3: parent rows for owned-campaign sub-entities --------
    if (pendingGrantIds.length) {
      await restoreScoped("pending_grants", `id = ANY($1)`, [pendingGrantIds]);
    }
    if (assetIds.length) {
      await restoreScoped("asset_based_payment_requests", `id = ANY($1)`, [assetIds]);
    }
    if (disbursalIds.length) {
      await restoreScoped("disbursal_requests", `id = ANY($1)`, [disbursalIds]);
    }
    if (completedIds.length) {
      await restoreScoped("completed_investment_details", `id = ANY($1)`, [completedIds]);
    }

    if (campaignIds.length > 0) {
      // Note: the delete handler hard-deletes ach_payment_requests and
      // investment_tag_mappings rows tied to these campaigns. Those are
      // unrecoverable and intentionally not restored here.
      await restoreScoped("user_investments", `campaign_id = ANY($1)`, [campaignIds]);
      await restoreScoped("campaigns", `id = ANY($1)`, [campaignIds]);
    }

    // -------- Phase 4: groups --------
    if (groupIds.length > 0) {
      await restoreScoped("requests", `group_to_follow_id = ANY($1)`, [groupIds]);
      await restoreScoped("group_account_balances", `group_id = ANY($1)`, [groupIds]);
      await restoreScoped("leader_groups", `group_id = ANY($1)`, [groupIds]);
      await restoreScoped("groups", `id = ANY($1)`, [groupIds]);
    }

    // -------- Phase 5: user-direct ownership --------
    await restoreScoped("user_investments", `user_id = $1`, [userId]);
    await restoreScoped("user_notifications", `target_user_id = $1`, [userId]);
    await restoreScoped("investment_requests", `user_id = $1`, [userId]);
    await restoreScoped("investment_feedbacks", `user_id = $1`, [userId]);
    if (formSubmissionIds.length) {
      await restoreScoped("form_submissions", `id = ANY($1)`, [formSubmissionIds]);
    }
    await restoreScoped("return_details", `user_id = $1`, [userId]);
    await restoreScoped("testimonials", `user_id = $1`, [userId]);
    await restoreScoped("user_stripe_customer_mappings", `user_id = $1`, [userId]);
    await restoreScoped("user_stripe_transaction_mappings", `user_id = $1`, [userId]);

    // -------- Phase 6: authorship/audit cascades --------
    await restoreScoped("events", `created_by = $1 OR modified_by = $1`, [userId]);
    await restoreScoped("catacap_teams", `created_by = $1 OR modified_by = $1`, [userId]);
    await restoreScoped("email_templates", `created_by = $1 OR modified_by = $1`, [userId]);
    await restoreScoped("faqs", `created_by = $1 OR modified_by = $1`, [userId]);
    await restoreScoped("news", `created_by = $1 OR modified_by = $1`, [userId]);

    // -------- Phase 7: finally restore the user --------
    await client.query(
      `UPDATE users SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
       WHERE id = $1 AND is_deleted = true`,
      [userId]
    );
  }

  return deletedUsers.map((u) => ({ id: u.id, email: u.email }));
}

/**
 * Find soft-deleted parent user IDs for a given set of child records by
 * matching the user's email to a column on the child table (case-insensitive).
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
     WHERE c.${childIdColumn} = ANY($1) AND u.is_deleted = true`,
    [childIds]
  );
  return r.rows.map((row: { id: string }) => row.id);
}

/**
 * Find soft-deleted parent user IDs for a given set of child records by
 * a direct foreign-key column on the child table.
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
     WHERE c.${childIdColumn} = ANY($1) AND u.is_deleted = true`,
    [childIds]
  );
  return r.rows.map((row: { id: string }) => row.id);
}
