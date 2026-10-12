import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VerifyCodeForm } from './verify-code-form'

vi.mock('@/app/(auth)/actions', () => ({ verifyMfaChallenge: vi.fn() }))

// `input-otp` observes its container and polls `elementFromPoint`; jsdom has neither. Same shape
// of shim as `components/agents/create-voice-dialog.test.tsx`.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
document.elementFromPoint = () => null

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function codeInput() {
  return screen.getByLabelText(/authentication code/i) as HTMLInputElement
}

function typeCode(value: string) {
  fireEvent.change(codeInput(), { target: { value } })
}

function submitButton() {
  return screen.getByRole('button', { name: /verify/i }) as HTMLButtonElement
}

async function action() {
  const { verifyMfaChallenge } = await import('@/app/(auth)/actions')
  return vi.mocked(verifyMfaChallenge)
}

describe('VerifyCodeForm', () => {
  it('submits the code once the sixth digit lands', async () => {
    const verify = await action()
    verify.mockResolvedValue({ error: '' })
    render(<VerifyCodeForm />)

    typeCode('123456')

    await waitFor(() => expect(verify).toHaveBeenCalledWith({ code: '123456' }))
  })

  it('shows the action error and clears the boxes for another go', async () => {
    const verify = await action()
    verify.mockResolvedValue({ error: 'That code is not right.' })
    render(<VerifyCodeForm />)

    typeCode('000000')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('That code is not right.')
    expect(codeInput().value).toBe('')
    expect(submitButton().disabled).toBe(true) // empty code, so the button waits for six digits
  })

  it('recovers from a rejected action request instead of staying disabled forever', async () => {
    // The stranded-form case: a transport failure, an aborted action POST, or a non-AuthError
    // thrown by the SDK rejects the promise. Without the catch/finally the input and the button
    // stayed disabled with no message, and only a manual reload got the user out.
    const verify = await action()
    verify.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<VerifyCodeForm />)

    typeCode('123456')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/check your connection/i)
    expect(codeInput().disabled).toBe(false)
  })

  it('re-enables the form after a rejection, so a second attempt is possible', async () => {
    const verify = await action()
    verify.mockRejectedValueOnce(new Error('upstream exploded'))
    verify.mockResolvedValueOnce({ error: '' })
    render(<VerifyCodeForm />)

    typeCode('111111')
    await screen.findByRole('alert')

    typeCode('222222')

    await waitFor(() => expect(verify).toHaveBeenCalledTimes(2))
    expect(verify).toHaveBeenLastCalledWith({ code: '222222' })
  })

  it('rejects a short code locally, without calling the action', async () => {
    const verify = await action()
    render(<VerifyCodeForm />)

    typeCode('123')
    fireEvent.submit(submitButton().closest('form')!)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBeTruthy()
    expect(verify).not.toHaveBeenCalled()
  })

  it('does not double-submit when the button click races the auto-submit', async () => {
    // `onComplete` fires on the sixth digit and the user may also hit the button; the isSubmitting
    // guard is what stops one code being spent twice against the attempt budget.
    const verify = await action()
    let release: (value: { error: string }) => void = () => {}
    verify.mockImplementation(
      () => new Promise((resolve) => (release = resolve as typeof release))
    )
    render(<VerifyCodeForm />)

    typeCode('123456')
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(1))

    fireEvent.submit(submitButton().closest('form')!)

    expect(verify).toHaveBeenCalledTimes(1)
    release({ error: '' })
  })
})
