import { handleMicrosoftCalendarCallback } from '@/app/(dashboard)/integrations/microsoft-calendar-actions'
import { redirect } from 'next/navigation'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    redirect('/integrations?microsoft_calendar_error=' + encodeURIComponent(error))
  }

  if (!code || !state) {
    redirect('/integrations?microsoft_calendar_error=missing_code_or_state')
  }

  const result = await handleMicrosoftCalendarCallback(code, state)

  if ('error' in result) {
    redirect('/integrations?microsoft_calendar_error=' + encodeURIComponent(result.error))
  }

  redirect('/integrations?microsoft_calendar_connected=true')
}
