# Voices Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Voices tab placeholder with a real voice browser (search, language/gender/age filters, favorites, in-use indicator) and a two-step "Create voice" flow (Fish Audio voice-design → save a chosen candidate as a real, selectable voice model).

**Architecture:** Extend the existing `searchVoices` server action to parse gender/age from Fish Audio's tags. Add a `favorite_voices` table + toggle action for per-org favorites. Add `designVoiceCandidates`/`saveVoiceModel` actions implementing Fish Audio's stateless voice-design → multipart create-model pipeline. Extract the shared orb/preview button out of `VoicePicker` into its own component so the new tab and the existing General-tab picker render identical avatars. Build the tab as its own client component (`VoicesTab`) to keep `agent-detail-client.tsx` from growing further.

**Tech Stack:** Next.js 16 Server Actions, Supabase (Postgres + RLS), Fish Audio REST API (`/v1/voice-design`, `/model`), Vitest, shadcn/ui `Command`/`Popover`/`Select` (`@base-ui/react` — `render={<X />}`, not `asChild`).

## Global Constraints

- Every `organization_id`-scoped query resolves the caller's org via `supabase.auth.getUser()` → `members` lookup, never a client-supplied id.
- RLS policies follow `organization_id in (select organization_id from members where user_id = auth.uid())`, one policy per operation (select/insert/delete), matching `00000000000010_business.sql`'s style — not a single `for all` policy.
- Migrations are numbered SQL files in `supabase/migrations/`; next number is `00000000000023`.
- `lucide-react` for icons; flags are emoji (already established in `voice-catalog.ts`).
- `server-only` must not leak into modules used outside a Next.js request context — not applicable here, everything stays in `'use server'` action files and client components.

---

## File Structure

- **Create** `supabase/migrations/00000000000023_favorite_voices.sql` — `favorite_voices` table + RLS.
- **Create** `components/voice/voice-orb-button.tsx` — extracted `colorTripleFor` + `VoiceOrbButton` (currently private to `voice-picker.tsx`).
- **Modify** `components/voice/voice-picker.tsx` — import the extracted orb button instead of defining it locally.
- **Modify** `app/(dashboard)/agents/[id]/actions.ts` — gender/age parsing in `searchVoices`, favorites actions, design/save-model actions.
- **Modify** `app/(dashboard)/agents/[id]/actions.test.ts` — tests for all of the above.
- **Create** `components/agents/create-voice-dialog.tsx` — design → pick candidate → save flow.
- **Create** `components/agents/create-voice-dialog.test.tsx`.
- **Create** `app/(dashboard)/agents/[id]/voices-tab.tsx` — the full tab UI.
- **Modify** `app/(dashboard)/agents/[id]/agent-detail-client.tsx` — replace the placeholder `TabsContent` with `<VoicesTab />`.

---

### Task 1: `favorite_voices` migration

**Files:**
- Create: `supabase/migrations/00000000000023_favorite_voices.sql`

No test — this is a schema migration, verified by running it locally.

- [ ] **Step 1: Write the migration**

```sql
create table favorite_voices (
  organization_id uuid not null references organizations(id) on delete cascade,
  voice_id text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, voice_id)
);

alter table favorite_voices enable row level security;

create policy "Members can view their organization's favorite voices"
  on favorite_voices for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can add their organization's favorite voices"
  on favorite_voices for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can remove their organization's favorite voices"
  on favorite_voices for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply the migration locally**

Run: `supabase db push` (or the project's equivalent local-apply command —
check `package.json` for a `db:push`/`migrate` script first and prefer that
if one exists)
Expected: migration applies with no errors; `favorite_voices` table exists

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00000000000023_favorite_voices.sql
git commit -m "feat: add favorite_voices table for per-org voice favorites"
```

---

### Task 2: Extract `VoiceOrbButton` into its own component

**Files:**
- Create: `components/voice/voice-orb-button.tsx`
- Modify: `components/voice/voice-picker.tsx`

