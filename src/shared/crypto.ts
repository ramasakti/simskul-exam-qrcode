import crypto from 'node:crypto';

export function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): string {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, expected] = storedHash.split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}
