-- Default new conversations to 'unknown' outcome until the call is finalized.
-- 'successful' / 'failed' are written only when the voice worker reaches a
-- terminal state (or a booking/message fails outright).

alter table conversations
  alter column outcome set default 'unknown';

alter table conversations
  drop constraint conversations_outcome_check;

alter table conversations
  add constraint conversations_outcome_check
    check (outcome in ('successful', 'failed', 'unknown'));
