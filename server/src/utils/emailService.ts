import { Resend } from "resend";
import pool from "../db.js";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "CataCap <support@catacap.org>";

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function applyTestOverride(recipient: string, subject: string, bodyHtml: string): { recipient: string; subject: string; bodyHtml: string } {
  const testEmail = process.env.TEST_EMAIL_OVERRIDE;
  if (!testEmail) return { recipient, subject, bodyHtml };
  const overriddenSubject = `[TEST] ${subject} (Original recipient: ${recipient})`;
  const notice = `<div style="background:#fff3cd;border:1px solid #ffc107;padding:10px;margin-bottom:15px;font-size:13px;color:#856404;border-radius:4px;"><strong>TEST MODE:</strong> This email was originally intended for <strong>${recipient}</strong></div>`;
  const overriddenBody = notice + bodyHtml;
  return { recipient: testEmail, subject: overriddenSubject, bodyHtml: overriddenBody };
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

    const originalRecipient = toEmail || template.receiver;
    const overridden = applyTestOverride(originalRecipient, subject, bodyHtml);
    const recipient = overridden.recipient;
    subject = overridden.subject;
    bodyHtml = overridden.bodyHtml;

    const resend = getResendClient();
    if (!resend) {
      console.warn(`[EMAIL] Resend API not configured (RESEND_API_KEY missing) — email NOT sent. Template category ${category} would be sent to: ${recipient}`);
      console.warn(`  Subject: ${subject}`);
      console.warn(`  Variables: ${JSON.stringify(variables)}`);
      return false;
    }

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [recipient],
      subject,
      html: bodyHtml,
    });

    if (error) {
      console.error(`[EMAIL] Resend error for category ${category}:`, error);
      return false;
    }

    console.log(`[EMAIL] Template email sent for category ${category} to: ${recipient}${recipient !== originalRecipient ? ` (original: ${originalRecipient})` : ''} (id: ${data?.id})`);
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

    const originalRecipient = toEmail || template.receiver;
    const overridden = applyTestOverride(originalRecipient, subject, bodyHtml);
    const recipient = overridden.recipient;
    subject = overridden.subject;
    bodyHtml = overridden.bodyHtml;

    const resend = getResendClient();
    if (!resend) {
      console.warn(`[EMAIL] Resend API not configured (RESEND_API_KEY missing) — email NOT sent. Template category ${category} would be sent to: ${recipient}`);
      console.warn(`  Subject: ${subject}`);
      console.warn(`  Attachments: ${attachments.map(a => a.filename).join(", ")}`);
      return false;
    }

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [recipient],
      subject,
      html: bodyHtml,
      attachments: attachments.map(a => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    if (error) {
      console.error(`[EMAIL] Resend error for category ${category} with attachments:`, error);
      return false;
    }

    console.log(`[EMAIL] Template email with attachments sent for category ${category} to: ${recipient}${recipient !== originalRecipient ? ` (original: ${originalRecipient})` : ''} (id: ${data?.id})`);
    return true;
  } catch (err: any) {
    console.error(`[EMAIL] Error sending template email with attachments for category ${category}:`, err.message);
    return false;
  }
}
