-- Store the raw PPV / spender counts the message engine already computes, so the
-- per-chatter "Per-Page Contribution" table (Golden ratio, Unlock, Fan CVR) can be
-- built from the Message Dashboard alone — making the separate Employee Report
-- upload redundant. Idempotent.

ALTER TABLE chatter_daily_metrics ADD COLUMN IF NOT EXISTS ppvs_sent INT;
ALTER TABLE chatter_daily_metrics ADD COLUMN IF NOT EXISTS ppvs_unlocked INT;
ALTER TABLE chatter_daily_metrics ADD COLUMN IF NOT EXISTS fans_who_spent INT;
