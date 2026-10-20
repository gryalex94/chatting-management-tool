-- AI chat, selling (utils/aiChat.js, ai/chat/content.js):
--  - ai_content: her content map: what she can sell, each item described precisely
--    (what it is, what's shown, the focus, the setting…) so the AI only offers what
--    really exists and matches it to what he asks for. Price and the lowest price
--    she may go down to.
--  - ai_examples gets selling moments from the agency's analysed chats: offers (with
--    whether they were bought), what came after a buy, and selling turning points
--    (with whether they sold, kept him or lost him).
-- Idempotent, so it is safe to re-run.

create table if not exists public.ai_content (
  id              bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  creator_id      uuid not null references public.creators(id) on delete cascade,
  title           text not null,
  kind            text not null default 'photos' check (kind in ('photos', 'video', 'bundle')),
  amount          integer,                               -- photos in a set
  minutes         numeric(6,1),                          -- video length
  nudity          text not null default 'dressed' check (nudity in ('dressed', 'lingerie', 'implied', 'topless', 'nude', 'explicit')),
  focus           text,                                  -- what the camera is on: legs, feet, chest…
  outfit          text,
  setting         text,                                  -- where: bed, shower, mirror…
  action          text,                                  -- what happens: posing, slow strip, solo with a toy…
  face            boolean not null default true,         -- her face is visible
  tags            text[] not null default '{}',
  description     text not null default '',              -- exactly what's inside, for the AI to match
  price           numeric(8,2) not null,
  min_price       numeric(8,2),                          -- the lowest she may go (discounts)
  notes           text,                                  -- when to offer it, or not
  active          boolean not null default true,
  sort            integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists ai_content_page on public.ai_content (organisation_id, creator_id, sort);
alter table public.ai_content enable row level security;

alter table public.ai_examples add column if not exists kind text not null default 'chat';   -- chat / offer / after_buy / turning
alter table public.ai_examples add column if not exists outcome text;                       -- bought_fast, bought, not_bought, bought_next, sold, kept_him, lost…
alter table public.ai_examples add column if not exists price numeric(8,2);
alter table public.ai_examples add column if not exists offer_what text;                    -- what the PPV promised, in plain words
create index if not exists ai_examples_kind on public.ai_examples (organisation_id, kind);

-- Let the API see the change straight away.
notify pgrst, 'reload schema';
