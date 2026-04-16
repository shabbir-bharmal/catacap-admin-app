import pg from "pg";

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
      day3_email_count INTEGER DEFAULT 0,
      week2_email_count INTEGER DEFAULT 0,
      error_message TEXT,
      status VARCHAR(20) DEFAULT 'Success'
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
      ('DeleteTestUsers', 'Deletes test user accounts', 18, 0, 'Asia/Kolkata', true)
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

async function backfillOrphanedUserRoles(client: pg.PoolClient): Promise<void> {
  try {
    const rolesExist = await client.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roles')`,
    );
    if (!rolesExist.rows[0].exists) {
      return;
    }

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
  } catch (err) {
    console.warn("backfillOrphanedUserRoles skipped due to error:", err instanceof Error ? err.message : err);
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
    await backfillSoftDeleteTimestamps(client);
    await fixIncorrectBackfillDates(client);
    await backfillOrphanedUserRoles(client);
  } finally {
    client.release();
  }
}

export default pool;
