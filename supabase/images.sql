-- ============================================================
-- Team13 Restaurant - Cập nhật image_url / avatar_url
-- Chạy SAU seed.sql.
--
-- HIỆN TẠI: toàn bộ image_url đang NULL nên trang user hiện khung trống.
-- File này có 2 section, chỉ chạy 1 trong 2:
--   Section A (mặc định, chạy ngay): ảnh placeholder picsum để demo
--     layout trang user/admin. KHÔNG phải ảnh món thật.
--   Section B (comment, chạy sau): trỏ về Supabase Storage khi team
--     đã upload ảnh thật lên bucket theo đúng tên file quy ước.
-- ============================================================

-- ------------------------------------------------------------
-- Section A: placeholder demo (chạy ngay được)
-- ------------------------------------------------------------
UPDATE dishes SET image_url =
  'https://picsum.photos/seed/' || slug || '/800/600'
WHERE image_url IS NULL;

UPDATE chefs SET avatar_url =
  'https://picsum.photos/seed/chef-' || substr(id::text, 1, 8) || '/400/400'
WHERE avatar_url IS NULL;

UPDATE ingredients SET image_url =
  'https://picsum.photos/seed/ing-' || substr(id::text, 1, 8) || '/400/400'
WHERE image_url IS NULL;

-- Kiểm tra: phải ra 0
-- SELECT (SELECT count(*) FROM dishes WHERE image_url IS NULL) AS dishes_null,
--        (SELECT count(*) FROM chefs WHERE avatar_url IS NULL) AS chefs_null,
--        (SELECT count(*) FROM ingredients WHERE image_url IS NULL) AS ingredients_null;

-- ------------------------------------------------------------
-- Section B: ảnh thật trên Supabase Storage (chạy sau khi upload)
-- Quy ước tên file khi upload trong Dashboard > Storage:
--   bucket dish-images/        <- {slug}.jpg   (vd: pho-bo-dac-biet.jpg)
--   bucket chef-avatars/       <- {slug-chef}.jpg (đặt tay từng chef)
--   bucket ingredient-images/  <- {slug-nl}.jpg
-- Project ref: mjsgkloycpzyhcjdyxwv
-- illustrative example:
-- UPDATE dishes SET image_url =
--   'https://mjsgkloycpzyhcjdyxwv.supabase.co/storage/v1/object/public/dish-images/' || slug || '.jpg';
-- Sau đó kiểm tra lại bằng query Section A (phải ra 0 row NULL
-- chỉ khi mọi món đều đã có file ảnh đúng tên trong bucket).
-- ============================================================
