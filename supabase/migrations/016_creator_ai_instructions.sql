-- Per-page custom AI instructions. Free-text rules the manager writes for a
-- specific creator page (special persona notes, custom do/don'ts, preferred
-- emojis, page-specific content scope). Injected into the chatter evaluations
-- as an extra "special instructions" block for that page's conversations.
ALTER TABLE creators ADD COLUMN IF NOT EXISTS ai_instructions text;
