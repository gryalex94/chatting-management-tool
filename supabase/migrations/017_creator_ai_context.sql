-- Structured per-page context used when evaluating that page's dialogues.
-- Free-text `ai_instructions` (016) stays as the catch-all; this holds the
-- FACTS about a page in named buckets, so the AI stops raising false flags for
-- things that are simply true of the page (content that exists, a legitimate
-- second account or Telegram group, content we cannot produce).
--
-- Shape: { content_available, content_unavailable, known_platforms,
--          persona, pricing, emoji }  — all optional free-text strings.
ALTER TABLE creators ADD COLUMN IF NOT EXISTS ai_context jsonb;
