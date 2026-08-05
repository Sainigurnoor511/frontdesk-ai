'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { ThinkingOrb } from 'thinking-orbs'
import { cn } from '@/lib/utils'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export function AssistantClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const hasConversation = messages.length > 0
  const canSend = input.trim().length > 0 && !isThinking && !isStreaming

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [messages, isThinking])

  async function handleSend() {
    const text = input.trim()
    if (!text || isThinking || isStreaming) return

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setInput('')
    setErrorMessage(null)
    setIsThinking(true)

    let response: Response
    try {
      response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextMessages),
      })
    } catch {
      setIsThinking(false)
      setErrorMessage('The assistant could not respond. Please try again.')
      return
    }

    if (!response.ok || !response.body) {
      setIsThinking(false)
      const body = await response.json().catch(() => null)
      setErrorMessage(body?.error ?? 'The assistant could not respond. Please try again.')
      return
    }

    setIsThinking(false)
    setIsStreaming(true)
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          next[next.length - 1] = { ...last, content: last.content + chunk }
          return next
        })
      }
    } finally {
      setIsStreaming(false)
    }
  }

  const composer = (
    <div className="flex w-full flex-col gap-2 rounded-3xl border border-border bg-background p-3 shadow-[0px_4px_12px_0px_rgba(0,0,0,0.06),0px_0px_1px_0px_rgba(0,0,0,0.30)]">
      <textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void handleSend()
          }
        }}
        placeholder="Ask your agent to do anything..."
        rows={2}
        aria-label="Message the assistant"
        className="max-h-40 flex-1 resize-none bg-transparent px-1.5 pt-1 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!canSend}
          aria-label="Send message"
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full transition-colors',
            canSend
              ? 'bg-foreground text-background hover:opacity-90'
              : 'cursor-not-allowed bg-muted text-muted-foreground'
          )}
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </div>
  )

  if (!hasConversation) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6">
        <div className="text-center">
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            How can I help you today?
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Ask me any questions about the platform
          </p>
        </div>
        {composer}
        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col">
      <div className="scrollbar-none flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 pb-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={cn('flex', message.role === 'user' && 'justify-end')}
            >
              <div
                className={cn(
                  'max-w-[75%] rounded-2xl text-sm whitespace-pre-wrap text-black',
                  message.role === 'user'
                    ? 'rounded-br-sm bg-[#f4f4f4] px-3 py-2'
                    : 'max-w-full bg-transparent'
                )}
              >
                {message.content}
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ThinkingOrb state="composing" size={20} />
              Thinking...
            </div>
          )}

          {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="sticky bottom-0 shrink-0 bg-background pt-2">{composer}</div>
    </div>
  )
}
