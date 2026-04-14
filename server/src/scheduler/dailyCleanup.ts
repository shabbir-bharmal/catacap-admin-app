import pool from "../db.js";
import type { PoolClient } from "pg";

const TABLE_NAME_MAP: Record<string, string> = {
  AspNetUsers: "users",
  AspNetUserRoles: "user_roles",
  Campaigns: "campaigns",
  Groups: "groups",
  PendingGrants: "pending_grants",
  PendingGrantNotes: "pending_grant_notes",
  DisbursalRequest: "disbursal_requests",
  DisbursalRequestNotes: "disbursal_request_notes",
  AssetBasedPaymentRequest: "asset_based_payment_requests",
  AssetBasedPaymentRequestNotes: "asset_based_payment_request_notes",
  FormSubmission: "form_submissions",
  FormSubmissionNotes: "form_submission_notes",
  InvestmentNotes: "investment_notes",
  CompletedInvestmentsDetails: "completed_investment_details",
  CompletedInvestmentNotes: "completed_investment_notes",
  ACHPaymentRequests: "ach_payment_requests",
  InvestmentTagMapping: "investment_tag_mappings",
  CampaignDtoGroup: "campaign_groups",
  ReturnMasters: "return_masters",
  ScheduledEmailLogs: "scheduled_email_logs",
  AccountBalanceChangeLogs: "account_balance_change_logs",
  ReturnDetails: "return_details",
  Recommendations: "recommendations",
  UserInvestments: "user_investments",
  InvestmentRequest: "investment_requests",
  InvestmentFeedback: "investment_feedbacks",
  Requests: "requests",
  LeaderGroup: "leader_groups",
  GroupAccountBalance: "group_account_balances",
  UsersNotifications: "user_notifications",
  SiteConfiguration: "site_configurations",
  ApprovedBy: "approvers",
  CataCapTeam: "catacap_teams",
  EmailTemplate: "email_templates",
  Event: "events",
  Faq: "faqs",
  InvestmentTag: "investment_tags",
  ModuleAccessPermission: "module_access_permissions",
  News: "news",
  Testimonial: "testimonials",
  Themes: "themes",
};

const COL_NAME_MAP: Record<string, string> = {
  Id: "id",
  UserId: "user_id",
  OwnerId: "owner_id",
  DeletedBy: "deleted_by",
  CreatedBy: "created_by",
  ModifiedBy: "modified_by",
  UpdatedBy: "updated_by",
  RejectedBy: "rejected_by",
  RequestOwnerId: "request_owner_id",
  UserToFollowId: "user_to_follow_id",
  TargetUserId: "target_user_id",
  PendingGrantId: "pending_grant_id",
  DisbursalRequestId: "disbursal_request_id",
  RequestId: "request_id",
  FormSubmissionId: "form_submission_id",
  CampaignId: "campaign_id",
  CompletedInvestmentId: "completed_investment_id",
  PendingGrantsId: "pending_grants_id",
  AssetBasedPaymentRequestId: "asset_based_payment_request_id",
  DeletedAt: "deleted_at",
  CampaignsId: "campaigns_id",
  GroupToFollowId: "group_to_follow_id",
};

function t(name: string): string {
  return TABLE_NAME_MAP[name] || name;
}

function c(name: string): string {
  return COL_NAME_MAP[name] || name;
}

