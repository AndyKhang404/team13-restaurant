-- ============================================================
-- Team13 Restaurant - Verify queries sau khi apply schema + seed
-- Dùng để kiểm tra trong SQL Editor hoặc qua Supabase MCP.
-- Trang user: query 1-3. Trang admin: query 4-6.
-- ============================================================

-- 1. Đếm số lượng từng bảng (kỳ vọng: 5 / 24 / 12 / 32)
SELECT (SELECT count(*) FROM chefs) AS chefs,
       (SELECT count(*) FROM ingredients) AS ingredients,
       (SELECT count(*) FROM dishes) AS dishes,
       (SELECT count(*) FROM dish_ingredients) AS links;

-- 2. Trang USER: danh sách món đang bán + tên đầu bếp
SELECT d.slug, d.name, d.price, d.category, d.is_featured, c.name AS chef
FROM dishes d LEFT JOIN chefs c ON c.id = d.chef_id
WHERE d.is_available = true
ORDER BY d.category, d.price;

-- 3. Trang USER: chi tiết 1 món + nguyên liệu (vd: pho-bo-dac-biet)
SELECT d.name, d.price, i.name AS ingredient, di.quantity, di.unit
FROM dishes d
JOIN dish_ingredients di ON di.dish_id = d.id
JOIN ingredients i ON i.id = di.ingredient_id
WHERE d.slug = 'pho-bo-dac-biet';

-- 4. Trang ADMIN: món + số nguyên liệu của từng món
SELECT d.slug, d.name, count(di.ingredient_id) AS so_nguyen_lieu
FROM dishes d LEFT JOIN dish_ingredients di ON di.dish_id = d.id
GROUP BY d.slug, d.name ORDER BY d.name;

-- 5. Trang ADMIN: nguyên liệu sắp hết kho (< 6000 g/ml)
SELECT name, stock_quantity, unit FROM ingredients
WHERE stock_quantity < 6000 ORDER BY stock_quantity;

-- 6. Kiểm tra RLS đã bật
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('chefs','ingredients','dishes','dish_ingredients');
-- Kỳ vọng: rowsecurity = true cho cả 4 bảng
