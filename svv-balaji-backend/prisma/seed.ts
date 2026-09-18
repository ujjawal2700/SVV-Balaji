import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Bootstrap data: one Super Admin and one branch.
 *
 * Safe to re-run. Previously this bailed out entirely the moment a Super Admin
 * existed, which meant changing SEED_SUPER_ADMIN_PASSWORD in .env and re-running
 * the seed appeared to succeed while silently changing nothing - the password
 * lives as a bcrypt hash in the database, not in .env, so the two just drifted
 * apart with no way to tell.
 *
 * Now it reports what it finds, and will reset the password on request.
 */
async function main() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@svvbalaji.com';
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe@123';
  const resetPassword = process.env.SEED_RESET_PASSWORD === 'true';

  if (!process.env.SEED_SUPER_ADMIN_EMAIL) {
    console.warn(
      'SEED_SUPER_ADMIN_EMAIL is not set - falling back to the default. If you edited .env ' +
        'and are seeing this, the file is not being loaded.',
    );
  }

  console.log(`Seeding against: ${email}`);

  await seedSuperAdmin(email, password, resetPassword);
  await seedDefaultBranch();
  await seedDefaultBanners();
  await seedDefaultCategories();
  await seedDefaultSchemes();
}

async function seedSuperAdmin(email: string, password: string, resetPassword: boolean) {
  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    const admin = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        fullName: 'Super Admin',
        role: UserRole.SUPER_ADMIN,
      },
    });
    console.log(`Created Super Admin: ${admin.email}`);
    console.log('   Sign in with the password from SEED_SUPER_ADMIN_PASSWORD. Change it soon.');
    return;
  }

  // The account is here. Make sure it can actually be signed into - a
  // suspended or demoted Super Admin locks everyone out of the panel, and
  // AuthService refuses any user who is not ACTIVE.
  if (existing.status !== 'ACTIVE' || existing.role !== UserRole.SUPER_ADMIN) {
    await prisma.user.update({
      where: { email },
      data: { status: 'ACTIVE', role: UserRole.SUPER_ADMIN },
    });
    console.log(`Reactivated ${email} as an ACTIVE Super Admin`);
  }

  const passwordMatches = await bcrypt.compare(password, existing.passwordHash);

  if (passwordMatches) {
    console.log(`Super Admin already exists and .env matches the stored password: ${email}`);
    return;
  }

  if (resetPassword) {
    await prisma.user.update({
      where: { email },
      data: {
        passwordHash: await bcrypt.hash(password, 10),
        // Any live session is now stale - force a fresh sign-in rather than
        // leaving a refresh token that outlives the password it was issued for.
        refreshTokenHash: null,
      },
    });
    console.log(`Password reset for ${email} from SEED_SUPER_ADMIN_PASSWORD.`);
    console.log('   Remove SEED_RESET_PASSWORD from .env now that it has been used.');
    return;
  }

  console.warn('');
  console.warn(`  ${email} exists, but SEED_SUPER_ADMIN_PASSWORD does NOT match the database.`);
  console.warn('');
  console.warn('  The password is stored as a bcrypt hash in the users table. Editing .env does');
  console.warn('  not change it - .env only supplies the value used when the account is first');
  console.warn('  created. That is why signing in with the new password fails.');
  console.warn('');
  console.warn('  To apply the .env password to the existing account, add this to .env:');
  console.warn('');
  console.warn('      SEED_RESET_PASSWORD="true"');
  console.warn('');
  console.warn('  then re-run `npm run prisma:seed` and remove the line afterwards.');
  console.warn('');
}

/**
 * Idempotent, and no longer tied to whether the admin was just created - a
 * database with an admin but no branch is a dead end, since farmers, users and
 * warehouses all need one to attach to.
 */
async function seedDefaultBranch() {
  const branchCount = await prisma.branch.count();
  if (branchCount > 0) {
    console.log(`Branches already present (${branchCount}) - leaving them alone`);
    return;
  }

  const branch = await prisma.branch.create({
    data: {
      name: 'Head Office',
      location: 'HQ',
      address: 'TBD',
    },
  });
  console.log(`Created default branch: ${branch.name}`);
}

