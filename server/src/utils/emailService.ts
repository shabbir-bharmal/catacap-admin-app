import nodemailer from "nodemailer";
import pool from "../db.js";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

export async function sendTemplateEmail(
  category: number,
  toEmail: string,
  variables: Record<string, string>
): Promise<boolean> {
  try {
    const templateResult = await pool.query(
      `SELECT id, name, subject, body_html, receiver
       FROM email_templates
       WHERE category = $1 AND status = 2 AND (is_deleted IS NULL OR is_deleted = false)
       LIMIT 1`,
      [category]
    );

    if (templateResult.rows.length === 0) {
      console.warn(`[EMAIL] No active email template found for category ${category}`);
      return false;
    }

    const template = templateResult.rows[0];
    let bodyHtml = template.body_html || "";
    let subject = template.subject || "";

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      bodyHtml = bodyHtml.replace(regex, value);
      subject = subject.replace(regex, value);
    }

    const recipient = toEmail || template.receiver;

    const mailer = getTransporter();
    if (!mailer) {
      console.log(`[EMAIL] SMTP not configured. Template email for category ${category} would be sent to: ${recipient}`);
      console.log(`  Subject: ${subject}`);
      console.log(`  Variables: ${JSON.stringify(variables)}`);
      return true;
    }

    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@catacap.com";

    await mailer.sendMail({
      from: fromEmail,
      to: recipient,
      subject,
      html: bodyHtml,
    });

    console.log(`[EMAIL] Template email sent for category ${category} to: ${recipient}`);
    return true;
  } catch (err: any) {
    console.error(`[EMAIL] Error sending template email for category ${category}:`, err.message);
    return false;
  }
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export async function sendTemplateEmailWithAttachments(
  category: number,
  toEmail: string,
  variables: Record<string, string>,
  attachments: EmailAttachment[]
): Promise<boolean> {
  try {
    const templateResult = await pool.query(
      `SELECT id, name, subject, body_html, receiver
       FROM email_templates
       WHERE category = $1 AND status = 2 AND (is_deleted IS NULL OR is_deleted = false)
       LIMIT 1`,
      [category]
    );

    if (templateResult.rows.length === 0) {
      console.warn(`[EMAIL] No active email template found for category ${category}`);
      return false;
    }

    const template = templateResult.rows[0];
    let bodyHtml = template.body_html || "";
    let subject = template.subject || "";

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      bodyHtml = bodyHtml.replace(regex, value);
      subject = subject.replace(regex, value);
    }

    const recipient = toEmail || template.receiver;

    const mailer = getTransporter();
    if (!mailer) {
      console.log(`[EMAIL] SMTP not configured. Template email for category ${category} would be sent to: ${recipient}`);
      console.log(`  Subject: ${subject}`);
      console.log(`  Attachments: ${attachments.map(a => a.filename).join(", ")}`);
      return true;
    }

    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@catacap.com";

    await mailer.sendMail({
      from: fromEmail,
      to: recipient,
      subject,
      html: bodyHtml,
      attachments: attachments.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    console.log(`[EMAIL] Template email with attachments sent for category ${category} to: ${recipient}`);
    return true;
  } catch (err: any) {
    console.error(`[EMAIL] Error sending template email with attachments for category ${category}:`, err.message);
    return false;
  }
}
