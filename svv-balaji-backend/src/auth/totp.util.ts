import * as crypto from 'crypto';
import * as qrcode from 'qrcode';

/**
 * Generates a random Base32 string of the given byte length.
 * Standard length is 20 bytes (160 bits).
 */
export function generateBase32Secret(length = 20): string {
  const bytes = crypto.randomBytes(length);
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += base32chars[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += base32chars[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Decodes a Base32 string into a Buffer.
 */
function base32ToBuffer(base32: string): Buffer {
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let index = 0;
  const output = Buffer.alloc(Math.ceil((base32.length * 5) / 8));

  for (let i = 0; i < base32.length; i++) {
    const char = base32[i].toUpperCase();
    if (char === '=' || char === ' ') continue;
    const val = base32chars.indexOf(char);
    if (val === -1) throw new Error('Invalid base32 character in secret');

    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      output[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return output.subarray(0, index);
}

/**
 * Generates a 6-digit TOTP code for the given secret and time counter.
 */
export function generateTotp(secret: string, counter: number): string {
  const key = base32ToBuffer(secret);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  timeBuffer.writeUInt32BE(counter & 0xffffffff, 4);

  const hmac = crypto.createHmac('sha1', key);
  hmac.update(timeBuffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = (binary % 1000000).toString().padStart(6, '0');
  return otp;
}

/**
 * Verifies a TOTP token against the given secret.
 * Allows a default window of +/- 1 step (30 seconds each).
 */
export function verifyTotp(token: string, secret: string, window = 1): boolean {
  if (!token || !secret) return false;
  // Clean token
  token = token.replace(/\s+/g, '');
  if (token.length !== 6 || !/^\d+$/.test(token)) return false;

  const currentCounter = Math.floor(Date.now() / 1000 / 30);

  for (let i = -window; i <= window; i++) {
    const generated = generateTotp(secret, currentCounter + i);
    if (generated === token) {
      return true;
    }
  }

  return false;
}

/**
 * Generates recovery codes.
 */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const random = crypto.randomBytes(4).toString('hex');
    codes.push(`${random.slice(0, 4)}-${random.slice(4)}`);
  }
  return codes;
}

/**
 * Generates an OTPAuth URI.
 */
export function generateOtpAuthUrl(secret: string, email: string): string {
  const issuer = 'SVV Balaji';
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(
    email,
  )}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generates a base64 Data URL for a QR Code.
 */
export async function generateQrCodeDataUrl(otpauthUrl: string): Promise<string> {
  return await qrcode.toDataURL(otpauthUrl);
}
