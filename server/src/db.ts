import pg from "pg";

const TIMESTAMP_OID = 1114;
const TIMESTAMPTZ_OID = 1184;
pg.types.setTypeParser(TIMESTAMP_OID, (val: string) => val);
pg.types.setTypeParser(TIMESTAMPTZ_OID, (val: string) => val);

const pool = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err);
});

async function runSoftDeleteMigration(client: pg.PoolClient): Promise<void> {
  const tables = [
    "account_balance_change_logs",
    "campaigns",
    "groups",
    "recommendations",
    "themes",
    "users",
  ];

  for (const table of tables) {
    const tableCheck = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    if (tableCheck.rows.length === 0) continue;

    await client.query(`
      ALTER TABLE ${table}
        ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(450)
    `);
  }
}

async function ensureSchedulerTables(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS archived_user_data (
      id SERIAL PRIMARY KEY,
      source_table TEXT NOT NULL,
      record_id TEXT NOT NULL,
      user_id TEXT,
      days_old INTEGER NOT NULL,
      record_json TEXT NOT NULL,
      archived_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS scheduler_logs (
      id SERIAL PRIMARY KEY,
      job_name VARCHAR(100),
      start_time TIMESTAMP,
      end_time TIMESTAMP,
      error_message TEXT,
      status VARCHAR(20) DEFAULT 'Success',
      metadata JSONB
    )
  `);

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'scheduler_logs' AND column_name = 'status'
      ) THEN
        ALTER TABLE scheduler_logs ADD COLUMN status VARCHAR(20) DEFAULT 'Success';
      END IF;
    END $$;
  `);

  await client.query(`
    ALTER TABLE scheduler_logs
      ADD COLUMN IF NOT EXISTS metadata JSONB
  `);

  await client.query(`
    ALTER TABLE scheduler_logs
      ALTER COLUMN end_time DROP NOT NULL
  `);

  const sel = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'scheduled_email_logs'`,
  );
  if (sel.rows.length > 0) {
    await client.query(
      `ALTER TABLE scheduled_email_logs
         ADD COLUMN IF NOT EXISTS scheduler_log_id INTEGER REFERENCES scheduler_logs(id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_scheduled_email_logs_scheduler_log_id
         ON scheduled_email_logs(scheduler_log_id)`,
    );
  }

  const wsel = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'welcome_series_email_logs'`,
  );
  if (wsel.rows.length > 0) {
    await client.query(
      `ALTER TABLE welcome_series_email_logs
         ADD COLUMN IF NOT EXISTS scheduler_log_id INTEGER REFERENCES scheduler_logs(id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_welcome_series_email_logs_scheduler_log_id
         ON welcome_series_email_logs(scheduler_log_id)`,
    );
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS scheduler_configurations (
      id SERIAL PRIMARY KEY,
      job_name VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      hour INTEGER NOT NULL DEFAULT 0,
      minute INTEGER NOT NULL DEFAULT 0,
      timezone VARCHAR(100) NOT NULL DEFAULT 'America/New_York',
      is_enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`
    INSERT INTO scheduler_configurations (job_name, description, hour, minute, timezone, is_enabled)
    VALUES
      ('SendReminderEmail', 'Sends reminder emails to users', 8, 0, 'America/New_York', true),
      ('DeleteArchivedUsers', 'Archives and deletes soft-deleted records past retention period', 2, 0, 'America/New_York', true),
      ('DeleteTestUsers', 'Deletes test user accounts', 18, 0, 'Asia/Kolkata', true),
      ('WelcomeSeries', 'Sends Day 1, Day 6, and Day 10 welcome emails to Learn More form submitters', 9, 0, 'America/New_York', true),
      ('WeeklyKenStats', 'Weekly Friday-noon stats email to Ken (pending grants, donations, investments, distributions)', 12, 0, 'America/Los_Angeles', true)
    ON CONFLICT (job_name) DO NOTHING
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS site_configurations (
      id SERIAL PRIMARY KEY,
      type VARCHAR(100),
      key VARCHAR(255),
      value TEXT,
      is_deleted BOOLEAN DEFAULT false,
      deleted_at TIMESTAMP,
      deleted_by VARCHAR(450)
    )
  `);

  await client.query(`
    INSERT INTO site_configurations (type, key, value)
    SELECT 'Configuration', 'Auto Delete Archived Records After (Days)', '14'
    WHERE NOT EXISTS (
      SELECT 1 FROM site_configurations
      WHERE type = 'Configuration'
        AND key = 'Auto Delete Archived Records After (Days)'
    )
  `);
}

async function backfillSchedulerLogIds(client: pg.PoolClient): Promise<void> {
  const migrationKey = "BackfillSchedulerLogIdsApplied_v2";
  try {
    const check = await client.query(
      `SELECT 1 FROM site_configurations WHERE key = $1 LIMIT 1`,
      [migrationKey],
    );
    if (check.rows.length > 0) return;
  } catch {
    return;
  }

  const selTable = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'scheduled_email_logs'`,
  );
  const selCol = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'scheduled_email_logs' AND column_name = 'scheduler_log_id'`,
  );
  if (selTable.rows.length > 0 && selCol.rows.length > 0) {
    try {
      const result = await client.query(`
        WITH ranked AS (
          SELECT id, job_name, start_time,
                 LEAD(start_time) OVER (PARTITION BY job_name ORDER BY start_time) AS next_start
          FROM scheduler_logs
          WHERE job_name = 'SendReminderEmail'
        )
        UPDATE scheduled_email_logs sel
           SET scheduler_log_id = r.id
          FROM ranked r
         WHERE sel.scheduler_log_id IS NULL
           AND sel.sent_date >= r.start_time
           AND (r.next_start IS NULL OR sel.sent_date < r.next_start)
      `);
      if (result.rowCount && result.rowCount > 0) {
        console.log(
          `[BackfillSchedulerLogIds] Linked ${result.rowCount} scheduled_email_logs row(s) to scheduler_logs.`,
        );
      }
    } catch (err) {
      console.error("[BackfillSchedulerLogIds] scheduled_email_logs backfill failed:", err);
    }
  }

  const wselTable = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'welcome_series_email_logs'`,
  );
  const wselCol = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'welcome_series_email_logs' AND column_name = 'scheduler_log_id'`,
  );
  if (wselTable.rows.length > 0 && wselCol.rows.length > 0) {
    try {
      const result = await client.query(`
        WITH ranked AS (
          SELECT id, job_name, start_time,
                 LEAD(start_time) OVER (PARTITION BY job_name ORDER BY start_time) AS next_start
          FROM scheduler_logs
          WHERE job_name = 'WelcomeSeries'
        )
        UPDATE welcome_series_email_logs wsel
           SET scheduler_log_id = r.id
          FROM ranked r
         WHERE wsel.scheduler_log_id IS NULL
           AND wsel.sent_at >= r.start_time
           AND (r.next_start IS NULL OR wsel.sent_at < r.next_start)
      `);
      if (result.rowCount && result.rowCount > 0) {
        console.log(
          `[BackfillSchedulerLogIds] Linked ${result.rowCount} welcome_series_email_logs row(s) to scheduler_logs.`,
        );
      }
    } catch (err) {
      console.error("[BackfillSchedulerLogIds] welcome_series_email_logs backfill failed:", err);
    }
  }

  try {
    await client.query(
      `INSERT INTO site_configurations (type, key, value)
       VALUES ('Migration', $1, 'true')
       ON CONFLICT DO NOTHING`,
      [migrationKey],
    );
  } catch {}
}

