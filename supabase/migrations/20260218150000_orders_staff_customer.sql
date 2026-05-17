-- Optional human-readable fields for admin order history (POS can populate later)
alter table public.orders add column if not exists staff_name text;
alter table public.orders add column if not exists customer_name text;
