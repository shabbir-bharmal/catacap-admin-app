import { Resend } from "resend";
import pool from "../db.js";

const DEFAULT_SENDER_NAME = "CataCap Support";
const DEFAULT_FROM_ADDRESS = "support@catacap.org";

const CACHE_TTL_MS = Math.max(1000, parseInt(process.env.EMAIL_CONFIG_CACHE_TTL_MS || "", 10) || 5 * 60 * 1000);

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const siteConfigCache = new Map<string, CacheEntry>();

function getCached(key: string): string | null {
  const entry = siteConfigCache.get(key);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.value;
  }
  if (entry) {
    siteConfigCache.delete(key);
  }
  return null;
}

function setCache(key: string, value: string): void {
  siteConfigCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateEmailConfigCache(): void {
  siteConfigCache.delete("emailSenderName");
  siteConfigCache.delete("defaultFromAddress");
}

export async function getEmailSenderName(): Promise<string> {
  const cached = getCached("emailSenderName");
  if (cached !== null) {
    return cached;
  }
  try {
    const result = await pool.query(
      `SELECT value FROM site_configurations WHERE key = 'emailSenderName' LIMIT 1`
    );
    const value = result.rows[0]?.value;
    const resolved = value && value.trim() ? value.trim() : DEFAULT_SENDER_NAME;
    setCache("emailSenderName", resolved);
    return resolved;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[EMAIL] Failed to fetch emailSenderName from site_configurations: ${message}`);
    return DEFAULT_SENDER_NAME;
  }
}

async function getDefaultFromAddress(): Promise<string> {
  const cached = getCached("defaultFromAddress");
  if (cached !== null) {
    return cached;
  }
  try {
    const result = await pool.query(
      `SELECT value FROM site_configurations WHERE key = 'defaultFromAddress' LIMIT 1`
    );
    const value = result.rows[0]?.value;
    const resolved = value && value.trim() ? value.trim() : DEFAULT_FROM_ADDRESS;
    setCache("defaultFromAddress", resolved);
    return resolved;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[EMAIL] Failed to fetch defaultFromAddress from site_configurations: ${message}`);
    return DEFAULT_FROM_ADDRESS;
  }
}

export async function buildFromEmail(): Promise<string> {
  const senderName = await getEmailSenderName();
  const fromAddress = await getDefaultFromAddress();
  return `${senderName} <${fromAddress}>`;
}

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

const PLACEHOLDER_REGEX = /\{\{\s*([^{}]+?)\s*\}\}/g;
const INLINE_TAGS_INSIDE_PLACEHOLDER_REGEX = /\{\{((?:(?!\}\}).)*?)\}\}/gs;
const HTML_TAG_REGEX = /<[^>]+>/g;

function stripInlineTagsInsidePlaceholders(content: string): string {
  return content.replace(INLINE_TAGS_INSIDE_PLACEHOLDER_REGEX, (_match, inner: string) => {
    const stripped = inner.replace(HTML_TAG_REGEX, "");
    return `{{${stripped}}}`;
  });
}

export function replaceTemplateVariables(
  content: string,
  variables: Record<string, string>,
  isHtml = false
): string {
  if (!content) return "";

  let working = content;
  if (isHtml) {
    working = stripInlineTagsInsidePlaceholders(working);
  }

  const lookup = new Map<string, string>();
  for (const [key, value] of Object.entries(variables || {})) {
    if (key) lookup.set(key.toLowerCase(), value ?? "");
  }

  return working.replace(PLACEHOLDER_REGEX, (_match, rawKey: string) => {
    const key = rawKey.trim().toLowerCase();
    const value = lookup.get(key);
    return value !== undefined ? value : "";
  });
}

function applyTestOverride(recipient: string, subject: string, bodyHtml: string): { recipient: string; subject: string; bodyHtml: string } {
  const testEmail = process.env.TEST_EMAIL_OVERRIDE;
  if (!testEmail) return { recipient, subject, bodyHtml };
  const overriddenSubject = `[TEST] ${subject} (Original recipient: ${recipient})`;
  const notice = `<div style="background:#fff3cd;border:1px solid #ffc107;padding:10px;margin-bottom:15px;font-size:13px;color:#856404;border-radius:4px;"><strong>TEST MODE:</strong> This email was originally intended for <strong>${recipient}</strong></div>`;
  const overriddenBody = notice + bodyHtml;
  return { recipient: testEmail, subject: overriddenSubject, bodyHtml: overriddenBody };
}

interface DispatchOptions {
  toEmail: string;
  subject: string;
  bodyHtml: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
  context: string;
  extraSkipLog?: () => void;
}

async function dispatchEmail(opts: DispatchOptions): Promise<boolean> {
  if (!opts.toEmail) {
    console.warn(`[EMAIL] ${opts.context} — empty recipient, skipping send.`);
    return false;
  }

  const overridden = applyTestOverride(opts.toEmail, opts.subject, opts.bodyHtml);
  const recipient = overridden.recipient;
  const finalSubject = overridden.subject;
  const finalBody = overridden.bodyHtml;

  const resend = getResendClient();
  if (!resend) {
    console.warn(`[EMAIL] Resend API not configured (RESEND_API_KEY missing) — ${opts.context} NOT sent. Would send to: ${recipient}`);
    console.warn(`  Subject: ${finalSubject}`);
    opts.extraSkipLog?.();
    return false;
  }

  const fromEmail = await buildFromEmail();

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [recipient],
      subject: finalSubject,
      html: finalBody,
      ...(opts.attachments && opts.attachments.length > 0
        ? { attachments: opts.attachments }
        : {}),
    });

    if (error) {
      console.error(`[EMAIL] Resend error for ${opts.context}:`, error);
      return false;
    }

    console.log(`[EMAIL] Sent ${opts.context} to: ${recipient}${recipient !== opts.toEmail ? ` (original: ${opts.toEmail})` : ''} (id: ${data?.id})`);
    return true;
  } catch (err: any) {
    console.error(`[EMAIL] Error sending ${opts.context}:`, err?.message || err);
    return false;
  }
}

export async function sendDirectEmail(
  toEmail: string,
  subject: string,
  bodyHtml: string
): Promise<boolean> {
  return dispatchEmail({
    toEmail,
    subject,
    bodyHtml,
    context: "direct email",
  });
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
    let subject = replaceTemplateVariables(template.subject || "", variables);
    let bodyHtml = replaceTemplateVariables(template.body_html || "", variables, true);

    return dispatchEmail({
      toEmail: toEmail || template.receiver,
      subject,
      bodyHtml,
      context: `template category ${category}`,
      extraSkipLog: () => {
        console.warn(`  Variables: ${JSON.stringify(variables)}`);
      },
    });
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
    let subject = replaceTemplateVariables(template.subject || "", variables);
    let bodyHtml = replaceTemplateVariables(template.body_html || "", variables, true);

    return dispatchEmail({
      toEmail: toEmail || template.receiver,
      subject,
      bodyHtml,
      attachments: attachments.map(a => ({
        filename: a.filename,
        content: a.content,
      })),
      context: `template category ${category} with attachments`,
      extraSkipLog: () => {
        console.warn(`  Attachments: ${attachments.map(a => a.filename).join(", ")}`);
      },
    });
  } catch (err: any) {
    console.error(`[EMAIL] Error sending template email with attachments for category ${category}:`, err.message);
    return false;
  }
}
