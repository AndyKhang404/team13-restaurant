-- ============================================================
-- Team13 Restaurant - Seed data demo
-- 5 chefs, ~24 ingredients, 12 dishes + dinh luong
-- Chạy SAU schema.sql, chỉ chạy 1 lần (hoặc chạy lại vẫn an toàn
-- vì block cleanup bên dưới sẽ xóa đúng các row demo trước khi insert)
-- Supabase Dashboard > SQL Editor > New Query > paste file này > Run
-- ============================================================

-- ------------------------------------------------------------
-- 0. Cleanup idempotent (chỉ xóa data demo, an toàn chạy lại)
-- ------------------------------------------------------------
DELETE FROM dishes WHERE slug IN (
  'goi-cuon-tom-thit','sup-bi-do','pho-bo-dac-biet','com-tam-suon-bi-cha',
  'bo-bit-tet-sot-tieu-den','mi-y-sot-bo-bam','sushi-tong-hop','pad-thai-tom',
  'banh-tiramisu','banh-flan-caramel','ca-phe-sua-da','tra-dao-cam-sa'
);
DELETE FROM ingredients WHERE name IN (
  N'Thịt bò',N'Bánh phở',N'Hành lá',N'Rau thơm',N'Xương bò',N'Sườn heo',
  N'Gạo tấm',N'Trứng gà',N'Tôm sú',N'Bánh tráng',N'Bí đỏ',N'Kem tươi',
  N'Mì Ý spaghetti',N'Thịt heo xay',N'Gạo sushi',N'Rong biển nori',N'Mực ống',
  N'Phô mai Mascarpone',N'Cà phê robusta',N'Sữa đặc',N'Đào ngâm',N'Trà đào túi lọc',
  N'Mì gạo Pad Thái',N'Khoai tây'
);
DELETE FROM chefs WHERE name IN (
  N'Trần Minh Quân',N'Lê Thu Thảo',N'Phạm Đức Anh',N'Christine Hà',N'Nguyễn Hoàng Nam'
);

-- ------------------------------------------------------------
-- 1. CHEFS (5)
-- ------------------------------------------------------------
INSERT INTO chefs (name, specialty, bio, experience_years, phone) VALUES
(N'Trần Minh Quân', N'Món Việt', N'Bếp trưởng 15 năm kinh nghiệm, chuyên phở và cơm tấm.', 15, '0901111111'),
(N'Lê Thu Thảo', N'Món Âu', N'Chuyên bít tết và mì Ý, tu nghiệp 3 năm tại Pháp.', 10, '0902222222'),
(N'Phạm Đức Anh', N'Món Nhật', N'Đầu bếp sushi 8 năm, chứng chỉ knife skill Osaka.', 8, '0903333333'),
(N'Christine Hà', N'Món Á fusion', N'Chuyên món Thái và fusion, quán quân MasterChef US.', 12, '0904444444'),
(N'Nguyễn Hoàng Nam', N'Tráng miệng & Đồ uống', N'Chuyên bánh ngọt và đồ uống sáng tạo.', 6, '0905555555');