/**
 * The homepage/categories hero used to be hardcoded JSX in the customer app,
 * not backed by anything - so an admin opening Banner Management for the
 * first time saw an empty screen even though the storefront was clearly
 * showing banners. Seeded here, once, as ordinary editable rows: same
 * content the hardcoded version showed, now something Super Admin can
 * actually change without a code deploy.
 *
 * Idempotent on count, same as seedDefaultBranch - if any banner already
 * exists (seeded before, or created by hand since), this does nothing.
 */
async function seedDefaultBanners() {
  const bannerCount = await prisma.banner.count();
  if (bannerCount > 0) {
    console.log(`Banners already present (${bannerCount}) - leaving them alone`);
    return;
  }

  await prisma.banner.createMany({
    data: [
      {
        title: 'Direct From Verified Mandis to Your Store',
        badgeText: '100% FARM-TRACEABLE STAPLES',
        description:
          'Pure Sharbati Atta, cold-pressed oils, and ground spices with verifiable batch QR provenance.',
        imageUrl: '/images/welcome_3d.jpg',
        ctaTextPrimary: 'Explore Catalog',
        ctaLinkPrimary: '/products/atta-flour',
        ctaTextSecondary: 'Trace A Batch',
        ctaLinkSecondary: '/trace',
        backgroundColor: '#064e3b',
        targetAudience: 'ALL',
        placement: 'HOMEPAGE',
        displayOrder: 1,
      },
      {
        title: 'Festive Retailer Schemes Live Now',
        badgeText: 'MEGA WHOLESALE SAVINGS',
        description: 'Enjoy up to 20% margin discounts + Buy 10 Get 1 free on selected spices and pulses.',
        imageUrl: '/images/cat_spices.jpg',
        ctaTextPrimary: 'Claim Active Schemes',
        ctaLinkPrimary: '/products/atta-flour',
        backgroundColor: '#ea580c',
        targetAudience: 'ALL',
        placement: 'HOMEPAGE',
        displayOrder: 2,
      },
      {
        title: 'Direct Bulk Supply & Verified Mandi Quality',
        badgeText: 'CATEGORY SPECIAL PROMO',
        description: 'Up to 20% Wholesale Margin • Mandi Grade Assured Across All Verticals',
        imageUrl:
          'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=600',
        ctaTextPrimary: 'Explore All Categories',
        ctaLinkPrimary: '/categories',
        ctaTextSecondary: 'Bulk B2B Rates',
        ctaLinkSecondary: '/price-lists',
        backgroundColor: '#ea580c',
        targetAudience: 'ALL',
        placement: 'CATEGORIES_PAGE',
        displayOrder: 1,
      },
    ],
  });
  console.log('Seeded 3 default banners (2 homepage, 1 categories page)');
}

/**
 * The customer app's category rail, `/categories` page and product routing
 * all used to import a hardcoded `categories` array from its own mock data
 * file (`src/mock/homeMockData.ts`) - so Super Admin had nothing to click on
 * to change what a shopper saw. Seeded here as real, editable `Category`
 * rows with the SAME slugs the mock array used as ids (`atta-flour`,
 * `namkeen`, ...), so every existing `/products/:categorySlug` link keeps
 * resolving once the frontend switches over. The mock file itself is left in
 * place, untouched, as the fallback shown only while zero categories exist.
 *
 * Idempotent on count, same pattern as seedDefaultBranch/seedDefaultBanners.
 */