async function backfillSoftDeleteTimestamps(
  client: pg.PoolClient,
): Promise<void> {
  const tables = [
    "account_balance_change_logs",
    "campaigns",
    "groups",
    "recommendations",
    "themes",
    "users",
  ];

  for (const table of tables) {
    const tableCheck = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    if (tableCheck.rows.length === 0) continue;

    const colCheck = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'is_deleted'`,
      [table],
    );
    if (colCheck.rows.length === 0) continue;

    const delAtCheck = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'deleted_at'`,
      [table],
    );
    if (delAtCheck.rows.length === 0) continue;

    const result = await client.query(
      `UPDATE ${table} SET deleted_at = NOW() - INTERVAL '30 days'
       WHERE is_deleted = true AND deleted_at IS NULL`,
    );
    if (result.rowCount && result.rowCount > 0) {
      console.log(
        `Backfilled deleted_at for ${result.rowCount} soft-deleted row(s) in ${table} (set to 30 days ago).`,
      );
    }
  }
}

async function fixIncorrectBackfillDates(client: pg.PoolClient): Promise<void> {
  const migrationKey = "BackfillDeletedAtFixV2Applied";
  try {
    const check = await client.query(
      `SELECT 1 FROM site_configurations WHERE key = $1 LIMIT 1`,
      [migrationKey],
    );
    if (check.rows.length > 0) return;
  } catch {
    return;
  }

  const tables = [
    "account_balance_change_logs",
    "campaigns",
    "groups",
    "recommendations",
    "themes",
    "users",
  ];

  for (const table of tables) {
    try {
      const result = await client.query(
        `UPDATE ${table} SET deleted_at = NOW() - INTERVAL '30 days'
         WHERE is_deleted = true
           AND (deleted_at IS NULL OR deleted_at > NOW() - INTERVAL '30 days')`,
      );
      if (result.rowCount && result.rowCount > 0) {
        console.log(
          `[BackfillV2] Set deleted_at to 30 days ago for ${result.rowCount} row(s) in ${table}.`,
        );
      }
    } catch {}
  }

  try {
    await client.query(
      `INSERT INTO site_configurations (type, key, value)
       VALUES ('Migration', $1, 'true')
       ON CONFLICT DO NOTHING`,
      [migrationKey],
    );
  } catch {}
}

