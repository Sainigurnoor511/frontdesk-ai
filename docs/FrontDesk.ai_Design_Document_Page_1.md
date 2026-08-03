# FrontDesk.ai Design Document

## Page 1 --- Vision & System Architecture

### Vision

FrontDesk.ai is an open-source, self-hostable AI receptionist platform
for automating inbound phone calls, answering customer questions,
qualifying leads, scheduling appointments, and routing conversations. It
is inspired by modern AI receptionist products while using an original
implementation and provider-agnostic architecture.

The first release focuses exclusively on inbound voice calls. The
platform should be modular, scalable, and allow users to bring their own
providers.

------------------------------------------------------------------------

## Core Features

-   AI Receptionist
-   Real-time Voice Calls
-   Knowledge Base (RAG)
-   Appointment Scheduling
-   CRM
-   Call Recordings & Transcripts
-   AI Call Summaries
-   Analytics
-   Multi-tenant Organizations
-   API & Webhooks

------------------------------------------------------------------------

## Engineering Principles

### Bring Your Own Everything

Every integration must be abstracted behind provider interfaces:

-   Voice
-   LLM
-   Calendar
-   Telephony
-   Storage
-   Email

### Open Source First

-   Self-hostable
-   Docker-first
-   Original implementation
-   Easy to extend

### Modular Architecture

Modules:

-   Authentication
-   Organizations
-   AI Agents
-   Voice Engine
-   CRM
-   Knowledge Base
-   Calendar
-   Analytics
-   Integrations

------------------------------------------------------------------------

## High-Level Architecture

``` text
Internet
    │
Next.js App
    │
Next.js API
    │
 ┌──┴─────────────┐
 │                │
Supabase     Redis/BullMQ
 │                │
 │          Background Workers
 └──────┬─────────┘
        │
 Provider Layer
        │
 ├─ LiveKit SIP
 ├─ Fish Audio
 ├─ Groq
 ├─ Cal.com
 ├─ Twilio
 └─ Plivo
```

------------------------------------------------------------------------

## Inbound Call Flow

1.  Customer calls business number.
2.  Twilio/Plivo forwards to LiveKit SIP.
3.  LiveKit creates a room.
4.  Groq Whisper performs streaming STT.
5.  Groq LLM generates responses.
6.  Knowledge Base provides context.
7.  AI invokes tools (calendar, CRM).
8.  Fish Audio streams TTS.
9.  Audio returns through LiveKit.
10. Background workers save transcripts, summaries, recordings, and
    analytics.

------------------------------------------------------------------------

## Technology Stack

**Framework:** Next.js + TypeScript

**UI:** Tailwind CSS, shadcn/ui, LiveKit React Components

**Database:** Supabase PostgreSQL + pgvector

**Queue:** Redis + BullMQ

**AI:** Groq LLM + Groq Whisper

**Voice:** LiveKit SIP + Fish Audio

**Calendar:** Cal.com

**Telephony:** Twilio & Plivo
