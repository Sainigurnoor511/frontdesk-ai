'use client'

import { useState } from 'react'
import { Plus, ClockCounterClockwise, ArrowUp } from '@phosphor-icons/react/dist/ssr'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

type Message = { role: 'assistant' | 'user'; text: string }

const WELCOME_MESSAGE: Message = {
  role: 'assistant',
  text: "Hi! I'm your personal AI assistant. I can answer your questions about the platform and configure your receptionists. If you need help with anything, just let me know.",
}

export function AssistantPanel({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE])
  const [input, setInput] = useState('')

  // TODO: wire to a real LLM-backed assistant that can read/write org data
  function handleSend() {
    if (!input.trim()) return
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: input },
      {
        role: 'assistant',
        text: "I'm not connected to a real assistant yet, but this is where I'd help you configure your receptionist.",
      },
    ])
    setInput('')
  }

  function handleNewChat() {
    setMessages([WELCOME_MESSAGE])
    setInput('')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="flex-row items-center justify-between gap-2 border-b pb-3">
          <SheetTitle>Assistant</SheetTitle>
          <div className="flex items-center gap-1 pr-8">
            <Button variant="ghost" size="icon-sm" aria-label="New chat" onClick={handleNewChat}>
              <Plus />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Open history">
              <ClockCounterClockwise />
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-4">
          {messages.map((message, i) => (
            <p
              key={i}
              className={
                message.role === 'assistant'
                  ? 'text-sm text-foreground'
                  : 'ml-auto max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm'
              }
            >
              {message.text}
            </p>
          ))}
        </div>

        <div className="flex items-end gap-2 border-t p-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Ask your agent to do anything..."
            rows={1}
            className="max-h-32 flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Button size="icon" aria-label="Send message" disabled={!input.trim()} onClick={handleSend}>
            <ArrowUp />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
