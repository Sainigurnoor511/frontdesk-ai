import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { VoicePicker } from './voice-picker'
import type { VoiceCatalogEntry } from '@/lib/data/voice-catalog'

// cmdk (used by our Command component) observes element size; jsdom has no
// ResizeObserver implementation.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
window.HTMLElement.prototype.scrollIntoView = () => {}

afterEach(() => {
  cleanup()
})

const voices: VoiceCatalogEntry[] = [
  { id: 'v1', label: 'Alice', language: 'en', previewUrl: 'https://example.com/a.mp3' },
  { id: 'v2', label: 'Bob', language: 'en', previewUrl: 'https://example.com/b.mp3' },
]

describe('VoicePicker', () => {
  it('opens and lists the given voices', () => {
    render(<VoicePicker voices={voices} onValueChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('filters the list by typed search text', () => {
    render(<VoicePicker voices={voices} onValueChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.change(screen.getByPlaceholderText('Search voices...'), {
      target: { value: 'Ali' },
    })
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByText('Bob')).toBeNull()
  })

  it('calls onValueChange when a voice is selected', () => {
    const onValueChange = vi.fn()
    render(<VoicePicker voices={voices} onValueChange={onValueChange} />)
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByText('Bob'))
    expect(onValueChange).toHaveBeenCalledWith('v2')
  })

  it('only plays one preview at a time', () => {
    const playSpy = vi
      .spyOn(window.HTMLMediaElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve())
    const pauseSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    render(<VoicePicker voices={voices} onValueChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('combobox'))

    const previewButtons = screen.getAllByRole('button', { name: /preview/i })
    fireEvent.click(previewButtons[0])
    fireEvent.click(previewButtons[1])

    expect(pauseSpy).toHaveBeenCalled()
    expect(playSpy).toHaveBeenCalledTimes(2)
  })
})
