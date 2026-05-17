-- Café inventory: null = unlimited, integer = tracked count (0 = sold out)
alter table public.menu_items add column if not exists stock integer;