**Interfaces:**
- Produces: `export function colorTripleFor(id: string): [string, string, string]`, `export function VoiceOrbButton(props: { id: string; playing: boolean; onToggle: () => void; className?: string }): JSX.Element`

This is a pure refactor (move code, no behavior change) — the existing
`voice-picker.test.tsx` suite is the regression check, no new test needed.

- [ ] **Step 1: Create the extracted component**

```tsx
// components/voice/voice-orb-button.tsx
'use client'

import { Play, Pause } from 'lucide-react'

export function colorTripleFor(id: string): [string, string, string] {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0
  const hue = Math.abs(hash) % 360
  return [
    `hsl(${hue}, 80%, 60%)`,
    `hsl(${(hue + 45) % 360}, 75%, 50%)`,
    `hsl(${(hue + 20) % 360}, 60%, 30%)`,
  ]
}

export function VoiceOrbButton({
  id,
  playing,
  onToggle,
  className = 'size-5',
}: {
  id: string
  playing: boolean
  onToggle: () => void
  className?: string
}) {
  const [c1, c2, c3] = colorTripleFor(id)
  return (
    <button
      type="button"
      aria-label={playing ? 'Pause preview' : 'Play preview'}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className={`group relative shrink-0 overflow-hidden rounded-full ${className}`}
      style={{
        background: `radial-gradient(circle at 30% 30%, ${c1}, ${c2} 55%, ${c3} 100%)`,
      }}
    >
      <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/20 group-hover:opacity-100">
        {playing ? (
          <Pause className="size-2.5 fill-white text-white" />
        ) : (
          <Play className="size-2.5 fill-white text-white" />
        )}
      </span>
      {playing && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Pause className="size-2.5 fill-white text-white" />
        </span>
      )}
    </button>
  )
}
```

- [ ] **Step 2: Update `voice-picker.tsx` to import it**

Remove the local `colorTripleFor`/`VoiceOrbButton` definitions from
`components/voice/voice-picker.tsx` (lines defining them near the top of
the file) and replace with:

```ts
import { colorTripleFor, VoiceOrbButton } from './voice-orb-button'
```

The two call sites (`<VoiceOrbButton id={voice.id} playing={...} onToggle={...} />`
in the row, and `colorTripleFor(selected.id)` for the trigger avatar) stay
exactly as they are — only the definitions move.

- [ ] **Step 3: Run the existing test suite to confirm no regression**

Run: `pnpm exec vitest run components/voice/voice-picker.test.tsx`
Expected: PASS (all 4 existing tests, unchanged)

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit -p .`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add components/voice/voice-orb-button.tsx components/voice/voice-picker.tsx
git commit -m "refactor: extract VoiceOrbButton for reuse in the Voices tab"
```

---

### Task 3: Gender/age parsing in `searchVoices`

**Files:**
- Modify: `app/(dashboard)/agents/[id]/actions.ts`
- Modify: `app/(dashboard)/agents/[id]/actions.test.ts`

**Interfaces:**
- Produces: `type VoiceSearchResult = VoiceCatalogEntry & { description?: string; gender?: 'male' | 'female'; age?: 'young' | 'middle-aged' | 'old' }`, updated `searchVoices(query: string, language?: string): Promise<VoiceSearchResult[]>`

- [ ] **Step 1: Write the failing tests**

Add to `app/(dashboard)/agents/[id]/actions.test.ts`, inside the existing
`describe('searchVoices', ...)` block:

```ts
it('parses gender and age from tags', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      items: [
        {
          id: 'v1',
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
          id: 'v2',
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run "app/(dashboard)/agents/[id]/actions.test.ts" -t "parses gender and age"`
Expected: FAIL — `result[0].gender` is `undefined` when a match should exist (first test)

- [ ] **Step 3: Implement the parsing**

In `app/(dashboard)/agents/[id]/actions.ts`, update the `FishAudioModelResult`
type and `searchVoices` mapping:

