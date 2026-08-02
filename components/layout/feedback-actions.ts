'use server'

import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { submitFeedbackSchema, type SubmitFeedbackInput } from '@/lib/validations/feedback'

export async function submitFeedback(
  input: SubmitFeedbackInput
): Promise<{ error: string } | { success: true }> {
  const parsed = submitFeedbackSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to send feedback.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const { error } = await supabase.from('feedback').insert({
    organization_id: member.organization_id,
    user_id: user.id,
    rating: parsed.data.rating ?? null,
    issue: parsed.data.issue || null,
    feature_request: parsed.data.featureRequest || null,
  })

  if (error) {
    return { error: 'Could not send feedback. Please try again.' }
  }

  return { success: true }
}
