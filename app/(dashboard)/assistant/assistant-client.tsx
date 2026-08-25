'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { SkeletonChatMessages } from '@/components/layout/dashboard-skeletons'
import { ThinkingOrb } from 'thinking-orbs'
import { Response as MarkdownResponse } from '@/components/ui/response'
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
  const [sidebarOpen, setSidebarOpen] = useState(true)
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
      setErrorMessage(result.error ?? 'Could not load chat. Please try again.')
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
      setErrorMessage(result.error ?? 'Could not delete chat. Please try again.')
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

    let apiResponse: globalThis.Response
    try {
      apiResponse = await fetch('/api/assistant', {
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

    const responseChatId = apiResponse.headers.get('X-Chat-Id')

    if (!apiResponse.ok || !apiResponse.body) {
      setIsThinking(false)
      const body = await apiResponse.json().catch(() => null)
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

    const reader = apiResponse.body.getReader()
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
    <div className="flex h-[124.4px] w-full flex-col gap-2 rounded-3xl border border-border bg-background p-3 shadow-[0px_4px_12px_0px_rgba(0,0,0,0.06),0px_0px_1px_0px_rgba(0,0,0,0.30)]">
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
        className="flex-1 resize-none bg-transparent px-1.5 pt-1 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
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
    <div className="flex h-full min-h-0 flex-1">
      {migrationRequired && (
        <div className="absolute inset-x-0 top-0 z-20 border-b border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          Chat history is not available yet — apply migration{' '}
          <code className="rounded bg-background/60 px-1 py-0.5 text-xs">
            00000000000035_assistant_chats.sql
          </code>{' '}
          then refresh.
        </div>
      )}

      <aside
        className={cn(
          'flex shrink-0 flex-col border-r border-border/80 bg-muted/20 transition-[width] duration-200 ease-in-out',
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden border-r-0'
        )}
      >
        <div className="flex flex-col gap-2 p-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 justify-start gap-2 rounded-lg border-border/80 bg-background shadow-none"
            onClick={startNewChat}
          >
            <MessageSquarePlus className="size-4" />
            New chat
          </Button>
        </div>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-2">
          {chats.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">No previous chats yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {chats.map((chat) => {
                const isActive = chat.id === activeChatId
                return (
                  <li key={chat.id}>
                    <div
                      className={cn(
                        'group flex items-center gap-1 rounded-lg px-2 py-2 transition-colors',
                        isActive
                          ? 'bg-background shadow-sm'
                          : 'hover:bg-background/70'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => void selectChat(chat.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm text-foreground">{chat.title}</p>
                        <p className="text-[11px] text-muted-foreground">
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

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            onClick={() => setSidebarOpen((open) => !open)}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
          </Button>
          <span className="text-sm font-medium text-foreground">Assistant</span>
        </header>

        {!hasConversation ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 pb-8">
            <div className="text-center">
              <h1 className="font-heading text-3xl font-semibold tracking-tight">
                How can I help you today?
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Ask questions about your business, receptionist, or the platform.
              </p>
            </div>
            <div className="w-full max-w-2xl">{composer}</div>
            {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
          </div>
        ) : (
          <>
            <div className="scrollbar-thin flex-1 overflow-y-auto">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
                {isLoadingChat ? (
                  <SkeletonChatMessages count={4} />
                ) : (
                  messages.map((message, index) => (
                    <div
                      key={index}
                      className={cn(
                        'flex w-full',
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {message.role === 'user' ? (
                        <div className="max-w-[85%] rounded-[22px] bg-muted px-4 py-2.5 text-sm leading-relaxed text-foreground">
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        </div>
                      ) : (
                        <div className="max-w-[85%] text-sm leading-relaxed text-foreground">
                          {message.content ? (
                            <MarkdownResponse>{message.content}</MarkdownResponse>
                          ) : isStreaming && index === messages.length - 1 ? (
                            <ThinkingOrb state="composing" size={64} />
                          ) : null}
                        </div>
                      )}
                    </div>
                  ))
                )}

                {isThinking && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ThinkingOrb state="composing" size={64} />
                    Thinking...
                  </div>
                )}

                {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

                <div ref={bottomRef} />
              </div>
            </div>

            <div className="shrink-0 border-t border-border/60 bg-background px-4 py-4">
              <div className="mx-auto w-full max-w-3xl">{composer}</div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