```ts
type FishAudioModelResult = {
  id: string
  title: string
  description?: string
  languages?: string[]
  samples?: Array<{ audio?: string }>
  tags?: string[]
}

export type VoiceSearchResult = VoiceCatalogEntry & {
  description?: string
  gender?: 'male' | 'female'
  age?: 'young' | 'middle-aged' | 'old'
}

const GENDER_TAGS = ['male', 'female'] as const
const AGE_TAGS = ['young', 'middle-aged', 'old'] as const

export async function searchVoices(
  query: string,
  language?: string
): Promise<VoiceSearchResult[]> {
  const params = new URLSearchParams({ title: query, page_size: '20' })
  const response = await fetch(`https://api.fish.audio/model?${params}`, {
    headers: { Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}` },
  })

  if (!response.ok) return []

  const data = (await response.json()) as { items?: FishAudioModelResult[] }
  const items = data.items ?? []

  const mapped = items.map((item) => {
    const tags = item.tags ?? []
    const gender = GENDER_TAGS.find((g) => tags.includes(g))
    const age = AGE_TAGS.find((a) => tags.includes(a))

    return {
      id: item.id,
      label: item.title,
      language: item.languages?.[0] ?? 'en',
      previewUrl: item.samples?.[0]?.audio ?? '',
      description: item.description,
      gender,
      age,
    }
  })

  return language ? mapped.filter((voice) => voice.language === language) : mapped
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run "app/(dashboard)/agents/[id]/actions.test.ts"`
Expected: PASS (all tests in the file, including the two new ones and the
three pre-existing `searchVoices` tests — check the pre-existing "maps
results to the catalog shape" test's exact-equality assertion still passes
now that `description`/`gender`/`age` are added to every returned object;
if it now fails because it expects an exact object without those keys,
update that pre-existing test's expected value to include
`description: undefined, gender: undefined, age: undefined` rather than
loosening the new code)

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit -p .`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/agents/[id]/actions.ts" "app/(dashboard)/agents/[id]/actions.test.ts"
git commit -m "feat: parse gender and age from Fish Audio voice tags"
```

---

### Task 4: Favorites actions

**Files:**
- Modify: `app/(dashboard)/agents/[id]/actions.ts`
- Modify: `app/(dashboard)/agents/[id]/actions.test.ts`

**Interfaces:**
- Consumes: `getOrgId`-style pattern already used by `updateBusinessProfile` in `app/(dashboard)/business/actions.ts` (org resolution via `auth.getUser()` → `members` lookup) — replicate inline here rather than importing across route boundaries, matching how `updateAgentGeneral` already does its own inline org lookup in this same file.
- Produces: `export async function getFavoriteVoiceIds(): Promise<string[]>`, `export async function toggleFavoriteVoice(voiceId: string): Promise<{ error: string } | { favorited: boolean }>`

- [ ] **Step 1: Write the failing tests**

Add to `app/(dashboard)/agents/[id]/actions.test.ts`. This file's existing
`mockSupabase` helper (used by `updateAgentGeneral` tests) only stubs the
`agents`/`members` tables — extend the mock inline for these tests since
favorites hit a different table shape (select + insert + delete, no update):

```ts
import { getFavoriteVoiceIds, toggleFavoriteVoice } from './actions'

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
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: memberSingle }) }) }
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
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: memberSingle }) }) }
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
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: memberSingle }) }) }
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run "app/(dashboard)/agents/[id]/actions.test.ts" -t "FavoriteVoice"`
Expected: FAIL — `getFavoriteVoiceIds`/`toggleFavoriteVoice` not exported

- [ ] **Step 3: Implement the actions**

Add to `app/(dashboard)/agents/[id]/actions.ts` (near the other exports):