-- ------------------------------------------------------------
-- 2. INGREDIENTS (~24)
-- unit: g | ml | cai | goi | mieng
-- ------------------------------------------------------------
INSERT INTO ingredients (name, unit, stock_quantity, price_per_unit) VALUES
(N'Thịt bò', 'g', 20000, 350),
(N'Bánh phở', 'g', 30000, 40),
(N'Hành lá', 'g', 5000, 30),
(N'Rau thơm', 'g', 8000, 50),
(N'Xương bò', 'g', 15000, 150),
(N'Sườn heo', 'g', 15000, 220),
(N'Gạo tấm', 'g', 25000, 35),
(N'Trứng gà', 'cai', 500, 3500),
(N'Tôm sú', 'g', 10000, 450),
(N'Bánh tráng', 'cai', 1000, 1500),
(N'Bí đỏ', 'g', 10000, 40),
(N'Kem tươi', 'ml', 5000, 120),
(N'Mì Ý spaghetti', 'g', 12000, 60),
(N'Thịt heo xay', 'g', 10000, 200),
(N'Gạo sushi', 'g', 15000, 50),
(N'Rong biển nori', 'mieng', 300, 4000),
(N'Mực ống', 'g', 8000, 380),
(N'Phô mai Mascarpone', 'g', 3000, 600),
(N'Cà phê robusta', 'g', 10000, 250),
(N'Sữa đặc', 'ml', 8000, 60),
(N'Đào ngâm', 'g', 5000, 120),
(N'Trà đào túi lọc', 'goi', 300, 8000),
(N'Mì gạo Pad Thái', 'g', 12000, 70),
(N'Khoai tây', 'g', 15000, 30);

-- ------------------------------------------------------------
-- 3. DISHES (12) - insert trước, gán chef sau
-- ------------------------------------------------------------
INSERT INTO dishes (name, slug, description, price, category, prep_time_minutes, is_available, is_featured) VALUES
(N'Gỏi cuốn tôm thịt', 'goi-cuon-tom-thit', N'Khai vị tươi mát: tôm, thịt heo, rau sống cuốn bánh tráng, chấm mắm nêm.', 45000, 'appetizer', 15, true, false),
(N'Súp bí đỏ kem tươi', 'sup-bi-do', N'Súp bí đỏ sánh mịn nấu cùng kem tươi, ngọt tự nhiên.', 59000, 'appetizer', 20, true, false),
(N'Phở bò đặc biệt', 'pho-bo-dac-biet', N'Phở bò tái nạm gầu, nước dùng ninh 12h từ xương bò.', 55000, 'main', 20, true, true),
(N'Cơm tấm sườn bì chả', 'com-tam-suon-bi-cha', N'Cơm tấm dẻo, sườn nướng mật ong, bì, chả trứng, mỡ hành.', 65000, 'main', 25, true, true),
(N'Bò bít tết sốt tiêu đen', 'bo-bit-tet-sot-tieu-den', N'Thăn bò Úc 250g áp chảo medium-rare, sốt tiêu đen, khoai tây chiên.', 129000, 'main', 25, true, true),
(N'Mì Ý sốt bò bằm', 'mi-y-sot-bo-bam', N'Spaghetti sốt bò bằm cà chua kiểu Bolognese, phô mai Parmesan.', 89000, 'main', 20, true, false),
(N'Sushi tổng hợp', 'sushi-tong-hop', N'Set 12 miếng sushi tôm, mực, cá hồi cuộn rong biển, cơm dẻo chuẩn Nhật.', 149000, 'main', 30, true, false),
(N'Pad Thái tôm', 'pad-thai-tom', N'Mì gạo xào me chua ngọt cùng tôm sú, trứng, đậu phộng rang.', 95000, 'main', 20, true, false),
(N'Bánh Tiramisu', 'banh-tiramisu', N'Bánh Ý với mascarpone béo mịn, cà phê và cacao đắng nhẹ.', 55000, 'dessert', 10, true, false),
(N'Bánh Flan caramel', 'banh-flan-caramel', N'Flan trứng sữa mềm mịn, lớp caramel vàng óng.', 30000, 'dessert', 10, true, false),
(N'Cà phê sữa đá', 'ca-phe-sua-da', N'Robusta pha phin đậm đà cùng sữa đặc, đá viên.', 29000, 'drink', 5, true, false),
(N'Trà đào cam sả', 'tra-dao-cam-sa', N'Trà đào mát lạnh, đào ngâm giòn, cam và sả thơm.', 39000, 'drink', 5, true, false);