async function seedDefaultCategories() {
  const categoryCount = await prisma.category.count();
  if (categoryCount > 0) {
    console.log(`Categories already present (${categoryCount}) - leaving them alone`);
    return;
  }

  const tree: {
    slug: string;
    name: string;
    imageUrl: string;
    children: { slug: string; name: string; imageUrl: string }[];
  }[] = [
    {
      slug: 'atta-flour',
      name: 'Atta & Flour',
      imageUrl: '/images/cat_atta_flour.jpg',
      children: [
        { slug: 'chakki-atta', name: 'Chakki Atta', imageUrl: '/images/premium_atta.jpg' },
        { slug: 'maida', name: 'Maida', imageUrl: '/images/cat_atta_flour.jpg' },
        { slug: 'besan', name: 'Besan', imageUrl: '/images/cat_spices.jpg' },
      ],
    },
    {
      slug: 'namkeen',
      name: 'Namkeen',
      imageUrl: '/images/cat_namkeen.jpg',
      children: [
        { slug: 'bhujia', name: 'Bhujia', imageUrl: '/images/aloo_bhujia.jpg' },
        { slug: 'mixtures', name: 'Mixtures', imageUrl: '/images/classic_namkeen.jpg' },
        { slug: 'sev', name: 'Sev & Gathiya', imageUrl: '/images/cat_namkeen.jpg' },
      ],
    },
    {
      slug: 'wafers',
      name: 'Wafers',
      imageUrl: '/images/cat_wafers.jpg',
      children: [
        { slug: 'potato-chips', name: 'Potato Chips', imageUrl: '/images/cat_wafers.jpg' },
        { slug: 'banana-chips', name: 'Banana Chips', imageUrl: '/images/cat_wafers.jpg' },
        { slug: 'tortilla', name: 'Tortilla Chips', imageUrl: '/images/tonys_chips.jpg' },
      ],
    },
    {
      slug: 'spices',
      name: 'Spices',
      imageUrl: '/images/cat_spices.jpg',
      children: [
        { slug: 'whole-spices', name: 'Whole Spices', imageUrl: '/images/cat_spices.jpg' },
        { slug: 'powdered-spices', name: 'Powdered Spices', imageUrl: '/images/cat_spices.jpg' },
        { slug: 'blended-spices', name: 'Blended Masalas', imageUrl: '/images/cat_spices.jpg' },
      ],
    },
  ];

  for (const [index, parent] of tree.entries()) {
    const created = await prisma.category.create({
      data: {
        name: parent.name,
        slug: parent.slug,
        imageUrl: parent.imageUrl,
        displayOrder: index + 1,
      },
    });
    await prisma.category.createMany({
      data: parent.children.map((child, childIndex) => ({
        name: child.name,
        slug: child.slug,
        imageUrl: child.imageUrl,
        parentId: created.id,
        displayOrder: childIndex + 1,
      })),
    });
  }

  console.log('Seeded 4 default categories with 12 subcategories');
}

/**
 * The homepage's "Today's Schemes & Offers" tiles were hardcoded in the
 * customer app's mock data, same story as banners and categories. Seeded as
 * real, editable rows - idempotent on count, same pattern as the others.
 */
async function seedDefaultSchemes() {
  const schemeCount = await prisma.scheme.count();
  if (schemeCount > 0) {
    console.log(`Schemes already present (${schemeCount}) - leaving them alone`);
    return;
  }

  await prisma.scheme.createMany({
    data: [
      {
        tag: 'LIMITED TIME',
        title: 'Buy 10 Get 1 Free',
        subtitle: 'on Selected Namkeen',
        ctaText: 'SHOP NOW',
        ctaLink: '/products/atta-flour',
        backgroundColor: '#fce3cd',
        textColor: '#452b0d',
        badgeColor: '#965a0b',
        badgeTextColor: '#ffffff',
        buttonColor: '#8a4b08',
        buttonTextColor: '#ffffff',
        targetAudience: 'ALL',
        displayOrder: 1,
      },
      {
        tag: 'BULK DISCOUNT',
        title: '₹300 Off',
        subtitle: 'on orders above ₹5,000',
        ctaText: 'VIEW OFFER',
        ctaLink: '/products/atta-flour',
        backgroundColor: '#e0e7ff',
        textColor: '#1e3a8a',
        badgeColor: '#1e3a8a',
        badgeTextColor: '#ffffff',
        buttonColor: '#1e3a8a',
        buttonTextColor: '#ffffff',
        targetAudience: 'ALL',
        displayOrder: 2,
      },
    ],
  });
  console.log('Seeded 2 default schemes');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
