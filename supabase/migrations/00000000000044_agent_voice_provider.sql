-- Selects which engine runs a voice call for this agent.
--
-- 'livekit'    — the existing pipeline: LiveKit WebRTC transport, Groq Whisper
--                STT, Groq LLM, Fish Audio TTS, Silero VAD, LiveKit egress
--                recording. Supports every language in `voice-catalog.ts` and
--                per-org cloned voices from `custom_voices`.
-- 'assemblyai' — AssemblyAI's managed Voice Agent API: one WebSocket owning
--                STT + LLM + TTS + turn detection. Recording and transcript
--                come from their Sessions API instead of LiveKit egress, and
--                `voice_id` / `custom_voices` do not apply (AssemblyAI has its
--                own fixed voice set, and only synthesizes en/es/de/fr/pt/it).
--
-- Defaults to 'livekit' so every existing agent keeps its current behavior.
alter table agents
  add column voice_provider text not null default 'livekit'
    check (voice_provider in ('livekit', 'assemblyai'));

-- AssemblyAI's own session id, captured from the `session.ready` event at the
-- start of an AssemblyAI-provider call. It is the only key their
-- `session.completed` webhook carries, so it's how the webhook finds the
-- conversation whose transcript and recording it needs to fill in.
--
-- Nullable: LiveKit calls never set it. Unique so a replayed or spoofed link
-- attempt can't attach one AssemblyAI session to two conversations.
alter table conversations
  add column assemblyai_session_id text;

create unique index conversations_assemblyai_session_id_key
  on conversations (assemblyai_session_id)
  where assemblyai_session_id is not null;
