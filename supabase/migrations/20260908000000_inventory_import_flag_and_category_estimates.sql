-- Applied to project mpkazwsxjorocqajpkao on 2026-09-08.
--
-- Inventory estimate: value stock by category rather than by item, because we
-- do not have a reliable buy-in price per item.
--
-- Two pieces:
--   1. inventory.is_import — per-item origin flag. false (default) = Sweden/EU,
--      true = bought in the UK or anywhere outside the EU.
--   2. category_estimates — one estimated buy-in price per category, split by
--      origin. Its own table rather than columns on `categories`, because
--      `categories` has no UPDATE policy and widening that would also allow
--      renaming and recolouring categories.

alter table public.inventory
  add column if not exists is_import boolean not null default false;

create table if not exists public.category_estimates (
  category_id uuid primary key references public.categories(id) on delete cascade,
  buy_price numeric,
  buy_price_import numeric,
  updated_at timestamptz default now()
);

alter table public.category_estimates enable row level security;

-- Matches the existing public_all_inventory policy: the app authenticates with
-- a single shared staff account, so access is gated at the PIN, not per row.
drop policy if exists "public_all_category_estimates" on public.category_estimates;
create policy "public_all_category_estimates" on public.category_estimates
  for all to public using (true) with check (true);

create index if not exists inventory_is_import_idx on public.inventory (is_import);
