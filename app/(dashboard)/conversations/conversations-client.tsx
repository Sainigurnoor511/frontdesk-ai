'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import {
  MessageCircle,
  MessagesSquare,
  Phone,
  Globe,
  Search,
  MessageSquareText,
  Clock,
  SquareArrowOutUpRight,
  ChevronDown,
  Mail,
  Trash,
  UserPlus,
  CalendarArrowDown,
  CalendarArrowUp,
  Target,
  Eye,
  Radio,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { DateFilterButton, FilterMenuButton } from '@/components/layout/filter-menu-button'
import {
  isOnOrAfterFilterDate,
  isOnOrBeforeFilterDate,
  parseFilterDateInput,
} from '@/lib/conversations/date-filters'
import type { Conversation, CallerMessage } from '@/lib/data/conversations'
import {
  markMessageAsRead,
  markAllMessagesAsRead,
  markAllConversationsAsRead,
  deleteMessage,
  createContactFromMessage,
} from './actions'
import { ConversationStatusBadge } from '@/components/conversations/conversation-status-badge'

const ConversationDetailSheet = dynamic(
  () =>
    import('@/components/conversations/conversation-detail-sheet').then(
      (module) => module.ConversationDetailSheet
    ),
  { ssr: false }
)

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
  if (channel === 'chat') return <MessageCircle className="size-4 text-muted-foreground" />
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

