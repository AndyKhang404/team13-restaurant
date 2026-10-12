-- Align dishes.category with Prisma enum (was text while client sent enum comparisons)
ALTER TABLE dishes ADD COLUMN category_new dish_category NOT NULL DEFAULT 'main';
UPDATE dishes SET category_new = category::text::dish_category;
ALTER TABLE dishes DROP COLUMN category;
ALTER TABLE dishes RENAME COLUMN category_new TO category;