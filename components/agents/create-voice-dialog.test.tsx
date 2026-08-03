import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateVoiceDialog } from './create-voice-dialog'

vi.mock('@/app/(dashboard)/agents/[id]/actions', () => ({
  designVoiceCandidates: vi.fn(),
  saveVoiceModel: vi.fn(),
}))

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
window.HTMLElement.prototype.scrollIntoView = () => {}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CreateVoiceDialog', () => {
  it('generates candidates and lets the user save one', async () => {
    const { designVoiceCandidates, saveVoiceModel } = await import(
      '@/app/(dashboard)/agents/[id]/actions'
    )
    vi.mocked(designVoiceCandidates).mockResolvedValue({
      candidates: [{ audioBase64: 'AAAA' }, { audioBase64: 'BBBB' }],
    })
    vi.mocked(saveVoiceModel).mockResolvedValue({ id: 'new-voice-id' })

    const onVoiceCreated = vi.fn()
    render(
      <CreateVoiceDialog open={true} onOpenChange={vi.fn()} onVoiceCreated={onVoiceCreated} />
    )

    fireEvent.change(screen.getByPlaceholderText(/describe the voice/i), {
      target: { value: 'A warm narrator' },
    })
    fireEvent.click(screen.getByRole('button', { name: /generate/i }))

    await waitFor(() => expect(designVoiceCandidates).toHaveBeenCalledWith('A warm narrator', 'en'))

    const useButtons = await screen.findAllByRole('button', { name: /use this voice/i })
    fireEvent.click(useButtons[0])

    fireEvent.change(screen.getByPlaceholderText(/name this voice/i), {
      target: { value: 'My Custom Voice' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() =>
      expect(saveVoiceModel).toHaveBeenCalledWith('AAAA', 'My Custom Voice', 'en')
    )
    expect(onVoiceCreated).toHaveBeenCalledWith({
      id: 'new-voice-id',
      label: 'My Custom Voice',
      language: 'en',
      previewUrl: '',
    })
  })
})
