-- Payment snapshot on café orders

alter table public.orders add column if not exists paid numeric not null default 0;
alter table public.orders add column if not exists change_given numeric not null default 0;
