// @vitest-environment node
// Node rather than the global jsdom environment: the route builds `Response` objects, which need
// Node's fetch globals.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mfaVerifyPathFromDenial } from '@/lib/auth/mfa'
import { POST } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/assistant/run-assistant', () => ({ runAssistantStream: vi.fn() }))
vi.mock('@/lib/data/assistant-chats', () => ({
  addAssistantChatMessage: vi.fn(),
  createAssistantChat: vi.fn(),
  getAssistantChatMessages: vi.fn(),
  titleFromFirstMessage: vi.fn(() => 'title'),
}))

const totpFactor = { id: 'factor-1', factor_type: 'totp', status: 'verified' }
const user = (factors: unknown[]) => ({ id: 'u1', email: 'owner@example.com', factors })

type GetUser = () => Promise<unknown>

async function mockSupabase(getUser: GetUser, aal: () => Promise<unknown> = async () => ({
  data: { currentLevel: 'aal1', nextLevel: null },
  error: null,
})) {
  const { createClient } = await import('@/lib/supabase/server')
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn(getUser), mfa: { getAuthenticatorAssuranceLevel: vi.fn(aal) } },
  } as never)
}

function assistantRequest() {
  return new Request('https://app.example.com/api/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'How many calls today?' }),
  })
}

describe('POST /api/assistant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // No provider key, so an authorized request stops at the 503 before any data access.
    vi.stubEnv('GROQ_API_KEY', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('answers a session that owes its code with the denial the panel navigates on', async () => {
    await mockSupabase(async () => ({ data: { user: user([totpFactor]) }, error: null }))

    const response = await POST(assistantRequest())
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.verifyPath).toBe('/verify')
    expect(mfaVerifyPathFromDenial(response.status, body)).toBe('/verify')
  })

  // A check that could not be made is not a pending session. Navigating a healthy aal2 session to
  // /verify on a GoTrue blip discarded the typed message and could land on a sign-out-only panel.
  it.each<[string, GetUser, (() => Promise<unknown>)?]>([
    ['getUser() throws', async () => Promise.reject(new TypeError('fetch failed'))],
    [
      'getUser() returns AuthRetryableFetchError',
      async () => ({
        data: { user: null },
        error: { name: 'AuthRetryableFetchError', status: 503, message: 'upstream' },
      }),
    ],
    ['getUser() returns a 429', async () => ({ data: { user: null }, error: { name: 'AuthApiError', status: 429, message: 'slow down' } })],
    [
      'the AAL read throws for a user with a factor',
      async () => ({ data: { user: user([totpFactor]) }, error: null }),
      async () => Promise.reject(new Error('gotrue down')),
    ],
  ])('indeterminate (%s): a plain 401 with no verifyPath', async (_label, getUser, aal) => {
    await mockSupabase(getUser, aal)

    const response = await POST(assistantRequest())
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).not.toHaveProperty('verifyPath')
    expect(mfaVerifyPathFromDenial(response.status, body)).toBeNull()
    expect(body.error).toMatch(/try again/i)
  })

  it('signed out: a plain 401 with no verifyPath', async () => {
    await mockSupabase(async () => ({
      data: { user: null },
      error: { name: 'AuthSessionMissingError', status: 400, message: 'Auth session missing!' },
    }))

    const response = await POST(assistantRequest())
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).not.toHaveProperty('verifyPath')
    expect(body.error).toMatch(/signed in/i)
  })

  it('saves nothing for any refusal', async () => {
    const { addAssistantChatMessage, createAssistantChat } = await import('@/lib/data/assistant-chats')
    await mockSupabase(async () => ({ data: { user: user([totpFactor]) }, error: null }))
    await POST(assistantRequest())
    await mockSupabase(async () => Promise.reject(new TypeError('fetch failed')))
    await POST(assistantRequest())

    expect(addAssistantChatMessage).not.toHaveBeenCalled()
    expect(createAssistantChat).not.toHaveBeenCalled()
  })

  it.each([
    ['no factor', [] as unknown[], 'aal1'],
    ['an elevated TOTP session', [totpFactor], 'aal2'],
  ])('lets a satisfied gate through (%s)', async (_label, factors, currentLevel) => {
    await mockSupabase(
      async () => ({ data: { user: user(factors) }, error: null }),
      async () => ({ data: { currentLevel, nextLevel: null }, error: null })
    )

    const response = await POST(assistantRequest())

    // Past authorization: the next refusal is the missing provider key.
    expect(response.status).toBe(503)
  })
})
