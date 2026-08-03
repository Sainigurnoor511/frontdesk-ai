# FrontDesk.ai Design Document

# Page 2 --- Backend Design

## Backend Philosophy

FrontDesk.ai is built as a **full-stack Next.js application**. The
frontend, API routes, authentication, realtime updates, and background
workers share a single TypeScript codebase to simplify development and
deployment.

The backend should be modular, stateless, and provider-agnostic.
Business logic must never directly depend on third-party SDKs; all
external services are accessed through provider adapters.

------------------------------------------------------------------------

# Core Stack

-   Next.js (App Router)
-   TypeScript
-   Supabase (PostgreSQL + Auth + Storage)
-   Redis
-   BullMQ
-   LiveKit SIP
-   Fish Audio
-   Groq (LLM + Whisper STT)
-   Cal.com
-   Twilio / Plivo

------------------------------------------------------------------------

# Project Structure

``` text
app/
api/

src/
  modules/
    auth/
    organizations/
    agents/
    calls/
    contacts/
    knowledge/
    calendar/
    analytics/

  providers/
    voice/
    llm/
    telephony/
    calendar/

  services/
  repositories/
  lib/
  queue/
  workers/
```

Each module owns its APIs, business logic, database access, and
validation.

------------------------------------------------------------------------

# Database Modules

Supabase stores all application data.

Primary entities:

-   Organizations
-   Users
-   Members
-   AI Agents
-   Phone Numbers
-   Contacts
-   Calls
-   Transcripts
-   Recordings
-   Calendars
-   Appointments
-   Knowledge Bases
-   Documents
-   Provider Credentials
-   API Keys
-   Analytics
-   Audit Logs

Every table is scoped by `organization_id`.

------------------------------------------------------------------------

# Provider Architecture

Every external dependency implements a common interface.

## Voice

-   Fish Audio (default)
-   Future providers

## LLM

-   Groq (default)
-   Future providers

## Speech-to-Text

-   Groq Whisper

## Calendar

-   Cal.com
-   Google
-   Outlook

## Telephony

-   Twilio
-   Plivo

This allows users to replace providers without modifying application
logic.

------------------------------------------------------------------------

# Queue & Background Workers

Redis + BullMQ handle asynchronous work.

Queues:

-   incoming-calls
-   recordings
-   transcripts
-   knowledge-indexing
-   calendar-sync
-   analytics
-   notifications
-   webhooks

Workers should be idempotent, retry-safe, and horizontally scalable.

------------------------------------------------------------------------

# Inbound Call Pipeline

``` text
Caller
   │
Twilio / Plivo
   │
LiveKit SIP
   │
LiveKit Room
   │
Groq Whisper
   │
Groq LLM
   │
Tool Calling
   │
Fish Audio
   │
Caller
```

After the call ends, workers asynchronously:

-   Save transcript
-   Store recording
-   Generate AI summary
-   Update CRM
-   Store analytics
-   Trigger webhooks

------------------------------------------------------------------------

# API Conventions

-   REST APIs
-   Typed request/response models
-   Zod validation
-   Consistent error format
-   Pagination
-   Filtering
-   Webhook support
-   Streaming endpoints for voice

------------------------------------------------------------------------

# Security

-   Supabase Authentication
-   Row Level Security (RLS)
-   Organization isolation
-   Encrypted provider credentials
-   Rate limiting
-   Audit logging
-   API key authentication for external integrations

------------------------------------------------------------------------

# Design Principles

-   Keep business logic independent of providers.
-   Everything should be replaceable through adapters.
-   Long-running work always executes in queues.
-   APIs remain thin; services contain business logic.
-   Optimize for low-latency inbound voice conversations.