async function ensureInvestmentInstruments(
  client: pg.PoolClient,
): Promise<void> {
  // The product previously called this concept "Investment Types" and the
  // schema used `investment_types` (table) and `campaigns.investment_types`
  // (column). The canonical name is now `investment_instruments`. This
  // helper reconciles any DB to the new naming without losing data.
  //
  // Strategy:
  //  - If the new name is missing and the old name exists -> RENAME (preserves data).
  //  - If both are missing entirely -> create empty so the API endpoints don't 500.
  //  - If the new name already exists -> nothing to do.

  const campaignsExists = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'campaigns'`,
  );
  if (campaignsExists.rows.length === 0) {
    return;
  }

  // 1) Lookup table reconciliation
  const newTable = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'investment_instruments'`,
  );
  const oldTable = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'investment_types'`,
  );

  if (newTable.rows.length === 0 && oldTable.rows.length > 0) {
    await client.query(
      `ALTER TABLE investment_types RENAME TO investment_instruments`,
    );
    console.log(
      "Renamed lookup table investment_types -> investment_instruments.",
    );
  } else if (newTable.rows.length === 0 && oldTable.rows.length === 0) {
    await client.query(`
      CREATE TABLE investment_instruments (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
    console.log("Created empty investment_instruments lookup table.");
  } else if (newTable.rows.length > 0 && oldTable.rows.length > 0) {
    // Both exist — recover from a partial/aborted prior migration.
    const newCount = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM investment_instruments`,
    );
    const oldCount = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM investment_types`,
    );
    if (newCount.rows[0].cnt === 0 && oldCount.rows[0].cnt > 0) {
      await client.query(`DROP TABLE investment_instruments`);
      await client.query(
        `ALTER TABLE investment_types RENAME TO investment_instruments`,
      );
      console.log(
        "Reconciled dual lookup tables: dropped empty investment_instruments and renamed investment_types -> investment_instruments.",
      );
    } else if (oldCount.rows[0].cnt === 0) {
      await client.query(`DROP TABLE investment_types`);
      console.log("Dropped empty legacy investment_types table.");
    } else {
      console.warn(
        `Both investment_instruments (${newCount.rows[0].cnt} rows) and investment_types (${oldCount.rows[0].cnt} rows) contain data. Manual reconciliation required.`,
      );
    }
  }

  // 2) Campaign column reconciliation
  const newCol = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'campaigns'
        AND column_name = 'investment_instruments'`,
  );
  const oldCol = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'campaigns'
        AND column_name = 'investment_types'`,
  );

  if (newCol.rows.length === 0 && oldCol.rows.length > 0) {
    await client.query(
      `ALTER TABLE campaigns RENAME COLUMN investment_types TO investment_instruments`,
    );
    console.log(
      "Renamed column campaigns.investment_types -> campaigns.investment_instruments.",
    );
  } else if (newCol.rows.length === 0 && oldCol.rows.length === 0) {
    await client.query(
      `ALTER TABLE campaigns ADD COLUMN investment_instruments TEXT`,
    );
    console.log("Added empty campaigns.investment_instruments column.");
  } else if (newCol.rows.length > 0 && oldCol.rows.length > 0) {
    const newFilled = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM campaigns
        WHERE investment_instruments IS NOT NULL AND investment_instruments <> ''`,
    );
    const oldFilled = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM campaigns
        WHERE investment_types IS NOT NULL AND investment_types <> ''`,
    );
    if (newFilled.rows[0].cnt === 0 && oldFilled.rows[0].cnt > 0) {
      await client.query(
        `ALTER TABLE campaigns DROP COLUMN investment_instruments`,
      );
      await client.query(
        `ALTER TABLE campaigns RENAME COLUMN investment_types TO investment_instruments`,
      );
      console.log(
        "Reconciled dual campaign columns: dropped empty investment_instruments and renamed investment_types -> investment_instruments.",
      );
    } else if (oldFilled.rows[0].cnt === 0) {
      await client.query(
        `ALTER TABLE campaigns DROP COLUMN investment_types`,
      );
      console.log("Dropped empty legacy campaigns.investment_types column.");
    } else {
      console.warn(
        `Both campaigns.investment_instruments (${newFilled.rows[0].cnt} rows) and campaigns.investment_types (${oldFilled.rows[0].cnt} rows) contain data. Manual reconciliation required.`,
      );
    }
  }
}

