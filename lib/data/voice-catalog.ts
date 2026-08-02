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
  {
    id: '76b55591c758444cb95253708696dfad',
    label: 'Joe — Narration',
    language: 'en',
    previewUrl: 'https://platform.r2.fish.audio/task/01e73764d4e14618b6079c7f214e0239.mp3',
  },
  {
    id: 'fb8fe4a94658429d9be70efd4eec35a2',
    label: 'Miles — Narration',
    language: 'en',
    previewUrl: 'https://platform.r2.fish.audio/task/4bd6ece1ceec42988faea46c27603fcc.mp3',
  },
  // Spanish
  {
    id: 'e9f68d442a8741b88132e68a48d352e0',
    label: 'Peppa — Latin Spanish',
    language: 'es',
    previewUrl: 'https://platform.r2.fish.audio/task/5720573899ef49dc98375ff03359a426.mp3',
  },
  {
    id: '7e778565d6c04034b8f8dacbd4418cc7',
    label: 'Santa Claus — Spanish',
    language: 'es',
    previewUrl: 'https://platform.r2.fish.audio/task/6e3f342053ff4e5495446283c72e1ca6.mp3',
  },
  // French
  {
    id: 'e6fa085797cf4259befce5b61a923eb8',
    label: 'Announcer — French',
    language: 'fr',
    previewUrl: 'https://platform.r2.fish.audio/task/8cff4f961e4c487fa713da3984d0ddff.mp3',
  },
  {
    id: '27f6bd0887c341dd95c2e89add0dcfd3',
    label: 'Jax — French',
    language: 'fr',
    previewUrl: 'https://platform.r2.fish.audio/task/b3405071af28493b89813ec1958fa802.mp3',
  },
  // German
  {
    id: 'd83fade735f4447698a08986de772c82',
    label: 'German — General',
    language: 'de',
    previewUrl: 'https://platform.r2.fish.audio/task/dde86a6ddeb54c47a796d546162c92a6.mp3',
  },
  {
    id: 'c079932b47564fcfad0a9f6874a49df7',
    label: 'German Father',
    language: 'de',
    previewUrl: 'https://platform.r2.fish.audio/task/80223537d3f74ed28464ce2c23607bf1.mp3',
  },
  // Portuguese
  {
    id: '53fefb59d05248878e9a2fdfdbd314ac',
    label: 'Jax — Brazilian Portuguese',
    language: 'pt',
    previewUrl: 'https://platform.r2.fish.audio/task/0b9f12c3ec624c0d9c340a354be87b6f.mp3',
  },
  {
    id: '8f50c4c145e44ec280fb759b32934890',
    label: 'Caine — Brazilian Portuguese',
    language: 'pt',
    previewUrl: 'https://platform.r2.fish.audio/task/6f827223e50e422f8162f6f3352200ad.mp3',
  },
  // Chinese
  {
    id: '6d67b892daa74c3088524b8a92c5dff6',
    label: 'Chinese — General',
    language: 'zh',
    previewUrl: 'https://platform.r2.fish.audio/task/1c1be60e08a64f97b0697045bb74763b.mp3',
  },
  {
    id: 'afd54d28b9c74524bc04325ed0f2e15d',
    label: 'Male — Chinese',
    language: 'zh',
    previewUrl: 'https://platform.r2.fish.audio/task/d51221f4e10e4bfaad7a3a2d56b48b8d.mp3',
  },
  // Japanese
  {
    id: '4bc1d3d1fa60415f989b8e0b99f333e1',
    label: 'Light — Japanese',
    language: 'ja',
    previewUrl: 'https://platform.r2.fish.audio/task/dcbd9b3a2bd942f587cb5520c3ea83d3.mp3',
  },
  {
    id: 'c748ffc7823b419481f7003b313566ad',
    label: 'Gojo — Japanese',
    language: 'ja',
    previewUrl: 'https://platform.r2.fish.audio/task/74648840fb8e463ea2f1f9af00e3705e.mp3',
  },
  // Hindi
  {
    id: '4d7609058bd34213b1378b29efbde1f1',
    label: 'Girl — Hindi',
    language: 'hi',
    previewUrl: 'https://platform.r2.fish.audio/task/1ca8bd04ccb840fcba6f7faf61c51705.mp3',
  },
  {
    id: '94fc4065e6e04b9baf1aea2107e91d66',
    label: 'Friendly Hindi Voice',
    language: 'hi',
    previewUrl: 'https://platform.r2.fish.audio/task/b667e32a82fd4b1e80803da78f3a252f.mp3',
  },
  // Punjabi
  {
    id: '3a642f544faf408a8e6c7a1c9539e052',
    label: 'Punjabi — General',
    language: 'pa',
    previewUrl: 'https://platform.r2.fish.audio/task/4224defe4006489f87d99e6b0b23013a.mp3',
  },
  {
    id: 'e1f0ea43321e479c919678c896924133',
    label: 'Warm Punjabi Narrator',
    language: 'pa',
    previewUrl: 'https://platform.r2.fish.audio/task/c9e5134458fe4e7bb4cca74eba09a250.mp3',
  },
  // Tamil
  {
    id: '31792949c082466bab25d6f3327ac216',
    label: 'Sneha — Tamil',
    language: 'ta',
    previewUrl: 'https://platform.r2.fish.audio/task/c5f2b20a35bb48daa390c3d64872f7cf.mp3',
  },
  {
    id: 'c9cbdcd106524e16850e52b1bd3e89ad',
    label: 'Male — Tamil',
    language: 'ta',
    previewUrl: 'https://platform.r2.fish.audio/task/df590133b25f462299e8a420dc2295da.mp3',
  },
  // Telugu
  {
    id: '735a2e696d1d4131902f519a2759b31b',
    label: 'Female — Telugu',
    language: 'te',
    previewUrl: 'https://platform.r2.fish.audio/task/4b047d1097c84e7fa1addacfb5511e7a.mp3',
  },
  {
    id: '3fa40f9596bb4f0c8cd1d796eac43fa5',
    label: 'Male — Telugu',
    language: 'te',
    previewUrl: 'https://platform.r2.fish.audio/tasks/2026-07-13/9de80745962e4ba7a7c174d2a29b5e9c.mp3',
  },
  // Bengali
  {
    id: '6497b68d100f4e2186ef406e154452b6',
    label: 'Emotional Narrator — Bengali',
    language: 'bn',
    previewUrl: 'https://platform.r2.fish.audio/task/dcefc93902114cec88285f70fc419bc3.mp3',
  },
  {
    id: 'e7601a9cab8342f3b080068d80dae69b',
    label: 'Tech — Bengali',
    language: 'bn',
    previewUrl: 'https://platform.r2.fish.audio/task/3cf942d0bf0f4ac29fc6c5bbcd7d4cfe.mp3',
  },
  // Marathi
  {
    id: '67df869809c24728a87093c21a257b11',
    label: 'Announcer — Marathi',
    language: 'mr',
    previewUrl: 'https://platform.r2.fish.audio/task/3df2c7a40a894c93980a2c61229e2b6d.mp3',
  },
  {
    id: '6404a335886949819ba25a02f489cd53',
    label: 'Storyteller — Marathi',
    language: 'mr',
    previewUrl: 'https://platform.r2.fish.audio/task/637cdaecb1dd4da8b977d8fad384faed.mp3',
  },
]
