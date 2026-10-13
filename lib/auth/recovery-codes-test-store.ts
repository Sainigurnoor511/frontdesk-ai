/**
 * In-memory stand-in for the parts of Supabase the recovery-code flow touches, shared by the
 * recovery-code test files. Not a test file itself.
 *
 * - `service` fakes the service-role client: PostgREST calls on `mfa_recovery_codes` (filters are
 *   honoured, so a missing `.is('used_at', null)` really does match a used row) and
 *   `auth.admin.mfa.listFactors` / `deleteFactor`.
 * - `session(...)` fakes the cookie-session client for one user. Its `getUser()` reads the user's
 *   factors from this store on every call, which is what GoTrue's `/user` does, so a factor deleted
 *   through `service` is gone from the next gate resolution.
 *
 * Each PostgREST call runs to completion in one synchronous step when awaited, which is the
 * guarantee a single conditional `UPDATE` gets from Postgres's row lock: two concurrent updates of
 * one row cannot both see `used_at is null`.
 */
import { vi } from 'vitest'

export type CodeRow = {
  id: string
  user_id: string
  code_hash: string
  used_at: string | null
  created_at: string
}

export type FakeFactor = { id: string; factor_type: string; status: 'verified' | 'unverified' }

type Filter = { column: keyof CodeRow; value: unknown; op: 'eq' | 'is' }
type Failures = Partial<Record<'delete' | 'insert' | 'update' | 'select' | 'deleteFactor', boolean>>

let nextId = 0

export function createRecoveryStore() {
  const rows: CodeRow[] = []
  const factors = new Map<string, FakeFactor[]>()
  const failures: Failures = {}

  function matches(row: CodeRow, filters: Filter[]) {
    return filters.every((filter) => row[filter.column] === filter.value)
  }

  class Query {
    private filters: Filter[] = []
    private returning = false
    constructor(
      private op: 'delete' | 'insert' | 'update' | 'select',
      private payload?: unknown,
      private head = false
    ) {}
    eq(column: keyof CodeRow, value: unknown) {
      this.filters.push({ column, value, op: 'eq' })
      return this
    }
    is(column: keyof CodeRow, value: null) {
      this.filters.push({ column, value, op: 'is' })
      return this
    }
    select() {
      this.returning = true
      return this
    }
    private run() {
      const error = failures[this.op] ? { message: `${this.op} failed`, code: 'XX000' } : null
      if (error) return { data: null, count: null, error }
      switch (this.op) {
        case 'insert': {
          for (const row of this.payload as Pick<CodeRow, 'user_id' | 'code_hash'>[]) {
            rows.push({
              id: `code-${++nextId}`,
              used_at: null,
              created_at: new Date().toISOString(),
              ...row,
            })
          }
          return { data: null, error: null }
        }
        case 'delete': {
          for (let i = rows.length - 1; i >= 0; i--) {
            if (matches(rows[i], this.filters)) rows.splice(i, 1)
          }
          return { data: null, error: null }
        }
        case 'update': {
          const changed = rows.filter((row) => matches(row, this.filters))
          for (const row of changed) Object.assign(row, this.payload)
          return { data: this.returning ? changed.map((row) => ({ id: row.id })) : null, error: null }
        }
        case 'select': {
          const found = rows.filter((row) => matches(row, this.filters))
          return { data: this.head ? null : found, count: found.length, error: null }
        }
      }
    }
    then<T>(resolve: (value: ReturnType<Query['run']>) => T, reject?: (reason: unknown) => T) {
      try {
        return Promise.resolve(resolve(this.run()))
      } catch (error) {
        return reject ? Promise.resolve(reject(error)) : Promise.reject(error)
      }
    }
  }

  const deleteFactor = vi.fn(async ({ userId, id }: { userId: string; id: string }) => {
    if (failures.deleteFactor) {
      return { data: null, error: { name: 'AuthApiError', message: 'down', status: 500 } }
    }
    factors.set(userId, (factors.get(userId) ?? []).filter((factor) => factor.id !== id))
    return { data: { id }, error: null }
  })

  const service = {
    from: vi.fn((table: string) => {
      if (table !== 'mfa_recovery_codes') throw new Error(`unexpected table ${table}`)
      return {
        insert: (payload: unknown) => new Query('insert', payload),
        delete: () => new Query('delete'),
        update: (payload: unknown) => new Query('update', payload),
        select: (_columns: string, options?: { head?: boolean }) =>
          new Query('select', undefined, Boolean(options?.head)),
      }
    }),
    auth: {
      admin: {
        mfa: {
          listFactors: vi.fn(async ({ userId }: { userId: string }) => ({
            data: { factors: [...(factors.get(userId) ?? [])] },
            error: null,
          })),
          deleteFactor,
        },
      },
    },
  }

  /** A cookie-session client for `userId`, at `currentLevel` (`aal1` is a pending session). */
  function session(userId: string, options: { currentLevel?: 'aal1' | 'aal2'; email?: string } = {}) {
    return {
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: userId,
              email: options.email ?? 'owner@example.com',
              factors: [...(factors.get(userId) ?? [])],
            },
          },
          error: null,
        })),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(async () => ({
            data: { currentLevel: options.currentLevel ?? 'aal1', nextLevel: null },
            error: null,
          })),
        },
        signOut: vi.fn(async () => ({ error: null })),
      },
    }
  }

  return { rows, factors, failures, service, session, deleteFactor }
}
