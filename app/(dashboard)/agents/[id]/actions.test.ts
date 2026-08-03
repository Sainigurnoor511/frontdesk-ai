import { describe, it, expect, vi } from 'vitest'

const mockGroqCreate = vi.fn()

vi.mock('groq-sdk', () => {
  class MockGroq {
    chat = {
      completions: {
        create: mockGroqCreate,
      },
    }
  }
  return { default: MockGroq }
})

import {
  updateAgentGeneral,
  updateAgentCallSettings,
  searchVoices,
  generateAdditionalInstructions,
  getFavoriteVoiceIds,
  toggleFavoriteVoice,
  designVoiceCandidates,
  saveVoiceModel,
} from './actions'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

const AGENT_ID = '11111111-1111-1111-1111-111111111111'

function mockSupabase({
  user = { id: 'user-1' } as { id: string } | null,
  organizationId = 'org-1',
  updateError = null as { message: string } | null,
} = {}) {
  const updateEq2 = vi.fn().mockResolvedValue({ error: updateError })
  const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 })
  const update = vi.fn().mockReturnValue({ eq: updateEq1 })

  const memberSingle = vi.fn().mockResolvedValue({
    data: user ? { organization_id: organizationId } : null,
  })
  const memberEq = vi.fn().mockReturnValue({ single: memberSingle })
  const memberSelect = vi.fn().mockReturnValue({ eq: memberEq })

  const from = vi.fn((table: string) => {
    if (table === 'members') {
      return { select: memberSelect }
    }
    if (table === 'agents') {
      return { update }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from,
    __mocks: { update, updateEq1, updateEq2 },
  }
}

describe('updateAgentGeneral', () => {
  it('returns a validation error when additional instructions exceed the max length', async () => {
    const result = await updateAgentGeneral(AGENT_ID, {
      additionalInstructions: 'a'.repeat(8001),
    })
    expect('error' in result && result.error).toBeTruthy()
  })

  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(mockSupabase({ user: null }) as never)

    const result = await updateAgentGeneral(AGENT_ID, {
      voiceId: 'default-neutral',
    })
    expect(result).toEqual({ error: 'You must be signed in to update this receptionist.' })
  })

  it('scopes the update to the caller organization on success', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await updateAgentGeneral(AGENT_ID, {
      voiceId: 'warm-friendly',
      defaultLanguage: 'English',
      additionalInstructions: 'Be nice',
      toneTraits: ['Friendly', 'Warm'],
      firstMessage: 'Hello!',
    })

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        voice_id: 'warm-friendly',
        language: 'English',
        additional_instructions: 'Be nice',
        tone_traits: ['Friendly', 'Warm'],
        first_message: 'Hello!',
      })
    )
    expect(supabase.__mocks.updateEq1).toHaveBeenCalledWith('id', AGENT_ID)
    expect(supabase.__mocks.updateEq2).toHaveBeenCalledWith('organization_id', 'org-42')
  })

  it("cannot update another organization's agent (org-scoped where clause)", async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-1' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    await updateAgentGeneral(AGENT_ID, { voiceId: 'default-neutral' })

    // The update is always scoped by both the target agent id and the caller's
    // organization_id, so Supabase RLS/filtering prevents cross-org writes.
    expect(supabase.__mocks.updateEq1).toHaveBeenCalledWith('id', AGENT_ID)
    expect(supabase.__mocks.updateEq2).toHaveBeenCalledWith('organization_id', 'org-1')
  })
})

describe('updateAgentCallSettings', () => {
  it('returns a validation error for an invalid phone number', async () => {
    const result = await updateAgentCallSettings(AGENT_ID, {
      answeringMode: 'staff_first',
      staffPhoneNumber: 'not-a-phone',
      maxRingSeconds: 20,
    })
    expect(result).toEqual({ error: 'Enter a valid phone number' })
  })

  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(mockSupabase({ user: null }) as never)

    const result = await updateAgentCallSettings(AGENT_ID, {
      answeringMode: 'staff_first',
      staffPhoneNumber: '+14155551234',
      maxRingSeconds: 20,
    })
    expect(result).toEqual({ error: 'You must be signed in to update this receptionist.' })
  })

  it('scopes the update to the caller organization on success', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await updateAgentCallSettings(AGENT_ID, {
      answeringMode: 'agent_first',
      staffPhoneNumber: '+14155551234',
      maxRingSeconds: 30,
      holdMusic: 'jazz',
    })

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        answering_mode: 'agent_first',
        staff_phone_number: '+14155551234',
        max_ring_seconds: 30,
        hold_music: 'jazz',
      })
    )
    expect(supabase.__mocks.updateEq1).toHaveBeenCalledWith('id', AGENT_ID)
    expect(supabase.__mocks.updateEq2).toHaveBeenCalledWith('organization_id', 'org-42')
  })
})

