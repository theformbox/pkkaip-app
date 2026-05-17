-- Plants, cafe menu, and logo setting for pkkaip-app (adjust RLS for production)

create table if not exists public.plants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  malay text default '' not null,
  description text default '' not null,
  care text default '' not null,
  uses text default '' not null,
  image text default '' not null
);

create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  emoji text default '🍽️' not null,
  sort_order int not null default 0
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.menu_categories (id) on delete cascade,
  name text not null,
  price numeric not null default 0,
  sort_order int not null default 0
);

create table if not exists public.app_settings (
  key text primary key,
  value text not null
);

alter table public.plants enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "plants_all" on public.plants;
drop policy if exists "menu_categories_all" on public.menu_categories;
drop policy if exists "menu_items_all" on public.menu_items;
drop policy if exists "app_settings_all" on public.app_settings;

create policy "plants_all" on public.plants for all using (true) with check (true);
create policy "menu_categories_all" on public.menu_categories for all using (true) with check (true);
create policy "menu_items_all" on public.menu_items for all using (true) with check (true);
create policy "app_settings_all" on public.app_settings for all using (true) with check (true);
