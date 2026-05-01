const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL });

(async () => {
  console.log('=== Match grants ===');
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name='campaign_match_grants' ORDER BY ordinal_position`
  );
  console.log('campaign_match_grants columns:', cols.rows.map(r=>r.column_name).join(', '));

  const grants = await pool.query(
    `SELECT * FROM campaign_match_grants ORDER BY created_at DESC`
  );
  grants.rows.forEach(g => console.log(JSON.stringify(g)));

  console.log('\n=== Grant ↔ campaigns ===');
  const links = await pool.query(
    `SELECT cmgc.match_grant_id, cmgc.campaign_id, c.name AS campaign_name, g.name AS grant_name
     FROM campaign_match_grant_campaigns cmgc
     JOIN campaigns c ON c.id = cmgc.campaign_id
     JOIN campaign_match_grants g ON g.id = cmgc.match_grant_id
     ORDER BY cmgc.match_grant_id`
  );
  links.rows.forEach(l => console.log(JSON.stringify(l)));

  console.log('\n=== Empower Her campaigns ===');
  const camps = await pool.query(
    `SELECT id, name, is_active, user_id FROM campaigns
     WHERE LOWER(name) LIKE '%empower%her%'
     ORDER BY id`
  );
  camps.rows.forEach(c => console.log(JSON.stringify(c)));

  if (camps.rows.length > 0) {
    const ids = camps.rows.map(r => r.id);
    console.log('\n=== Recommendations on those campaigns ===');
    const rcols = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='recommendations' ORDER BY ordinal_position`
    );
    console.log('recommendations columns:', rcols.rows.map(r=>r.column_name).join(', '));
    const recs = await pool.query(
      `SELECT * FROM recommendations
       WHERE campaign_id = ANY($1::int[])
         AND (is_deleted IS NULL OR is_deleted = false)
       ORDER BY campaign_id, id`,
      [ids]
    );
    recs.rows.forEach(r => console.log(JSON.stringify(r)));
  }

  console.log('\n=== Match grant activity (all) ===');
  const acts = await pool.query(
    `SELECT id, match_grant_id, recommendation_id, campaign_id, donor_user_id,
            recipient_user_id, amount_matched, created_at, reverted_at, notes
     FROM campaign_match_grant_activity
     ORDER BY created_at DESC LIMIT 50`
  );
  acts.rows.forEach(a => console.log(JSON.stringify(a)));

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
