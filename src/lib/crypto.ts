import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateApiKey(secretKey: string): string {
  const randomSalt = randomBytes(32).toString('hex');
  const hmac = createHmac('sha256', secretKey);
  hmac.update(randomSalt);
  return `sk-${hmac.digest('hex')}`;
}

export function hashApiKey(key: string, saltKey: string): string {
  const hmac = createHmac('sha256', saltKey);
  hmac.update(key);
  return hmac.digest('hex');
}

export function verifyApiKey(
  rawKey: string,
  hashedKey: string,
  saltKey: string,
): boolean {
  const computed = hashApiKey(rawKey, saltKey);
  const computedBuf = Buffer.from(computed, 'hex');
  const storedBuf = Buffer.from(hashedKey, 'hex');

  if (computedBuf.length !== storedBuf.length) {
    return false;
  }

  return timingSafeEqual(computedBuf, storedBuf);
}
