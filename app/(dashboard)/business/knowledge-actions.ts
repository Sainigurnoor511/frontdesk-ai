'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import {
  addKnowledgeWebsiteSchema,
  knowledgeSourceIdSchema,
  createFaqSchema,
  updateFaqSchema,
  faqIdSchema,
  type AddKnowledgeWebsiteInput,
  type CreateFaqInput,
  type UpdateFaqInput,
} from '@/lib/validations/knowledge'
import { knowledgeIndexingQueue } from '@/lib/queue/queues/knowledge-indexing'
import { isSupportedKnowledgeFileName } from '@/lib/knowledge/supported-files'

type ActionResult = { error: string } | { success: true }

async function getOrgId(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>
): Promise<{ error: string } | { organizationId: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to do this.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  return { organizationId: member.organization_id }
}

export async function addKnowledgeWebsite(input: AddKnowledgeWebsiteInput): Promise<ActionResult> {
  const parsed = addKnowledgeWebsiteSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { data: source, error } = await supabase
    .from('knowledge_sources')
    .insert({
      organization_id: orgResult.organizationId,
      type: 'website',
      name: parsed.data.name,
      source_url: parsed.data.url,
      scan_depth: parsed.data.scanDepth,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error || !source) {
    return { error: 'Could not add website source. Please try again.' }
  }

  await knowledgeIndexingQueue.add('index-source', {
    action: 'index_source',
    sourceId: source.id,
  })

  revalidatePath('/business')
  return { success: true }
}

export async function uploadKnowledgeFile(formData: FormData): Promise<ActionResult> {
  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return { error: 'Choose a file to upload.' }
  }

  if (!isSupportedKnowledgeFileName(file.name)) {
    return {
      error: 'Unsupported file type. Upload a .txt, .md, .html, or .htm file for now.',
    }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${orgResult.organizationId}/${crypto.randomUUID()}-${safeName}`

  const { error: uploadError } = await supabase.storage
    .from('knowledge-documents')
    .upload(storagePath, file, { upsert: false })

  if (uploadError) {
    return { error: 'Could not upload file. Please try again.' }
  }

  const { data: source, error } = await supabase
    .from('knowledge_sources')
    .insert({
      organization_id: orgResult.organizationId,
      type: 'file',
      name: file.name,
      storage_path: storagePath,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error || !source) {
    return { error: 'Could not save knowledge source. Please try again.' }
  }

  await knowledgeIndexingQueue.add('index-source', {
    action: 'index_source',
    sourceId: source.id,
  })

  revalidatePath('/business')
  return { success: true }
}

export async function deleteKnowledgeSource(id: string): Promise<ActionResult> {
  const parsed = knowledgeSourceIdSchema.safeParse({ id })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { data: source } = await supabase
    .from('knowledge_sources')
    .select('storage_path')
    .eq('id', parsed.data.id)
    .eq('organization_id', orgResult.organizationId)
    .single()

  const { error } = await supabase
    .from('knowledge_sources')
    .delete()
    .eq('id', parsed.data.id)
    .eq('organization_id', orgResult.organizationId)

  if (error) {
    return { error: 'Could not delete knowledge source. Please try again.' }
  }

  if (source?.storage_path) {
    await supabase.storage.from('knowledge-documents').remove([source.storage_path])
  }

  await knowledgeIndexingQueue.add('delete-source', {
    action: 'delete_source',
    organizationId: orgResult.organizationId,
    sourceId: parsed.data.id,
  })

  revalidatePath('/business')
  return { success: true }
}

export async function createFaq(input: CreateFaqInput): Promise<ActionResult> {
  const parsed = createFaqSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { data: faq, error } = await supabase
    .from('faqs')
    .insert({
      organization_id: orgResult.organizationId,
      question: parsed.data.question,
      answer: parsed.data.answer,
    })
    .select('id')
    .single()

  if (error || !faq) {
    return { error: 'Could not create FAQ. Please try again.' }
  }

  await knowledgeIndexingQueue.add('index-faq', {
    action: 'index_faq',
    faqId: faq.id,
  })

  revalidatePath('/business')
  return { success: true }
}

export async function updateFaq(input: UpdateFaqInput): Promise<ActionResult> {
  const parsed = updateFaqSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase
    .from('faqs')
    .update({
      question: parsed.data.question,
      answer: parsed.data.answer,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.id)
    .eq('organization_id', orgResult.organizationId)

  if (error) {
    return { error: 'Could not update FAQ. Please try again.' }
  }

  await knowledgeIndexingQueue.add('index-faq', {
    action: 'index_faq',
    faqId: parsed.data.id,
  })

  revalidatePath('/business')
  return { success: true }
}

export async function deleteFaq(id: string): Promise<ActionResult> {
  const parsed = faqIdSchema.safeParse({ id })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase
    .from('faqs')
    .delete()
    .eq('id', parsed.data.id)
    .eq('organization_id', orgResult.organizationId)

  if (error) {
    return { error: 'Could not delete FAQ. Please try again.' }
  }

  await knowledgeIndexingQueue.add('delete-faq', {
    action: 'delete_faq',
    organizationId: orgResult.organizationId,
    faqId: parsed.data.id,
  })

  revalidatePath('/business')
  return { success: true }
}
