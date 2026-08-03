# Voices tab: browse, filter, favorite, and design new receptionist voices

## Goal

Replace the "Voice library coming soon" placeholder on the Receptionist
detail page's Voices tab with a real voice browser (search, language/gender/
age filters, favorites) plus a "Create voice" flow that designs a brand-new
voice via Fish Audio's voice-design API and saves a chosen candidate as a
real, selectable voice model.

## Scope

1. Extend voice search to parse gender/age from Fish Audio's free-text tags.
2. Favorites: new `favorite_voices` table + toggle action.
3. Voice design + save-as-model pipeline (2-step: generate candidates,
   pick one, save).
4. Full Voices tab UI: header (agent selector, Create voice), search,
   filters, Recommended list, per-row preview/select/favorite/in-use.

## Data layer

`app/(dashboard)/agents/[id]/actions.ts` — extend `searchVoices`'s mapping:

```ts
type FishVoiceSearchResult = VoiceCatalogEntry & {
  description?: string
  gender?: 'male' | 'female'
  age?: 'young' | 'middle-aged' | 'old'
}
```

Parse `item.tags` (already returned by Fish Audio's `/model` endpoint,
verified during spec research — e.g. `['male', 'middle-aged', 'narration',
...]`) for the first tag matching `male`/`female` → `gender`, and
`young`/`middle-aged`/`old` → `age`. `item.description` passed through
as-is. No Accent field — Fish Audio's accent tagging is too sparse to
support a reliable filter (verified: only occasional entries like "British
Accent" appear in an otherwise unrelated tag list).

## Favorites

New migration `supabase/migrations/00000000000023_favorite_voices.sql`:

```sql
create table favorite_voices (
  organization_id uuid not null references organizations(id) on delete cascade,
  voice_id text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, voice_id)
);

alter table favorite_voices enable row level security;

create policy "org members can manage their favorite voices"
  on favorite_voices for all
  using (organization_id in (select organization_id from members where user_id = auth.uid()))
  with check (organization_id in (select organization_id from members where user_id = auth.uid()));
```

New actions in `app/(dashboard)/agents/[id]/actions.ts`:
- `getFavoriteVoiceIds(): Promise<string[]>` — org-scoped via the existing
  `getOrgId`-equivalent pattern used by `updateAgentGeneral`.
- `toggleFavoriteVoice(voiceId: string): Promise<{ error: string } | { favorited: boolean }>`
  — inserts or deletes the row, org-scoped.

## Voice design + save pipeline

Two new server actions:

```ts
async function designVoiceCandidates(
  instruction: string,
  language: string
): Promise<{ error: string } | { candidates: { audioBase64: string }[] }>
```
Calls `POST https://api.fish.audio/v1/voice-design` with header
`model: voice-design-1`, body `{ instruction, language, n: 4 }`. Stateless
per Fish Audio's docs — returns candidate `audio_base64` payloads only, no
`reference_id` yet.

```ts
async function saveVoiceModel(
  audioBase64: string,
  title: string
): Promise<{ error: string } | { id: string }>
```
Calls `POST https://api.fish.audio/model` as `multipart/form-data`: decode
`audioBase64` to a `Blob`, field `voices` = that blob, `title`, `type: 'tts'`,
`train_mode: 'fast'` (instant availability), `visibility: 'private'`
(org-specific voice, not published to Fish Audio's public discovery page).
Returns the new model's `id`, usable immediately as a `reference_id` in
`FishAudioTTS` and as a `VoiceCatalogEntry.id`.

## UI

`components/agents/create-voice-dialog.tsx`:
- Instruction textarea (placeholder: "Describe the voice you want..."),
  language select (reuses `languageOptions`).
- "Generate" button calls `designVoiceCandidates`, shows up to 4 candidate
  rows (orb + play/pause preview, reusing the `VoiceOrbButton` pattern from
  `voice-picker.tsx` factored into a shared component — see File Structure).
- Selecting a candidate prompts for a name (simple text input inline, not a
  second dialog), then calls `saveVoiceModel`; on success, calls
  `onVoiceCreated(newVoiceEntry)` and closes.

`app/(dashboard)/agents/[id]/voices-tab.tsx` (new, extracted from
`agent-detail-client.tsx` to keep that file from growing further — it
already handles General/Rules/Call settings/Advanced tabs):
- Header: agent-selector `Select` (switches which agent's `voice_id` this
  tab edits — sourced from the `agents: Agent[]` prop already passed into
  `AgentDetailClient`), "+ Create voice" button opening
  `CreateVoiceDialog`.
- "Currently using {label}" text, right-aligned above the list.
- Search input (debounced, calls `searchVoices`).
- Filter row: Language / Gender / Age, each a small multi-select dropdown
  (reuses `Command`+`Popover` pattern from `VoicePicker`). Filtering is
  client-side against whatever result set (curated shortlist or live
  search) is currently displayed.
- "Recommended" heading + list: `voiceCatalog` entries by default; search
  query present → shows `searchVoices` results instead, same row shape.
- Each row: orb+preview button, name, description (truncated), language
  flag, gender, age, "In use" badge when `voice.id === selectedAgent.voice_id`,
  favorite star (filled if in `favoriteVoiceIds`, toggles via
  `toggleFavoriteVoice`). Clicking the row body (not orb/star) immediately
  persists this agent's `voice_id` via the existing `updateAgentGeneral`
  action (no separate save step — matches the reference's "switch anytime"
  copy).

## File structure

- Modify: `app/(dashboard)/agents/[id]/actions.ts` — gender/age parsing,
  favorites actions, design/save-model actions.
- Create: `supabase/migrations/00000000000023_favorite_voices.sql`.
- Modify: `components/voice/voice-picker.tsx` — extract `VoiceOrbButton`
  and `colorTripleFor` into `components/voice/voice-orb-button.tsx` so both
  `VoicePicker` and the new Voices tab reuse the identical avatar/preview
  component instead of duplicating it.
- Create: `components/agents/create-voice-dialog.tsx`.
- Create: `app/(dashboard)/agents/[id]/voices-tab.tsx`.
- Modify: `app/(dashboard)/agents/[id]/agent-detail-client.tsx` — replace
  the placeholder Voices `TabsContent` with `<VoicesTab .../>`.

## Testing

- `searchVoices` gender/age parsing: unit tests with sample tag arrays
  (male/female detection, young/middle-aged/old detection, missing tags).
- `toggleFavoriteVoice` / `getFavoriteVoiceIds`: unit tests, mocked
  Supabase, org-scoping assertions (same pattern as existing
  `updateAgentGeneral` tests).
- `designVoiceCandidates` / `saveVoiceModel`: unit tests, mocked fetch,
  assert request shape (header, multipart fields) and base64 decode.
- Manual: search, filter combinations, favorite toggle, switching the
  selected voice, full design → pick candidate → save → newly-created
  voice appears and can be selected.
