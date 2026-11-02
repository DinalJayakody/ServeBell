import { createHmac, randomBytes, randomInt } from 'node:crypto';

/** Opaque URL-safe secret (QR tokens etc.). */
export const randomToken = (bytes = 16) => randomBytes(bytes).toString('base64url');

/** Short human-typeable code without ambiguous characters (0/O, 1/I/L). */
export function humanCode(length = 8) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join('');
}

/** Keyed hash so a database leak alone can't be used to redeem stored codes. */
export const hmac = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('base64url');
