# FrontDesk.ai Design Document

# Page 3 --- AI & Voice Platform

## Overview

FrontDesk.ai is designed for **low-latency inbound AI voice
conversations**. Every conversation should feel natural, allow
interruptions, and complete common receptionist tasks such as answering
questions, booking appointments, taking messages, and collecting lead
information.

The AI pipeline is fully streaming---speech recognition, language
generation, and speech synthesis happen continuously instead of waiting
for the caller to finish long utterances.

------------------------------------------------------------------------

# Voice Pipeline

``` text
Caller
   │
Twilio / Plivo
   │
LiveKit SIP
   │
LiveKit Room
   │
Groq Whisper (Streaming STT)
   │
Conversation Engine
   │
Groq LLM
   │
Tool Calling
   │
Fish Audio (Streaming TTS)
   │
LiveKit
   │
Caller
```

The conversation engine coordinates every step and maintains
conversation state.

------------------------------------------------------------------------

# Conversation Lifecycle

1.  Accept inbound call.
2.  Load organization settings.
3.  Load AI agent configuration.
4.  Retrieve business hours.
5.  Connect linked calendars.
6.  Load relevant Knowledge Base context.
7.  Start streaming conversation.
8.  Invoke tools when required.
9.  End conversation gracefully.
10. Generate transcript, summary, and analytics asynchronously.

------------------------------------------------------------------------

# AI Tools

The LLM should never directly modify data. Instead, it invokes tools
such as:

-   Search Knowledge Base
-   Check availability
-   Book appointment
-   Cancel or reschedule appointment
-   Create CRM contact
-   Update contact notes
-   Transfer call (future)
-   Send follow-up email (future)

Every tool returns structured JSON and validates input before execution.

------------------------------------------------------------------------

# Knowledge Base (RAG)

Supported sources:

-   PDF
-   DOCX
-   Markdown
-   Plain text
-   Website crawler
-   FAQ editor

Documents are chunked, embedded, and stored in pgvector. During a call,
only the most relevant context is retrieved and injected into the prompt
to minimize latency.

------------------------------------------------------------------------

# Prompt Strategy

Each AI agent contains:

-   Personality
-   Business information
-   Conversation goals
-   Safety rules
-   Tool definitions
-   Escalation rules

The system prompt should remain concise, while dynamic context
(calendar, RAG results, customer details) is injected at runtime.

------------------------------------------------------------------------

# Performance Goals

-   Fast call pickup
-   Streaming speech recognition
-   Streaming LLM responses
-   Streaming TTS playback
-   Minimal perceived latency
-   Background processing for non-critical tasks

Heavy operations such as summaries, analytics, CRM enrichment, and
notifications should always execute through background workers after the
call.

------------------------------------------------------------------------

# Error Handling

If any provider becomes unavailable:

-   Retry transient failures.
-   Fall back to graceful error messages.
-   Log detailed diagnostics.
-   Never terminate the call abruptly when recovery is possible.

The conversation engine should isolate provider failures so that
replacing one service does not require changes to business logic.

------------------------------------------------------------------------

# Design Principles

-   Optimize for natural conversations.
-   Keep prompts modular.
-   Use tool calling instead of prompt-only logic.
-   Keep latency low through streaming.
-   Treat providers as interchangeable components.
