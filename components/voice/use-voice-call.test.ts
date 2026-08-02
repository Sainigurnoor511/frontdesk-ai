import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useVoiceCall } from './use-voice-call'

type Handler = (...args: unknown[]) => void

class MockTrack {
  kind = 'audio'
  attach = vi.fn(() => {
    const el = document.createElement('audio')
    document.body.appendChild(el)
    return el
  })
  // Matches the real livekit-client Track.detach() behavior: it clears
  // element.srcObject and pauses the element, but deliberately does NOT
  // remove it from the DOM (the real library caches/recycles <audio>
  // elements internally). See node_modules/livekit-client/dist/livekit-client.esm.mjs
  // detach() -> detachTrack() / recycleElement().
  detach = vi.fn((element: HTMLMediaElement) => {
    element.srcObject = null
    element.pause()
    return element
  })
}

const { MockRoom } = vi.hoisted(() => {
  class MockRoom {
    static instances: MockRoom[] = []
    handlers: Record<string, Handler[]> = {}
    localParticipant = { setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined) }
    connect = vi.fn().mockResolvedValue(undefined)
    disconnect = vi.fn(() => {
      this.emit('disconnected')
    })

    constructor() {
      MockRoom.instances.push(this)
    }

    on(event: string, handler: Handler) {
      this.handlers[event] = [...(this.handlers[event] ?? []), handler]
      return this
    }

    emit(event: string, ...args: unknown[]) {
      for (const handler of this.handlers[event] ?? []) handler(...args)
    }
  }
  return { MockRoom }
})

vi.mock('livekit-client', () => {
  return {
    Room: MockRoom,
    RoomEvent: {
      TrackSubscribed: 'trackSubscribed',
      ActiveSpeakersChanged: 'activeSpeakersChanged',
      Disconnected: 'disconnected',
    },
    Track: { Kind: { Audio: 'audio' } },
  }
})

describe('useVoiceCall audio element cleanup', () => {
  beforeEach(() => {
    MockRoom.instances = []
    document.body.innerHTML = ''
  })

  const startCall = vi.fn().mockResolvedValue({
    token: 'tok',
    url: 'wss://example.com',
    roomName: 'room',
    conversationId: 'conv',
  })

  it('removes attached audio elements from the DOM on disconnect()', async () => {
    const { result } = renderHook(() => useVoiceCall(startCall))

    await act(async () => {
      await result.current.connect()
    })

    const room = MockRoom.instances[0]
    act(() => {
      room.emit('trackSubscribed', new MockTrack())
    })

    expect(document.body.querySelectorAll('audio').length).toBe(1)

    act(() => {
      result.current.disconnect()
    })

    expect(document.body.querySelectorAll('audio').length).toBe(0)
  })

  it('removes attached audio elements when the room disconnects remotely', async () => {
    const { result } = renderHook(() => useVoiceCall(startCall))

    await act(async () => {
      await result.current.connect()
    })

    const room = MockRoom.instances[0]
    act(() => {
      room.emit('trackSubscribed', new MockTrack())
    })

    expect(document.body.querySelectorAll('audio').length).toBe(1)

    // Simulate the agent ending the call (remote-initiated disconnect),
    // not via the hook's own disconnect().
    act(() => {
      room.emit('disconnected')
    })

    expect(document.body.querySelectorAll('audio').length).toBe(0)
  })

  it('removes attached audio elements on unmount', async () => {
    const { result, unmount } = renderHook(() => useVoiceCall(startCall))

    await act(async () => {
      await result.current.connect()
    })

    const room = MockRoom.instances[0]
    act(() => {
      room.emit('trackSubscribed', new MockTrack())
    })

    expect(document.body.querySelectorAll('audio').length).toBe(1)

    unmount()

    expect(document.body.querySelectorAll('audio').length).toBe(0)
  })

  it('only sets agentState to talking for audio tracks', async () => {
    const { result } = renderHook(() => useVoiceCall(startCall))

    await act(async () => {
      await result.current.connect()
    })

    expect(result.current.agentState).toBe('listening')

    const videoTrack = new MockTrack()
    videoTrack.kind = 'video'
    act(() => {
      MockRoom.instances[0].emit('trackSubscribed', videoTrack)
    })

    await waitFor(() => {
      expect(result.current.agentState).toBe('listening')
    })
    expect(videoTrack.attach).not.toHaveBeenCalled()
  })
})
