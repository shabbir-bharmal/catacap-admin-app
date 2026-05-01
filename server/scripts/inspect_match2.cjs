const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL });

(async () => {
  console.log('=== Match grant activity for grant 2 (FundHer) ===');
  const acts = await pool.query(
    `SELECT a.*, r.user_email AS triggering_email, r.amount AS triggering_amount, c.name AS campaign_name
     FROM campaign_match_grant_activity a
     LEFT JOIN recommendations r ON r.id = a.triggered_by_recommendation_id
     LEFT JOIN campaigns c ON c.id = a.campaign_id
     WHERE a.match_grant_id = 2
     ORDER BY a.created_at DESC`
  );
  acts.rows.forEach(a => console.log(JSON.stringify(a)));

  console.log('\n=== Pending/approved recommendations on Empower Her Fund II (campaign 246) and which already have a FundHer match ===');
  const recs = await pool.query(
    `SELECT r.id, r.user_email, r.user_full_name, r.amount, r.status,
            r.user_id,
            EXISTS(
              SELECT 1 FROM campaign_match_grant_activity a
              WHERE a.match_grant_id = 2 AND a.triggered_by_recommendation_id = r.id
            ) AS already_matched
     FROM recommendations r
     WHERE r.campaign_id = 246
       AND (r.is_deleted IS NULL OR r.is_deleted = false)
       AND r.user_id <> 'd3737961-7cf8-426c-8ba2-74196026f040'
     ORDER BY r.id`
  );
  recs.rows.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== FundHer donor (user d3737961-...) ===');
  const donor = await pool.query(
    `SELECT id, email, first_name, last_name, account_balance FROM users WHERE id = 'd3737961-7cf8-426c-8ba2-74196026f040'`
  );
  console.log(JSON.stringify(donor.rows[0]));

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
