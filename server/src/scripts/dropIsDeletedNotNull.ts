import pg from "pg";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("No SUPABASE_DB_URL or DATABASE_URL found");
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const sqlPath = path.resolve(
    __dirname,
    "../../../Back-End/Invest/sql_scripts/drop_is_deleted_not_null.sql"
  );
  const sql = fs.readFileSync(sqlPath, "utf-8");

  const client = await pool.connect();
  try {
    console.log("Executing migration: drop is_deleted NOT NULL constraint...");
    await client.query(sql);
    console.log("Migration completed successfully.");

    const sampleTables = ["users", "groups", "events", "themes", "news"];
    console.log("\nVerifying column definitions on sample tables:");
    for (const table of sampleTables) {
      const result = await client.query(
        `SELECT column_name, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
           AND column_name = 'is_deleted'`,
        [table]
      );
      if (result.rows.length > 0) {
        const row = result.rows[0];
        console.log(
          `  ${table}.is_deleted -> nullable: ${row.is_nullable}, default: ${row.column_default}`
        );
      } else {
        console.log(`  ${table}.is_deleted -> column not found`);
      }
    }
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
