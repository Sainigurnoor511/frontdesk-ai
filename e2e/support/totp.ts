import { createHmac } from 'node:crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function decodeBase32(secret: string): Buffer {
  const clean = secret.replace(/[\s=-]/g, '').toUpperCase()
  let bits = ''
  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char)
    if (value === -1) throw new Error('E2E_MFA_TOTP_SECRET is not valid base32')
    bits += value.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

/** RFC 6238 TOTP with Supabase's parameters: SHA-1, 6 digits, 30-second step. */
export function totpCode(secret: string, now: number = Date.now()): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)))
  const hmac = createHmac('sha1', decodeBase32(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff
  return String(binary % 1_000_000).padStart(6, '0')
}
