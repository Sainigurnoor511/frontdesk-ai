export type IntegrationCategory =
  | 'Automation'
  | 'Communication'
  | 'CRM'
  | 'Developer'
  | 'Forms'
  | 'Payment'
  | 'Scheduling'
  | 'Support'
  | 'Telephony'

export type Integration = {
  slug: string
  name: string
  category: IntegrationCategory
  description: string
  settingsDescription: string
  isAdvanced?: boolean
}

export const integrationCategories: IntegrationCategory[] = [
  'Automation',
  'Communication',
  'CRM',
  'Developer',
  'Forms',
  'Payment',
  'Scheduling',
  'Support',
  'Telephony',
]

export const integrationCatalog: Integration[] = [
  {
    slug: 'calendly',
    name: 'Calendly',
    category: 'Scheduling',
    description: 'Let callers book directly into your existing Calendly event types.',
    settingsDescription:
      'With this enabled, your receptionist can offer and book open Calendly slots without leaving the call.',
  },
  {
    slug: 'google-calendar',
    name: 'Google Calendar',
    category: 'Scheduling',
    description: 'Sync bookings and availability with a connected Google Calendar.',
    settingsDescription:
      'With this enabled, staff can connect their calendar to sync availability and bookings.',
  },
  {
    slug: 'microsoft-calendar',
    name: 'Microsoft Calendar',
    category: 'Scheduling',
    description: 'Sync bookings and availability with Outlook or Microsoft 365 calendars.',
    settingsDescription:
      'With this enabled, staff can connect their Microsoft calendar so bookings and availability stay in sync.',
  },
  {
    slug: 'mcp-server',
    name: 'MCP Server',
    category: 'Developer',
    description: 'Give your receptionist access to tools exposed by a custom MCP server.',
    settingsDescription:
      'With this enabled, you can point your receptionist at an MCP server URL to expose custom tools and data sources during calls.',
    isAdvanced: true,
  },
  {
    slug: 'sip-trunk',
    name: 'SIP Trunk',
    category: 'Telephony',
    description: 'Route calls through your own SIP trunk instead of a provisioned number.',
    settingsDescription:
      'With this enabled, you can register your own SIP trunk credentials so calls route through your existing telephony provider.',
  },
  {
    slug: 'twilio',
    name: 'Twilio',
    category: 'Telephony',
    description: 'Bring your own Twilio phone numbers and messaging into your receptionist.',
    settingsDescription:
      'With this enabled, you can link a Twilio account so its numbers and SMS capabilities are available to your receptionist.',
  },
  {
    slug: 'webhook-tool',
    name: 'Webhook Tool',
    category: 'Developer',
    description: 'Trigger an outbound webhook with call data at points you define.',
    settingsDescription:
      'With this enabled, you can configure a webhook URL that receives call events and data as they happen.',
    isAdvanced: true,
  },
  {
    slug: 'zapier',
    name: 'Zapier',
    category: 'Automation',
    description: 'Connect your receptionist to thousands of apps through Zapier automations.',
    settingsDescription:
      'With this enabled, call and booking events can trigger Zaps you build across your other connected apps.',
  },
  {
    slug: 'hubspot',
    name: 'HubSpot',
    category: 'CRM',
    description: 'Log calls and sync contacts with your HubSpot CRM.',
    settingsDescription:
      'With this enabled, callers are matched to or created as HubSpot contacts and call activity is logged automatically.',
  },
  {
    slug: 'jotform',
    name: 'JotForm',
    category: 'Forms',
    description: 'Send call intake details straight into a JotForm submission.',
    settingsDescription:
      'With this enabled, information collected during a call can be submitted directly to a JotForm you choose.',
  },
  {
    slug: 'mailgun',
    name: 'Mailgun',
    category: 'Communication',
    description: 'Send transactional emails like booking confirmations through Mailgun.',
    settingsDescription:
      'With this enabled, confirmation and follow-up emails are sent through your Mailgun account instead of the default sender.',
  },
  {
    slug: 'make',
    name: 'Make',
    category: 'Automation',
    description: 'Kick off Make (Integromat) scenarios from call and booking events.',
    settingsDescription:
      'With this enabled, call and booking events can trigger scenarios you build in Make.',
  },
  {
    slug: 'ringcentral',
    name: 'RingCentral',
    category: 'Telephony',
    description: 'Route and forward calls through your existing RingCentral phone system.',
    settingsDescription:
      'With this enabled, you can connect a RingCentral account so calls can be transferred to your existing phone system.',
  },
  {
    slug: 'salesforce',
    name: 'Salesforce',
    category: 'CRM',
    description: 'Create leads and log call activity directly in Salesforce.',
    settingsDescription:
      'With this enabled, callers are matched against Salesforce records and new leads or activities are created automatically.',
  },
  {
    slug: 'sendgrid',
    name: 'SendGrid',
    category: 'Communication',
    description: 'Send booking confirmations and notification emails through SendGrid.',
    settingsDescription:
      'With this enabled, confirmation and follow-up emails are sent through your SendGrid account.',
  },
  {
    slug: 'slack',
    name: 'Slack',
    category: 'Communication',
    description: 'Post call summaries and booking alerts to a Slack channel.',
    settingsDescription:
      'With this enabled, your team gets a Slack message whenever a call ends or a booking is made.',
  },
  {
    slug: 'stripe',
    name: 'Stripe',
    category: 'Payment',
    description: 'Take deposits or full payment for bookings made over the phone.',
    settingsDescription:
      'With this enabled, your receptionist can collect a payment or deposit through Stripe as part of booking a call.',
  },
  {
    slug: 'typeform',
    name: 'Typeform',
    category: 'Forms',
    description: 'Send call intake details into a Typeform response.',
    settingsDescription:
      'With this enabled, information collected during a call can be submitted directly to a Typeform you choose.',
  },
  {
    slug: 'zendesk',
    name: 'Zendesk',
    category: 'Support',
    description: 'Create and update Zendesk support tickets from caller requests.',
    settingsDescription:
      'With this enabled, callers with support requests automatically get a Zendesk ticket created or updated.',
  },
  {
    slug: 'zoho-crm',
    name: 'Zoho CRM',
    category: 'CRM',
    description: 'Sync contacts and log call activity in Zoho CRM.',
    settingsDescription:
      'With this enabled, callers are matched to or created as Zoho CRM contacts and call activity is logged automatically.',
  },
]

export function getIntegrationBySlug(slug: string): Integration | undefined {
  return integrationCatalog.find((integration) => integration.slug === slug)
}
