import { useStorefrontCategoryTree } from '@shared/hooks/useCategories';
import { api as storefrontApi } from '../api/client';
import { categories as mockCategories, type MockCategory } from '../mock/homeMockData';

/**
 * Same shape `MockCategory` already used, so every screen built against the
 * mock array (HomePage's category rail, CategoriesPage, ProductsPage's
 * category routing, DesktopHeader's mega-menu) keeps working unchanged - only
 * where the list comes from changes.
 */
export type CategoryNode = MockCategory;

/** Rotates through a fixed palette so a category picked up an icon-tile color without needing one from the admin form. */
const COLOR_PALETTE = ['#f5e9d8', '#fde3cf', '#f3e6d0', '#f6dede', '#e0e7ff', '#dcfce7', '#fae8ff', '#fef3c7'];

/**
 * Live categories from Admin > Manage Category, in the same shape the mock
 * array always had - `id` here is the slug (`atta-flour`, not a uuid), which
 * is what every route (`/products/:categoryId`) already expects.
 *
 * Falls back to the hardcoded `mockCategories` (still exported from
 * `mock/homeMockData.ts`, untouched) only while zero categories are published
 * from the admin side - same fallback pattern as `useStorefrontBanners`.
 */
export function useCategoryTree(): CategoryNode[] {
  const { data } = useStorefrontCategoryTree(storefrontApi);

  if (data && data.length > 0) {
    return data.map((category, index) => ({
      id: category.slug,
      name: category.name,
      color: COLOR_PALETTE[index % COLOR_PALETTE.length],
      image: category.imageUrl ?? '/images/cat_namkeen.jpg',
      subcategories: category.children.map((child) => ({
        id: child.slug,
        name: child.name,
        image: child.imageUrl ?? category.imageUrl ?? '/images/cat_namkeen.jpg',
      })),
    }));
  }

  return mockCategories;
}
