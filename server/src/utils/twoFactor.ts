interface TwoFactorCode {
  code: number;
  expiresAt: number;
}

const codeStore = new Map<string, TwoFactorCode>();

const CODE_TTL_MS = 10 * 60 * 1000;

export function generateTwoFactorCode(email: string): number {
  const code = Math.floor(100000 + Math.random() * 900000);
  const normalizedEmail = email.toLowerCase();

  codeStore.set(normalizedEmail, {
    code,
    expiresAt: Date.now() + CODE_TTL_MS,
  });

  console.log(`[2FA] Code for ${normalizedEmail}: ${code} (email sending not yet implemented — logged to console as placeholder)`);

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
