-- Homepage sections gain a kind and a layout so the shelves that used to be
-- hard-coded on the storefront ("Best of the Basics", "Popular Products" and
-- the "Starting from" price strip) become rows Super Admin can edit, reorder,
-- hide or delete.

CREATE TYPE "HomeSectionKind" AS ENUM ('PRODUCTS', 'DAILY_STAPLES', 'TOP_PICKS', 'PRICE_DEALS');
CREATE TYPE "HomeSectionLayout" AS ENUM ('SHELF', 'GRID');

ALTER TABLE "home_sections"
  ADD COLUMN "kind" "HomeSectionKind" NOT NULL DEFAULT 'PRODUCTS',
  ADD COLUMN "layout" "HomeSectionLayout" NOT NULL DEFAULT 'SHELF',
  ADD COLUMN "productLimit" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN "tiles" JSONB NOT NULL DEFAULT '[]';

-- The three former hard-coded blocks, with the same copy and order they had.
-- Price-strip tiles link to a category by slug lookup; a missing category just
-- leaves the tile pointing at /products.
INSERT INTO "home_sections" ("id", "title", "subtitle", "kind", "layout", "targetAudience", "displayOrder", "isActive", "productIds", "productLimit", "tiles", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Best of the Basics', 'Farm-fresh flour, namkeen, spices & kitchen essentials',
   'DAILY_STAPLES', 'SHELF', 'ALL', 10, true, ARRAY[]::TEXT[], 12, '[]', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Shop by Price', NULL,
   'PRICE_DEALS', 'SHELF', 'ALL', 20, true, ARRAY[]::TEXT[], 12,
   jsonb_build_array(
     jsonb_build_object('label', 'Starting from', 'price', 25,  'subtitle', 'Salt, Spices & masalas',    'emoji', '🧂', 'color', 'purple', 'categoryId', NULL),
     jsonb_build_object('label', 'Starting from', 'price', 79,  'subtitle', 'Namkeens & snacks',         'emoji', '🍟', 'color', 'orange', 'categoryId', NULL),
     jsonb_build_object('label', 'Starting from', 'price', 199, 'subtitle', 'Atta, Flour & grains',      'emoji', '🌾', 'color', 'green',  'categoryId', NULL),
     jsonb_build_object('label', 'Starting from', 'price', 499, 'subtitle', 'Premium cold pressed oils', 'emoji', '⭐', 'color', 'blue',   'categoryId', NULL)
   ),
   CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Popular Products', 'Highest demand products among local grocery retailers',
   'TOP_PICKS', 'GRID', 'ALL', 30, true, ARRAY[]::TEXT[], 12, '[]', CURRENT_TIMESTAMP);
