import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const KEY_LENGTH = 32
const AUTH_TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY
  if (!secret) {
    throw new Error('ENCRYPTION_KEY environment variable is not set')
  }
  return createHash('sha256').update(secret).digest().subarray(0, KEY_LENGTH)
}

export function encrypt(text: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

/**
 * HMAC-SHA256 of `value`, hex-encoded, for storing a lookup token (such as a recovery code) that
 * must be matchable but never stored in plaintext. Keyed from `ENCRYPTION_KEY` like `encrypt()`,
 * so the database alone cannot test candidates, but through a per-`purpose` subkey
 * (`HMAC(key, "frontdesk:<purpose>")`) so the AES key itself is never used as a MAC key and one
 * purpose's hashes are useless for another. Only for high-entropy values: a fast keyed hash is
 * no defence for anything guessable.
 */
export function keyedHash(purpose: string, value: string): string {
  const subkey = createHmac('sha256', getEncryptionKey()).update(`frontdesk:${purpose}`).digest()
  return createHmac('sha256', subkey).update(value, 'utf8').digest('hex')
}

export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey()
  const buffer = Buffer.from(encryptedData, 'base64')

  const iv = buffer.subarray(0, IV_LENGTH)
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}