async function columnExists(
  client: PoolClient,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name = $2`,
    [tableName, columnName]
  );
  return result.rows.length > 0;
}

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

async function archiveAndDelete(
  client: PoolClient,
  tableName: string,
  pkColumn: string,
  userIdColumn: string | null,
  cutoffDate: Date
): Promise<void> {
  const pgTable = t(tableName);
  const pgPk = c(pkColumn);
  const pgUserId = userIdColumn ? c(userIdColumn) : null;

  if (!(await tableExists(client, pgTable))) {
    console.log(`  SKIP (table not found): ${pgTable}`);
    return;
  }

  if (!(await columnExists(client, pgTable, "deleted_at"))) {
    console.log(`  SKIP (no deleted_at): ${pgTable}`);
    return;
  }

  const userIdSelect = pgUserId
    ? `CAST(${pgUserId} AS VARCHAR(450))`
    : "NULL";

  await client.query(
    `INSERT INTO archived_user_data
      (source_table, record_id, user_id, deleted_at, days_old, record_json, archived_at)
     SELECT
       $1,
       CAST(${pgPk} AS TEXT),
       ${userIdSelect},
       deleted_at,
       (CURRENT_DATE - deleted_at::date),
       row_to_json(t)::TEXT,
       NOW()
     FROM ${pgTable} t
     WHERE deleted_at IS NOT NULL
       AND deleted_at <= $2
       AND NOT EXISTS (
         SELECT 1 FROM archived_user_data a
         WHERE a.source_table = $1
           AND a.record_id = CAST(t.${pgPk} AS TEXT)
           AND CAST(a.archived_at AS DATE) = CURRENT_DATE
       )`,
    [pgTable, cutoffDate]
  );

  const deleteResult = await client.query(
    `DELETE FROM ${pgTable}
     WHERE deleted_at IS NOT NULL AND deleted_at <= $1`,
    [cutoffDate]
  );

  console.log(
    `  ${pgTable}: archived & deleted ${deleteResult.rowCount} row(s)`
  );
}

async function archiveAndDeleteOrphan(
  client: PoolClient,
  childTable: string,
  fkColumn: string,
  parentTable: string,
  parentPkCol: string,
  cutoffDate: Date
): Promise<void> {
  const pgChild = t(childTable);
  const pgParent = t(parentTable);
  const pgFk = c(fkColumn);
  const pgParentPk = c(parentPkCol);

  if (!(await tableExists(client, pgChild))) {
    console.log(`  SKIP (table not found): ${pgChild}`);
    return;
  }

  if (!(await tableExists(client, pgParent))) {
    console.log(`  SKIP (parent not found): ${pgParent}`);
    return;
  }

  await client.query(
    `INSERT INTO archived_user_data
      (source_table, record_id, user_id, deleted_at, days_old, record_json, archived_at)
     SELECT
       $1,
       CAST(c.id AS TEXT),
       NULL,
       p.deleted_at,
       (CURRENT_DATE - p.deleted_at::date),
       row_to_json(c)::TEXT,
       NOW()
     FROM ${pgChild} c
     JOIN ${pgParent} p
       ON p.${pgParentPk} = c.${pgFk}
       AND p.deleted_at IS NOT NULL
       AND p.deleted_at <= $2
     WHERE NOT EXISTS (
       SELECT 1 FROM archived_user_data a
       WHERE a.source_table = $1
         AND a.record_id = CAST(c.id AS TEXT)
         AND CAST(a.archived_at AS DATE) = CURRENT_DATE
     )`,
    [pgChild, cutoffDate]
  );

  const deleteResult = await client.query(
    `DELETE FROM ${pgChild} c
     USING ${pgParent} p
     WHERE p.${pgParentPk} = c.${pgFk}
       AND p.deleted_at IS NOT NULL
       AND p.deleted_at <= $1`,
    [cutoffDate]
  );

  console.log(
    `  ${pgChild} (orphan): archived & deleted ${deleteResult.rowCount} row(s)`
  );
}

async function nullifyFkColumn(
  client: PoolClient,
  childTable: string,
  fkColumn: string,
  cutoffDate: Date
): Promise<void> {
  const pgChild = t(childTable);
  const pgFk = c(fkColumn);

  if (!(await tableExists(client, pgChild))) return;
  if (!(await columnExists(client, pgChild, pgFk))) return;

  const result = await client.query(
    `UPDATE ${pgChild} ch
     SET ${pgFk} = NULL
     FROM users u
     WHERE u.id = ch.${pgFk}
       AND u.deleted_at IS NOT NULL
       AND u.deleted_at <= $1`,
    [cutoffDate]
  );

  console.log(
    `  ${pgChild}.${pgFk} → nullified ${result.rowCount} row(s)`
  );
}

export async function runDailyCleanup(): Promise<void> {
  const client = await pool.connect();

  try {
    const configResult = await client.query(
      `SELECT value FROM site_configurations
       WHERE type = 'Configuration'
         AND key = 'Auto Delete Archived Records After (Days)'
         AND (is_deleted = false OR is_deleted IS NULL)
       LIMIT 1`
    );

    if (configResult.rows.length === 0) {
      throw new Error(
        "sp_DailyCleanup: Configuration not found in site_configurations. Aborting."
      );
    }

    const retentionDays = parseInt(configResult.rows[0].value, 10);
    if (isNaN(retentionDays)) {
      throw new Error(
        "sp_DailyCleanup: Invalid retention days value. Aborting."
      );
    }

    const now = new Date();
    const cutoffDate = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - retentionDays,
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds()
    ));

    console.log(`[CLEANUP] Retention days: ${retentionDays}`);
    console.log(`[CLEANUP] Cutoff date: ${cutoffDate.toISOString()}`);
    console.log(`[CLEANUP] Started at: ${new Date().toISOString()}`);

    await client.query("BEGIN");

    try {
      console.log("-- LEVEL 5: Leaf tables --");
      await archiveAndDeleteOrphan(client, "PendingGrantNotes", "PendingGrantId", "PendingGrants", "Id", cutoffDate);
      await archiveAndDeleteOrphan(client, "DisbursalRequestNotes", "DisbursalRequestId", "DisbursalRequest", "Id", cutoffDate);
      await archiveAndDeleteOrphan(client, "AssetBasedPaymentRequestNotes", "RequestId", "AssetBasedPaymentRequest", "Id", cutoffDate);
      await archiveAndDeleteOrphan(client, "FormSubmissionNotes", "FormSubmissionId", "FormSubmission", "Id", cutoffDate);
      await archiveAndDeleteOrphan(client, "InvestmentNotes", "CampaignId", "Campaigns", "Id", cutoffDate);
      await archiveAndDeleteOrphan(client, "CompletedInvestmentNotes", "CompletedInvestmentId", "CompletedInvestmentsDetails", "Id", cutoffDate);
      await archiveAndDeleteOrphan(client, "ACHPaymentRequests", "CampaignId", "Campaigns", "Id", cutoffDate);
      await archiveAndDeleteOrphan(client, "InvestmentTagMapping", "CampaignId", "Campaigns", "Id", cutoffDate);

      await client.query(
        `DELETE FROM campaign_groups cdg
         USING campaigns c
         WHERE c.id = cdg.campaigns_id
           AND c.deleted_at IS NOT NULL
           AND c.deleted_at <= $1`,
        [cutoffDate]
      );

      await archiveAndDeleteOrphan(client, "ReturnMasters", "CampaignId", "Campaigns", "Id", cutoffDate);
      await archiveAndDelete(client, "ScheduledEmailLogs", "Id", "UserId", cutoffDate);

      console.log("-- LEVEL 4: AccountBalanceChangeLogs (all 3 parent FKs) --");
      await archiveAndDeleteOrphan(client, "AccountBalanceChangeLogs", "AssetBasedPaymentRequestId", "AssetBasedPaymentRequest", "Id", cutoffDate);
      await archiveAndDeleteOrphan(client, "AccountBalanceChangeLogs", "CampaignId", "Campaigns", "Id", cutoffDate);
      await archiveAndDeleteOrphan(client, "AccountBalanceChangeLogs", "PendingGrantsId", "PendingGrants", "Id", cutoffDate);
      await archiveAndDelete(client, "AccountBalanceChangeLogs", "Id", "UserId", cutoffDate);

      await archiveAndDelete(client, "CompletedInvestmentsDetails", "Id", null, cutoffDate);
      await archiveAndDelete(client, "ReturnDetails", "Id", "UserId", cutoffDate);

      console.log("-- LEVEL 3: Mid-level parents --");
      await archiveAndDelete(client, "AssetBasedPaymentRequest", "Id", "UserId", cutoffDate);
      await archiveAndDelete(client, "DisbursalRequest", "Id", "UserId", cutoffDate);
      await archiveAndDelete(client, "PendingGrants", "Id", "UserId", cutoffDate);
      await archiveAndDelete(client, "Recommendations", "Id", "UserId", cutoffDate);
      await archiveAndDelete(client, "UserInvestments", "Id", "UserId", cutoffDate);
      await archiveAndDelete(client, "InvestmentRequest", "Id", "UserId", cutoffDate);
      await archiveAndDelete(client, "InvestmentFeedback", "Id", "UserId", cutoffDate);
      await archiveAndDelete(client, "Requests", "Id", "RequestOwnerId", cutoffDate);
      await archiveAndDelete(client, "LeaderGroup", "Id", "UserId", cutoffDate);
      await archiveAndDelete(client, "GroupAccountBalance", "Id", "UserId", cutoffDate);
      await archiveAndDelete(client, "FormSubmission", "Id", null, cutoffDate);
      await archiveAndDelete(client, "UsersNotifications", "Id", "TargetUserId", cutoffDate);
      await archiveAndDelete(client, "AspNetUserRoles", "UserId", "UserId", cutoffDate);

      console.log("-- LEVEL 2: Top-level domain parents --");
      await archiveAndDelete(client, "Groups", "Id", "OwnerId", cutoffDate);
      await archiveAndDelete(client, "Campaigns", "Id", "UserId", cutoffDate);

      console.log("-- NULLIFY: Audit FK columns referencing deleted users --");
      await nullifyFkColumn(client, "AspNetUsers", "DeletedBy", cutoffDate);

      await nullifyFkColumn(client, "Requests", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "Requests", "RequestOwnerId", cutoffDate);
      await nullifyFkColumn(client, "Requests", "UserToFollowId", cutoffDate);

      await nullifyFkColumn(client, "AccountBalanceChangeLogs", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "ApprovedBy", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "AssetBasedPaymentRequest", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "AssetBasedPaymentRequest", "UpdatedBy", cutoffDate);
      await nullifyFkColumn(client, "Campaigns", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "CataCapTeam", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "CataCapTeam", "CreatedBy", cutoffDate);
      await nullifyFkColumn(client, "CataCapTeam", "ModifiedBy", cutoffDate);
      await nullifyFkColumn(client, "CompletedInvestmentsDetails", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "CompletedInvestmentsDetails", "CreatedBy", cutoffDate);
      await nullifyFkColumn(client, "DisbursalRequest", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "EmailTemplate", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "Event", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "Event", "CreatedBy", cutoffDate);
      await nullifyFkColumn(client, "Event", "ModifiedBy", cutoffDate);
      await nullifyFkColumn(client, "Faq", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "FormSubmission", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "GroupAccountBalance", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "Groups", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "InvestmentFeedback", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "InvestmentRequest", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "InvestmentRequest", "ModifiedBy", cutoffDate);
      await nullifyFkColumn(client, "InvestmentTag", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "LeaderGroup", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "ModuleAccessPermission", "UpdatedBy", cutoffDate);
      await nullifyFkColumn(client, "News", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "PendingGrants", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "PendingGrants", "RejectedBy", cutoffDate);
      await nullifyFkColumn(client, "Recommendations", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "Recommendations", "RejectedBy", cutoffDate);
      await nullifyFkColumn(client, "ReturnDetails", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "ReturnMasters", "CreatedBy", cutoffDate);
      await nullifyFkColumn(client, "ScheduledEmailLogs", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "SiteConfiguration", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "Testimonial", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "Themes", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "UserInvestments", "DeletedBy", cutoffDate);
      await nullifyFkColumn(client, "UsersNotifications", "DeletedBy", cutoffDate);

      await nullifyFkColumn(client, "AssetBasedPaymentRequestNotes", "CreatedBy", cutoffDate);
      await nullifyFkColumn(client, "CompletedInvestmentNotes", "CreatedBy", cutoffDate);
      await nullifyFkColumn(client, "DisbursalRequestNotes", "CreatedBy", cutoffDate);
      await nullifyFkColumn(client, "FormSubmissionNotes", "CreatedBy", cutoffDate);
      await nullifyFkColumn(client, "InvestmentNotes", "CreatedBy", cutoffDate);
      await nullifyFkColumn(client, "PendingGrantNotes", "CreatedBy", cutoffDate);

      console.log("-- LEVEL 1: Root --");
      await archiveAndDelete(client, "AspNetUsers", "Id", "Id", cutoffDate);

      await client.query("COMMIT");
      console.log(`[CLEANUP] Cleanup finished at ${new Date().toISOString()}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    client.release();
  }
}
