import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AssistantClient } from './assistant-client'

vi.mock('./actions', () => ({ loadAssistantChat: vi.fn(), removeAssistantChat: vi.fn() }))
vi.mock('thinking-orbs', () => ({ ThinkingOrb: () => null }))
vi.mock('@/components/ui/response', () => ({
  Response: ({ children }: { children: string }) => <p>{children}</p>,
}))

describe('AssistantClient on a refused send', () => {
  beforeEach(() => {
    // jsdom has no layout, so the auto-scroll has nothing to call.
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('keeps the typed draft and shows the error in place on a 401 without verifyPath', async () => {
    // What the route returns when the session check could not be made (a GoTrue blip): not a
    // reason to navigate, and the message was never saved, so the draft must survive.
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        { error: 'We could not confirm your session just now. Please try again in a moment.' },
        { status: 401 }
      )
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<AssistantClient initialChats={[]} />)
    const box = screen.getByRole('textbox', { name: 'Message the assistant' }) as HTMLTextAreaElement

    fireEvent.change(box, { target: { value: 'How many calls today?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(screen.getByText(/could not confirm your session/i)).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Queried again: the composer remounts when the view switches between empty and conversation.
    const after = screen.getByRole('textbox', { name: 'Message the assistant' }) as HTMLTextAreaElement
    expect(after.value).toBe('How many calls today?')
    // The optimistic bubble is gone, so a retry does not show the message twice.
    expect(screen.queryAllByText('How many calls today?', { selector: 'p' })).toHaveLength(0)
  })
})