-- Gán chef cho từng món
UPDATE dishes SET chef_id = (SELECT id FROM chefs WHERE name = N'Trần Minh Quân' LIMIT 1)
  WHERE slug IN ('goi-cuon-tom-thit','pho-bo-dac-biet','com-tam-suon-bi-cha');
UPDATE dishes SET chef_id = (SELECT id FROM chefs WHERE name = N'Lê Thu Thảo' LIMIT 1)
  WHERE slug IN ('sup-bi-do','bo-bit-tet-sot-tieu-den','mi-y-sot-bo-bam');
UPDATE dishes SET chef_id = (SELECT id FROM chefs WHERE name = N'Phạm Đức Anh' LIMIT 1)
  WHERE slug = 'sushi-tong-hop';
UPDATE dishes SET chef_id = (SELECT id FROM chefs WHERE name = N'Christine Hà' LIMIT 1)
  WHERE slug = 'pad-thai-tom';
UPDATE dishes SET chef_id = (SELECT id FROM chefs WHERE name = N'Nguyễn Hoàng Nam' LIMIT 1)
  WHERE slug IN ('banh-tiramisu','banh-flan-caramel','ca-phe-sua-da','tra-dao-cam-sa');

-- ------------------------------------------------------------
-- 4. DISH_INGREDIENTS (định lượng)
-- ------------------------------------------------------------
INSERT INTO dish_ingredients (dish_id, ingredient_id, quantity, unit) VALUES
-- Gỏi cuốn
((SELECT id FROM dishes WHERE slug='goi-cuon-tom-thit'), (SELECT id FROM ingredients WHERE name=N'Tôm sú'), 150, 'g'),
((SELECT id FROM dishes WHERE slug='goi-cuon-tom-thit'), (SELECT id FROM ingredients WHERE name=N'Bánh tráng'), 4, 'cai'),
((SELECT id FROM dishes WHERE slug='goi-cuon-tom-thit'), (SELECT id FROM ingredients WHERE name=N'Rau thơm'), 50, 'g'),
-- Súp bí đỏ
((SELECT id FROM dishes WHERE slug='sup-bi-do'), (SELECT id FROM ingredients WHERE name=N'Bí đỏ'), 300, 'g'),
((SELECT id FROM dishes WHERE slug='sup-bi-do'), (SELECT id FROM ingredients WHERE name=N'Kem tươi'), 100, 'ml'),
-- Phở bò
((SELECT id FROM dishes WHERE slug='pho-bo-dac-biet'), (SELECT id FROM ingredients WHERE name=N'Thịt bò'), 200, 'g'),
((SELECT id FROM dishes WHERE slug='pho-bo-dac-biet'), (SELECT id FROM ingredients WHERE name=N'Bánh phở'), 150, 'g'),
((SELECT id FROM dishes WHERE slug='pho-bo-dac-biet'), (SELECT id FROM ingredients WHERE name=N'Hành lá'), 20, 'g'),
((SELECT id FROM dishes WHERE slug='pho-bo-dac-biet'), (SELECT id FROM ingredients WHERE name=N'Xương bò'), 300, 'g'),
-- Cơm tấm
((SELECT id FROM dishes WHERE slug='com-tam-suon-bi-cha'), (SELECT id FROM ingredients WHERE name=N'Sườn heo'), 200, 'g'),
((SELECT id FROM dishes WHERE slug='com-tam-suon-bi-cha'), (SELECT id FROM ingredients WHERE name=N'Gạo tấm'), 200, 'g'),
((SELECT id FROM dishes WHERE slug='com-tam-suon-bi-cha'), (SELECT id FROM ingredients WHERE name=N'Trứng gà'), 1, 'cai'),
-- Bò bít tết
((SELECT id FROM dishes WHERE slug='bo-bit-tet-sot-tieu-den'), (SELECT id FROM ingredients WHERE name=N'Thịt bò'), 250, 'g'),
((SELECT id FROM dishes WHERE slug='bo-bit-tet-sot-tieu-den'), (SELECT id FROM ingredients WHERE name=N'Khoai tây'), 200, 'g'),
-- Mì Ý
((SELECT id FROM dishes WHERE slug='mi-y-sot-bo-bam'), (SELECT id FROM ingredients WHERE name=N'Mì Ý spaghetti'), 150, 'g'),
((SELECT id FROM dishes WHERE slug='mi-y-sot-bo-bam'), (SELECT id FROM ingredients WHERE name=N'Thịt heo xay'), 150, 'g'),
-- Sushi
((SELECT id FROM dishes WHERE slug='sushi-tong-hop'), (SELECT id FROM ingredients WHERE name=N'Gạo sushi'), 200, 'g'),
((SELECT id FROM dishes WHERE slug='sushi-tong-hop'), (SELECT id FROM ingredients WHERE name=N'Tôm sú'), 100, 'g'),
((SELECT id FROM dishes WHERE slug='sushi-tong-hop'), (SELECT id FROM ingredients WHERE name=N'Mực ống'), 100, 'g'),
((SELECT id FROM dishes WHERE slug='sushi-tong-hop'), (SELECT id FROM ingredients WHERE name=N'Rong biển nori'), 3, 'mieng'),
-- Pad Thái
((SELECT id FROM dishes WHERE slug='pad-thai-tom'), (SELECT id FROM ingredients WHERE name=N'Mì gạo Pad Thái'), 150, 'g'),
((SELECT id FROM dishes WHERE slug='pad-thai-tom'), (SELECT id FROM ingredients WHERE name=N'Tôm sú'), 150, 'g'),
((SELECT id FROM dishes WHERE slug='pad-thai-tom'), (SELECT id FROM ingredients WHERE name=N'Trứng gà'), 1, 'cai'),
-- Tiramisu
((SELECT id FROM dishes WHERE slug='banh-tiramisu'), (SELECT id FROM ingredients WHERE name=N'Phô mai Mascarpone'), 100, 'g'),
((SELECT id FROM dishes WHERE slug='banh-tiramisu'), (SELECT id FROM ingredients WHERE name=N'Trứng gà'), 2, 'cai'),
((SELECT id FROM dishes WHERE slug='banh-tiramisu'), (SELECT id FROM ingredients WHERE name=N'Cà phê robusta'), 30, 'g'),
-- Flan
((SELECT id FROM dishes WHERE slug='banh-flan-caramel'), (SELECT id FROM ingredients WHERE name=N'Trứng gà'), 3, 'cai'),
((SELECT id FROM dishes WHERE slug='banh-flan-caramel'), (SELECT id FROM ingredients WHERE name=N'Sữa đặc'), 100, 'ml'),
-- Cà phê sữa đá
((SELECT id FROM dishes WHERE slug='ca-phe-sua-da'), (SELECT id FROM ingredients WHERE name=N'Cà phê robusta'), 25, 'g'),
((SELECT id FROM dishes WHERE slug='ca-phe-sua-da'), (SELECT id FROM ingredients WHERE name=N'Sữa đặc'), 40, 'ml'),
-- Trà đào
((SELECT id FROM dishes WHERE slug='tra-dao-cam-sa'), (SELECT id FROM ingredients WHERE name=N'Trà đào túi lọc'), 1, 'goi'),
((SELECT id FROM dishes WHERE slug='tra-dao-cam-sa'), (SELECT id FROM ingredients WHERE name=N'Đào ngâm'), 80, 'g')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 5. Kiểm tra nhanh sau khi seed
-- ------------------------------------------------------------
-- SELECT (SELECT count(*) FROM chefs) AS chefs,
--        (SELECT count(*) FROM ingredients) AS ingredients,
--        (SELECT count(*) FROM dishes) AS dishes,
--        (SELECT count(*) FROM dish_ingredients) AS links;
-- Kỳ vọng: chefs=5, ingredients=24, dishes=12, links=32
