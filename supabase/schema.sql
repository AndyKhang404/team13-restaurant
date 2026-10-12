-- ============================================================
-- Team13 Restaurant - Supabase PostgreSQL Schema
-- Models: chefs, ingredients, dishes, dish_ingredients (N-N)
-- Cách dùng: Supabase Dashboard > SQL Editor > New Query > paste file này > Run
-- ============================================================

-- 1. Extension cho gen_random_uuid()
create extension if not exists "pgcrypto";

-- 2. Function tự cập nhật updated_at
create or replace function handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- 3. CHEFS (Đầu bếp)
-- 1 chef nấu nhiều dish
-- ============================================================
create table chefs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar_url text,
  specialty text, -- vd: Mon Au, Sushi, Mon Viet
  bio text,
  experience_years int default 0 check (experience_years >= 0),
  phone text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- 4. INGREDIENTS (Nguyên liệu)
-- ============================================================
create table ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, -- vd: Thit bo, Ca chua
  unit text not null default 'g', -- g, kg, ml, liter, cai, goi
  stock_quantity numeric(10,2) default 0 check (stock_quantity >= 0),
  price_per_unit numeric(12,2) default 0 check (price_per_unit >= 0),
  image_url text,
  is_available boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- 5. DISHES (Món ăn)
-- Mỗi dish thuộc 1 chef (nullable, xóa chef thì set null)
-- ============================================================
create table dishes (
  id uuid primary key default gen_random_uuid(),
  name text not null, -- vd: Pho Bo
  slug text unique not null, -- vd: pho-bo (dùng cho URL trang user)
  description text,
  image_url text,
  price numeric(12,2) not null check (price >= 0),
  category text not null default 'main'
    check (category in ('appetizer','main','dessert','drink','combo')),
  is_available boolean default true,
  is_featured boolean default false, -- hiện ở trang chủ
  prep_time_minutes int check (prep_time_minutes > 0),
  chef_id uuid references chefs(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- 6. DISH_INGREDIENTS (Định lượng N-N)
-- 1 dish gồm nhiều ingredient, 1 ingredient dùng cho nhiều dish
-- ============================================================
create table dish_ingredients (
  dish_id uuid not null references dishes(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  quantity numeric(10,2) not null check (quantity > 0),
  unit text default 'g',
  primary key (dish_id, ingredient_id)
);

-- ============================================================
-- 7. Index cho truy vấn trang user / admin
-- ============================================================
create index idx_dishes_chef on dishes(chef_id);
create index idx_dishes_category on dishes(category);
create index idx_dishes_available on dishes(is_available);
create index idx_dish_ingredients_ingredient on dish_ingredients(ingredient_id);

-- ============================================================
-- 8. Trigger updated_at
-- ============================================================
create trigger trg_chefs_updated before update on chefs
  for each row execute function handle_updated_at();
create trigger trg_ingredients_updated before update on ingredients
  for each row execute function handle_updated_at();
create trigger trg_dishes_updated before update on dishes
  for each row execute function handle_updated_at();

-- ============================================================
-- 9. RLS - Row Level Security
-- Trang user: public đọc không cần login
-- Trang admin: authenticated được CRUD (đồ án để vậy là đủ,
-- production nên check thêm role is_admin)
-- ============================================================
alter table chefs enable row level security;
alter table ingredients enable row level security;
alter table dishes enable row level security;
alter table dish_ingredients enable row level security;

-- Public read
create policy "public read chefs"
  on chefs for select to anon, authenticated using (true);
create policy "public read ingredients"
  on ingredients for select to anon, authenticated using (true);
create policy "public read dishes"
  on dishes for select to anon, authenticated using (true);
create policy "public read dish_ingredients"
  on dish_ingredients for select to anon, authenticated using (true);

-- Authenticated write (admin)
create policy "authenticated write chefs"
  on chefs for all to authenticated using (true) with check (true);
create policy "authenticated write ingredients"
  on ingredients for all to authenticated using (true) with check (true);
create policy "authenticated write dishes"
  on dishes for all to authenticated using (true) with check (true);
create policy "authenticated write dish_ingredients"
  on dish_ingredients for all to authenticated using (true) with check (true);

-- ============================================================
-- 10. Seed mẫu (optional, chạy sau khi tạo bảng)
-- ============================================================
-- insert into chefs (name, specialty) values
-- ('Gordon Ramsay', 'Mon Au'),
-- ('Christine Ha', 'Mon A');
--
-- insert into ingredients (name, unit, stock_quantity) values
-- ('Thit bo', 'g', 5000),
-- ('Banh pho', 'g', 10000);
--
-- insert into dishes (name, slug, price, category, chef_id)
-- select 'Pho Bo', 'pho-bo', 55000, 'main', id from chefs limit 1;
