import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

/**
 * Derives a 32-byte key from the environment secret.
 * Falls back to JWT_REFRESH_SECRET or a hardcoded dev key if TWO_FACTOR_ENCRYPTION_KEY is missing.
 */
function getEncryptionKey(): Buffer {
  const secret =
    process.env.TWO_FACTOR_ENCRYPTION_KEY || process.env.JWT_REFRESH_SECRET || 'dev_fallback_secret_key_32_bytes';
  // Ensure the key is exactly 32 bytes for AES-256
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64 encoded string containing the IV, Auth Tag, and Ciphertext.
 * Format: base64(iv:authTag:ciphertext)
 */
export function encryptSecret(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');

  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a ciphertext string encrypted with `encryptSecret`.
 * Returns the plaintext string, or throws an error if decryption fails or format is invalid.
 */
export function decryptSecret(cipherText: string): string {
  const parts = cipherText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }

  const [ivBase64, authTagBase64, encryptedBase64] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