describe('searchVoices', () => {
  it('queries Fish Audio and maps results to the catalog shape', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            _id: 'abc123',
            title: 'Test Voice',
            languages: ['en'],
            samples: [{ audio: 'https://example.com/sample.mp3' }],
          },
        ],
      }),
    } as unknown as Response)

    const result = await searchVoices('test')

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('title=test'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: expect.stringContaining('Bearer') }),
      })
    )
    expect(result).toEqual([
      { id: 'abc123', label: 'Test Voice', language: 'en', previewUrl: 'https://example.com/sample.mp3' },
    ])
  })

  it('filters results by language client-side', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { _id: '1', title: 'A', languages: ['en'], samples: [{ audio: 'a.mp3' }] },
          { _id: '2', title: 'B', languages: ['hi'], samples: [{ audio: 'b.mp3' }] },
        ],
      }),
    } as unknown as Response)

    const result = await searchVoices('', 'hi')

    expect(result).toEqual([{ id: '2', label: 'B', language: 'hi', previewUrl: 'b.mp3' }])
  })

  it('returns an empty list on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response)
    await expect(searchVoices('test')).resolves.toEqual([])
  })

  it('parses gender and age from tags', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            _id: 'v1',
            title: 'Test Voice',
            description: 'A warm narrator',
            languages: ['en'],
            samples: [{ audio: 'a.mp3' }],
            tags: ['male', 'middle-aged', 'narration', 'warm'],
          },
        ],
      }),
    } as unknown as Response)

    const result = await searchVoices('test')

    expect(result[0]).toMatchObject({
      id: 'v1',
      description: 'A warm narrator',
      gender: 'male',
      age: 'middle-aged',
    })
  })

  it('omits gender/age when tags do not contain them', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            _id: 'v2',
            title: 'Untagged Voice',
            languages: ['en'],
            samples: [{ audio: 'b.mp3' }],
            tags: ['storytelling', 'clear'],
          },
        ],
      }),
    } as unknown as Response)

    const result = await searchVoices('test')

    expect(result[0].gender).toBeUndefined()
    expect(result[0].age).toBeUndefined()
  })
})

describe('generateAdditionalInstructions', () => {
  it('returns an error for an empty prompt', async () => {
    const result = await generateAdditionalInstructions('   ', {})
    expect(result).toEqual({
      error: 'Describe the type of agent you would like to configure.',
    })
  })

  it('returns the generated text from Groq', async () => {
    mockGroqCreate.mockResolvedValue({
      choices: [{ message: { content: 'Always mention free parking.' } }],
    })

    const result = await generateAdditionalInstructions('A friendly dental receptionist', {
      businessName: 'Acme Dental',
      industry: 'Dental',
    })

    expect(result).toEqual({ text: 'Always mention free parking.' })
    expect(mockGroqCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('Acme Dental — Dental'),
          }),
        ]),
      })
    )
  })

  it('truncates output to 8000 characters', async () => {
    mockGroqCreate.mockResolvedValue({
      choices: [{ message: { content: 'a'.repeat(9000) } }],
    })

    const result = await generateAdditionalInstructions('test', {})

    expect('text' in result && result.text.length).toBe(8000)
  })

  it('returns an error when Groq returns no content', async () => {
    mockGroqCreate.mockResolvedValue({ choices: [{ message: { content: '' } }] })

    const result = await generateAdditionalInstructions('test', {})

    expect(result).toEqual({ error: 'Could not generate instructions. Please try again.' })
  })
})

