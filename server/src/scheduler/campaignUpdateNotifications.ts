import pool from "../db.js";

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  const text = String(s).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return text.length > n ? text.substring(0, n - 1) + "…" : text;
}

export async function runCampaignUpdateNotifications(): Promise<void> {
  const jobName = "CampaignUpdateNotifications";
  console.log(`[SCHEDULER] ${jobName}: scanning for updates whose start_date has been reached...`);

  const due = await pool.query(
    `SELECT cu.id, cu.campaign_id, cu.subject, cu.description,
            cu.short_description,
            c.property AS campaign_property,
            c.image_file_name, c.tile_image_file_name
       FROM campaign_updates cu
       JOIN campaigns c ON c.id = cu.campaign_id
      WHERE cu.is_deleted = false
        AND cu.notifications_sent_at IS NULL
        AND cu.start_date IS NOT NULL
        AND cu.start_date <= NOW()
        AND (cu.end_date IS NULL OR cu.end_date >= NOW())`
  );

  if (due.rows.length === 0) {
    console.log(`[SCHEDULER] ${jobName}: no due updates.`);
    return;
  }

  let totalNotifs = 0;
  let processed = 0;

  for (const u of due.rows) {
    try {
      const investors = await pool.query(
        `SELECT DISTINCT ui.user_id
           FROM user_investments ui
          WHERE ui.campaign_id = $1
            AND ui.user_id IS NOT NULL
            AND (ui.is_deleted IS NULL OR ui.is_deleted = false)`,
        [u.campaign_id]
      );

      const redirectUrl = `/investments/${u.campaign_property || u.campaign_id}`;
      const title = u.subject;
      const description = u.short_description || truncate(u.description, 240);
      const picture = u.image_file_name || u.tile_image_file_name || null;

      for (const row of investors.rows) {
        try {
          await pool.query(
            `INSERT INTO user_notifications (title, description, url_to_redirect, is_read, target_user_id, picture_file_name)
             VALUES ($1, $2, $3, false, $4, $5)`,
            [title, description, redirectUrl, row.user_id, picture]
          );
          totalNotifs++;
        } catch (notifErr) {
          console.error(
            `[SCHEDULER] ${jobName}: failed to insert notification for user ${row.user_id}, update ${u.id}:`,
            notifErr
          );
        }
      }

      await pool.query(
        `UPDATE campaign_updates SET notifications_sent_at = NOW() WHERE id = $1`,
        [u.id]
      );
      processed++;
    } catch (updateErr) {
      console.error(`[SCHEDULER] ${jobName}: failed processing update ${u.id}:`, updateErr);
    }
  }

  console.log(
    `[SCHEDULER] ${jobName}: processed ${processed}/${due.rows.length} update(s), inserted ${totalNotifs} notification(s).`
  );
}
