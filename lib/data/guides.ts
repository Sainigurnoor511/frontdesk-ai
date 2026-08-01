import type { Icon } from '@phosphor-icons/react'
import { Rocket, Robot, Buildings, Wrench, Clock, CalendarCheck, Gear } from '@phosphor-icons/react/dist/ssr'

export type GuideStep = {
  title: string
  description: string
}

export type Guide = {
  slug: string
  title: string
  description: string
  icon: Icon
  steps: GuideStep[]
}

export const guides: Guide[] = [
  {
    slug: 'first-booking',
    title: 'How to create your first booking',
    description:
      'The short path from setup to a booking on your calendar: what your receptionist needs, and how it books for you.',
    icon: Rocket,
    steps: [
      { title: 'Connect a phone number', description: 'Your receptionist needs a number to answer calls on. Pick an area code and we’ll assign one automatically, or bring your own from a provider you already use.' },
      { title: 'Set your business hours', description: 'Tell your receptionist when you’re open. Calls outside these hours can be routed to voicemail, a message, or handled by the agent anyway — your choice.' },
      { title: 'Add at least one service', description: 'A booking needs something to book. Add a service with a name and duration so your receptionist knows what it’s scheduling.' },
      { title: 'Connect your calendar', description: 'Link Google Calendar or Cal.com so bookings land where you already keep your schedule, and so your receptionist knows when you’re free.' },
      { title: 'Write a short greeting', description: 'This is the first thing callers hear. Keep it brief — your business name and a friendly opener is usually enough.' },
      { title: 'Choose a voice and language', description: 'Pick a voice that fits your business and the language your customers call in. You can preview voices before committing.' },
      { title: 'Test the flow yourself', description: 'Call your new number and walk through booking an appointment as if you were a customer. This catches most issues before a real caller does.' },
      { title: 'Check the booking landed correctly', description: 'Open your connected calendar and confirm the test booking appears with the right time, service, and contact details.' },
      { title: 'Go live', description: 'Once the test booking looks right, you’re ready for real calls. Share your new number or forward your existing line to it.' },
    ],
  },
  {
    slug: 'meet-your-receptionist',
    title: 'Meet your AI receptionist',
    description: 'Instructions, first message, voice, languages, rules, and call settings.',
    icon: Robot,
    steps: [
      { title: 'Understand what your receptionist can do', description: 'It answers calls, checks availability, books and reschedules appointments, answers common questions from your knowledge base, and can transfer to a real person when needed.' },
      { title: 'Write its instructions', description: 'This is the system prompt — the personality, tone, and boundaries for how it talks to callers. Keep it specific to your business rather than generic.' },
      { title: 'Set the first message', description: 'What it says the instant a call connects. A short greeting with your business name sets expectations immediately.' },
      { title: 'Pick a voice', description: 'Browse available voices and preview a sample. Match the tone to your brand — warm and casual for a salon, crisp and professional for a law office.' },
      { title: 'Choose supported languages', description: 'Add every language your customers actually call in. The receptionist will detect and respond in the caller’s language automatically.' },
      { title: 'Define escalation rules', description: 'Decide when a call should be handed to a real person — angry callers, complex requests, or anything outside what the agent is confident handling.' },
      { title: 'Set safety rules', description: 'Boundaries the agent should never cross: no medical advice, no pricing guarantees it can’t honor, no promises about availability it hasn’t confirmed.' },
      { title: 'Configure call routing', description: 'Decide whether staff or the agent answers first, and how long to ring before the agent picks up.' },
      { title: 'Set maximum ring time', description: 'How long a caller waits before being connected. Shorter times feel responsive; longer times give staff a chance to pick up first.' },
      { title: 'Add hold music', description: 'What plays while a caller waits, if anything. Silence can feel like a dropped call — a short audio loop reassures callers they’re still connected.' },
      { title: 'Connect a knowledge base', description: 'Upload documents, FAQs, or a website so the agent can answer specific questions about your business accurately instead of guessing.' },
      { title: 'Review tool permissions', description: 'Confirm which actions the agent is allowed to take on its own — booking, rescheduling, canceling — versus what needs a human to approve.' },
      { title: 'Set a fallback message', description: 'What the agent says when it genuinely doesn’t know the answer, so it never has to make something up.' },
      { title: 'Preview a sample conversation', description: 'Run through a few example questions in the preview panel before going live, to hear exactly how the agent responds.' },
      { title: 'Adjust tone based on feedback', description: 'After a few real calls, revisit the instructions and tighten anything that felt off — too formal, too chatty, too slow to get to the point.' },
      { title: 'Set up call summaries', description: 'Enable automatic summaries so you get a quick readout of what happened on each call without listening to the whole recording.' },
      { title: 'Save and publish', description: 'Once everything looks right, publish the configuration so it applies to live calls immediately.' },
    ],
  },
  {
    slug: 'business-setup',
    title: 'Get your business set up',
    description: 'Details, locations, hours, scheduling, plus website scanning and knowledge.',
    icon: Buildings,
    steps: [
      { title: 'Enter your business name', description: 'This is how your receptionist refers to your business on calls, so make sure it’s exactly how you want it said out loud.' },
      { title: 'Add your business address', description: 'Used for location-aware answers like directions and for setting the right timezone automatically.' },
      { title: 'Set your timezone', description: 'Confirms your business hours and calendar bookings all line up correctly, especially if you operate across regions.' },
      { title: 'Scan your website', description: 'Point the scanner at your site and it’ll pull business hours, services, and pricing automatically — saving you from typing it all in by hand.' },
      { title: 'Review the scanned information', description: 'Automated scans are a starting point, not gospel. Check the extracted hours, services, and details for accuracy before publishing.' },
      { title: 'Add multiple locations', description: 'If you operate more than one site, add each one with its own hours and address so the agent can route callers correctly.' },
      { title: 'Set business hours per location', description: 'Different locations can have different hours — configure each independently rather than assuming one schedule fits all.' },
      { title: 'Define holiday hours', description: 'Add exceptions for holidays and closures so the agent doesn’t offer appointments on days you’re actually closed.' },
      { title: 'Upload your logo', description: 'Used across your dashboard and booking page so everything feels like your business, not a generic template.' },
      { title: 'Write a short business description', description: 'A sentence or two the agent can draw on when a caller asks what your business does.' },
      { title: 'Add contact details', description: 'Email and any secondary phone numbers, so the agent has fallback information to share if needed.' },
      { title: 'Connect your knowledge base', description: 'Upload PDFs, docs, or FAQs the agent can search when answering detailed questions.' },
      { title: 'Add a website crawler source', description: 'Point at your site so new pages get indexed into the knowledge base automatically over time.' },
      { title: 'Review indexed content', description: 'Spot-check what got pulled into the knowledge base to confirm nothing important was missed or misread.' },
      { title: 'Set up staff scheduling', description: 'Add staff members and their individual availability so bookings can be assigned to the right person.' },
      { title: 'Confirm everything with a test call', description: 'Call in and ask the agent a few questions about your business to confirm it has the right information.' },
    ],
  },
  {
    slug: 'services',
    title: 'Build out your services',
    description: 'Types, pricing, assets, locations, add-ons, and promotions.',
    icon: Wrench,
    steps: [
      { title: 'Add your first service', description: 'Give it a clear name callers will recognize — avoid internal jargon that only makes sense to your staff.' },
      { title: 'Set the duration', description: 'How long the service actually takes, including any buffer time you want between bookings.' },
      { title: 'Set the price', description: 'Displayed to callers if they ask, and used for any automated quotes the agent gives.' },
      { title: 'Assign a category', description: 'Group related services together so your booking page and agent responses stay organized.' },
      { title: 'Add a short description', description: 'A sentence explaining what’s included, so the agent can answer follow-up questions without guessing.' },
      { title: 'Attach an image', description: 'Shown on your public booking page to help customers recognize what they’re booking.' },
      { title: 'Restrict a service to specific locations', description: 'If a service is only offered at certain sites, scope it so the agent doesn’t offer it everywhere.' },
      { title: 'Add optional add-ons', description: 'Extras a customer can attach to a booking, each with their own price and duration.' },
      { title: 'Set up a promotion', description: 'Time-limited discounts the agent can mention when relevant, with a clear start and end date.' },
      { title: 'Review your full service list', description: 'Read through everything as if you were a new customer — confirm names, prices, and descriptions all make sense together.' },
    ],
  },
  {
    slug: 'availability',
    title: 'Take control of your availability',
    description: 'Set your business opening hours, plus staff and asset hours, closures, and one-off time off.',
    icon: Clock,
    steps: [
      { title: 'Set your default opening hours', description: 'The baseline hours your business is open, used whenever a more specific schedule isn’t set.' },
      { title: 'Set hours per day of the week', description: 'Override the default for individual days — shorter hours on weekends, closed on Mondays, whatever fits your business.' },
      { title: 'Add staff-specific availability', description: 'If different staff work different hours, set each person’s schedule so bookings only go to someone actually working.' },
      { title: 'Set asset or room availability', description: 'For businesses that book equipment or rooms rather than people, define when each asset is available.' },
      { title: 'Add a one-off closure', description: 'Block out a single day or range — a holiday, a private event — without touching your recurring schedule.' },
      { title: 'Add recurring time off', description: 'Set a repeating block, like every Wednesday afternoon, for something that happens on a regular cadence.' },
      { title: 'Set booking lead time', description: 'How much advance notice you need before a slot can be booked, to avoid same-minute walk-in requests.' },
      { title: 'Set a maximum booking window', description: 'How far in advance customers can book — stops the calendar from filling up with appointments months out.' },
      { title: 'Review the calendar view', description: 'Check the visual calendar to confirm your hours, closures, and staff availability all display the way you expect.' },
    ],
  },
  {
    slug: 'google-calendar',
    title: 'Connect Google Calendar',
    description: 'Enable the integration once, then connect each staff member’s calendar so your receptionist checks their availability and never double-books.',
    icon: CalendarCheck,
    steps: [
      { title: 'Open the Integrations page', description: 'Find Google Calendar in the list of available integrations for your account.' },
      { title: 'Click Connect', description: 'This starts the authorization flow with Google, opening a new window to sign in.' },
      { title: 'Sign in with your Google account', description: 'Use the Google account that owns the calendar you want bookings to land on.' },
      { title: 'Grant calendar permissions', description: 'Approve the requested access so the integration can read availability and create events.' },
      { title: 'Confirm the connection succeeded', description: 'You should see a green “Connected” status back on the Integrations page.' },
      { title: 'Select which calendar to use', description: 'If your Google account has multiple calendars, choose the one bookings should be written to.' },
      { title: 'Enable two-way sync', description: 'Turn on sync so events created outside the app — like a manual entry — also block availability for the agent.' },
      { title: 'Connect a staff member’s calendar', description: 'Go to that staff member’s profile and repeat the connection flow for their individual calendar.' },
      { title: 'Repeat for each staff member', description: 'Every staff member who takes bookings needs their own calendar connected so availability stays accurate per person.' },
      { title: 'Set a buffer between events', description: 'Add a few minutes of padding around each booking so back-to-back appointments don’t run into each other.' },
      { title: 'Choose the event title format', description: 'Decide what shows in the calendar entry — customer name, service, or both — for quick scanning at a glance.' },
      { title: 'Add a default event description', description: 'Include booking details like service and contact info automatically in every calendar event.' },
      { title: 'Set a reminder', description: 'Configure a notification before each appointment so staff never miss a booking.' },
      { title: 'Test with a sample booking', description: 'Book a test appointment through your receptionist and confirm it appears correctly on the connected calendar.' },
      { title: 'Verify availability blocking works', description: 'Try booking the same slot again and confirm the agent correctly shows it as unavailable.' },
      { title: 'Check timezone handling', description: 'Confirm the event time matches what you expect, especially if your Google account and business are in different timezones.' },
      { title: 'Review sync frequency', description: 'Understand how often the calendar refreshes so you know the maximum delay before a manual change is reflected.' },
      { title: 'Disconnect and reconnect if needed', description: 'If something looks wrong, disconnecting and reconnecting the integration resolves most sync issues.' },
    ],
  },
  {
    slug: 'settings',
    title: 'Find your way around settings',
    description: 'Account, notifications, billing, plus app feature controls.',
    icon: Gear,
    steps: [
      { title: 'Update your account name and email', description: 'Keep your profile details current — this is what shows up in team-facing areas of the app.' },
      { title: 'Change your password', description: 'Set a new password from the security section if you ever need to rotate it.' },
      { title: 'Review notification preferences', description: 'Choose which events send you an email or in-app alert, so you’re only notified about what matters.' },
      { title: 'Manage your team', description: 'Invite teammates, assign roles, and remove access for anyone who no longer needs it.' },
      { title: 'Check usage summary', description: 'See how much call time and how many bookings you’ve used this billing period at a glance.' },
      { title: 'Toggle app features on or off', description: 'Turn sidebar sections on or off to keep the app focused on what your business actually uses.' },
      { title: 'Review connected integrations', description: 'See everything currently connected — calendar, webhooks, third-party tools — in one place.' },
      { title: 'Export your data', description: 'Download your call history, bookings, and client records if you ever need a local copy.' },
    ],
  },
]

export function getGuideBySlug(slug: string): Guide | undefined {
  return guides.find((guide) => guide.slug === slug)
}
