/**
 * Checks the SQL SHAPE of migration 048, not its live semantics: it reads the file as text and
 * asserts what it does and does not say. It cannot prove what Postgres will do with it (that needs
 * a database, and CI applies migrations only on merge to `main`). What it does catch is the edit
 * that matters: someone adding a policy or a grant that lets the publishable key reach
 * `mfa_recovery_codes` or call its replace function, dropping a revoke, or unpinning the
 * function's `search_path`.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  path.resolve(__dirname, '../../supabase/migrations/00000000000048_mfa_recovery_codes.sql'),
  'utf8'
)

// Statements only: `--` comments stripped, so the explanation in the header cannot satisfy or
// trip an assertion. Split on `;` outside `$$ … $$`, so the function body stays one statement.
function splitStatements(text: string): string[] {
  const out: string[] = []
  let current = ''
  let inBody = false
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('$$', i)) {
      inBody = !inBody
      current += '$$'
      i++
    } else if (text[i] === ';' && !inBody) {
      out.push(current)
      current = ''
    } else {
      current += text[i]
    }
  }
  out.push(current)
  return out
}

const statements = splitStatements(
  sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
)
  .map((statement) => statement.replace(/\s+/g, ' ').trim().toLowerCase())
  .filter(Boolean)

const FUNCTION = 'public.replace_mfa_recovery_codes(uuid, uuid, text[])'

describe('migration 048 (mfa_recovery_codes) SQL shape', () => {
  it('creates the table with the hashed-code columns, the factor binding and both indexes', () => {
    const create = statements.find((s) => s.startsWith('create table if not exists mfa_recovery_codes'))
    expect(create).toBeDefined()
    expect(create).toContain('user_id uuid not null references auth.users on delete cascade')
    expect(create).toContain('factor_id uuid not null')
    expect(create).toContain('code_hash text not null')
    expect(create).toContain('used_at timestamptz')
    expect(create).not.toMatch(/\bcode text\b|\bplaintext\b/)
    expect(statements).toContainEqual(expect.stringMatching(/^create index .* on mfa_recovery_codes \(user_id\)$/))
    expect(statements).toContainEqual(
      expect.stringMatching(/^create index .* on mfa_recovery_codes \(user_id, factor_id\)$/)
    )
  })

  it('enables RLS', () => {
    expect(statements).toContain('alter table mfa_recovery_codes enable row level security')
  })

  it('revokes everything on the table from anon and authenticated', () => {
    expect(statements).toContain('revoke all on mfa_recovery_codes from anon, authenticated')
  })

  it('grants anon and authenticated nothing, by policy or by grant', () => {
    expect(statements.filter((s) => s.startsWith('create policy'))).toEqual([])
    // The schema qualifier `public.` is not the PUBLIC role, so it is taken out before looking.
    const roles = statements.map((s) => s.replace(/\bpublic\./g, ''))
    expect(roles.filter((s) => /\b(authenticated|anon|public)\b/.test(s) && !s.startsWith('revoke'))).toEqual([])
  })

  describe('replace_mfa_recovery_codes', () => {
    const fn = statements.find((s) => s.startsWith('create or replace function public.replace_mfa_recovery_codes'))

    it('is security definer with a pinned, empty search_path', () => {
      expect(fn).toBeDefined()
      expect(fn).toContain('p_user_id uuid, p_factor_id uuid, p_hashes text[]')
      expect(fn).toContain('security definer')
      expect(fn).toMatch(/set search_path = ''/)
    })

    it('replaces only the user’s unused codes, binding the new set to the factor', () => {
      expect(fn).toContain('delete from public.mfa_recovery_codes where user_id = p_user_id and used_at is null')
      expect(fn).toContain('insert into public.mfa_recovery_codes (user_id, factor_id, code_hash)')
      expect(fn).toContain('select p_user_id, p_factor_id, hash from unnest(p_hashes)')
    })

    it('is executable by service_role only', () => {
      expect(statements).toContain(`revoke execute on function ${FUNCTION} from public, anon, authenticated`)
      const grants = statements.filter((s) => /^grant\b/.test(s))
      expect(grants).toEqual([`grant execute on function ${FUNCTION} to service_role`])
    })
  })
})
