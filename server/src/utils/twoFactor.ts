import { sendDirectEmail } from "./emailService.js";

interface TwoFactorCode {
  code: number;
  expiresAt: number;
}

const codeStore = new Map<string, TwoFactorCode>();

const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_TTL_MINUTES = Math.round(CODE_TTL_MS / 60000);

function buildEmailHtml(code: number): string {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #1f2d3d; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 12px; color: #405189;">Your verification code</h2>
      <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.5;">
        Use the following code to finish signing in to your CataCap admin account:
      </p>
      <div style="font-size: 28px; font-weight: 700; letter-spacing: 6px; padding: 16px 24px; background: #f3f6fb; border: 1px solid #d0d7e2; border-radius: 6px; text-align: center; color: #0ab39c;">
        ${code}
      </div>
      <p style="margin: 16px 0 0; font-size: 12px; color: #6b7280;">
        This code will expire in ${CODE_TTL_MINUTES} minutes. If you did not try to sign in, you can safely ignore this email.
      </p>
    </div>
  `;
}

export async function generateTwoFactorCode(email: string): Promise<number> {
  const code = Math.floor(100000 + Math.random() * 900000);
  const normalizedEmail = email.toLowerCase();

  codeStore.set(normalizedEmail, {
    code,
    expiresAt: Date.now() + CODE_TTL_MS,
  });

  console.log(`[2FA] Code generated for ${normalizedEmail} (expires in ${CODE_TTL_MINUTES}m)`);

  try {
    const sent = await sendDirectEmail(
      email,
      "Your CataCap admin verification code",
      buildEmailHtml(code)
    );
    if (!sent) {
      console.warn(`[2FA] Verification email not delivered for ${normalizedEmail} — see [EMAIL] logs above for details.`);
    }
  } catch (err: any) {
    console.error(`[2FA] Error sending verification email to ${normalizedEmail}:`, err?.message || err);
  }

  return code;
}

export function verifyTwoFactorCode(email: string, code: number): boolean {
  const normalizedEmail = email.toLowerCase();
  const stored = codeStore.get(normalizedEmail);

  if (!stored) return false;

  if (Date.now() > stored.expiresAt) {
    codeStore.delete(normalizedEmail);
    return false;
  }

  if (stored.code !== code) return false;

  codeStore.delete(normalizedEmail);
  return true;
}
