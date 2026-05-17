-- Drag-order for plants in admin (index persisted as sort_order)
alter table public.plants add column if not exists sort_order int not null default 0;
