import pool from "./pool.js";

export async function seedDatabase() {
  const existing = await pool.query("SELECT COUNT(*) FROM roles");
  if (parseInt(existing.rows[0].count) > 0) return;

  await pool.query(`
    INSERT INTO roles (id, name) VALUES (1, 'User'), (2, 'Admin')
    ON CONFLICT DO NOTHING;

    INSERT INTO themes (id, name) VALUES
      (1, 'Climate Change'), (2, 'Gender Equity'), (3, 'Education'),
      (4, 'Healthcare'), (5, 'Clean Energy'), (6, 'Affordable Housing')
    ON CONFLICT DO NOTHING;
  `);

  const adminId = "admin-001";
  await pool.query(
    `INSERT INTO users (id, first_name, last_name, username, email, password_hash, date_created)
     VALUES ($1, 'Admin', 'User', 'admin', 'admin@catacap.org',
       '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NOW())
     ON CONFLICT DO NOTHING`,
    [adminId]
  );
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id) VALUES ($1, 2) ON CONFLICT DO NOTHING`,
    [adminId]
  );

  const userNames = [
    ["Sarah", "Johnson"], ["Michael", "Chen"], ["Emily", "Williams"],
    ["James", "Brown"], ["Olivia", "Davis"], ["Robert", "Martinez"],
    ["Jessica", "Taylor"], ["David", "Anderson"], ["Amanda", "Thomas"],
    ["Christopher", "Garcia"], ["Lisa", "Rodriguez"], ["Daniel", "Wilson"],
    ["Jennifer", "Lopez"], ["Kevin", "Lee"], ["Rachel", "Harris"]
  ];

  for (let i = 0; i < userNames.length; i++) {
    const uid = `user-${String(i + 1).padStart(3, "0")}`;
    const [fn, ln] = userNames[i];
    const uname = `${fn.toLowerCase()}.${ln.toLowerCase()}`;
    const email = `${uname}@example.com`;
    const monthsAgo = Math.floor(Math.random() * 18);
    const dateCreated = new Date();
    dateCreated.setMonth(dateCreated.getMonth() - monthsAgo);

    await pool.query(
      `INSERT INTO users (id, first_name, last_name, username, email, password_hash, date_created)
       VALUES ($1, $2, $3, $4, $5, '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', $6)
       ON CONFLICT DO NOTHING`,
      [uid, fn, ln, uname, email, dateCreated]
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, 1) ON CONFLICT DO NOTHING`,
      [uid]
    );
  }

  const campaignNames = [
    "Solar Farm Initiative", "Women Empowerment Fund", "Green Building Project",
    "Education Access Program", "Clean Water Initiative", "Healthcare Innovation Fund",
    "Affordable Housing Development", "Climate Action Bond"
  ];

  for (let i = 0; i < campaignNames.length; i++) {
    const themeIds = [((i % 6) + 1).toString(), (((i + 2) % 6) + 1).toString()].join(",");
    const userId = `user-${String((i % 15) + 1).padStart(3, "0")}`;
    const monthsAgo = Math.floor(Math.random() * 12) + 2;
    const created = new Date();
    created.setMonth(created.getMonth() - monthsAgo);

    await pool.query(
      `INSERT INTO campaigns (id, name, user_id, themes, stage, created_date)
       VALUES ($1, $2, $3, $4, 'Active', $5)
       ON CONFLICT DO NOTHING`,
      [i + 1, campaignNames[i], userId, themeIds, created]
    );
  }

  const statuses = ["approved", "approved", "approved", "approved", "pending", "rejected"];
  for (let i = 0; i < 80; i++) {
    const userId = `user-${String((i % 15) + 1).padStart(3, "0")}`;
    const userIdx = i % 15;
    const [fn, ln] = userNames[userIdx];
    const email = `${fn.toLowerCase()}.${ln.toLowerCase()}@example.com`;
    const campaignId = (i % 8) + 1;
    const status = statuses[i % statuses.length];
    const amount = Math.round((Math.random() * 9000 + 1000) * 100) / 100;
    const monthsAgo = Math.floor(Math.random() * 14);
    const dateCreated = new Date();
    dateCreated.setMonth(dateCreated.getMonth() - monthsAgo);
    dateCreated.setDate(Math.floor(Math.random() * 28) + 1);

    await pool.query(
      `INSERT INTO recommendations (user_id, user_email, user_full_name, campaign_id, status, amount, date_created)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, email, `${fn} ${ln}`, campaignId, status, amount, dateCreated]
    );
  }

  const groupNames = [
    "Impact Investors Club", "Green Future Alliance", "Social Change Network",
    "Community Development Fund", "Sustainable Growth Partners"
  ];

  for (let i = 0; i < groupNames.length; i++) {
    const monthsAgo = Math.floor(Math.random() * 10) + 1;
    const created = new Date();
    created.setMonth(created.getMonth() - monthsAgo);

    await pool.query(
      `INSERT INTO groups (id, name, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [i + 1, groupNames[i], created]
    );

    const memberCount = Math.floor(Math.random() * 8) + 3;
    for (let j = 0; j < memberCount; j++) {
      const userId = `user-${String((j % 15) + 1).padStart(3, "0")}`;
      await pool.query(
        `INSERT INTO requests (group_id, user_id, status) VALUES ($1, $2, 'accepted')
         ON CONFLICT DO NOTHING`,
        [i + 1, userId]
      );

      const logCount = Math.floor(Math.random() * 3) + 1;
      for (let k = 0; k < logCount; k++) {
        const oldVal = Math.round(Math.random() * 5000 * 100) / 100;
        const increase = Math.round((Math.random() * 3000 + 500) * 100) / 100;
        await pool.query(
          `INSERT INTO account_balance_change_logs (user_id, group_id, old_value, new_value, change_date)
           VALUES ($1, $2, $3, $4, NOW() - INTERVAL '${Math.floor(Math.random() * 300)} days')`,
          [userId, i + 1, oldVal, oldVal + increase]
        );
      }
    }
  }

  console.log("Database seeded successfully");
}
