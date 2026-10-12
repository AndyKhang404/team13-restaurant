-- ============================================================
-- Team13 Restaurant - Supabase Storage cho ảnh món ăn / chef
-- Chạy SAU schema.sql. Tạo 3 bucket public + policy đọc public,
-- chỉ authenticated mới được upload/sửa/xóa (trang admin).
-- Supabase Dashboard > SQL Editor > New Query > paste > Run
-- Sau đó upload ảnh trong Dashboard > Storage, copy URL vào
-- cột image_url / avatar_url của các bảng.
-- ============================================================

-- 1. Tạo buckets (idempotent)
INSERT INTO storage.buckets (id, name, public) VALUES
  ('dish-images', 'dish-images', true),
  ('chef-avatars', 'chef-avatars', true),
  ('ingredient-images', 'ingredient-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Policy: public đọc ảnh (trang user không cần login)
DROP POLICY IF EXISTS "public read images" ON storage.objects;
CREATE POLICY "public read images"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id IN ('dish-images','chef-avatars','ingredient-images'));

-- 3. Policy: admin (authenticated) được upload / sửa / xóa
DROP POLICY IF EXISTS "authenticated upload images" ON storage.objects;
CREATE POLICY "authenticated upload images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('dish-images','chef-avatars','ingredient-images'));

DROP POLICY IF EXISTS "authenticated update images" ON storage.objects;
CREATE POLICY "authenticated update images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('dish-images','chef-avatars','ingredient-images'));

DROP POLICY IF EXISTS "authenticated delete images" ON storage.objects;
CREATE POLICY "authenticated delete images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('dish-images','chef-avatars','ingredient-images'));
