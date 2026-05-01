import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  // 1. Find "Sea Forward" campaigns (all variants)
  const seaCamps = await pool.query(`
    SELECT id, name, is_deleted, status FROM campaigns
    WHERE name ILIKE '%sea forward%' OR name ILIKE '%seaforward%'
    ORDER BY id
  `);
  console.log('=== Campaigns matching Sea Forward ===');
  console.log(JSON.stringify(seaCamps.rows, null, 2));

  // 2. Find ellenremmer in users + recs
  const ellenUsers = await pool.query(`
    SELECT id, email, first_name, last_name, user_name FROM users
    WHERE email ILIKE '%ellenremmer%' OR user_name ILIKE '%ellenremmer%'
    ORDER BY email
  `);
  console.log('\n=== Users matching ellenremmer ===');
  console.log(JSON.stringify(ellenUsers.rows, null, 2));

  const ellenRecs = await pool.query(`
    SELECT r.id, r.user_email, r.amount, r.status, r.date_created, r.campaign_id, c.name AS campaign_name, r.is_deleted
    FROM recommendations r
    JOIN campaigns c ON c.id = r.campaign_id
    WHERE r.user_email ILIKE '%ellenremmer%'
    ORDER BY r.date_created DESC
  `);
  console.log('\n=== ALL recs by ellenremmer (any campaign) ===');
  console.log(JSON.stringify(ellenRecs.rows, null, 2));

  // 3. Confirm "Collective Climate Justice Fund II" exists, find id
  const cclj = await pool.query(`
    SELECT id, name, is_deleted, status FROM campaigns
    WHERE name ILIKE '%collective climate justice%'
    ORDER BY id
  `);
  console.log('\n=== Campaigns matching Collective Climate Justice ===');
  console.log(JSON.stringify(cclj.rows, null, 2));

  // 4. campaign_match_grant_campaigns columns
  const cols = await pool.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'campaign_match_grant_campaigns' ORDER BY ordinal_position
  `);
  console.log('\n=== campaign_match_grant_campaigns cols ===');
  console.log(cols.rows.map(c => `${c.column_name}:${c.data_type}`).join(', '));

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
