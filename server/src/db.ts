import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err);
});

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
  } finally {
    client.release();
  }
}

export default pool;
