# Voice & Language Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix mid-call Fish Audio TTS voice drift by pinning a `reference_id` per call, and replace the Receptionist General tab's fake voice/language dropdowns with a real Fish Audio-backed voice picker (curated shortlist + live search + preview) and a 13-language list with flag avatars.

**Architecture:** A hardcoded `lib/data/voice-catalog.ts` (same pattern as `lib/data/integration-catalog.ts`) seeds a curated shortlist per language. A new server action (`searchVoices`) hits Fish Audio's public `GET /model` endpoint for on-demand search beyond the shortlist. A new `components/voice/voice-picker.tsx` (Command+Popover, modeled on the ElevenLabs Voice Picker pattern) replaces the plain `Select` for voice, with a shared single `<audio>` element so only one preview plays at a time. The language `Select` gets a 13-language list with emoji-flag-in-circle rows. The actual bug fix threads `agent.voice_id` through `FishAudioTTS` into the `/v1/tts` request body as `reference_id`.

**Tech Stack:** Next.js 16 App Router, TypeScript, shadcn/ui `Command`/`Popover`/`Select` (`@base-ui/react` composition — `render={<Component />}`, not `asChild`), Vitest, Fish Audio REST API.

## Global Constraints

- Every `organization_id`-scoped query resolves the caller's org via `supabase.auth.getUser()` → `members` lookup, never a client-supplied id (already done in `updateAgentGeneral` — no new org-scoped queries needed in this plan).
- Validation lives in `lib/validations/*.ts` as Zod schemas, not inline.
- `server-only` must not be imported by modules also used outside a Next.js request context — the new server action lives in the existing `'use server'` file, no change to that boundary.
- shadcn/ui composition uses `render={<Component />}`, not Radix's `asChild`.
- `lucide-react` for all app-level icons — flags are emoji, not lucide icons (lucide has no flag glyphs), used as text content inside a `rounded-full` div, not an icon import.

---

## File Structure

- **Create** `lib/data/voice-catalog.ts` — curated `VoiceCatalogEntry[]` + `LANGUAGE_OPTIONS` (13 languages with ISO code, label, flag emoji).
- **Modify** `app/(dashboard)/agents/[id]/actions.ts` — add `searchVoices` server action.
- **Create** `app/(dashboard)/agents/[id]/actions.test.ts` additions (existing file, add test cases) — covered by editing the existing test file, not a new one; see Task 2.
- **Create** `components/voice/voice-picker.tsx` — the searchable voice picker component.
- **Create** `components/voice/voice-picker.test.tsx` — component tests.
- **Modify** `app/(dashboard)/agents/[id]/agent-detail-client.tsx` — replace `VOICE_OPTIONS`/`LANGUAGE_OPTIONS` usage with the catalog + new picker + flag-avatar language rows.
- **Modify** `lib/voice/adapters/fish-audio-tts.ts` — add `reference_id` support.
- **Modify** `lib/voice/adapters/fish-audio-tts.test.ts` — add `reference_id` assertions.
- **Modify** `workers/voice-agent.ts` — pass `agentDetail.voice_id` into `FishAudioTTS`.

---

### Task 1: Voice catalog data

**Files:**
- Create: `lib/data/voice-catalog.ts`

**Interfaces:**
- Produces: `type VoiceCatalogEntry = { id: string; label: string; language: string; previewUrl: string }`, `export const voiceCatalog: VoiceCatalogEntry[]`, `type LanguageOption = { code: string; label: string; flag: string }`, `export const languageOptions: LanguageOption[]`

No test needed — this is static data, not logic (per writing-plans guidance: fold non-logic data files into the task that consumes them, but here the data is large enough and independently reviewable to stand alone as its own task with a manual content check instead of a unit test).

- [ ] **Step 1: Write the catalog file**

