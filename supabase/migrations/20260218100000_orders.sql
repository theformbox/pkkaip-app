-- Café POS orders (kitchen display + admin)

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number int not null,
  created_at timestamptz not null default now(),
  status text not null default 'pending',
  total numeric not null default 0,
  items jsonb not null default '[]'::jsonb
);

alter table public.orders add column if not exists status text default 'pending';

alter table public.orders enable row level security;

drop policy if exists "orders_all" on public.orders;
create policy "orders_all" on public.orders for all using (true) with check (true);
