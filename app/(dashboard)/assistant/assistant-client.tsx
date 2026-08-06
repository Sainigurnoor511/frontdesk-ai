'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUp, MessageSquarePlus, Trash2 } from 'lucide-react'
import { ThinkingOrb } from 'thinking-orbs'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { SkeletonChatMessages } from '@/components/layout/dashboard-skeletons'
import type { AssistantChatSummary } from '@/lib/data/assistant-chats'
import { loadAssistantChat, removeAssistantChat } from './actions'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function formatChatTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60_000)

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function AssistantClient({
  initialChats,
  migrationRequired = false,
}: {
  initialChats: AssistantChatSummary[]
  migrationRequired?: boolean
}) {
  const [chats, setChats] = useState<AssistantChatSummary[]>(initialChats)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isLoadingChat, setIsLoadingChat] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const hasConversation = messages.length > 0
  const canSend = input.trim().length > 0 && !isThinking && !isStreaming && !isLoadingChat

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [messages, isThinking])

  function startNewChat() {
    setActiveChatId(null)
    setMessages([])
    setInput('')
    setErrorMessage(null)
  }

  async function selectChat(chatId: string) {
    if (chatId === activeChatId || isThinking || isStreaming) return

    setIsLoadingChat(true)
    setErrorMessage(null)

    const result = await loadAssistantChat(chatId)
    setIsLoadingChat(false)

    if ('error' in result) {
      setErrorMessage(result.error)
      return
    }

    setActiveChatId(chatId)
    setMessages(
      result.messages.map((message) => ({
        role: message.role,
        content: message.content,
      }))
    )
  }

  async function handleDeleteChat(chatId: string) {
    const result = await removeAssistantChat(chatId)
    if ('error' in result) {
      setErrorMessage(result.error)
      return
    }

    setChats((prev) => prev.filter((chat) => chat.id !== chatId))
    if (activeChatId === chatId) {
      startNewChat()
    }
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || isThinking || isStreaming || isLoadingChat) return

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
        body: JSON.stringify({
          chatId: activeChatId ?? undefined,
          message: text,
        }),
      })
    } catch {
      setIsThinking(false)
      setErrorMessage('The assistant could not respond. Please try again.')
      return
    }

    const responseChatId = response.headers.get('X-Chat-Id')

    if (!response.ok || !response.body) {
      setIsThinking(false)
      const body = await response.json().catch(() => null)
      setErrorMessage(body?.error ?? 'The assistant could not respond. Please try again.')
      return
    }

    if (responseChatId && !activeChatId) {
      setActiveChatId(responseChatId)
      setChats((prev) => [
        {
          id: responseChatId,
          title: text.length > 60 ? `${text.slice(0, 57)}...` : text,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ...prev,
      ])
    } else if (responseChatId && activeChatId) {
      setChats((prev) =>
        prev
          .map((chat) =>
            chat.id === activeChatId
              ? { ...chat, updatedAt: new Date().toISOString() }
              : chat
          )
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      )
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

  return (
    <div className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col gap-3">
      {migrationRequired && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          Chat history is not available yet — the database migration for assistant chats has not
          been applied. Run{' '}
          <code className="rounded bg-background/60 px-1 py-0.5 text-xs">npx supabase db push</code>{' '}
          (or apply migration{' '}
          <code className="rounded bg-background/60 px-1 py-0.5 text-xs">
            00000000000035_assistant_chats.sql
          </code>{' '}
          in the Supabase SQL editor), then refresh this page.
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4">
      <aside className="flex w-56 shrink-0 flex-col gap-2 border-r pr-3">
        <Button
          type="button"
          variant="outline"
          className="justify-start gap-2"
          onClick={startNewChat}
        >
          <MessageSquarePlus className="size-4" />
          New chat
        </Button>

        <div className="scrollbar-thin flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">No previous chats yet.</p>
          ) : (
            <ul className="space-y-1">
              {chats.map((chat) => {
                const isActive = chat.id === activeChatId
                return (
                  <li key={chat.id}>
                    <div
                      className={cn(
                        'group flex items-center gap-1 rounded-lg border px-2 py-2',
                        isActive
                          ? 'border-border bg-muted'
                          : 'border-transparent hover:bg-muted/60'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => void selectChat(chat.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm font-medium">{chat.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatChatTime(chat.updatedAt)}
                        </p>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="shrink-0 opacity-0 group-hover:opacity-100"
                        aria-label={`Delete ${chat.title}`}
                        onClick={() => void handleDeleteChat(chat.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!hasConversation ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6">
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
        ) : (
          <>
            <div className="scrollbar-none flex-1 overflow-y-auto">
              <div className="flex flex-col gap-4 pb-4">
                {isLoadingChat ? (
                  <SkeletonChatMessages count={4} />
                ) : (
                  messages.map((message, index) => (
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
                ))
                )}

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
          </>
        )}
      </div>
      </div>
    </div>
  )
}