```ts
// lib/data/voice-catalog.ts
export type VoiceCatalogEntry = {
  id: string
  label: string
  language: string
  previewUrl: string
}

export type LanguageOption = {
  code: string
  label: string
  flag: string
}

export const languageOptions: LanguageOption[] = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', label: 'French', flag: '🇫🇷' },
  { code: 'de', label: 'German', flag: '🇩🇪' },
  { code: 'pt', label: 'Portuguese', flag: '🇵🇹' },
  { code: 'zh', label: 'Chinese', flag: '🇨🇳' },
  { code: 'ja', label: 'Japanese', flag: '🇯🇵' },
  { code: 'hi', label: 'Hindi', flag: '🇮🇳' },
  { code: 'pa', label: 'Punjabi', flag: '🇮🇳' },
  { code: 'ta', label: 'Tamil', flag: '🇮🇳' },
  { code: 'te', label: 'Telugu', flag: '🇮🇳' },
  { code: 'bn', label: 'Bengali', flag: '🇮🇳' },
  { code: 'mr', label: 'Marathi', flag: '🇮🇳' },
]

// Curated shortlist: Fish Audio public model `_id` used directly as the TTS
// `reference_id`. Picked via `GET https://api.fish.audio/model?title=<lang>`
// ranked by `like_count`/`task_count`, one-time manual curation.
export const voiceCatalog: VoiceCatalogEntry[] = [
  // English
  { id: '76b55591c758444cb95253708696dfad', label: 'Joe — Narration', language: 'en', previewUrl: 'https://platform.r2.fish.audio/task/01e73764d4e14618b6079c7f214e0239.mp3' },
  { id: 'fb8fe4a94658429d9be70efd4eec35a2', label: 'Miles — Narration', language: 'en', previewUrl: 'https://platform.r2.fish.audio/task/4bd6ece1ceec42988faea46c27603fcc.mp3' },
  // Hindi
  { id: '4d7609058bd34213b1378b29efbde1f1', label: 'Girl — Hindi', language: 'hi', previewUrl: '' },
  { id: 'b79b6174191548d08af0fb6bf0396127', label: 'Hindi Gojo Voice', language: 'hi', previewUrl: '' },
]
```

> **Implementer note:** the `en`/`hi` entries above use real `_id`s pulled during
> spec research; `previewUrl` for the two Hindi entries and all other 11
> languages must be filled in before merging by calling
> `GET https://api.fish.audio/model?title=<language name>&page_size=10` with
> `Authorization: Bearer $FISH_AUDIO_API_KEY` and copying `items[].samples[0].audio`
> and `items[].id` for 2-3 well-reviewed (`like_count`/`task_count`) results per
> language not yet covered (es, fr, de, pt, zh, ja, pa, ta, te, bn, mr). This is
> data entry, not implementation — do it directly in this file before Task 4
> needs real entries to render.

- [ ] **Step 2: Verify the file compiles**

Run: `pnpm exec tsc --noEmit -p .`
Expected: no errors referencing `voice-catalog.ts`

- [ ] **Step 3: Commit**

```bash
git add lib/data/voice-catalog.ts
git commit -m "feat: add curated voice and language catalog"
```

---

### Task 2: `searchVoices` server action

**Files:**
- Modify: `app/(dashboard)/agents/[id]/actions.ts`
- Modify: `app/(dashboard)/agents/[id]/actions.test.ts`

**Interfaces:**
- Consumes: `VoiceCatalogEntry` type from `lib/data/voice-catalog.ts` (Task 1)
- Produces: `export async function searchVoices(query: string, language?: string): Promise<VoiceCatalogEntry[]>`

- [ ] **Step 1: Write the failing test**

Add to `app/(dashboard)/agents/[id]/actions.test.ts` (check the existing file's
top-of-file mock setup first — it likely already mocks `@/lib/supabase/server`;
add a `global.fetch` mock alongside it):

```ts
describe('searchVoices', () => {
  it('queries Fish Audio and maps results to the catalog shape', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'abc123',
            title: 'Test Voice',
            languages: ['en'],
            samples: [{ audio: 'https://example.com/sample.mp3' }],
          },
        ],
      }),
    } as unknown as Response)

    const { searchVoices } = await import('./actions')
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
          { id: '1', title: 'A', languages: ['en'], samples: [{ audio: 'a.mp3' }] },
          { id: '2', title: 'B', languages: ['hi'], samples: [{ audio: 'b.mp3' }] },
        ],
      }),
    } as unknown as Response)

    const { searchVoices } = await import('./actions')
    const result = await searchVoices('', 'hi')

    expect(result).toEqual([{ id: '2', label: 'B', language: 'hi', previewUrl: 'b.mp3' }])
  })

  it('returns an empty list on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response)
    const { searchVoices } = await import('./actions')
    await expect(searchVoices('test')).resolves.toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run app/\(dashboard\)/agents/\[id\]/actions.test.ts -t searchVoices`
