-- How close a fan and the creator are (AI chat, Q16 in AI_CHAT_RULES_QUESTIONS.md):
-- what the memory model read from his messages about how he treats her, kept next
-- to his notes and updated with them after each conversation:
--   bond = { warmth: cold | normal | warm | affectionate, why, at }
-- The closeness level itself (new, friendly, flirty, intimate, girlfriend) is
-- worked out for each reply from this plus how long and how often they chat, what
-- he shared, how sexual they have been and what he spends (ai/chat/memory.js).
-- His notes (facts, jsonb) now also carry when he said each thing (said_at) and,
-- for plans, the day it happens (on): no column needed for those.
-- Idempotent, so it is safe to re-run.

alter table public.ai_fan_memory add column if not exists bond jsonb;

notify pgrst, 'reload schema';
