import type { PoolClient } from "pg";

async function tableExists(
  client: PoolClient,
  tableName: string
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return result.rows.length > 0;
}

async function hasIsDeletedColumn(
  client: PoolClient,
  tableName: string
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name = 'is_deleted'`,
    [tableName]
  );
  return result.rows.length > 0;
}

async function softDeleteWhere(
  client: PoolClient,
  table: string,
  where: string,
  params: unknown[],
  deletedBy: string | null
): Promise<number> {
  if (!(await tableExists(client, table))) return 0;
  if (!(await hasIsDeletedColumn(client, table))) return 0;

  const deletedByParamIdx = params.length + 1;
  const result = await client.query(
    `UPDATE ${table}
       SET is_deleted = true,
           deleted_at = NOW(),
           deleted_by = $${deletedByParamIdx}
     WHERE (${where})
       AND (is_deleted IS NULL OR is_deleted = false)`,
    [...params, deletedBy]
  );
  return result.rowCount || 0;
}

async function selectIds(
  client: PoolClient,
  table: string,
  column: string,
  where: string,
  params: unknown[]
): Promise<string[]> {
  if (!(await tableExists(client, table))) return [];
  const result = await client.query(
    `SELECT ${column} AS id FROM ${table} WHERE ${where}`,
    params
  );
  return result.rows
    .map((r: { id: unknown }) => r.id)
    .filter((v): v is string | number => v !== null && v !== undefined)
    .map((v) => String(v));
}

export interface CascadeResult {
  totalSoftDeleted: number;
  perTable: Record<string, number>;
}

/**
 * Cascade soft-delete all records owned by the given user across every
 * related table that has an `is_deleted` column. Must be invoked inside an
 * existing transaction (the caller controls BEGIN/COMMIT/ROLLBACK).
 *
 * Rows already marked `is_deleted = true` are left untouched, so re-running
 * the cascade for the same user is a no-op on already-deleted children.
 *
 * The caller is still responsible for soft-deleting the `users` row itself
 * and for handling any access-control mappings (user_roles, etc.).
 */
export async function cascadeSoftDeleteUserData(
  client: PoolClient,
  userId: string,
  userEmail: string | null,
  actingAdminId: string | null
): Promise<CascadeResult> {
  const perTable: Record<string, number> = {};
  const userIds = [userId];
  const userEmails = userEmail ? [userEmail] : [];

  const record = (table: string, count: number) => {
    if (count > 0) perTable[table] = (perTable[table] || 0) + count;
  };

  const campaignIds = await selectIds(
    client,
    "campaigns",
    "id",
    "user_id = ANY($1)",
    [userIds]
  );
  const groupIds = await selectIds(
    client,
    "groups",
    "id",
    "owner_id = ANY($1)",
    [userIds]
  );
  const pendingGrantIds = await selectIds(
    client,
    "pending_grants",
    "id",
    "user_id = ANY($1)",
    [userIds]
  );
  const disbursalRequestIds = await selectIds(
    client,
    "disbursal_requests",
    "id",
    "user_id = ANY($1)",
    [userIds]
  );
  const assetRequestIds = await selectIds(
    client,
    "asset_based_payment_requests",
    "id",
    "user_id = ANY($1)",
    [userIds]
  );
  const formSubmissionIds = userEmails.length
    ? await selectIds(
        client,
        "form_submissions",
        "id",
        "email = ANY($1)",
        [userEmails]
      )
    : [];
  const returnMasterIds = campaignIds.length
    ? await selectIds(
        client,
        "return_masters",
        "id",
        "campaign_id = ANY($1)",
        [campaignIds]
      )
    : [];
  const completedInvestmentIds = campaignIds.length
    ? await selectIds(
        client,
        "completed_investment_details",
        "id",
        "campaign_id = ANY($1)",
        [campaignIds]
      )
    : [];

  // Grand-children notes: must be soft-deleted before/with their parents so
  // existing soft-delete filters hide them.
  if (completedInvestmentIds.length) {
    record(
      "completed_investment_notes",
      await softDeleteWhere(
        client,
        "completed_investment_notes",
        "completed_investment_id = ANY($1)",
        [completedInvestmentIds],
        actingAdminId
      )
    );
  }
  if (returnMasterIds.length) {
    record(
      "return_details",
      await softDeleteWhere(
        client,
        "return_details",
        "return_master_id = ANY($1)",
        [returnMasterIds],
        actingAdminId
      )
    );
  }
  if (pendingGrantIds.length) {
    record(
      "pending_grant_notes",
      await softDeleteWhere(
        client,
        "pending_grant_notes",
        "pending_grant_id = ANY($1)",
        [pendingGrantIds],
        actingAdminId
      )
    );
  }
  if (assetRequestIds.length) {
    record(
      "asset_based_payment_request_notes",
      await softDeleteWhere(
        client,
        "asset_based_payment_request_notes",
        "request_id = ANY($1)",
        [assetRequestIds],
        actingAdminId
      )
    );
  }
  if (disbursalRequestIds.length) {
    record(
      "disbursal_request_notes",
      await softDeleteWhere(
        client,
        "disbursal_request_notes",
        "disbursal_request_id = ANY($1)",
        [disbursalRequestIds],
        actingAdminId
      )
    );
  }
  if (formSubmissionIds.length) {
    record(
      "form_submission_notes",
      await softDeleteWhere(
        client,
        "form_submission_notes",
        "form_submission_id = ANY($1)",
        [formSubmissionIds],
        actingAdminId
      )
    );
  }

  // Campaign-scoped children.
  if (campaignIds.length) {
    record(
      "investment_notes",
      await softDeleteWhere(
        client,
        "investment_notes",
        "campaign_id = ANY($1)",
        [campaignIds],
        actingAdminId
      )
    );
    record(
      "investment_tag_mappings",
      await softDeleteWhere(
        client,
        "investment_tag_mappings",
        "campaign_id = ANY($1)",
        [campaignIds],
        actingAdminId
      )
    );
    record(
      "ach_payment_requests",
      await softDeleteWhere(
        client,
        "ach_payment_requests",
        "campaign_id = ANY($1)",
        [campaignIds],
        actingAdminId
      )
    );
    record(
      "account_balance_change_logs",
      await softDeleteWhere(
        client,
        "account_balance_change_logs",
        "campaign_id = ANY($1)",
        [campaignIds],
        actingAdminId
      )
    );
    record(
      "completed_investment_details",
      await softDeleteWhere(
        client,
        "completed_investment_details",
        "campaign_id = ANY($1)",
        [campaignIds],
        actingAdminId
      )
    );
    record(
      "return_masters",
      await softDeleteWhere(
        client,
        "return_masters",
        "campaign_id = ANY($1)",
        [campaignIds],
        actingAdminId
      )
    );
  }

  // Group-scoped children (groups owned by the user). These cover rows that
  // belong to OTHER users but reference one of this user's groups, so the
  // group's footprint is cleaned up entirely.
  if (groupIds.length) {
    record(
      "requests",
      await softDeleteWhere(
        client,
        "requests",
        "group_to_follow_id = ANY($1)",
        [groupIds],
        actingAdminId
      )
    );
    record(
      "leader_groups",
      await softDeleteWhere(
        client,
        "leader_groups",
        "group_id = ANY($1)",
        [groupIds],
        actingAdminId
      )
    );
    record(
      "group_account_balances",
      await softDeleteWhere(
        client,
        "group_account_balances",
        "group_id = ANY($1)",
        [groupIds],
        actingAdminId
      )
    );
  }

  // Pending-grant- and asset-request-scoped logs: scheduler map also wires
  // these via parent ids, so we mirror those paths here.
  if (pendingGrantIds.length) {
    record(
      "scheduled_email_logs",
      await softDeleteWhere(
        client,
        "scheduled_email_logs",
        "pending_grant_id = ANY($1)",
        [pendingGrantIds],
        actingAdminId
      )
    );
    record(
      "account_balance_change_logs",
      await softDeleteWhere(
        client,
        "account_balance_change_logs",
        "pending_grants_id = ANY($1)",
        [pendingGrantIds],
        actingAdminId
      )
    );
  }
  if (assetRequestIds.length) {
    record(
      "account_balance_change_logs",
      await softDeleteWhere(
        client,
        "account_balance_change_logs",
        "asset_based_payment_request_id = ANY($1)",
        [assetRequestIds],
        actingAdminId
      )
    );
  }

  // User-owned top-level records.
  record(
    "pending_grants",
    await softDeleteWhere(
      client,
      "pending_grants",
      "user_id = ANY($1)",
      [userIds],
      actingAdminId
    )
  );
  record(
    "asset_based_payment_requests",
    await softDeleteWhere(
      client,
      "asset_based_payment_requests",
      campaignIds.length
        ? "user_id = ANY($1) OR campaign_id = ANY($2)"
        : "user_id = ANY($1)",
      campaignIds.length ? [userIds, campaignIds] : [userIds],
      actingAdminId
    )
  );
  record(
    "disbursal_requests",
    await softDeleteWhere(
      client,
      "disbursal_requests",
      "user_id = ANY($1)",
      [userIds],
      actingAdminId
    )
  );
  if (userEmails.length) {
    record(
      "form_submissions",
      await softDeleteWhere(
        client,
        "form_submissions",
        "email = ANY($1)",
        [userEmails],
        actingAdminId
      )
    );
    record(
      "recommendations",
      await softDeleteWhere(
        client,
        "recommendations",
        "user_id = ANY($1) OR user_email = ANY($2)",
        [userIds, userEmails],
        actingAdminId
      )
    );
  } else {
    record(
      "recommendations",
      await softDeleteWhere(
        client,
        "recommendations",
        "user_id = ANY($1)",
        [userIds],
        actingAdminId
      )
    );
  }

  record(
    "user_investments",
    await softDeleteWhere(
      client,
      "user_investments",
      "user_id = ANY($1)",
      [userIds],
      actingAdminId
    )
  );
  record(
    "investment_requests",
    await softDeleteWhere(
      client,
      "investment_requests",
      "user_id = ANY($1)",
      [userIds],
      actingAdminId
    )
  );
  record(
    "investment_feedbacks",
    await softDeleteWhere(
      client,
      "investment_feedbacks",
      "user_id = ANY($1)",
      [userIds],
      actingAdminId
    )
  );
  record(
    "return_details",
    await softDeleteWhere(
      client,
      "return_details",
      "user_id = ANY($1)",
      [userIds],
      actingAdminId
    )
  );
  record(
    "leader_groups",
    await softDeleteWhere(
      client,
      "leader_groups",
      "user_id = ANY($1)",
      [userIds],
      actingAdminId
    )
  );
  record(
    "group_account_balances",
    await softDeleteWhere(
      client,
      "group_account_balances",
      "user_id = ANY($1)",
      [userIds],
      actingAdminId
    )
  );
  record(
    "user_notifications",
    await softDeleteWhere(
      client,
      "user_notifications",
      "target_user_id = ANY($1)",
      [userIds],
      actingAdminId
    )
  );
  record(
    "testimonials",
    await softDeleteWhere(
      client,
      "testimonials",
      "user_id = ANY($1)",
      [userIds],
      actingAdminId
    )
  );
  record(
    "scheduled_email_logs",
    await softDeleteWhere(
      client,
      "scheduled_email_logs",
      "user_id = ANY($1)",
      [userIds],
      actingAdminId
    )
  );
  record(
    "account_balance_change_logs",
    await softDeleteWhere(
      client,
      "account_balance_change_logs",
      "user_id = ANY($1)",
      [userIds],
      actingAdminId
    )
  );
  record(
    "requests",
    await softDeleteWhere(
      client,
      "requests",
      "request_owner_id = ANY($1) OR user_to_follow_id = ANY($1)",
      [userIds],
      actingAdminId
    )
  );

  // Parent records last so their child filters above already ran.
  record(
    "groups",
    await softDeleteWhere(
      client,
      "groups",
      "owner_id = ANY($1)",
      [userIds],
      actingAdminId
    )
  );
  record(
    "campaigns",
    await softDeleteWhere(
      client,
      "campaigns",
      "user_id = ANY($1)",
      [userIds],
      actingAdminId
    )
  );

  const totalSoftDeleted = Object.values(perTable).reduce(
    (sum, n) => sum + n,
    0
  );
  return { totalSoftDeleted, perTable };
}
