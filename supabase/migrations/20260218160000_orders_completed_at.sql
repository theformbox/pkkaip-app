-- When kitchen marks an order ready
alter table public.orders add column if not exists completed_at timestamptz;