```ts
export async function getFavoriteVoiceIds(): Promise<string[]> {
  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()
  if (!member) return []

  const { data } = await supabase
    .from('favorite_voices')
    .select('voice_id')
    .eq('organization_id', member.organization_id)

  return (data ?? []).map((row) => row.voice_id as string)
}

export async function toggleFavoriteVoice(
  voiceId: string
): Promise<{ error: string } | { favorited: boolean }> {
  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'You must be signed in to do this.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()
  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const { data: existing } = await supabase
    .from('favorite_voices')
    .select('voice_id')
    .eq('organization_id', member.organization_id)
    .eq('voice_id', voiceId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('favorite_voices')
      .delete()
      .eq('organization_id', member.organization_id)
      .eq('voice_id', voiceId)
    if (error) return { error: 'Could not update favorite.' }
    return { favorited: false }
  }

  const { error } = await supabase
    .from('favorite_voices')
    .insert({ organization_id: member.organization_id, voice_id: voiceId })
  if (error) return { error: 'Could not update favorite.' }
  return { favorited: true }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run "app/(dashboard)/agents/[id]/actions.test.ts"`
Expected: PASS (full file)

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit -p .`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/agents/[id]/actions.ts" "app/(dashboard)/agents/[id]/actions.test.ts"
git commit -m "feat: add favorite voice toggle and lookup actions"
```

---

### Task 5: Voice design + save-as-model actions

**Files:**
- Modify: `app/(dashboard)/agents/[id]/actions.ts`
- Modify: `app/(dashboard)/agents/[id]/actions.test.ts`

**Interfaces:**
- Produces: `export async function designVoiceCandidates(instruction: string, language: string): Promise<{ error: string } | { candidates: { audioBase64: string }[] }>`, `export async function saveVoiceModel(audioBase64: string, title: string): Promise<{ error: string } | { id: string }>`

- [ ] **Step 1: Write the failing tests**

Add to `app/(dashboard)/agents/[id]/actions.test.ts`:

```ts
import { designVoiceCandidates, saveVoiceModel } from './actions'

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

    const result = await saveVoiceModel('AAAA', 'My Custom Voice')

    expect(result).toEqual({ id: 'new-voice-id' })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://api.fish.audio/model')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeInstanceOf(FormData)
  })

  it('returns an error on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response)
    const result = await saveVoiceModel('AAAA', 'My Custom Voice')
    expect(result).toEqual({ error: 'Could not save the new voice. Please try again.' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run "app/(dashboard)/agents/[id]/actions.test.ts" -t "designVoiceCandidates"`
Expected: FAIL — not exported

- [ ] **Step 3: Implement the actions**

Add to `app/(dashboard)/agents/[id]/actions.ts`:

```ts
export async function designVoiceCandidates(
  instruction: string,
  language: string
): Promise<{ error: string } | { candidates: { audioBase64: string }[] }> {
  if (!instruction.trim()) {
    return { error: 'Describe the voice you want to create.' }
  }

  const response = await fetch('https://api.fish.audio/v1/voice-design', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}`,
      'Content-Type': 'application/json',
      model: 'voice-design-1',
    },
    body: JSON.stringify({ instruction, language, n: 4 }),
  })

  if (!response.ok) {
    return { error: 'Could not generate voice candidates. Please try again.' }
  }

  const data = (await response.json()) as { candidates?: Array<{ audio_base64?: string }> }
  const candidates = (data.candidates ?? [])
    .filter((c): c is { audio_base64: string } => typeof c.audio_base64 === 'string')
    .map((c) => ({ audioBase64: c.audio_base64 }))

  return { candidates }
}

