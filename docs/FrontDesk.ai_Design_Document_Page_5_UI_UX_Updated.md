# FrontDesk.ai Design Document

# Page 5 --- UI & UX Specification

## UI Philosophy

The UI should be **extremely simple** and closely follow the layout and
navigation patterns shown in the provided reference images. The
implementation must be original while maintaining a familiar SaaS
dashboard experience.

The primary objective is **speed of development, consistency, and
maintainability**, not custom visual design.

------------------------------------------------------------------------

# Design Rules (Strict)

-   **Light mode only** (v1)
-   **Do not create any custom CSS**
-   **Do not override shadcn/ui styles**
-   **Do not define custom colors**
-   **Do not customize borders, radii, shadows, spacing, or typography**
-   **Use the default shadcn/ui theme**
-   **Use Tailwind utilities only for layout**
-   **Use Lucide icons**
-   **Use Radix UI primitives through shadcn/ui**
-   **Use LiveKit React Components for active voice UI where
    appropriate**

Everything should look like a default shadcn application.

------------------------------------------------------------------------

# Application Layout

The application should use a standard SaaS dashboard layout.

``` text
┌─────────────────────────────────────────────────────────────┐
│ Sidebar │ Header                                            │
│         ├───────────────────────────────────────────────────┤
│         │                                                   │
│         │               Current Page                        │
│         │                                                   │
│         │                                                   │
└─────────┴───────────────────────────────────────────────────┘
```

------------------------------------------------------------------------

# Sidebar

Use the latest **shadcn Sidebar** component without visual
customization.

Sections:

-   Home
-   Guides

Operations

-   Calendar
-   Availability
-   Clients
-   Staff
-   Conversations
-   Analytics

Receptionist

-   AI Agents (Receptionists)

Setup

-   Organization
-   Integrations
-   Booking Page

General

-   Settings
-   More

Bottom section:

-   Upgrade Card (default Card component)

The **More** button should open a Dropdown Menu using the default shadcn
DropdownMenu component.

Menu items:

-   AI Assistant
-   Organization
-   AI Agents
-   Settings
-   Lock Sidebar Layout

------------------------------------------------------------------------

# Header

The header should remain minimal.

Right side components:

-   Assistant Button
-   Help Button
-   Notification Button
-   User Avatar

Use default:

-   Button
-   Avatar
-   DropdownMenu
-   Popover

No custom styling.

------------------------------------------------------------------------

# Notification Popover

Default Popover component.

Contents:

-   Empty state
-   Future notifications list

------------------------------------------------------------------------

# User Menu

Avatar opens a DropdownMenu.

Menu:

-   User Information
-   Usage Summary
-   Settings
-   Dark Mode (future)
-   Logout

Keep default shadcn layout.

------------------------------------------------------------------------

# Main Pages

Each page should follow the same layout:

1.  Title
2.  Description
3.  Primary Action Button
4.  Filters / Search
5.  Main Content

Possible content:

-   Cards
-   Data Tables
-   Forms
-   Tabs
-   Dialogs
-   Drawers

No page should introduce unique layouts.

------------------------------------------------------------------------

# Component Usage

Use only official shadcn/ui components whenever possible.

Primary components:

-   Sidebar
-   Card
-   Table
-   Data Table
-   Button
-   Input
-   Textarea
-   Select
-   Combobox
-   Dropdown Menu
-   Popover
-   Dialog
-   Sheet
-   Drawer
-   Calendar
-   Badge
-   Avatar
-   Alert Dialog
-   Skeleton
-   Tabs
-   Tooltip
-   Sonner Toast
-   Scroll Area
-   Separator
-   Breadcrumb
-   Pagination

Avoid creating custom reusable UI unless absolutely necessary.

------------------------------------------------------------------------

# LiveKit Components

Use official LiveKit React Components for:

-   Active Call Controls
-   Microphone Status
-   Audio Level Visualization
-   Connection Status
-   Participant State

Do not recreate voice controls manually.

------------------------------------------------------------------------

# Responsive Behaviour

Desktop:

-   Fixed Sidebar
-   Header
-   Content Area

Tablet:

-   Collapsible Sidebar

Mobile:

-   Drawer Sidebar
-   Responsive Header
-   Full-width pages

------------------------------------------------------------------------

# UX Principles

-   Keep interactions simple.
-   Use standard shadcn patterns.
-   Consistent spacing.
-   Default typography.
-   Loading Skeletons everywhere.
-   Empty states for every page.
-   Error states using Alert components.
-   Confirmation dialogs before destructive actions.

The final application should feel like a clean, default shadcn dashboard
rather than a custom-designed product. The focus is functionality,
consistency, and developer productivity.
