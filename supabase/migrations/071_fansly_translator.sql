-- The translator in the Fansly side panel: each fan message's language and its English, kept once
-- translated (never paid for twice), and the language to answer a fan in when a chatter sets one.
-- Idempotent, so it is safe to re-run.

alter table public.fansly_messages add column if not exists lang text;          -- ISO 639-1 ('es', 'de', …); 'en'; 'und' (emoji, "ok", too short)
alter table public.fansly_messages add column if not exists text_en text;       -- the English, when not English
alter table public.fansly_fans add column if not exists reply_lang text;        -- set by a chatter; empty: his own language, from his messages