async function ensureCampaignsOwnerGroupColumns(
  client: pg.PoolClient,
): Promise<void> {
  try {
    await client.query(`
      ALTER TABLE campaigns
        ADD COLUMN IF NOT EXISTS owner_group_id        INTEGER,
        ADD COLUMN IF NOT EXISTS auto_enroll_investors BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_schema = 'public'
            AND table_name = 'campaigns'
            AND constraint_name = 'campaigns_owner_group_id_fkey'
        ) THEN
          ALTER TABLE campaigns
            ADD CONSTRAINT campaigns_owner_group_id_fkey
            FOREIGN KEY (owner_group_id) REFERENCES groups(id);
        END IF;
      END $$;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_campaigns_owner_group_id
        ON campaigns (owner_group_id)
        WHERE owner_group_id IS NOT NULL
    `);
  } catch (err: any) {
    console.warn(
      "ensureCampaignsOwnerGroupColumns: could not ensure owner_group columns:",
      err?.message || err,
    );
  }
}

async function ensureInvestmentNotificationRecipientsTable(
  client: pg.PoolClient,
): Promise<void> {
  // Per-campaign list of {name, email} pairs that receive an email
  // when someone invests in the campaign. See migration
  // releases/30_04_2026/migrations/2026_04_30_campaign_investment_notification_recipients.sql
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS campaign_investment_notification_recipients (
        id          SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL,
        name        TEXT NOT NULL DEFAULT '',
        email       TEXT NOT NULL,
        position    INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_schema = 'public'
            AND table_name = 'campaign_investment_notification_recipients'
            AND constraint_name = 'campaign_investment_notification_recipients_campaign_id_fkey'
        ) THEN
          ALTER TABLE campaign_investment_notification_recipients
            ADD CONSTRAINT campaign_investment_notification_recipients_campaign_id_fkey
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cinr_campaign_id
        ON campaign_investment_notification_recipients (campaign_id)
    `);
  } catch (err: any) {
    console.warn(
      "ensureInvestmentNotificationRecipientsTable: could not ensure table:",
      err?.message || err,
    );
  }
}

async function ensureAdminPerformanceIndexes(
  client: pg.PoolClient,
): Promise<void> {
  // Adds B-tree / expression indexes that back the most frequent admin
  // queries (Investments list, Users list, Groups list, Pending Grants list,
  // Dashboard, Consolidated Finances). All statements are
  // CREATE INDEX IF NOT EXISTS so this is safe to run on every startup.
  // We only create an index when the underlying table actually exists so a
  // partial deployment doesn't break startup.
  const indexes: Array<{ table: string; name: string; ddl: string }> = [
    // recommendations: aggregated by campaign_id and joined on lower(user_email)
    { table: "recommendations", name: "idx_recommendations_campaign_id",
      ddl: `CREATE INDEX IF NOT EXISTS idx_recommendations_campaign_id ON recommendations (campaign_id)` },
    { table: "recommendations", name: "idx_recommendations_lower_email",
      ddl: `CREATE INDEX IF NOT EXISTS idx_recommendations_lower_email ON recommendations (LOWER(user_email))` },
    { table: "recommendations", name: "idx_recommendations_status",
      ddl: `CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations (status)` },

    // users: joined via lower(email) in dashboard, finance, top-donors etc.
    { table: "users", name: "idx_users_lower_email",
      ddl: `CREATE INDEX IF NOT EXISTS idx_users_lower_email ON users (LOWER(email))` },

    // user_roles: joined on both sides in nearly every admin query
    { table: "user_roles", name: "idx_user_roles_role_id",
      ddl: `CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles (role_id)` },
    { table: "user_roles", name: "idx_user_roles_user_id",
      ddl: `CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles (user_id)` },

    // requests: lookups by group and by owner (Users list filter, Groups members)
    { table: "requests", name: "idx_requests_group_status",
      ddl: `CREATE INDEX IF NOT EXISTS idx_requests_group_status ON requests (group_to_follow_id, status)` },
    { table: "requests", name: "idx_requests_owner",
      ddl: `CREATE INDEX IF NOT EXISTS idx_requests_owner ON requests (request_owner_id)` },

    // pending_grants and notes
    { table: "pending_grants", name: "idx_pending_grants_user_id",
      ddl: `CREATE INDEX IF NOT EXISTS idx_pending_grants_user_id ON pending_grants (user_id)` },
    { table: "pending_grants", name: "idx_pending_grants_campaign_id",
      ddl: `CREATE INDEX IF NOT EXISTS idx_pending_grants_campaign_id ON pending_grants (campaign_id)` },
    { table: "pending_grant_notes", name: "idx_pending_grant_notes_grant_id",
      ddl: `CREATE INDEX IF NOT EXISTS idx_pending_grant_notes_grant_id ON pending_grant_notes (pending_grant_id)` },

    // investment_notes
    { table: "investment_notes", name: "idx_investment_notes_campaign_id",
      ddl: `CREATE INDEX IF NOT EXISTS idx_investment_notes_campaign_id ON investment_notes (campaign_id)` },

    // account_balance_change_logs and group_account_balances
    { table: "account_balance_change_logs", name: "idx_acl_user_id",
      ddl: `CREATE INDEX IF NOT EXISTS idx_acl_user_id ON account_balance_change_logs (user_id)` },
    { table: "account_balance_change_logs", name: "idx_acl_group_id",
      ddl: `CREATE INDEX IF NOT EXISTS idx_acl_group_id ON account_balance_change_logs (group_id)` },
    { table: "group_account_balances", name: "idx_gab_user_id",
      ddl: `CREATE INDEX IF NOT EXISTS idx_gab_user_id ON group_account_balances (user_id)` },
    { table: "group_account_balances", name: "idx_gab_group_id",
      ddl: `CREATE INDEX IF NOT EXISTS idx_gab_group_id ON group_account_balances (group_id)` },

    // campaign_groups (join membership table; PK already covers (campaigns_id, groups_id))
    { table: "campaign_groups", name: "idx_campaign_groups_groups_id",
      ddl: `CREATE INDEX IF NOT EXISTS idx_campaign_groups_groups_id ON campaign_groups (groups_id)` },

    // campaigns: deleted_by lookup join, group_for_private_access_id used in groups list UNION
    { table: "campaigns", name: "idx_campaigns_deleted_by",
      ddl: `CREATE INDEX IF NOT EXISTS idx_campaigns_deleted_by ON campaigns (deleted_by)` },
    { table: "campaigns", name: "idx_campaigns_private_access_group",
      ddl: `CREATE INDEX IF NOT EXISTS idx_campaigns_private_access_group ON campaigns (group_for_private_access_id)` },

    // groups: owner_id IN (...) lookup in finance.ts getFinancesData
    { table: "groups", name: "idx_groups_owner_id",
      ddl: `CREATE INDEX IF NOT EXISTS idx_groups_owner_id ON groups (owner_id)` },

    // asset_based_payment_requests: filtered by user_id IN (...) in finance.ts
    { table: "asset_based_payment_requests", name: "idx_asset_based_payment_requests_user_id",
      ddl: `CREATE INDEX IF NOT EXISTS idx_asset_based_payment_requests_user_id ON asset_based_payment_requests (user_id)` },
  ];

  let created = 0;
  for (const idx of indexes) {
    const exists = await client.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1`,
      [idx.table],
    );
    if (exists.rows.length === 0) continue;
    const before = await client.query(
      `SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=$1`,
      [idx.name],
    );
    if (before.rows.length > 0) continue;
    try {
      await client.query(idx.ddl);
      created++;
    } catch (err) {
      console.warn(
        `Could not create index ${idx.name}: ${(err as Error).message}`,
      );
    }
  }
  if (created > 0) {
    console.log(`Created ${created} admin performance indexes.`);
  }
}