describe('getFavoriteVoiceIds', () => {
  it('returns an empty array when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never)

    await expect(getFavoriteVoiceIds()).resolves.toEqual([])
  })

  it('returns the caller organization favorite voice ids', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const selectFavorites = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: [{ voice_id: 'v1' }, { voice_id: 'v2' }] }),
    })
    const memberSingle = vi.fn().mockResolvedValue({ data: { organization_id: 'org-1' } })
    const from = vi.fn((table: string) => {
      if (table === 'members') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: memberSingle }) }),
        }
      }
      if (table === 'favorite_voices') {
        return { select: selectFavorites }
      }
      throw new Error(`Unexpected table: ${table}`)
    })
    vi.mocked(createSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
    } as never)

    await expect(getFavoriteVoiceIds()).resolves.toEqual(['v1', 'v2'])
  })
})

describe('toggleFavoriteVoice', () => {
  it('inserts a favorite when not already favorited', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const maybeSingle = vi.fn().mockResolvedValue({ data: null })
    const insert = vi.fn().mockResolvedValue({ error: null })
    const memberSingle = vi.fn().mockResolvedValue({ data: { organization_id: 'org-1' } })
    const from = vi.fn((table: string) => {
      if (table === 'members') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: memberSingle }) }),
        }
      }
      if (table === 'favorite_voices') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
          }),
          insert,
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    })
    vi.mocked(createSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
    } as never)

    const result = await toggleFavoriteVoice('v1')

    expect(result).toEqual({ favorited: true })
    expect(insert).toHaveBeenCalledWith({ organization_id: 'org-1', voice_id: 'v1' })
  })

  it('removes a favorite when already favorited', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const maybeSingle = vi.fn().mockResolvedValue({ data: { voice_id: 'v1' } })
    const deleteEq2 = vi.fn().mockResolvedValue({ error: null })
    const deleteEq1 = vi.fn().mockReturnValue({ eq: deleteEq2 })
    const del = vi.fn().mockReturnValue({ eq: deleteEq1 })
    const memberSingle = vi.fn().mockResolvedValue({ data: { organization_id: 'org-1' } })
    const from = vi.fn((table: string) => {
      if (table === 'members') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: memberSingle }) }),
        }
      }
      if (table === 'favorite_voices') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
          }),
          delete: del,
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    })
    vi.mocked(createSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
    } as never)

    const result = await toggleFavoriteVoice('v1')

    expect(result).toEqual({ favorited: false })
    expect(deleteEq1).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(deleteEq2).toHaveBeenCalledWith('voice_id', 'v1')
  })
})

describe('designVoiceCandidates', () => {
  it('returns an error for a blank instruction', async () => {
    const result = await designVoiceCandidates('   ', 'en')
    expect(result).toEqual({ error: 'Describe the voice you want to create.' })
  })

  it('calls Fish Audio voice-design and returns candidates', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ audio_base64: 'AAAA' }, { audio_base64: 'BBBB' }],
      }),
    } as unknown as Response)

    const result = await designVoiceCandidates('A warm narrator', 'en')

    expect(fetch).toHaveBeenCalledWith(
      'https://api.fish.audio/v1/voice-design',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ model: 'voice-design-1' }),
      })
    )
    expect(result).toEqual({
      candidates: [{ audioBase64: 'AAAA' }, { audioBase64: 'BBBB' }],
    })
  })

  it('returns an error on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response)
    const result = await designVoiceCandidates('A warm narrator', 'en')
    expect(result).toEqual({ error: 'Could not generate voice candidates. Please try again.' })
  })
})

describe('saveVoiceModel', () => {
  it('posts multipart form data and returns the new model id', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'new-voice-id' }),
    } as unknown as Response)

    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const insert = vi.fn().mockResolvedValue({ error: null })
    const memberSingle = vi.fn().mockResolvedValue({ data: { organization_id: 'org-1' } })
    const from = vi.fn((table: string) => {
      if (table === 'members') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: memberSingle }) }),
        }
      }
      if (table === 'custom_voices') {
        return { insert }
      }
      throw new Error(`Unexpected table: ${table}`)
    })
    vi.mocked(createSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
    } as never)

    const result = await saveVoiceModel('AAAA', 'My Custom Voice', 'en')

    expect(result).toEqual({ id: 'new-voice-id' })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://api.fish.audio/model')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeInstanceOf(FormData)
    expect(insert).toHaveBeenCalledWith({
      organization_id: 'org-1',
      voice_id: 'new-voice-id',
      name: 'My Custom Voice',
      language: 'en',
    })
  })

  it('returns an error on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response)
    const result = await saveVoiceModel('AAAA', 'My Custom Voice', 'en')
    expect(result).toEqual({ error: 'Could not save the new voice. Please try again.' })
  })
})
