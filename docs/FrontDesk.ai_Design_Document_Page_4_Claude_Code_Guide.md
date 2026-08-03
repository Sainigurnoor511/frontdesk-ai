# FrontDesk.ai Design Document

# Page 4 --- Claude Code Implementation Guide

## Objective

Build **FrontDesk.ai** as a production-ready, open-source AI
receptionist platform. The implementation should use original code and
original UI while delivering functionality comparable to modern AI
receptionist products. Prioritize maintainability, extensibility, and a
clean developer experience over shortcuts.

------------------------------------------------------------------------

# Development Principles

-   Build feature-by-feature; avoid placeholder implementations.
-   Prefer composition over large monolithic components.
-   Keep business logic outside UI components.
-   Use strict TypeScript throughout the project.
-   Keep APIs thin; place business logic in services.
-   Every feature must include loading, empty, success, and error
    states.
-   Write clean, self-documenting code with concise comments only where
    needed.

------------------------------------------------------------------------

# Project Standards

-   Framework: Next.js (App Router)
-   Styling: Tailwind CSS
-   Components: shadcn/ui
-   Voice UI: LiveKit React Components where appropriate
-   State: TanStack Query + Zustand
-   Forms: React Hook Form + Zod
-   Database: Supabase
-   Queue: Redis + BullMQ

Never introduce another UI library unless there is a compelling
technical reason.

------------------------------------------------------------------------

# Folder Organization

``` text
app/
components/
features/
lib/
providers/
services/
repositories/
hooks/
types/
workers/
```

Each feature should own its components, hooks, services, and API
handlers to minimize cross-module coupling.

------------------------------------------------------------------------

# Implementation Order

1.  Authentication & Organizations
2.  Dashboard Layout
3.  AI Agent Management
4.  Phone Number & Provider Settings
5.  Inbound Calling Pipeline
6.  Knowledge Base (RAG)
7.  Calendar Integration
8.  CRM & Contacts
9.  Analytics
10. Integrations & Webhooks
11. Testing & Performance Optimization

Each phase should be complete before moving to the next.

------------------------------------------------------------------------

# Definition of Done

A feature is complete only when it includes:

-   Functional UI
-   Backend implementation
-   Validation
-   Error handling
-   Responsive layout
-   Accessibility basics
-   Tests where appropriate
-   Documentation updates

------------------------------------------------------------------------

# Open Source Guidelines

-   No proprietary assets or branding.
-   Keep providers configurable through adapters.
-   Write reusable components and services.
-   Favor clear APIs over framework-specific abstractions.
-   Document extension points for contributors.

------------------------------------------------------------------------

# Success Criteria

FrontDesk.ai should be:

-   Easy to self-host
-   Easy to extend
-   Provider agnostic
-   Production ready
-   Well documented
-   Consistent in UI and architecture

The resulting codebase should allow contributors to add new providers,
tools, and features without modifying the application's core
architecture.