export function ConversationsClient({
  conversations,
  messages,
}: {
  conversations: Conversation[]
  messages: CallerMessage[]
}) {
  const [tab, setTab] = useState('conversations')
  const [search, setSearch] = useState('')
  const [dateAfter, setDateAfter] = useState<string | null>(null)
  const [dateBefore, setDateBefore] = useState<string | null>(null)
  const [outcomeFilter, setOutcomeFilter] = useState<Conversation['outcome'] | null>(null)
  const [readFilter, setReadFilter] = useState<'read' | 'unread' | null>(null)
  const [channelFilter, setChannelFilter] = useState<Conversation['channel'] | null>(null)
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [messageList, setMessageList] = useState(messages)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    startTransition(async () => {
      const result = await markAllConversationsAsRead()
      if (result && 'error' in result) {
        toast.error(result.error)
      }
    })
  }, [])

  function setDateAfterSafe(value: string | null) {
    if (value && dateBefore && parseFilterDateInput(value) > parseFilterDateInput(dateBefore)) {
      toast.error('Date after must be on or before date before.')
      return
    }
    setDateAfter(value)
  }

  function setDateBeforeSafe(value: string | null) {
    if (value && dateAfter && parseFilterDateInput(dateAfter) > parseFilterDateInput(value)) {
      toast.error('Date after must be on or before date before.')
      return
    }
    setDateBefore(value)
  }

  const unreadCount = messageList.filter((m) => !m.isRead).length

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase()
    return conversations.filter((c) => {
      if (query) {
        const haystack = [c.summary ?? '', c.category ?? '', conversationTitle(c)]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(query)) return false
      }

      if (dateAfter && !isOnOrAfterFilterDate(c.createdAt, dateAfter)) return false

      if (dateBefore && !isOnOrBeforeFilterDate(c.createdAt, dateBefore)) return false

      if (outcomeFilter && c.outcome !== outcomeFilter) return false
      if (readFilter === 'read' && !c.isRead) return false
      if (readFilter === 'unread' && c.isRead) return false
      if (channelFilter && c.channel !== channelFilter) return false

      return true
    })
  }, [
    conversations,
    search,
    dateAfter,
    dateBefore,
    outcomeFilter,
    readFilter,
    channelFilter,
  ])

  function openConversation(conversation: Conversation) {
    setSelected(conversation)
  }

  function handleMarkAsRead(id: string) {
    setMessageList((prev) => prev.map((m) => (m.id === id ? { ...m, isRead: true } : m)))
    startTransition(async () => {
      const result = await markMessageAsRead(id)
      if ('error' in result) toast.error(result.error)
    })
  }

  function handleMarkAllAsRead() {
    setMessageList((prev) => prev.map((m) => ({ ...m, isRead: true })))
    startTransition(async () => {
      const result = await markAllMessagesAsRead()
      if ('error' in result) toast.error(result.error)
    })
  }

  function handleDelete(id: string) {
    setMessageList((prev) => prev.filter((m) => m.id !== id))
    startTransition(async () => {
      const result = await deleteMessage(id)
      if ('error' in result) toast.error(result.error)
    })
  }

  function handleCreateContact(id: string) {
    startTransition(async () => {
      const result = await createContactFromMessage(id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setMessageList((prev) =>
        prev.map((m) => (m.id === id ? { ...m, isRead: true } : m))
      )
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Conversations</h1>
        <p className="mt-1 text-sm font-normal text-[#96989d]">
          Review calls and chats, and follow up on requests your receptionist could not complete.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="w-full justify-start gap-1 border-b [&>*]:flex-none">
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
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search conversations"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <DateFilterButton
              icon={CalendarArrowDown}
              label="Date after"
              active={dateAfter !== null}
              value={dateAfter}
              onChange={setDateAfterSafe}
              inputId="conv-date-after"
            />

            <DateFilterButton
              icon={CalendarArrowUp}
              label="Date before"
              active={dateBefore !== null}
              value={dateBefore}
              onChange={setDateBeforeSafe}
              inputId="conv-date-before"
            />

            <FilterMenuButton icon={Target} label="Outcome" active={outcomeFilter !== null}>
              <DropdownMenuItem onClick={() => setOutcomeFilter(null)}>All outcomes</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setOutcomeFilter('successful')}>
                Successful
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setOutcomeFilter('failed')}>Failed</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setOutcomeFilter('unknown')}>Unknown</DropdownMenuItem>
            </FilterMenuButton>

            <FilterMenuButton icon={Eye} label="Status" active={readFilter !== null}>
              <DropdownMenuItem onClick={() => setReadFilter(null)}>All conversations</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setReadFilter('unread')}>Unread</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setReadFilter('read')}>Read</DropdownMenuItem>
            </FilterMenuButton>

            <FilterMenuButton icon={Radio} label="Channel" active={channelFilter !== null}>
              <DropdownMenuItem onClick={() => setChannelFilter(null)}>All channels</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setChannelFilter('voice_web')}>
                Voice chat on website
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setChannelFilter('phone')}>Phone call</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setChannelFilter('chat')}>
                Text chat on website
              </DropdownMenuItem>
            </FilterMenuButton>
          </div>

          <Card>
            <CardContent className="p-0">
              {filteredConversations.length === 0 ? (
                <Empty className="border-0 py-10">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <MessagesSquare />
                    </EmptyMedia>
                    <EmptyTitle>
                      {conversations.length === 0 ? 'No conversations yet' : 'No matching conversations'}
                    </EmptyTitle>
                    <EmptyDescription>
                      {conversations.length === 0
                        ? 'Calls and chats with your receptionist will show up here.'
                        : 'Try adjusting your filters or search term.'}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul className="divide-y">
                  {filteredConversations.map((conversation) => {
                    const isExpanded = expandedId === conversation.id
                    return (
                      <li key={conversation.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : conversation.id)
                          }
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                        >
                          <ChannelIcon channel={conversation.channel} />
                          {!conversation.isRead && (
                            <span className="size-2 shrink-0 rounded-full bg-primary" />
                          )}
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-medium">
                                {conversationTitle(conversation)}
                              </p>
                              <ConversationStatusBadge outcome={conversation.outcome} />
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
                              <MessageSquareText className="size-3.5" />
                              {conversation.transcript.length}
                            </span>
                            <span>{formatRelativeTime(conversation.createdAt)}</span>
                            <span className="flex items-center gap-1">
                              <Clock className="size-3.5" />
                              {formatDuration(conversation.durationSeconds)}
                            </span>
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation()
                                openConversation(conversation)
                              }}
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter' && e.key !== ' ') return
                                e.stopPropagation()
                                e.preventDefault()
                                openConversation(conversation)
                              }}
                              className="rounded p-0.5 hover:text-foreground"
                            >
                              <SquareArrowOutUpRight className="size-4" />
                            </span>
                            <ChevronDown
                              className={`size-4 transition-transform ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                            />
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="space-y-3 border-t bg-muted/30 px-4 py-3 pl-11 text-sm">
                            <div className="flex flex-wrap gap-x-6 gap-y-2">
                              <div className="space-y-0.5">
                                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                  Started
                                </p>
                                <p>{new Date(conversation.createdAt).toLocaleString()}</p>
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                  Duration
                                </p>
                                <p>{formatDuration(conversation.durationSeconds)}</p>
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                  Messages
                                </p>
                                <p>{conversation.transcript.length}</p>
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                  Receptionist
                                </p>
                                <p>{conversation.agentName ?? 'Receptionist Agent'}</p>
                              </div>
                            </div>
                            {conversation.summary && (
                              <p className="text-muted-foreground">{conversation.summary}</p>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages" className="space-y-4 pt-4">
          <p className="text-sm text-muted-foreground">
            When someone leaves your AI receptionist a message — on a call or in chat — it shows
            up here. These are usually requests the caller wanted but the receptionist could not
            finish (for example, booking a slot that was unavailable).
          </p>
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
                <Empty className="border-0 py-10">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Mail />
                    </EmptyMedia>
                    <EmptyTitle>No messages yet</EmptyTitle>
                    <EmptyDescription>
                      When a caller asks for something your receptionist could not complete, the
                      summary will appear here so you can follow up.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
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
                          <Badge variant="secondary">Unresolved request</Badge>
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

      <ConversationDetailSheet
        conversation={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      />
    </div>
  )
}
