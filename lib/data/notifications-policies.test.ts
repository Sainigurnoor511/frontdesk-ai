// TEXT-SHAPE GUARD ONLY. This suite reads migration `047` as a string and
// regex-matches its policy and grant statements. It does NOT run them against
// a live Postgres, so it does not exercise policy semantics: a policy whose text
// looks right but whose predicate is wrong still passes here. Running the RLS
// and grant set against a real database in CI is backlogged in
// `developer-docs/TODO.md`.
//
// Within that limit, "a direct member write is
// rejected" is expressed against the migration that rejects it: a member-facing
// insert or delete policy, or a table-wide update grant, is exactly what let any
// authenticated member forge a notification into a teammate's bell, rewrite
// someone else's row, or flip `email_sent_at` to suppress a real email. A
// regression here reinstates that, and this is the cheapest place to catch it.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const MIGRATION = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/00000000000047_notifications.sql'),
  'utf8'
)

describe('notifications RLS and grants', () => {
  it('scopes the select policy to the caller organization', () => {
    expect(MIGRATION).toMatch(/create policy[^;]+for select[^;]+organization_id in \(\s*select organization_id from members where user_id = auth\.uid\(\)/)
  })

  it('grants no member-facing insert or delete policy', () => {
    expect(MIGRATION).not.toMatch(/create policy[^;]+on notifications for insert/)
    expect(MIGRATION).not.toMatch(/create policy[^;]+on notifications for delete/)
  })

  it('revokes the table-wide write grants Supabase hands to authenticated', () => {
    expect(MIGRATION).toMatch(
      /revoke insert, update, delete, truncate, references on notifications from authenticated/
    )
    expect(MIGRATION).toMatch(/revoke all on notifications from anon/)
  })

  it('re-grants update on is_read alone', () => {
    expect(MIGRATION).toMatch(/grant update \(is_read\) on notifications to authenticated/)
    // Any broader column grant would reopen the hole the revoke above closes.
    const updateGrants = MIGRATION.match(/grant[^;]*update[^;]*to authenticated/g) ?? []
    expect(updateGrants).toHaveLength(1)
  })

  it('checks the organization on the update policy as well as the row filter', () => {
    const updatePolicy = MIGRATION.match(/create policy[^;]+for update[^;]+;/)?.[0] ?? ''
    expect(updatePolicy).toContain('using')
    // Without `with check`, a member could move a row to another organization.
    expect(updatePolicy).toContain('with check')
  })

  it('keeps the delivery lease separate from the durable sent timestamp', () => {
    expect(MIGRATION).toMatch(/email_sent_at timestamptz/)
    expect(MIGRATION).toMatch(/email_claimed_at timestamptz/)
    expect(MIGRATION).toMatch(/email_claim_token text/)
  })
})