Expected: FAIL — `searchVoices` is not exported

- [ ] **Step 3: Implement `searchVoices`**

Add to `app/(dashboard)/agents/[id]/actions.ts` (top-level, alongside the
existing exports — no auth/org lookup needed since this only reads Fish
Audio's public voice library, not org data):

```ts
import type { VoiceCatalogEntry } from '@/lib/data/voice-catalog'

type FishAudioModelResult = {
  id: string
  title: string
  languages?: string[]
  samples?: Array<{ audio?: string }>
}

export async function searchVoices(
  query: string,
  language?: string
): Promise<VoiceCatalogEntry[]> {
  const params = new URLSearchParams({ title: query, page_size: '20' })
  const response = await fetch(`https://api.fish.audio/model?${params}`, {
    headers: { Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}` },
  })

  if (!response.ok) return []

  const data = (await response.json()) as { items?: FishAudioModelResult[] }
  const items = data.items ?? []

  const mapped = items.map((item) => ({
    id: item.id,
    label: item.title,
    language: item.languages?.[0] ?? 'en',
    previewUrl: item.samples?.[0]?.audio ?? '',
  }))

  return language ? mapped.filter((voice) => voice.language === language) : mapped
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run app/\(dashboard\)/agents/\[id\]/actions.test.ts -t searchVoices`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/agents/\[id\]/actions.ts app/\(dashboard\)/agents/\[id\]/actions.test.ts
git commit -m "feat: add searchVoices server action for Fish Audio voice library"
```

---

### Task 3: Pin `reference_id` in Fish Audio TTS (the actual bug fix)

**Files:**
- Modify: `lib/voice/adapters/fish-audio-tts.ts`
- Modify: `lib/voice/adapters/fish-audio-tts.test.ts`

**Interfaces:**
- Produces: `synthesizeSpeech(text: string, voiceId?: string): Promise<ReadableStream<Uint8Array>>`, `new FishAudioTTS(voiceId?: string)`

- [ ] **Step 1: Write the failing test**

Add to `lib/voice/adapters/fish-audio-tts.test.ts`:

```ts
it('includes reference_id in the request body when a voiceId is given', async () => {
  const mockBody = new ReadableStream()
  vi.mocked(fetch).mockResolvedValue({ ok: true, body: mockBody } as Response)

  await synthesizeSpeech('Hello', 'voice-123')

  const [, requestInit] = vi.mocked(fetch).mock.calls[0]
  const body = JSON.parse(requestInit!.body as string)
  expect(body.reference_id).toBe('voice-123')
})

it('omits reference_id when no voiceId is given', async () => {
  const mockBody = new ReadableStream()
  vi.mocked(fetch).mockResolvedValue({ ok: true, body: mockBody } as Response)

  await synthesizeSpeech('Hello')

  const [, requestInit] = vi.mocked(fetch).mock.calls[0]
  const body = JSON.parse(requestInit!.body as string)
  expect(body.reference_id).toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/voice/adapters/fish-audio-tts.test.ts`
Expected: FAIL — `body.reference_id` is `undefined` in the first test (assertion fails, `toBe('voice-123')` mismatch)

- [ ] **Step 3: Implement `reference_id` support**

Modify `lib/voice/adapters/fish-audio-tts.ts`:

```ts
export async function synthesizeSpeech(
  text: string,
  voiceId?: string
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}`,
      'Content-Type': 'application/json',
      model: 's2.1-pro-free',
    },
    body: JSON.stringify({
      text,
      format: 'pcm',
      sample_rate: 24000,
      ...(voiceId ? { reference_id: voiceId } : {}),
    }),
  })

  if (!response.ok || !response.body) {
    throw new Error(`Fish Audio TTS request failed: ${response.status}`)
  }

  return response.body
}
```

Then update `FishAudioTTS` to accept and thread the voice id:

```ts
export class FishAudioTTS extends tts.TTS {
  label = 'fishaudio.TTS'
  private abortController = new AbortController()

  constructor(private readonly voiceId?: string) {
    super(FISH_AUDIO_TTS_SAMPLE_RATE, FISH_AUDIO_TTS_CHANNELS, { streaming: false })
  }

  // ...get model()/get provider() unchanged...

  synthesize(
    text: string,
    connOptions?: APIConnectOptions,
    abortSignal?: AbortSignal
  ): FishAudioChunkedStream {
    const signal = abortSignal
      ? AbortSignal.any([abortSignal, this.abortController.signal])
      : this.abortController.signal
    return new FishAudioChunkedStream(this, text, this.voiceId, connOptions, signal)
  }

  // ...stream()/close() unchanged...
}
```

And thread `voiceId` through `FishAudioChunkedStream`'s constructor into its
`run()` call to `synthesizeSpeech`:

```ts
class FishAudioChunkedStream extends tts.ChunkedStream {
  label = 'fishaudio.ChunkedStream'

  constructor(
    ttsInstance: FishAudioTTS,
    text: string,
    private readonly voiceId: string | undefined,
    connOptions?: APIConnectOptions,
    abortSignal?: AbortSignal
  ) {
    super(text, ttsInstance, connOptions, abortSignal)
  }

  protected async run(): Promise<void> {
    try {
      const stream = await synthesizeSpeech(this.inputText, this.voiceId)
      // ...rest unchanged...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/voice/adapters/fish-audio-tts.test.ts`
Expected: PASS (all tests, including the two pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add lib/voice/adapters/fish-audio-tts.ts lib/voice/adapters/fish-audio-tts.test.ts
git commit -m "fix: pin Fish Audio TTS to a single voice per call via reference_id"
```

---

### Task 4: Wire `voice_id` into the worker

**Files:**
- Modify: `workers/voice-agent.ts`

**Interfaces:**
- Consumes: `new FishAudioTTS(voiceId?: string)` from Task 3; `agentDetail.voice_id` (already on `AgentDetail` type per `lib/data/agents.ts:25`)

No new test file — this is a one-line constructor argument change in a worker
entrypoint with no existing unit test harness (the worker is tested via the
existing manual live-call verification already used for this feature).

- [ ] **Step 1: Update the `AgentSession` construction**

In `workers/voice-agent.ts`, change:

```ts
const session = new agents.AgentSession({
  stt: OpenAISTT.withGroq(),
  llm: OpenAILLM.withGroq({ model: 'llama-3.3-70b-versatile' }),
  tts: new FishAudioTTS(),
})
```

to:

```ts
const session = new agents.AgentSession({
  stt: OpenAISTT.withGroq(),
  llm: OpenAILLM.withGroq({ model: 'llama-3.3-70b-versatile' }),
  tts: new FishAudioTTS(agentDetail.voice_id ?? undefined),
})
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit -p .`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add workers/voice-agent.ts
git commit -m "fix: pass agent's configured voice_id into the TTS adapter"
```

---

### Task 5: `VoicePicker` component

**Files:**
- Create: `components/voice/voice-picker.tsx`
- Create: `components/voice/voice-picker.test.tsx`

**Interfaces:**
- Consumes: `VoiceCatalogEntry`, `voiceCatalog` from `lib/data/voice-catalog.ts` (Task 1); `searchVoices` from `app/(dashboard)/agents/[id]/actions.ts` (Task 2)
- Produces: `export function VoicePicker(props: { voices: VoiceCatalogEntry[]; value?: string; onValueChange: (id: string) => void; onSearch?: (query: string) => void; placeholder?: string }): JSX.Element`

This component takes `voices` as a prop (the currently-relevant list — caller
decides whether that's the curated shortlist or search results) rather than
fetching internally, so it stays a pure, testable UI component; the parent
(`agent-detail-client.tsx`, Task 6) owns calling `searchVoices` and merging
results.

- [ ] **Step 1: Write the failing test**

```tsx
// components/voice/voice-picker.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VoicePicker } from './voice-picker'
import type { VoiceCatalogEntry } from '@/lib/data/voice-catalog'

const voices: VoiceCatalogEntry[] = [
  { id: 'v1', label: 'Alice', language: 'en', previewUrl: 'https://example.com/a.mp3' },
  { id: 'v2', label: 'Bob', language: 'en', previewUrl: 'https://example.com/b.mp3' },
]

describe('VoicePicker', () => {
  it('opens and lists the given voices', () => {
    render(<VoicePicker voices={voices} onValueChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('filters the list by typed search text', () => {
    render(<VoicePicker voices={voices} onValueChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Ali' } })
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.queryByText('Bob')).not.toBeInTheDocument()
  })

  it('calls onValueChange when a voice is selected', () => {
    const onValueChange = vi.fn()
    render(<VoicePicker voices={voices} onValueChange={onValueChange} />)
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByText('Bob'))
    expect(onValueChange).toHaveBeenCalledWith('v2')
  })

  it('only plays one preview at a time', () => {
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
    const pauseSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    render(<VoicePicker voices={voices} onValueChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('combobox'))

    const previewButtons = screen.getAllByRole('button', { name: /preview/i })
    fireEvent.click(previewButtons[0])
    fireEvent.click(previewButtons[1])

    expect(pauseSpy).toHaveBeenCalled()
    expect(playSpy).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run components/voice/voice-picker.test.tsx`
Expected: FAIL — module `./voice-picker` does not exist

- [ ] **Step 3: Implement `VoicePicker`**

```tsx
// components/voice/voice-picker.tsx
'use client'

import { useMemo, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import type { VoiceCatalogEntry } from '@/lib/data/voice-catalog'

type VoicePickerProps = {
  voices: VoiceCatalogEntry[]
  value?: string
  onValueChange: (id: string) => void
  onSearch?: (query: string) => void
  placeholder?: string
}

function colorPairFor(id: string): [string, string] {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0
  const hue = Math.abs(hash) % 360
  return [`hsl(${hue}, 70%, 55%)`, `hsl(${(hue + 40) % 360}, 70%, 65%)`]
}

function VoiceAvatar({ id }: { id: string }) {
  const [c1, c2] = colorPairFor(id)
  return (
    <div
      className="size-6 shrink-0 rounded-full"
      style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
    />
  )
}

export function VoicePicker({
  voices,
  value,
  onValueChange,
  onSearch,
  placeholder = 'Select a voice...',
}: VoicePickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const filtered = useMemo(
    () => voices.filter((voice) => voice.label.toLowerCase().includes(query.toLowerCase())),
    [voices, query]
  )

  const selected = voices.find((voice) => voice.id === value)

  function togglePreview(voice: VoiceCatalogEntry) {
    if (!audioRef.current) {
      audioRef.current = new Audio()
    }
    const audio = audioRef.current

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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" role="combobox" className="w-full justify-start gap-2">
            {selected ? (
              <>
                <VoiceAvatar id={selected.id} />
                {selected.label}
              </>
            ) : (
              placeholder
            )}
          </Button>
        }
      />
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={(next) => {
              setQuery(next)
              onSearch?.(next)
            }}
            placeholder="Search voices..."
          />
          <CommandList>
            <CommandEmpty>No voices found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((voice) => (
                <CommandItem
                  key={voice.id}
                  value={voice.id}
                  onSelect={() => {
                    onValueChange(voice.id)
                    setOpen(false)
                  }}
                  className="flex items-center gap-2"
                >
                  <VoiceAvatar id={voice.id} />
                  <span className="flex-1">{voice.label}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label={playingId === voice.id ? 'Pause preview' : 'Play preview'}
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePreview(voice)
                    }}
                  >
                    {playingId === voice.id ? (
                      <Pause className="size-3.5" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                  </Button>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run components/voice/voice-picker.test.tsx`
Expected: PASS

If `role="combobox"` or `role="textbox"` don't match the actual rendered
output from `Command`/`Popover`/`Button`, inspect the rendered DOM
(`screen.debug()`) and adjust the test queries to match real roles/labels —
don't change the component to fit an assumed role that isn't actually there.

- [ ] **Step 5: Commit**

```bash
git add components/voice/voice-picker.tsx components/voice/voice-picker.test.tsx
git commit -m "feat: add searchable VoicePicker component with preview playback"
```

---

### Task 6: Wire the picker and language list into the Receptionist General tab

**Files:**
- Modify: `app/(dashboard)/agents/[id]/agent-detail-client.tsx`

**Interfaces:**
- Consumes: `voiceCatalog`, `languageOptions` from `lib/data/voice-catalog.ts` (Task 1); `searchVoices` from `./actions` (Task 2); `VoicePicker` from `@/components/voice/voice-picker` (Task 5)

No new automated test — this task wires existing, already-tested pieces into
an existing client component whose surrounding save/cancel/dirty-tracking
logic is unchanged. Verify manually per Step 3.

- [ ] **Step 1: Replace the hardcoded options and voice `Select`**

Remove the `VOICE_OPTIONS`/`LANGUAGE_OPTIONS` consts (lines 42-48) and their
import references; import from the catalog instead:

```ts
import { voiceCatalog, languageOptions } from '@/lib/data/voice-catalog'
import { VoicePicker } from '@/components/voice/voice-picker'
import { searchVoices } from './actions'
```

Update the two `useState` defaults (lines 95-96):

```ts
const [voiceId, setVoiceId] = useState(agent.voice_id ?? voiceCatalog[0]?.id ?? '')
const [defaultLanguage, setDefaultLanguage] = useState(agent.language ?? languageOptions[0].code)
```

And the two matching spots in `generalDirty` (lines 122-123) and
`handleCancelGeneral` (lines 130-131) — replace `VOICE_OPTIONS[0].id` with
`voiceCatalog[0]?.id ?? ''` and `LANGUAGE_OPTIONS[0]` with
`languageOptions[0].code` in both places.

Add search state near the other General-tab state:

```ts
const [voiceSearchResults, setVoiceSearchResults] = useState<typeof voiceCatalog>([])

async function handleVoiceSearch(query: string) {
  if (!query) {
    setVoiceSearchResults([])
    return
  }
  const results = await searchVoices(query, defaultLanguage)
  setVoiceSearchResults(results)
}

const shortlistForLanguage = voiceCatalog.filter((voice) => voice.language === defaultLanguage)
const voiceOptionsToShow =
  voiceSearchResults.length > 0 ? voiceSearchResults : shortlistForLanguage
```

Replace the voice `Select` block (lines 305-316):

```tsx
<VoicePicker
  voices={voiceOptionsToShow}
  value={voiceId}
  onValueChange={setVoiceId}
  onSearch={handleVoiceSearch}
  placeholder="Select a voice"
/>
```

Remove the now-redundant "Browse all voices" button (lines 317-324) — the
picker's built-in search replaces it.

- [ ] **Step 2: Replace the language `Select` with flag-avatar rows**

Replace the default-language `Select` block (lines 334-348):

```tsx
<Select
  value={defaultLanguage}
  onValueChange={(value) => setDefaultLanguage(value as string)}
>
  <SelectTrigger className="w-full">
    <SelectValue placeholder="Select a language" />
  </SelectTrigger>
  <SelectContent>
    {languageOptions.map((lang) => (
      <SelectItem key={lang.code} value={lang.code} className="flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-full bg-muted text-xs">
          {lang.flag}
        </span>
        {lang.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

- [ ] **Step 3: Manual verification**

Run: `pnpm dev`, navigate to a receptionist's detail page, General tab.
Confirm:
- Language select shows 13 languages with flag-in-circle rows.
- Voice picker opens on click, shows the curated shortlist for the selected
  language, search box filters/fetches more via `searchVoices`.
- Clicking a preview button plays audio; clicking a second one stops the
  first and starts the new one.
- Selecting a voice updates the trigger button and marks the form dirty
  (`UnsavedChangesBar` appears); Save persists via `updateAgentGeneral`.

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/agents/\[id\]/agent-detail-client.tsx
git commit -m "feat: wire VoicePicker and 13-language list into receptionist General tab"
```

---

### Task 7: End-to-end live call verification

**Files:** none (manual verification only)

- [ ] **Step 1: Start the worker**

Run: `pnpm run worker:voice`

- [ ] **Step 2: Start the app and place a test call**

Run: `pnpm dev`, open a receptionist with a specific voice selected (not the
default), start a web call, speak several sentences back and forth.

- [ ] **Step 3: Confirm the fix**

Confirm the agent's voice stays the same single voice for the entire call
(the originally reported bug — voice changing mid-word/mid-call — does not
recur), and that STT (Groq Whisper) and TTS (Fish Audio, free model) both
still work per the earlier session's fixes.

- [ ] **Step 4: Report result**

No commit — this is verification only. If the voice still drifts, return to
`systematic-debugging` Phase 1 rather than layering another fix on top.
