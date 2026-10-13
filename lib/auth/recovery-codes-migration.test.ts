/**
 * Checks the SQL SHAPE of migration 048, not its live semantics: it reads the file as text and
 * asserts what it does and does not say. It cannot prove what Postgres will do with it (that needs
 * a database, and CI applies migrations only on merge to `main`). What it does catch is the edit
 * that matters: someone adding a policy or a grant that lets the publishable key reach
 * `mfa_recovery_codes`, or dropping the revoke.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  path.resolve(__dirname, '../../supabase/migrations/00000000000048_mfa_recovery_codes.sql'),
  'utf8'
)

// Statements only: `--` comments stripped, so the explanation in the header cannot satisfy or
// trip an assertion.
const statements = sql
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .split(';')
  .map((statement) => statement.replace(/\s+/g, ' ').trim().toLowerCase())
  .filter(Boolean)

describe('migration 048 (mfa_recovery_codes) SQL shape', () => {
  it('creates the table with the hashed-code columns and a user index', () => {
    const create = statements.find((s) => s.startsWith('create table if not exists mfa_recovery_codes'))
    expect(create).toBeDefined()
    expect(create).toContain('user_id uuid not null references auth.users on delete cascade')
    expect(create).toContain('code_hash text not null')
    expect(create).toContain('used_at timestamptz')
    expect(create).not.toMatch(/\bcode text\b|\bplaintext\b/)
    expect(statements).toContainEqual(expect.stringMatching(/^create index .* on mfa_recovery_codes \(user_id\)$/))
  })

  it('enables RLS', () => {
    expect(statements).toContain('alter table mfa_recovery_codes enable row level security')
  })

  it('revokes everything from anon and authenticated', () => {
    expect(statements).toContain('revoke all on mfa_recovery_codes from anon, authenticated')
  })

  it('grants anon and authenticated nothing, by policy or by grant', () => {
    expect(statements.filter((s) => s.startsWith('create policy'))).toEqual([])
    expect(statements.filter((s) => /^grant\b/.test(s))).toEqual([])
    expect(statements.filter((s) => /\b(authenticated|anon|public)\b/.test(s) && !s.startsWith('revoke'))).toEqual([])
  })
})
