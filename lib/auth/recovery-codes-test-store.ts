/**
 * In-memory stand-in for the parts of Supabase the recovery-code flow touches, shared by the
 * recovery-code test files. Not a test file itself.
 *
 * - `service` fakes the service-role client: PostgREST calls on `mfa_recovery_codes` (filters are
 *   honoured, so a missing `.is('used_at', null)` really does match a used row), the
 *   `replace_mfa_recovery_codes` RPC (one synchronous step, which is what the SQL function's single
 *   transaction gives: it either replaces the unused set or changes nothing), and
 *   `auth.admin.mfa.listFactors` / `deleteFactor`.
 * - `session(...)` fakes the cookie-session client for one user. Its `getUser()` reads the user's
 *   factors from this store on every call, which is what GoTrue's `/user` does, so a factor deleted
 *   through `service` is gone from the next gate resolution.
 *
 * Each PostgREST call runs to completion in one synchronous step when awaited, which is the
 * guarantee a single conditional `UPDATE` gets from Postgres's row lock: two concurrent updates of
 * one row cannot both see `used_at is null`.
 *
 * `failures[op]` makes calls fail: `true` fails every call, a number fails that many calls and
 * then stops. `failures.updateResponse` is the nastier case: the update COMMITS and then its
 * response is lost, as when the connection drops after Postgres has applied it.
 */
import { vi } from 'vitest'

export type CodeRow = {
  id: string
  user_id: string
  factor_id: string
  code_hash: string
  used_at: string | null
  created_at: string
}

export type FakeFactor = { id: string; factor_type: string; status: 'verified' | 'unverified' }

type Filter = { column: keyof CodeRow; value: unknown; op: 'eq' | 'is' | 'in' }
type FailureKey = 'delete' | 'insert' | 'update' | 'updateResponse' | 'select' | 'rpc' | 'deleteFactor'
type Failures = Partial<Record<FailureKey, boolean | number>>

let nextId = 0

export function createRecoveryStore() {
  const rows: CodeRow[] = []
  const factors = new Map<string, FakeFactor[]>()
  const failures: Failures = {}

  /** Consumes one failure for `key`, if any is armed. */
  function fails(key: FailureKey): boolean {
    const armed = failures[key]
    if (armed === true) return true
    if (typeof armed === 'number' && armed > 0) {
      failures[key] = armed - 1
      return true
    }
    return false
  }

  function matches(row: CodeRow, filters: Filter[]) {
    return filters.every((filter) =>
      filter.op === 'in'
        ? (filter.value as unknown[]).includes(row[filter.column])
        : row[filter.column] === filter.value
    )
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
    in(column: keyof CodeRow, values: unknown[]) {
      this.filters.push({ column, value: values, op: 'in' })
      return this
    }
    select() {
      this.returning = true
      return this
    }
    private run() {
      if (fails(this.op)) return { data: null, count: null, error: { message: `${this.op} failed`, code: 'XX000' } }
      switch (this.op) {
        case 'insert': {
          for (const row of this.payload as Pick<CodeRow, 'user_id' | 'factor_id' | 'code_hash'>[]) {
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
          if (fails('updateResponse')) {
            return { data: null, error: { message: 'connection reset after commit', code: '08006' } }
          }
          return {
            data: this.returning ? changed.map((row) => ({ id: row.id, factor_id: row.factor_id })) : null,
            error: null,
          }
        }
        case 'select': {
          const found = rows.filter((row) => matches(row, this.filters))
          return { data: this.head ? null : found.map((row) => ({ ...row })), count: found.length, error: null }
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
    if (fails('deleteFactor')) {
      return { data: null, error: { name: 'AuthApiError', message: 'down', status: 500 } }
    }
    factors.set(userId, (factors.get(userId) ?? []).filter((factor) => factor.id !== id))
    return { data: { id }, error: null }
  })

  /** `replace_mfa_recovery_codes`, all or nothing, like the SQL function's one transaction. */
  const rpc = vi.fn(
    async (name: string, args: { p_user_id: string; p_factor_id: string; p_hashes: string[] }) => {
      if (name !== 'replace_mfa_recovery_codes') throw new Error(`unexpected rpc ${name}`)
      if (fails('rpc')) return { data: null, error: { message: 'rpc failed', code: 'XX000' } }
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].user_id === args.p_user_id && rows[i].used_at === null) rows.splice(i, 1)
      }
      for (const hash of args.p_hashes) {
        rows.push({
          id: `code-${++nextId}`,
          user_id: args.p_user_id,
          factor_id: args.p_factor_id,
          code_hash: hash,
          used_at: null,
          created_at: new Date().toISOString(),
        })
      }
      return { data: null, error: null }
    }
  )

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
    rpc,
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

  /**
   * A cookie-session client for `userId`, at `currentLevel` (`aal1` is a pending session).
   * `recoveringAt` (unix seconds) puts a `recovery` entry in the token's `amr`, as a session opened
   * from a reset link has.
   */
  function session(
    userId: string,
    options: { currentLevel?: 'aal1' | 'aal2'; email?: string; recoveringAt?: number } = {}
  ) {
    const now = Math.floor(Date.now() / 1000)
    const amr = [{ method: 'password', timestamp: now }]
    if (options.recoveringAt !== undefined) amr.push({ method: 'recovery', timestamp: options.recoveringAt })
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
        getClaims: vi.fn(async () => ({ data: { claims: { sub: userId, amr } }, error: null })),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(async () => ({
            data: { currentLevel: options.currentLevel ?? 'aal1', nextLevel: null },
            error: null,
          })),
          // Unenrolling through the session (settings' "Disable 2FA") removes the factor here too.
          unenroll: vi.fn(async ({ factorId }: { factorId: string }) => {
            factors.set(userId, (factors.get(userId) ?? []).filter((factor) => factor.id !== factorId))
            return { data: { id: factorId }, error: null }
          }),
          listFactors: vi.fn(async () => {
            const all = factors.get(userId) ?? []
            return { data: { all, totp: all.filter((factor) => factor.factor_type === 'totp') }, error: null }
          }),
        },
        signOut: vi.fn(async () => ({ error: null })),
      },
    }
  }

  return { rows, factors, failures, service, session, deleteFactor, rpc }
}
