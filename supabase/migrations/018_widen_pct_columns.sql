-- Percentage columns were DECIMAL(5,2), capping at 999.99. Infloww legitimately
-- exports values above that — e.g. a "Renew on %" of 1353.57% on a free page,
-- where fans-with-renew-on is measured against a different denominator than
-- active fans. A single such cell aborted the whole creator-statistics upload
-- with an opaque "numeric field overflow", losing every other row in the file.
--
-- Widen to DECIMAL(10,2) so real exported values always store.
ALTER TABLE creator_daily_stats ALTER COLUMN renew_on_pct     TYPE DECIMAL(10,2);
ALTER TABLE creator_daily_stats ALTER COLUMN contribution_pct TYPE DECIMAL(10,2);
ALTER TABLE creator_daily_stats ALTER COLUMN of_ranking       TYPE DECIMAL(10,2);
