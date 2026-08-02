-- Migration 00000000000018 granted anonymous SELECT on all columns of `agents`
-- for booking-page-enabled organizations, via row-level RLS. RLS filters rows,
-- not columns — anonymous callers querying the table directly (e.g. via
-- Supabase's REST API) could read private columns the public booking page
-- never needed: greeting_prompt/personality_notes/additional_instructions
-- (the operator's system prompt) and staff_phone_number (a private escalation
-- number). Column grants are orthogonal to RLS policies; both must pass.

revoke select on agents from anon;
grant select (id, organization_id, name, business_name) on agents to anon;
