-- Pages stay separate per platform: each page (OnlyFans, Fanvue or Fansly) has its own
-- creator profile (ai_personas, keyed by the page). Two pages share one only when a
-- manager links them: profile_from names the page whose profile this page uses (the same
-- creator on two platforms). Empty: the page's own. No foreign key on purpose: a second
-- key from creators to creators would make creators(...) embeds ambiguous.
-- Replaces fansly_accounts.ai_creator_id (borrowing any page's profile), cleared here.
-- Idempotent, so it is safe to re-run.
alter table public.creators add column if not exists profile_from uuid;
update public.fansly_accounts set ai_creator_id = null where ai_creator_id is not null;
notify pgrst, 'reload schema';
