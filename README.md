# FrontDesk.ai

An open-source, self-hostable AI receptionist platform. FrontDesk.ai answers calls, books appointments, and manages your business's front desk — an original implementation inspired by products like ElevenLabs' Reception.ai, built to be free, transparent, and self-hostable.

## Features

- **AI receptionist agents** — configurable voice/chat agents with custom greetings, tone, languages, and call-routing rules
- **Website-aware setup** — scan a business website to auto-fill business info, services, and knowledge sources
- **Calendar & bookings** — appointments, staff/asset availability, business-hours-aware scheduling
- **Clients & staff management** — CRM-lite records tied to your organization
- **Conversations** — call transcripts, AI-generated summaries, and outcome tracking
- **Analytics** — call volume, bookings, revenue, and conversion tracking
- **Integrations** — calendar sync, CRM, and webhook/automation connectors
- **Multi-tenant orgs** — Supabase-backed auth and row-level-security-scoped organizations

## Tech Stack

- **Framework:** [Next.js 16](https://nextjs.org) (App Router, Server Actions)
- **Database & Auth:** [Supabase](https://supabase.com) (Postgres + Row Level Security)
- **Queue / background jobs:** [BullMQ](https://docs.bullmq.io) + [Redis](https://redis.io)
- **LLM:** [Groq](https://groq.com) for extraction and generation
- **Voice:** [Fish Audio](https://fish.audio) for text-to-speech
- **UI:** Tailwind CSS v4, shadcn/ui (on [Base UI](https://base-ui.com)), [Phosphor Icons](https://phosphoricons.com)
- **Testing:** Vitest

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (or the Supabase CLI for local development)
- A Redis instance (local via Docker, or a hosted provider)
- API keys for [Groq](https://console.groq.com) and [Fish Audio](https://fish.audio)

### Setup

1. Clone the repo and install dependencies:

   ```bash
   git clone https://github.com/<your-org>/frontdesk-ai.git
   cd frontdesk-ai
   npm install
   ```

2. Copy the environment template and fill in your credentials:

   ```bash
   cp .env.example .env.local
   ```

3. Apply database migrations:

   ```bash
   npx supabase db push
   ```

4. Start the dev server:

   ```bash
   npm run dev
   ```

5. In a separate terminal, start the background worker (handles website scans and other queued jobs):

   ```bash
   npm run worker
   ```

6. Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run worker` | Run the background job worker (BullMQ) |

## Architecture

- `app/` — Next.js App Router routes, grouped by `(auth)` and `(dashboard)` route groups, plus a standalone `onboarding` flow
- `components/` — UI components (`components/ui` is the vendored shadcn/Base UI layer; feature components live in their own folders)
- `lib/` — data access (`lib/data`), validation schemas (`lib/validations`), Supabase clients (`lib/supabase`), the crawler and LLM provider code, and the BullMQ queue setup (`lib/queue`)
- `workers/` — standalone Node processes that consume BullMQ queues (run outside the Next.js request lifecycle)
- `supabase/migrations/` — SQL migrations, applied via the Supabase CLI

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup details, coding conventions, and how to submit changes.

## License

Licensed under the [Apache License 2.0](./LICENSE).
