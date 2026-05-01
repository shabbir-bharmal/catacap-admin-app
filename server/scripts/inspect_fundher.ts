import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  // Eligible campaigns for grant 2
  const elig = await pool.query(`
    SELECT cmgc.campaign_id, c.name, c.is_deleted, c.status
    FROM campaign_match_grant_campaigns cmgc
    JOIN campaigns c ON c.id = cmgc.campaign_id
    WHERE cmgc.match_grant_id = 2
    ORDER BY c.name
  `);
  console.log('=== FundHer eligible campaigns ===');
  console.log(JSON.stringify(elig.rows, null, 2));

  // Find the 7 target recs
  const targets = [
    { campaign: 'Sea Forward',                            email: 'ellenremmer53@gmail.com' },
    { campaign: 'Collective Climate Justice Fund II',     email: 'jessbrooks@gmail.com' },
    { campaign: 'Collective Climate Justice Fund II',     email: 'iben.falconer@gmail.com' },
    { campaign: 'Collective Climate Justice Fund II',     email: 'alexandra.ducas@gmail.com' },
    { campaign: 'Collective Climate Justice Fund II',     email: 'rayleney@gmail.com' },
    { campaign: 'Collective Climate Justice Fund II',     email: 'maggsf@gmail.com' },
    { campaign: 'Collective Climate Justice Fund II',     email: 'Zlembke@gmail.com' },
  ];
  console.log('\n=== Target recs ===');
  for (const t of targets) {
    const r = await pool.query(`
      SELECT r.id, r.user_email, r.user_full_name, r.amount, r.status, r.date_created,
             r.campaign_id, c.name AS campaign_name, r.user_id, r.is_deleted,
             EXISTS(SELECT 1 FROM campaign_match_grant_activity a WHERE a.donor_recommendation_id = r.id) AS is_match_created,
             EXISTS(SELECT 1 FROM campaign_match_grant_activity a WHERE a.match_grant_id = 2 AND a.triggered_by_recommendation_id = r.id) AS already_matched_by_fundher,
             EXISTS(SELECT 1 FROM campaign_match_grant_campaigns cmgc WHERE cmgc.match_grant_id = 2 AND cmgc.campaign_id = r.campaign_id) AS campaign_eligible_for_fundher
      FROM recommendations r
      JOIN campaigns c ON c.id = r.campaign_id
      WHERE c.name ILIKE $1
        AND lower(r.user_email) = lower($2)
        AND COALESCE(r.is_deleted, false) = false
        AND COALESCE(c.is_deleted, false) = false
      ORDER BY r.date_created DESC
    `, [t.campaign, t.email]);
    if (r.rows.length === 0) {
      console.log(`MISSING: ${t.campaign} / ${t.email}`);
    } else {
      for (const row of r.rows) {
        console.log(`OK rec ${row.id}: ${row.campaign_name} / ${row.user_email} amt=${row.amount} status=${row.status} eligible=${row.campaign_eligible_for_fundher} alreadyMatched=${row.already_matched_by_fundher} matchCreated=${row.is_match_created} userId=${row.user_id}`);
      }
    }
  }

  // FundHer donor user
  const donor = await pool.query(`
    SELECT id, email, first_name, last_name, user_name, account_balance
    FROM users WHERE id = 'd3737961-7cf8-426c-8ba2-74196026f040'
  `);
  console.log('\n=== FundHer donor ===');
  console.log(JSON.stringify(donor.rows, null, 2));

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
