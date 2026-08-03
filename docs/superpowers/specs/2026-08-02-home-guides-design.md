# Design: Home + Guides Pages

Date: 2026-08-02
Status: Approved

## Context

Third sub-project following Auth/Orgs/Dashboard Shell and AI Agent Management. Builds out the Home and Guides pages, currently placeholders. Reference: user-provided screenshots of Reception.ai's Home and Guides pages, plus a live accessibility-tree capture of Reception.ai's actual zero-data Home page (obtained via the user's own logged-in account, used strictly as UX/structure reference — not their source code or literal copy).

## Scope

In scope:
- Home page matching the real zero-state structure: Getting Started card, Your Business section, single Calls stat tile, Latest Calls empty state
- Guides list page: video card + 7 guide entries with inline-expand step lists
- Full step-by-step content authored for all 7 guides, describing the intended full product (including features not yet built, e.g. Google Calendar integration) per explicit direction
- Sidebar "Organization" nav item renamed to "Business"

Out of scope: real video asset, real call/booking data (zero-state only, populates automatically once later phases add real data), billing/pricing (no paid tiers — open source).

## Home Page

- Getting Started card: heading, walkthrough copy, "Watch video" (placeholder, non-functional), "Browse guides" link to `/guides`, dismissible (local state, not persisted).
- Your Business section: "Add a phone number to start taking calls" link to `/phone-numbers`, disabled "Test your receptionist" button.
- Calls (7d) stat tile: single tile, `0`, "No prior data" subtext, links to `/analytics` (placeholder page).
- Latest Calls card: "No calls yet. Your recent calls will appear here." + "Start receiving calls" link to `/phone-numbers`.

## Guides Page

- Video card at top (static placeholder thumbnail, no real video).
- 7 guide cards: title, description, icon, step count badge. Clicking expands the card in place to show the full ordered step list (title + 2-3 sentence explanation per step). No separate route.
- Guide content hardcoded as TypeScript data (`lib/data/guides.ts`), same pattern as countries/industries.

## Guides — Full List and Step Counts

1. How to create your first booking (9 steps)
2. Meet your AI receptionist (17 steps)
3. Get your business set up (16 steps)
4. Build out your services (10 steps)
5. Take control of your availability (9 steps)
6. Connect Google Calendar (18 steps)
7. Find your way around settings (8 steps)

## Testing

Vitest test for guide data integrity (every guide has correct step count matching its declared count, no empty step text). No e2e test needed — this phase is static content plus zero-state data fetching already covered by existing patterns.
