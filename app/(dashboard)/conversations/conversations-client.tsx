'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  ChatCircle,
  ChatsCircle,
  Phone,
  Globe,
  MagnifyingGlass,
  ChatText,
  Clock,
  ArrowSquareOut,
  Waveform,
  Robot,
  User,
  EnvelopeSimple,
  CheckCircle,
  XCircle,
  Trash,
  UserPlus,
} from '@phosphor-icons/react/dist/ssr'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import type { Conversation, CallerMessage } from '@/lib/data/conversations'
import {
  markMessageAsRead,
  markAllMessagesAsRead,
  deleteMessage,
  createContactFromMessage,
} from './actions'

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  const diffSeconds = Math.round(diffMs / 1000)
  const diffMinutes = Math.round(diffSeconds / 60)
  const diffHours = Math.round(diffMinutes / 60)
  const diffDays = Math.round(diffHours / 24)

  if (diffSeconds < 60) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}:${remaining.toString().padStart(2, '0')}`
}

function ChannelIcon({ channel }: { channel: Conversation['channel'] }) {
  if (channel === 'phone') return <Phone className="size-4 text-muted-foreground" />
  if (channel === 'chat') return <ChatCircle className="size-4 text-muted-foreground" />
  return <Globe className="size-4 text-muted-foreground" />
}

function conversationTitle(conversation: Conversation): string {
  if (conversation.summary) {
    const firstSentence = conversation.summary.split(/(?<=[.!?])\s/)[0]
    if (firstSentence.length <= 60) return firstSentence
    return `${firstSentence.slice(0, 57)}...`
  }
  return conversation.channel === 'phone' ? 'Call' : 'Conversation'
}

function FilterChip({ label }: { label: string }) {
  return (
    <Button variant="outline" size="sm" className="text-muted-foreground">
      {label}
    </Button>
  )
}

export function ConversationsClient({
  conversations,
  messages,
}: {
  conversations: Conversation[]
  messages: CallerMessage[]
}) {
  const [tab, setTab] = useState('conversations')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [detailTab, setDetailTab] = useState('overview')
  const [messageList, setMessageList] = useState(messages)
  const [isPending, startTransition] = useTransition()

  const unreadCount = messageList.filter((m) => !m.isRead).length

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return conversations
    return conversations.filter((c) =>
      [c.summary ?? '', c.category ?? '', conversationTitle(c)]
        .join(' ')
        .toLowerCase()
        .includes(query)
    )
  }, [conversations, search])

  function handleMarkAsRead(id: string) {
    setMessageList((prev) => prev.map((m) => (m.id === id ? { ...m, isRead: true } : m)))
    startTransition(async () => {
      await markMessageAsRead(id)
    })
  }

  function handleMarkAllAsRead() {
    setMessageList((prev) => prev.map((m) => ({ ...m, isRead: true })))
    startTransition(async () => {
      await markAllMessagesAsRead()
    })
  }

  function handleDelete(id: string) {
    setMessageList((prev) => prev.filter((m) => m.id !== id))
    startTransition(async () => {
      await deleteMessage(id)
    })
  }

  function handleCreateContact(id: string) {
    startTransition(async () => {
      const result = await createContactFromMessage(id)
      if ('success' in result) {
        setMessageList((prev) =>
          prev.map((m) => (m.id === id ? { ...m, isRead: true } : m))
        )
      }
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Conversations</h1>
        <p className="mt-1 text-sm font-normal text-[#96989d]">
          Review call transcripts, summaries, and messages left by callers.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="conversations">Conversations</TabsTrigger>
          <TabsTrigger value="messages" className="gap-1.5">
            Messages
            {unreadCount > 0 && (
              <Badge variant="secondary" className="h-4 px-1.5">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conversations" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-sm flex-1 min-w-[200px]">
              <MagnifyingGlass className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search conversations"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {/* TODO: wire these filters up to real query params / server-side filtering. */}
          <div className="flex flex-wrap gap-2">
            <FilterChip label="Date after" />
            <FilterChip label="Date before" />
            <FilterChip label="Outcome" />
            <FilterChip label="Conversation status" />
            <FilterChip label="Channel" />
          </div>

          <Card>
            <CardContent className="p-0">
              {filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                  <ChatsCircle className="h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">No conversations yet</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Calls and chats with your receptionist will show up here.
                  </p>
                </div>
              ) : (
                <ul className="divide-y">
                  {filteredConversations.map((conversation) => (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(conversation)
                          setDetailTab('overview')
                        }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                      >
                        <ChannelIcon channel={conversation.channel} />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium">
                              {conversationTitle(conversation)}
                            </p>
                            <Badge
                              variant={
                                conversation.outcome === 'successful'
                                  ? 'default'
                                  : 'destructive'
                              }
                              className={
                                conversation.outcome === 'successful'
                                  ? 'bg-green-600 text-white [a]:hover:bg-green-600/80'
                                  : ''
                              }
                            >
                              {conversation.outcome === 'successful'
                                ? 'Successful'
                                : 'Failed'}
                            </Badge>
                            {conversation.category && (
                              <Badge variant="secondary">{conversation.category}</Badge>
                            )}
                          </div>
                          {conversation.summary && (
                            <p className="truncate text-sm text-muted-foreground">
                              {conversation.summary}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <ChatText className="size-3.5" />
                            {conversation.transcript.length}
                          </span>
                          <span>{formatRelativeTime(conversation.createdAt)}</span>
                          <span className="flex items-center gap-1">
                            <Clock className="size-3.5" />
                            {formatDuration(conversation.durationSeconds)}
                          </span>
                          <ArrowSquareOut className="size-4" />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages" className="space-y-4 pt-4">
          {messageList.length > 0 && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllAsRead}
                disabled={isPending || unreadCount === 0}
              >
                Mark all as read
              </Button>
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              {messageList.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                  <EnvelopeSimple className="h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">No messages yet</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Messages callers leave for you will show up here.
                  </p>
                </div>
              ) : (
                <ul className="divide-y">
                  {messageList.map((message) => (
                    <li key={message.id} className="space-y-2 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {!message.isRead && (
                            <span className="size-2 shrink-0 rounded-full bg-primary" />
                          )}
                          <p className="font-medium">
                            {message.callerName ?? 'Unknown caller'}
                          </p>
                          {message.callerPhone && (
                            <a
                              href={`tel:${message.callerPhone}`}
                              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                            >
                              {message.callerPhone}
                            </a>
                          )}
                          <Badge variant="secondary">shared by caller</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(message.createdAt)}
                        </span>
                      </div>

                      {message.summary && (
                        <p className="text-sm text-muted-foreground">{message.summary}</p>
                      )}

                      {message.quotedLine && (
                        <p className="border-l-2 pl-3 text-sm italic text-muted-foreground">
                          &ldquo;{message.quotedLine}&rdquo;
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending || Boolean(message.convertedToClientId)}
                          onClick={() => handleCreateContact(message.id)}
                        >
                          <UserPlus />
                          {message.convertedToClientId
                            ? 'Contact created'
                            : 'Create contact'}
                        </Button>
                        {!message.isRead && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleMarkAsRead(message.id)}
                          >
                            Mark as read
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleDelete(message.id)}
                        >
                          <Trash />
                          Delete message
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          {selected && (
            <div className="flex h-full flex-col">
              <SheetHeader>
                <SheetTitle>Conversation with Receptionist</SheetTitle>
                <SheetDescription>
                  {new Date(selected.createdAt).toLocaleString()}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
                {/* TODO: real audio playback - no recording storage yet, this is a static placeholder. */}
                <div className="flex h-16 items-center justify-center gap-0.5 rounded-lg bg-muted px-4">
                  <Waveform className="size-8 text-muted-foreground" />
                  <div className="flex flex-1 items-center gap-0.5">
                    {Array.from({ length: 40 }).map((_, i) => (
                      <span
                        key={i}
                        className="w-1 rounded-full bg-muted-foreground/30"
                        style={{ height: `${8 + ((i * 7) % 24)}px` }}
                      />
                    ))}
                  </div>
                </div>

                <Tabs value={detailTab} onValueChange={setDetailTab}>
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="transcription">Transcription</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-4 pt-4">
                    {selected.summary && (
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Summary</p>
                        <p className="text-sm text-muted-foreground">
                          {selected.summary}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="space-y-1">
                        <p className="font-medium">Type</p>
                        <p className="text-muted-foreground capitalize">
                          {selected.channel.replace('_', ' ')}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium">Date</p>
                        <p className="text-muted-foreground">
                          {new Date(selected.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium">Duration</p>
                        <p className="text-muted-foreground">
                          {formatDuration(selected.durationSeconds)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium">How the call ended</p>
                        <p className="text-muted-foreground">
                          {selected.endedReason ?? 'Unknown'}
                        </p>
                      </div>
                    </div>

                    {selected.callGoals.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Call goals</p>
                        <ul className="space-y-2">
                          {selected.callGoals.map((goal, i) => (
                            <li
                              key={i}
                              className="space-y-1 rounded-lg border p-3 text-sm"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-medium">{goal.name}</p>
                                <Badge
                                  variant={
                                    goal.status === 'success' ? 'default' : 'destructive'
                                  }
                                  className={
                                    goal.status === 'success'
                                      ? 'bg-green-600 text-white [a]:hover:bg-green-600/80'
                                      : ''
                                  }
                                >
                                  {goal.status === 'success' ? (
                                    <CheckCircle />
                                  ) : (
                                    <XCircle />
                                  )}
                                  {goal.status === 'success' ? 'Success' : 'Failed'}
                                </Badge>
                              </div>
                              <p className="text-muted-foreground">{goal.reasoning}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="transcription" className="pt-4">
                    {selected.transcript.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        No transcript available for this conversation.
                      </p>
                    ) : (
                      <ul className="space-y-3">
                        {selected.transcript.map((message, i) => (
                          <li
                            key={i}
                            className={`flex items-end gap-2 ${
                              message.role === 'caller' ? 'flex-row-reverse' : ''
                            }`}
                          >
                            {message.role === 'agent' && (
                              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
                                <Robot className="size-3.5 text-muted-foreground" />
                              </span>
                            )}
                            {message.role === 'caller' && (
                              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
                                <User className="size-3.5 text-muted-foreground" />
                              </span>
                            )}
                            <div
                              className={`max-w-[75%] space-y-1 ${
                                message.role === 'caller' ? 'text-right' : ''
                              }`}
                            >
                              <div
                                className={`rounded-lg px-3 py-2 text-sm ${
                                  message.role === 'caller'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted'
                                }`}
                              >
                                {message.text}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {formatDuration(message.timestampSeconds)}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
