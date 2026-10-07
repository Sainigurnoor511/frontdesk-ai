'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { Monitor, MessageCircle, Phone, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import type { Conversation } from '@/lib/data/conversations'
import { CallAudioPlayer } from '@/components/conversations/call-audio-player'
import { SkeletonRecordingPlayer } from '@/components/layout/dashboard-skeletons'
import {
  formatChannelLabel,
  formatConversationDate,
  formatEndedReason,
  isVoiceConversation,
  resolveDisplayCallGoals,
} from '@/lib/conversations/display'
import { getActiveTranscriptIndex } from '@/lib/conversations/transcript-playback'
import { getRecordingUrl } from '@/app/(dashboard)/conversations/actions'

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}:${remaining.toString().padStart(2, '0')}`
}

function ChannelTypeBadge({ channel }: { channel: Conversation['channel'] }) {
  const Icon =
    channel === 'phone' ? Phone : channel === 'chat' ? MessageCircle : Monitor

  return (
    <Badge
      variant="secondary"
      className="h-6 gap-1 rounded-full border-transparent px-2.5 text-xs font-medium"
    >
      <Icon className="-ms-0.5 size-3.5 shrink-0 opacity-100" />
      {formatChannelLabel(channel)}
    </Badge>
  )
}

function GoalStatusBadge({ status }: { status: Conversation['callGoals'][number]['status'] }) {
  if (status === 'success') {
    return (
      <Badge
        className="h-6 rounded-full border-transparent bg-green-100 px-2.5 text-xs font-medium capitalize text-green-950"
      >
        success
      </Badge>
    )
  }
  if (status === 'failed') {
    return (
      <Badge
        className="h-6 rounded-full border-transparent bg-red-100 px-2.5 text-xs font-medium capitalize text-red-950"
      >
        failed
      </Badge>
    )
  }
  return (
    <Badge
      variant="secondary"
      className="h-6 rounded-full border-transparent px-2.5 text-xs font-medium capitalize text-muted-foreground"
    >
      unknown
    </Badge>
  )
}

const overviewCardClass =
  'rounded-xl bg-background shadow-sm md:rounded-none md:bg-transparent md:shadow-none'

function OverviewMetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0 md:px-0"
    >
      <p className="text-xs font-medium text-foreground md:text-sm">{label}</p>
      <div className="text-right">{children}</div>
    </div>
  )
}

export function ConversationDetailSheet({
  conversation,
  open,
  onOpenChange,
}: {
  conversation: Conversation | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [detailTab, setDetailTab] = useState('overview')
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null)
  const [recordingLoading, setRecordingLoading] = useState(false)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [seekTarget, setSeekTarget] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [, startTransition] = useTransition()
  const prevActiveIndexRef = useRef(-1)

  const agentLabel = conversation?.agentName ?? 'Receptionist'
  const displayGoals = conversation ? resolveDisplayCallGoals(conversation) : []
  const achievedCount = displayGoals.filter((g) => g.status === 'success').length
  const activeTranscriptIndex = conversation
    ? getActiveTranscriptIndex(conversation.transcript, playbackTime)
    : -1
  const canSyncTranscript = Boolean(recordingUrl) && isVoiceConversation(conversation?.channel ?? 'chat')

  useEffect(() => {
    if (!open || !conversation) {
      setRecordingUrl(null)
      setRecordingLoading(false)
      setPlaybackTime(0)
      setSeekTarget(null)
      setIsPlaying(false)
      prevActiveIndexRef.current = -1
      return
    }

    setDetailTab('overview')
    setRecordingUrl(null)
    setPlaybackTime(0)
    setSeekTarget(null)
    setIsPlaying(false)
    prevActiveIndexRef.current = -1

    if (!conversation.recordingPath && !conversation.roomName) {
      setRecordingLoading(false)
      return
    }

    setRecordingLoading(true)
    let cancelled = false

    startTransition(async () => {
      const url = await getRecordingUrl(conversation.id)
      if (!cancelled) {
        setRecordingUrl(url)
        setRecordingLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [open, conversation?.id, conversation?.recordingPath, conversation?.roomName])

  useEffect(() => {
    if (!isPlaying || detailTab !== 'transcription' || activeTranscriptIndex < 0) return
    if (activeTranscriptIndex === prevActiveIndexRef.current) return

    prevActiveIndexRef.current = activeTranscriptIndex
    document
      .getElementById(`transcript-line-${activeTranscriptIndex}`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeTranscriptIndex, detailTab, isPlaying])

  function handleOpenChange(next: boolean) {
    if (!next) {
      setRecordingUrl(null)
      setRecordingLoading(false)
      setDetailTab('overview')
      setPlaybackTime(0)
      setSeekTarget(null)
      setIsPlaying(false)
      prevActiveIndexRef.current = -1
    }
    onOpenChange(next)
  }

  function handleTranscriptSeek(timestampSeconds: number) {
    setSeekTarget(timestampSeconds)
    setPlaybackTime(timestampSeconds)
    prevActiveIndexRef.current = -1
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 data-[side=right]:w-[699.2px]! data-[side=right]:max-w-[699.2px]!"
      >
        {conversation && (
          <>
            <SheetHeader className="shrink-0 border-b px-6 py-5 pr-12">
              <SheetTitle className="text-base font-semibold">
                Conversation with {agentLabel}
              </SheetTitle>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col">
              {isVoiceConversation(conversation.channel) && (
                <div className="shrink-0 px-6 py-4">
                  {recordingLoading ? (
                    <SkeletonRecordingPlayer />
                  ) : (
                    <CallAudioPlayer
                      recordingUrl={recordingUrl}
                      durationSeconds={conversation.durationSeconds}
                      transcript={conversation.transcript}
                      agentName={agentLabel}
                      downloadFilename={`conversation-${conversation.id}${conversation.recordingPath?.endsWith('.ogg') ? '.ogg' : '.mp3'}`}
                      showWaveform
                      onTimeUpdate={setPlaybackTime}
                      onPlayingChange={setIsPlaying}
                      seekToSeconds={seekTarget}
                      onSeekApplied={() => setSeekTarget(null)}
                    />
                  )}
                </div>
              )}

              <Tabs
                value={detailTab}
                onValueChange={setDetailTab}
                className="flex min-h-0 flex-1 flex-col"
              >
                <TabsList
                  variant="line"
                  className="w-full shrink-0 justify-start gap-6 border-b px-6 `*:flex-none"
                >
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="transcription">Transcription</TabsTrigger>
                </TabsList>

                <TabsContent
                  value="overview"
                  className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6 data-[state=inactive]:hidden"
                >
                  <div className="pb-4">
                    {conversation.summary && (
                      <div
                        className={`mb-2 p-4 md:mb-0 md:p-0 md:py-8 ${overviewCardClass}`}
                      >
                        <p className="mb-2 text-xs font-medium text-foreground md:text-sm">
                          Summary
                        </p>
                        <p className="text-xs font-normal text-foreground md:text-sm">
                          {conversation.summary}
                        </p>
                      </div>
                    )}

                    <div className="flex flex-col gap-2 md:contents">
                      <div className={overviewCardClass}>
                        <OverviewMetaRow label="Type">
                          <ChannelTypeBadge channel={conversation.channel} />
                        </OverviewMetaRow>
                        <OverviewMetaRow label="Date">
                          <span className="text-xs font-normal text-foreground md:text-sm">
                            {formatConversationDate(conversation.createdAt)}
                          </span>
                        </OverviewMetaRow>
                        <OverviewMetaRow label="Duration">
                          <span className="text-xs font-normal text-foreground md:text-sm">
                            {formatDuration(conversation.durationSeconds)}
                          </span>
                        </OverviewMetaRow>
                        <OverviewMetaRow label="How the call ended">
                          <p className="max-w-md text-xs font-normal text-muted-foreground md:text-sm">
                            {formatEndedReason(conversation.endedReason)}
                          </p>
                        </OverviewMetaRow>
                      </div>

                      <div className={overviewCardClass}>
                        <div
                          className="flex items-center justify-between border-b border-border px-4 py-3 md:px-0"
                        >
                          <p className="text-xs font-medium text-foreground md:text-sm">
                            Call goals
                          </p>
                          <p className="text-xs font-medium text-foreground md:text-sm">
                            {achievedCount} of {displayGoals.length} achieved
                          </p>
                        </div>
                        {displayGoals.map((goal) => (
                          <div
                            key={goal.name}
                            className="flex flex-col gap-2 border-b border-border px-4 py-3 pl-4 last:border-b-0 md:px-0 md:pl-4"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-foreground md:text-sm">
                                {goal.name}
                              </p>
                              <GoalStatusBadge status={goal.status} />
                            </div>
                            <p className="text-xs font-normal text-foreground md:text-sm">
                              {goal.reasoning}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent
                  value="transcription"
                  className="min-h-0 flex-1 overflow-y-auto px-6 py-4 data-[state=inactive]:hidden"
                >
                  {conversation.transcript.length === 0 ? (
                    <Empty className="border-0 py-10">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <MessageCircle />
                        </EmptyMedia>
                        <EmptyTitle>No transcript available</EmptyTitle>
                        <EmptyDescription>
                          This conversation does not have a transcript yet.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <ul className="space-y-5">
                      {conversation.transcript.map((line, index) => {
                        const isAgent = line.role === 'agent'
                        const isActive = canSyncTranscript && index === activeTranscriptIndex
                        return (
                          <li
                            key={`${line.timestampSeconds}-${index}`}
                            id={`transcript-line-${index}`}
                            className={cn(
                              'flex flex-col gap-1.5',
                              isAgent ? 'items-start' : 'items-end'
                            )}
                          >
                            {isAgent && (
                              <div className="flex items-center gap-2">
                                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                  <Bot className="size-4" />
                                </div>
                                <span className="text-sm font-medium">{agentLabel}</span>
                              </div>
                            )}
                            <button
                              type="button"
                              disabled={!canSyncTranscript}
                              onClick={() => handleTranscriptSeek(line.timestampSeconds)}
                              className={cn(
                                'w-fit max-w-[85%] rounded-xl px-3 py-2.5 text-left text-sm leading-relaxed text-foreground transition-colors',
                                isAgent
                                  ? 'border border-border bg-muted/40'
                                  : 'bg-muted',
                                canSyncTranscript && 'cursor-pointer hover:opacity-90',
                                isActive &&
                                  (isAgent
                                    ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                                    : 'bg-primary/15 ring-2 ring-primary/30')
                              )}
                            >
                              {line.text}
                            </button>
                            <p
                              className={cn(
                                'text-xs text-muted-foreground',
                                isAgent ? 'pl-0' : 'pr-1'
                              )}
                            >
                              {formatDuration(line.timestampSeconds)}
                            </p>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
