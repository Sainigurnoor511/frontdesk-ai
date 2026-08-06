alter table agents add column if not exists llm_model text not null default 'gemini-3-flash';
alter table agents add column if not exists reasoning_effort text not null default 'minimal';
alter table agents add column if not exists filter_background_speech boolean not null default false;
alter table agents add column if not exists skip_knowledge_retrieval boolean not null default false;
alter table agents add column if not exists allow_dtmf boolean not null default false;
alter table agents add column if not exists hold_sound text;
alter table agents add column if not exists typing_sound_enabled boolean not null default true;
alter table agents add column if not exists secure_mode boolean not null default false;
alter table agents add column if not exists identity_verification_enabled boolean not null default false;

alter table agents drop constraint if exists agents_reasoning_effort_check;
alter table agents add constraint agents_reasoning_effort_check
  check (reasoning_effort in ('minimal', 'low', 'medium', 'high'));
