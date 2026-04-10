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
      [table]
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

async function backfillOrphanedUserRoles(client: pg.PoolClient): Promise<void> {
  const roleCheck = await client.query(
    `SELECT id FROM roles WHERE name = 'User' LIMIT 1`
  );
  if (roleCheck.rows.length > 0) {
    const userRoleId = roleCheck.rows[0].id;
    const result = await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT u.id, $1
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       WHERE ur.user_id IS NULL
       ON CONFLICT DO NOTHING`,
      [userRoleId]
    );
    if (result.rowCount && result.rowCount > 0) {
      console.log(`Backfilled user_roles for ${result.rowCount} orphaned user(s).`);
    }
  }

  const updateResult = await client.query(
    `UPDATE users
     SET is_active = COALESCE(is_active, true),
         date_created = COALESCE(date_created, NOW())
     WHERE is_active IS NULL OR date_created IS NULL`
  );
  if (updateResult.rowCount && updateResult.rowCount > 0) {
    console.log(`Backfilled is_active/date_created for ${updateResult.rowCount} user(s).`);
  }
}

export async function testConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    console.log("Database connection established.");

    const tableCheck = await client.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')"
    );
    if (tableCheck.rows[0].exists) {
      const result = await client.query("SELECT COUNT(*) FROM users");
      console.log(`Users table found with ${result.rows[0].count} rows.`);
    } else {
      console.warn("Warning: 'users' table not found. Auth endpoints will not work until the schema is deployed.");
    }

    await runSoftDeleteMigration(client);
    await backfillOrphanedUserRoles(client);
  } finally {
    client.release();
  }
}

export default pool;