export async function saveVoiceModel(
  audioBase64: string,
  title: string
): Promise<{ error: string } | { id: string }> {
  const audioBuffer = Buffer.from(audioBase64, 'base64')
  const form = new FormData()
  form.append('voices', new Blob([new Uint8Array(audioBuffer)], { type: 'audio/mpeg' }), 'voice.mp3')
  form.append('title', title)
  form.append('type', 'tts')
  form.append('train_mode', 'fast')
  form.append('visibility', 'private')

  const response = await fetch('https://api.fish.audio/model', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}` },
    body: form,
  })

  if (!response.ok) {
    return { error: 'Could not save the new voice. Please try again.' }
  }

  const data = (await response.json()) as { id?: string }
  if (!data.id) {
    return { error: 'Could not save the new voice. Please try again.' }
  }

  return { id: data.id }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run "app/(dashboard)/agents/[id]/actions.test.ts"`
Expected: PASS (full file)

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit -p .`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/agents/[id]/actions.ts" "app/(dashboard)/agents/[id]/actions.test.ts"
git commit -m "feat: add Fish Audio voice-design and save-as-model actions"
```

---

### Task 6: `CreateVoiceDialog` component

**Files:**
- Create: `components/agents/create-voice-dialog.tsx`
- Create: `components/agents/create-voice-dialog.test.tsx`

**Interfaces:**
- Consumes: `designVoiceCandidates`, `saveVoiceModel` from `app/(dashboard)/agents/[id]/actions.ts` (Task 5); `VoiceOrbButton` from `components/voice/voice-orb-button.tsx` (Task 2); `languageOptions` from `lib/data/voice-catalog.ts`
- Produces: `export function CreateVoiceDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; onVoiceCreated: (voice: { id: string; label: string; language: string; previewUrl: string }) => void }): JSX.Element`

- [ ] **Step 1: Write the failing test**

```tsx
// components/agents/create-voice-dialog.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateVoiceDialog } from './create-voice-dialog'

vi.mock('@/app/(dashboard)/agents/[id]/actions', () => ({
  designVoiceCandidates: vi.fn(),
  saveVoiceModel: vi.fn(),
}))

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
window.HTMLElement.prototype.scrollIntoView = () => {}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CreateVoiceDialog', () => {
  it('generates candidates and lets the user save one', async () => {
    const { designVoiceCandidates, saveVoiceModel } = await import(
      '@/app/(dashboard)/agents/[id]/actions'
    )
    vi.mocked(designVoiceCandidates).mockResolvedValue({
      candidates: [{ audioBase64: 'AAAA' }, { audioBase64: 'BBBB' }],
    })
    vi.mocked(saveVoiceModel).mockResolvedValue({ id: 'new-voice-id' })

    const onVoiceCreated = vi.fn()
    render(
      <CreateVoiceDialog open={true} onOpenChange={vi.fn()} onVoiceCreated={onVoiceCreated} />
    )

    fireEvent.change(screen.getByPlaceholderText(/describe the voice/i), {
      target: { value: 'A warm narrator' },
    })
    fireEvent.click(screen.getByRole('button', { name: /generate/i }))

    await waitFor(() => expect(designVoiceCandidates).toHaveBeenCalledWith('A warm narrator', 'en'))

    const useButtons = await screen.findAllByRole('button', { name: /use this voice/i })
    fireEvent.click(useButtons[0])

    fireEvent.change(screen.getByPlaceholderText(/name this voice/i), {
      target: { value: 'My Custom Voice' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() =>
      expect(saveVoiceModel).toHaveBeenCalledWith('AAAA', 'My Custom Voice')
    )
    expect(onVoiceCreated).toHaveBeenCalledWith({
      id: 'new-voice-id',
      label: 'My Custom Voice',
      language: 'en',
      previewUrl: '',
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run components/agents/create-voice-dialog.test.tsx`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement the component**

```tsx
// components/agents/create-voice-dialog.tsx
'use client'

import { useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { VoiceOrbButton } from '@/components/voice/voice-orb-button'
import { languageOptions } from '@/lib/data/voice-catalog'
import {
  designVoiceCandidates,
  saveVoiceModel,
} from '@/app/(dashboard)/agents/[id]/actions'

type Candidate = { audioBase64: string; id: string }
type CreatedVoice = { id: string; label: string; language: string; previewUrl: string }

export function CreateVoiceDialog({
  open,
  onOpenChange,
  onVoiceCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onVoiceCreated: (voice: CreatedVoice) => void
}) {
  const [instruction, setInstruction] = useState('')
  const [language, setLanguage] = useState('en')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [savingCandidateId, setSavingCandidateId] = useState<string | null>(null)
  const [nameForCandidateId, setNameForCandidateId] = useState<string | null>(null)
  const [voiceName, setVoiceName] = useState('')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  function reset() {
    setInstruction('')
    setCandidates([])
    setError(null)
    setNameForCandidateId(null)
    setVoiceName('')
  }

  async function handleGenerate() {
    setError(null)
    setGenerating(true)
    const result = await designVoiceCandidates(instruction, language)
    setGenerating(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setCandidates(result.candidates.map((c, i) => ({ ...c, id: `candidate-${i}` })))
  }

  function togglePreview(candidate: Candidate) {
    if (!audioRef.current) audioRef.current = new Audio()
    const audio = audioRef.current
    if (playingId === candidate.id) {
      audio.pause()
      setPlayingId(null)
      return
    }
    audio.pause()
    audio.src = `data:audio/mpeg;base64,${candidate.audioBase64}`
    void audio.play()
    setPlayingId(candidate.id)
    audio.onended = () => setPlayingId(null)
  }

  async function handleSave(candidate: Candidate) {
    if (!voiceName.trim()) return
    setSavingCandidateId(candidate.id)
    setError(null)
    const result = await saveVoiceModel(candidate.audioBase64, voiceName.trim())
    setSavingCandidateId(null)
    if ('error' in result) {
      setError(result.error)
      return
    }
    onVoiceCreated({ id: result.id, label: voiceName.trim(), language, previewUrl: '' })
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a voice</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Describe the voice you want..."
            rows={3}
          />
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a language" />
            </SelectTrigger>
            <SelectContent>
              {languageOptions.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.flag} {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={!instruction.trim() || generating}
          >
            {generating ? 'Generating...' : 'Generate'}
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {candidates.length > 0 && (
            <div className="space-y-2">
              {candidates.map((candidate) => (
                <div key={candidate.id} className="flex items-center gap-3 rounded-lg border p-2">
                  <VoiceOrbButton
                    id={candidate.id}
                    playing={playingId === candidate.id}
                    onToggle={() => togglePreview(candidate)}
                  />
                  {nameForCandidateId === candidate.id ? (
                    <>
                      <Input
                        value={voiceName}
                        onChange={(e) => setVoiceName(e.target.value)}
                        placeholder="Name this voice"
                        className="flex-1"
                        autoFocus
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={!voiceName.trim() || savingCandidateId === candidate.id}
                        onClick={() => handleSave(candidate)}
                      >
                        {savingCandidateId === candidate.id ? 'Saving...' : 'Save'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setNameForCandidateId(candidate.id)}
                    >
                      Use this voice
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

If `components/ui/dialog.tsx` exports differ from `Dialog`/`DialogContent`/
`DialogHeader`/`DialogTitle` (check the file — `command.tsx` already
imports from it, so it exists), adjust the import names to match; the
composition pattern (`render={<X />}` vs children) should mirror how
`command.tsx`'s `CommandDialog` already uses this same `Dialog` component.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run components/agents/create-voice-dialog.test.tsx`
Expected: PASS

If the rendered DOM doesn't match a query (e.g. `Select`'s trigger role,
button text casing), inspect with `screen.debug()` and adjust the test
query to match reality — don't change the component to fit an assumed
query that isn't actually there.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit -p .`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add components/agents/create-voice-dialog.tsx components/agents/create-voice-dialog.test.tsx
git commit -m "feat: add CreateVoiceDialog for designing and saving new voices"
```

---

### Task 7: `VoicesTab` component

**Files:**
- Create: `app/(dashboard)/agents/[id]/voices-tab.tsx`
- Modify: `app/(dashboard)/agents/[id]/agent-detail-client.tsx`

**Interfaces:**
- Consumes: `searchVoices` (returns `VoiceSearchResult[]`, Task 3), `getFavoriteVoiceIds`/`toggleFavoriteVoice` (Task 4), `updateAgentGeneral` (existing), `VoiceOrbButton` (Task 2), `CreateVoiceDialog` (Task 6), `voiceCatalog`/`languageOptions` from `lib/data/voice-catalog.ts`, `Agent`/`AgentDetail` types from `lib/data/agents.ts`
- Produces: `export function VoicesTab(props: { agent: AgentDetail; agents: Agent[] }): JSX.Element`

No new automated test for this task — it composes already-tested pieces
(`searchVoices`, favorites actions, `VoiceOrbButton`, `CreateVoiceDialog`)
into a page layout; verify manually per Step 3, consistent with how the
General-tab wiring task in the earlier voice-picker plan was handled.

- [ ] **Step 1: Implement the component**

```tsx
// app/(dashboard)/agents/[id]/voices-tab.tsx
'use client'

