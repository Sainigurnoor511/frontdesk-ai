'use server'

import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { scanRequestSchema, createAgentSchema, type ScanRequestInput, type CreateAgentInput } from '@/lib/validations/agent'
import { scanWebsiteQueue } from '@/lib/queue/queues/scan-website'
import type { ExtractedBusinessInfo } from '@/lib/providers/llm/types'
import { redirect } from 'next/navigation'

export async function startWebsiteScan(
  input: ScanRequestInput
): Promise<{ scanJobId: string } | { error: string }> {
  const parsed = scanRequestSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const serviceClient = createServiceRoleClient()
  const { data: job, error } = await serviceClient
    .from('agent_scan_jobs')
    .insert({ url: parsed.data.url, scan_depth: parsed.data.scanDepth, status: 'pending' })
    .select('id')
    .single()

  if (error || !job) {
    return { error: 'Could not start scan. Please try again.' }
  }

  await scanWebsiteQueue.add('scan', {
    scanJobId: job.id,
    url: parsed.data.url,
    scanDepth: parsed.data.scanDepth,
  })

  return { scanJobId: job.id }
}

export async function getScanJobStatus(scanJobId: string): Promise<
  | { status: string; extractedData: ExtractedBusinessInfo | null; errorMessage: string | null }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: job, error } = await supabase
    .from('agent_scan_jobs')
    .select('status, extracted_data, error_message')
    .eq('id', scanJobId)
    .single()

  if (error || !job) {
    return { error: 'Scan job not found.' }
  }

  return {
    status: job.status,
    extractedData: job.extracted_data,
    errorMessage: job.error_message,
  }
}

export async function createAgent(input: CreateAgentInput): Promise<{ error: string }> {
  const parsed = createAgentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const { data: agent, error } = await supabase
    .from('agents')
    .insert({
      organization_id: member.organization_id,
      name: parsed.data.businessName,
      business_name: parsed.data.businessName,
      country: parsed.data.country,
      language: parsed.data.language,
      industry: parsed.data.industry,
      answering_mode: parsed.data.answeringMode,
      staff_phone_number: parsed.data.staffPhoneNumber,
      max_ring_seconds: parsed.data.maxRingSeconds,
      hold_music: parsed.data.holdMusic,
      greeting_prompt: parsed.data.greetingPrompt,
      personality_notes: parsed.data.personalityNotes,
    })
    .select('id')
    .single()

  if (error || !agent) {
    return { error: 'Could not create agent. Please try again.' }
  }

  redirect(`/agents/${agent.id}`)
}