async function backfillOrphanedUserRoles(client: pg.PoolClient): Promise<void> {
  const roleCheck = await client.query(
    `SELECT id FROM roles WHERE name = 'User' LIMIT 1`,
  );
  if (roleCheck.rows.length > 0) {
    const userRoleId = roleCheck.rows[0].id;
    const result = await client.query(
      `INSERT INTO user_roles (user_id, role_id, discriminator, is_deleted)
       SELECT u.id, $1, 'IdentityUserRole<string>', false
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       WHERE ur.user_id IS NULL
       ON CONFLICT DO NOTHING`,
      [userRoleId],
    );
    if (result.rowCount && result.rowCount > 0) {
      console.log(
        `Backfilled user_roles for ${result.rowCount} orphaned user(s).`,
      );
    }
  }

  const updateResult = await client.query(
    `UPDATE users
     SET is_active = COALESCE(is_active, true),
         date_created = COALESCE(date_created, NOW())
     WHERE is_active IS NULL OR date_created IS NULL`,
  );
  if (updateResult.rowCount && updateResult.rowCount > 0) {
    console.log(
      `Backfilled is_active/date_created for ${updateResult.rowCount} user(s).`,
    );
  }
}

export async function testConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    console.log("Database connection established.");

    const tableCheck = await client.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')",
    );
    if (tableCheck.rows[0].exists) {
      const result = await client.query("SELECT COUNT(*) FROM users");
      console.log(`Users table found with ${result.rows[0].count} rows.`);
    } else {
      console.warn(
        "Warning: 'users' table not found. Auth endpoints will not work until the schema is deployed.",
      );
    }

    await runSoftDeleteMigration(client);
    await ensureSchedulerTables(client);
    await ensureInvestmentInstruments(client);
    await ensureAdminPerformanceIndexes(client);
    await ensureCampaignsOwnerGroupColumns(client);
    await ensureInvestmentNotificationRecipientsTable(client);
    await backfillSchedulerLogIds(client);
    await backfillSoftDeleteTimestamps(client);
    await fixIncorrectBackfillDates(client);
    await backfillOrphanedUserRoles(client);
  } finally {
    client.release();
  }
}

export default pool;