import { useEffect, useState } from 'react'
import { Star, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { VoiceOrbButton } from '@/components/voice/voice-orb-button'
import { CreateVoiceDialog } from '@/components/agents/create-voice-dialog'
import {
  voiceCatalog,
  languageOptions,
  type VoiceCatalogEntry,
} from '@/lib/data/voice-catalog'
import {
  searchVoices,
  getFavoriteVoiceIds,
  toggleFavoriteVoice,
  updateAgentGeneral,
  type VoiceSearchResult,
} from './actions'
import type { AgentDetail, Agent } from '@/lib/data/agents'

const GENDER_OPTIONS = ['male', 'female'] as const
const AGE_OPTIONS = ['young', 'middle-aged', 'old'] as const

export function VoicesTab({ agent, agents }: { agent: AgentDetail; agents: Agent[] }) {
  const [selectedAgentId, setSelectedAgentId] = useState(agent.id)
  const [currentVoiceId, setCurrentVoiceId] = useState(agent.voice_id ?? '')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VoiceSearchResult[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [languageFilter, setLanguageFilter] = useState<string | null>(null)
  const [genderFilter, setGenderFilter] = useState<string | null>(null)
  const [ageFilter, setAgeFilter] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null)

  useEffect(() => {
    void getFavoriteVoiceIds().then(setFavorites)
  }, [])

  useEffect(() => {
    if (!query) {
      setResults([])
      return
    }
    const timeout = setTimeout(() => {
      void searchVoices(query, languageFilter ?? undefined).then(setResults)
    }, 300)
    return () => clearTimeout(timeout)
  }, [query, languageFilter])

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? agent

  const baseList: VoiceSearchResult[] = query ? results : voiceCatalog
  const filtered = baseList.filter((voice) => {
    if (languageFilter && voice.language !== languageFilter) return false
    if (genderFilter && 'gender' in voice && voice.gender !== genderFilter) return false
    if (ageFilter && 'age' in voice && voice.age !== ageFilter) return false
    return true
  })

  const currentVoice = voiceCatalog.find((v) => v.id === currentVoiceId)

  function togglePreview(voice: VoiceCatalogEntry) {
    const audio = audioEl ?? new Audio()
    if (!audioEl) setAudioEl(audio)
    if (playingId === voice.id) {
      audio.pause()
      setPlayingId(null)
      return
    }
    audio.pause()
    audio.src = voice.previewUrl
    void audio.play()
    setPlayingId(voice.id)
    audio.onended = () => setPlayingId(null)
  }

  async function handleSelectVoice(voiceId: string) {
    setCurrentVoiceId(voiceId)
    await updateAgentGeneral(selectedAgentId, { voiceId })
  }

  async function handleToggleFavorite(voiceId: string) {
    const result = await toggleFavoriteVoice(voiceId)
    if ('favorited' in result) {
      setFavorites((prev) =>
        result.favorited ? [...prev, voiceId] : prev.filter((id) => id !== voiceId)
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.business_name ?? a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus />
          Create voice
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Pick how your receptionist sounds. Preview, favorite, and switch anytime.
      </p>

      <div className="flex items-center justify-between gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search library voices..."
          className="max-w-sm"
        />
        {currentVoice && (
          <p className="shrink-0 text-sm text-muted-foreground">
            Currently using <span className="font-medium text-foreground">{currentVoice.label}</span>
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={languageFilter ?? '__all'} onValueChange={(v) => setLanguageFilter(v === '__all' ? null : v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All languages</SelectItem>
            {languageOptions.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                {lang.flag} {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={genderFilter ?? '__all'} onValueChange={(v) => setGenderFilter(v === '__all' ? null : v)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Any gender</SelectItem>
            {GENDER_OPTIONS.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ageFilter ?? '__all'} onValueChange={(v) => setAgeFilter(v === '__all' ? null : v)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Age" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Any age</SelectItem>
            {AGE_OPTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">
          {query ? 'Search results' : 'Recommended'} <span className="tabular-nums">{filtered.length}</span>
        </p>
        {filtered.map((voice) => {
          const isFavorite = favorites.includes(voice.id)
          const isInUse = voice.id === currentVoiceId
          const langLabel = languageOptions.find((l) => l.code === voice.language)
          return (
            <button
              key={voice.id}
              type="button"
              onClick={() => handleSelectVoice(voice.id)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted"
            >
              <VoiceOrbButton
                id={voice.id}
                playing={playingId === voice.id}
                onToggle={() => togglePreview(voice)}
                className="size-8"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{voice.label}</p>
                {'description' in voice && voice.description && (
                  <p className="truncate text-xs text-muted-foreground">{voice.description}</p>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {langLabel?.flag} {langLabel?.label ?? voice.language}
              </span>
              {'gender' in voice && voice.gender && (
                <span className="shrink-0 text-xs capitalize text-muted-foreground">{voice.gender}</span>
              )}
              {'age' in voice && voice.age && (
                <span className="shrink-0 text-xs capitalize text-muted-foreground">{voice.age}</span>
              )}
              {isInUse && <Badge variant="outline">In use</Badge>}
              <Star
                className={`size-4 shrink-0 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`}
                onClick={(e) => {
                  e.stopPropagation()
                  void handleToggleFavorite(voice.id)
                }}
              />
            </button>
          )
        })}
      </div>

      <CreateVoiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onVoiceCreated={(voice) => {
          setCurrentVoiceId(voice.id)
          void updateAgentGeneral(selectedAgentId, { voiceId: voice.id })
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Wire it into `agent-detail-client.tsx`**

Replace the placeholder `TabsContent` (the block starting `{/* Voices tab */}`
that renders the `Card` with `Speaker` icon and "Voice library coming soon")
with:

```tsx
{/* Voices tab */}
<TabsContent value="voices" className="pt-6">
  <VoicesTab agent={agent} agents={agents} />
</TabsContent>
```

Add the import near the other local imports:

```ts
import { VoicesTab } from './voices-tab'
```

The `Speaker` icon import in `agent-detail-client.tsx` may now be unused —
check with a search for other `Speaker` usages in that file; if unused,
remove it from the `lucide-react` import list (unused imports fail the
project's lint/typecheck conventions elsewhere in this codebase).

- [ ] **Step 3: Manual verification**

Run: `pnpm dev`, navigate to a receptionist's Voices tab. Confirm:
- Recommended list renders with orb avatars, language flag, gender/age
  (for entries where the curated catalog has them — note: `voiceCatalog`
  entries don't carry `description`/`gender`/`age` since they're
  hand-curated, not from live search; only live search results will show
  those fields. Verify this doesn't crash — it shouldn't, since the JSX
  guards each field with `'gender' in voice`).
- Search a query, results replace the Recommended list, gender/age/
  description show up now.
- Language/Gender/Age filters narrow the list.
- Clicking a row (not the star or orb) sets it as in-use, "In use" badge
  moves, persists after reload.
- Clicking the star toggles favorite, persists after reload.
- Clicking the orb plays/pauses preview audio.
- "Create voice" opens the dialog, generate → candidates appear → "Use
  this voice" → name it → Save → dialog closes, new voice is now in-use
  and visible somewhere accessible (it won't appear in the Recommended
  list since that's the static catalog — confirm it at least becomes the
  "Currently using" voice; note this as a known gap, not a blocker, since
  the spec didn't require newly-created voices to join the curated
  shortlist).

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit -p .`
Expected: no errors

- [ ] **Step 5: Run the full test suite**

Run: `pnpm exec vitest run`
Expected: PASS (all files, no regressions)

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/agents/[id]/voices-tab.tsx" "app/(dashboard)/agents/[id]/agent-detail-client.tsx"
git commit -m "feat: build the Voices tab (search, filters, favorites, create voice)"
```
