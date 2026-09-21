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
  await seedDefaultProducts();
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
  const tree: {
    slug: string;
    name: string;
    imageUrl: string;
    description: string;
    children: { slug: string; name: string; imageUrl: string; description: string }[];
  }[] = [
    {
      slug: 'atta-flour',
      name: 'Atta & Flour',
      imageUrl: '/images/cat_atta_flour.jpg',
      description: 'Fresh chakki atta, premium maida, pure besan and grain flours.',
      children: [
        { slug: 'chakki-atta', name: 'Chakki Atta', imageUrl: '/images/premium_atta.jpg', description: 'Fresh stone-ground chakki wheat atta.' },
        { slug: 'maida', name: 'Maida', imageUrl: '/images/cat_atta_flour.jpg', description: 'Refined wheat flour for baking and cooking.' },
        { slug: 'besan', name: 'Besan', imageUrl: '/images/cat_spices.jpg', description: 'Pure unadulterated gram flour.' },
      ],
    },
    {
      slug: 'namkeen',
      name: 'Namkeen',
      imageUrl: '/images/cat_namkeen.jpg',
      description: 'Crispy, savory traditional namkeens, bhujia, and sev.',
      children: [
        { slug: 'bhujia', name: 'Bhujia', imageUrl: '/images/aloo_bhujia.jpg', description: 'Spicy crispy Bikaneri and aloo bhujia.' },
        { slug: 'mixtures', name: 'Mixtures', imageUrl: '/images/classic_namkeen.jpg', description: 'Crunchy traditional mixed farsan.' },
        { slug: 'sev', name: 'Sev & Gathiya', imageUrl: '/images/cat_namkeen.jpg', description: 'Traditional Gujarati and Rajasthani sev & gathiya.' },
      ],
    },
    {
      slug: 'wafers',
      name: 'Wafers',
      imageUrl: '/images/cat_wafers.jpg',
      description: 'Light, crunchy potato, banana and tortilla chips.',
      children: [
        { slug: 'potato-chips', name: 'Potato Chips', imageUrl: '/images/cat_wafers.jpg', description: 'Crispy salted and masala potato chips.' },
        { slug: 'banana-chips', name: 'Banana Chips', imageUrl: '/images/cat_wafers.jpg', description: 'Kerala style crispy banana wafers in pure oil.' },
        { slug: 'tortilla', name: 'Tortilla Chips', imageUrl: '/images/tonys_chips.jpg', description: 'Corn tortilla chips for nachos and dips.' },
      ],
    },
    {
      slug: 'spices',
      name: 'Spices',
      imageUrl: '/images/cat_spices.jpg',
      description: 'Pure, aromatic whole spices, ground powders, and blended masalas.',
      children: [
        { slug: 'whole-spices', name: 'Whole Spices', imageUrl: '/images/cat_spices.jpg', description: 'Khada masala: black pepper, cardamom, cloves, cinnamon.' },
        { slug: 'powdered-spices', name: 'Powdered Spices', imageUrl: '/images/cat_spices.jpg', description: 'Turmeric, red chilli powder, coriander powder, cumin powder.' },
        { slug: 'blended-spices', name: 'Blended Masalas', imageUrl: '/images/cat_spices.jpg', description: 'Garam masala, kitchen king, chaat masala and special blends.' },
      ],
    },
  ];

  for (const [index, parent] of tree.entries()) {
    const parentCat = await prisma.category.upsert({
      where: { slug: parent.slug },
      update: {
        name: parent.name,
        imageUrl: parent.imageUrl,
        description: parent.description,
        displayOrder: index + 1,
        isActive: true,
      },
      create: {
        name: parent.name,
        slug: parent.slug,
        imageUrl: parent.imageUrl,
        description: parent.description,
        displayOrder: index + 1,
        isActive: true,
      },
    });

    for (const [childIndex, child] of parent.children.entries()) {
      await prisma.category.upsert({
        where: { slug: child.slug },
        update: {
          name: child.name,
          imageUrl: child.imageUrl,
          description: child.description,
          parentId: parentCat.id,
          displayOrder: childIndex + 1,
          isActive: true,
        },
        create: {
          name: child.name,
          slug: child.slug,
          imageUrl: child.imageUrl,
          description: child.description,
          parentId: parentCat.id,
          displayOrder: childIndex + 1,
          isActive: true,
        },
      });
    }
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

/**
 * The customer app's product pages, listings and homepage shelves used to read
 * arrays hardcoded in its mock data file (`src/mock/homeMockData.ts`) - six
 * products a retailer or shopper could see and Super Admin could not touch.
 * Migrated here as real, editable rows: same names, copy, images and prices,
 * now managed from the admin Add/Edit Product screen.
 *
 * Slugs are the OLD mock ids (`premium-atta`, `classic-namkeen-100x20`, ...),
 * so every existing `/product-detail/:id` link, bookmark and stored cart line
 * keeps resolving - the same trick the category seed uses.
 *
 * Idempotent per SKU, not per table: a product that already exists is left
 * completely alone, so re-running the seed never overwrites what Super Admin
 * has edited since. (Count-based idempotency, as the banner seed uses, would
 * skip the whole migration the moment ANY product existed.)
 *
 * Prices are written as dated PriceList rules, never as product columns:
 * the B2C rate, and a B2B quantity ladder at the same 90/80/72/65% of MRP the
 * storefront used to compute on the fly - so what a retailer sees is
 * unchanged, but each tier is now a rule an admin can supersede.
 */
async function seedDefaultProducts() {
  const admin = await prisma.user.findFirst({ where: { role: UserRole.SUPER_ADMIN } });
  if (!admin) {
    console.warn('No Super Admin found - skipping product migration (price rules need a creator)');
    return;
  }

  const categoryId = async (slug?: string) => {
    if (!slug) return null;
    const found = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
    if (!found) console.warn(`  category "${slug}" not found - product will be uncategorised`);
    return found?.id ?? null;
  };

  const GST_PERCENT = 5;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  /**
   * PriceList.unitPrice is EXCLUSIVE of GST - the order engine adds
   * `subtotal x gst%` on top (SalesService lineTotal). The storefront, though,
   * has always displayed GST-INCLUSIVE prices ("Inclusive of all taxes"), and
   * every figure in the old mock data is one of those. Storing them as-is would
   * charge tax twice at checkout, so each is converted to its exclusive base.
   *
   * The paisa is chosen so the round trip holds: base x (1 + gst) must land back
   * on the exact rupee figure a shopper saw, not one paisa either side of it.
   */
  const exclusive = (inclusive: number) => {
    const base = round2(inclusive / (1 + GST_PERCENT / 100));
    for (const candidate of [base, round2(base - 0.01), round2(base + 0.01)]) {
      if (round2(candidate * (1 + GST_PERCENT / 100)) === inclusive) return candidate;
    }
    return base;
  };

  /** 1-9 / 10-49 / 50-99 / 100+ pcs, as % of the reference (inclusive) price. Mirrors the old PDP arithmetic. */
  const LADDER: [number, number][] = [
    [1, 0.9],
    [10, 0.8],
    [50, 0.72],
    [100, 0.65],
  ];
  const ladderFor = (reference: number) =>
    LADDER.map(([minQuantity, share]) => ({
      minQuantity,
      // The shopper-facing (inclusive) tier price is what the old page showed;
      // what is stored is its exclusive base.
      unitPrice: exclusive(Math.round(reference * share)),
    }));

  // Shared across all six: what the old product page hardcoded for every
  // product, so the migrated pages behave the same until an admin changes them.
  const COMMON = {
    minOrderQuantity: 1,
    maxOrderQuantity: 10,
    moqB2B: 10,
    maxOrderQuantityB2B: 500,
    packBoxSize: 10,
    gstInvoiceAvailable: true,
    businessSupportContact: 'Dedicated Distributor Desk: +91 1800-BALAJI',
    // No finished-goods stock exists yet, so a computed "0 in stock" would make
    // every migrated product unbuyable. Backorder keeps them orderable, exactly
    // as they were, without inventing a stock figure.
    allowBackorder: true,
    reorderPoint: 0,
    safetyStock: 0,
  };
  const DISCLAIMER =
    'Every effort is made to maintain accuracy of all information. However, actual product packaging and materials may contain more and/or different information. It is recommended not to solely rely on the information presented.';

  const products: {
    slug: string;
    name: string;
    sku: string;
    unit: string;
    categorySlug?: string;
    brand?: string;
    packLabel: string;
    mrp?: number;
    b2cPrice: number;
    badge?: string;
    hsnCode?: string;
    images: string[];
    rating?: number;
    reviewCount?: number;
    highlights?: string[];
    description: string;
    disclaimer?: string;
    manufacturer?: string;
    countryOfOrigin?: string;
    shelfLife?: string;
    returnPolicy?: string;
    warranty?: string;
    deliveryTerms?: string;
    bulkAvailable?: boolean;
    isTopPick?: boolean;
    isDailyStaple?: boolean;
    specifications?: { label: string; value: string }[];
    faqs?: { question: string; answer: string }[];
    offers?: { title: string; description: string }[];
    variants?: {
      name: string;
      sku: string;
      mrp: number;
      b2cPrice: number;
      images: string[];
    }[];
  }[] = [
    {
      slug: 'classic-namkeen-100x20',
      name: 'Classic Namkeen',
      sku: 'BJ-NAM-100G',
      unit: 'PACK',
      categorySlug: 'mixtures',
      brand: 'Balaji',
      packLabel: '100g x 20',
      mrp: 200,
      b2cPrice: 180,
      badge: 'Buy 10 Get 1',
      images: ['/images/classic_namkeen.jpg', '/images/aloo_bhujia.jpg'],
      rating: 4.5,
      reviewCount: 320,
      highlights: [
        'Premium quality',
        'Suitable for retail & wholesale',
        'Hygienically packed',
        'Long shelf life',
        'Bulk ordering available',
      ],
      description:
        'Our classic Namkeen is made with the finest ingredients, perfectly spiced and crisped to deliver an authentic taste. Ideal for parties, snacks, and bulk retail.',
      isTopPick: true,
    },
    {
      slug: 'premium-atta',
      name: 'Premium Chakki Atta',
      sku: 'DT-ATTA-10KG',
      unit: 'KG',
      categorySlug: 'chakki-atta',
      brand: 'Desi Tokri',
      packLabel: '10kg Bag',
      mrp: 480,
      b2cPrice: 450,
      badge: '100% Sharbati',
      // 1101 00 00 is the wheat-flour HSN. The old page showed it on EVERY
      // product as a placeholder; it is only set where it is actually correct.
      hsnCode: '1101 00 00',
      images: ['/images/premium_atta.jpg', '/images/cat_atta_flour.jpg'],
      rating: 4.8,
      reviewCount: 1240,
      highlights: [
        '100% MP Sharbati Wheat',
        'Ground using traditional stone chakki',
        'No added preservatives or colors',
        'High in fiber and nutrients',
      ],
      description:
        'Our Premium Chakki Atta is made from the finest quality MP Sharbati wheat grains, carefully selected and ground using traditional stone chakki to retain its natural aroma, texture, and nutritional value. Perfect for making soft, fluffy, and delicious rotis that stay fresh longer.',
      disclaimer: DISCLAIMER,
      manufacturer: 'Balaji Agro Industries Pvt Ltd',
      countryOfOrigin: 'India',
      shelfLife: '12 Months',
      returnPolicy: '7 Days Replacement Policy',
      warranty: 'Not Applicable',
      deliveryTerms: 'Dispatch within 24 hours. Wholesale rates applied automatically.',
      bulkAvailable: true,
      isTopPick: true,
      specifications: [
        { label: 'Brand', value: 'Balaji' },
        { label: 'Product Type', value: 'Whole Wheat Atta' },
        { label: 'Net Weight', value: '10 KG' },
        { label: 'Packaging', value: 'PP Bag' },
        { label: 'Country of Origin', value: 'India' },
        { label: 'Shelf Life', value: '12 Months' },
      ],
      faqs: [
        {
          question: 'Is this 100% whole wheat?',
          answer: 'Yes, it is made from 100% MP Sharbati wheat without any mixing or maida.',
        },
        {
          question: 'How long does the atta stay fresh?',
          answer: 'It is best consumed within 3 months of packaging if stored in an airtight container.',
        },
      ],
      offers: [
        { title: 'Bank Offer', description: '5% Unlimited Cashback on Axis Bank Credit Card' },
        { title: 'Special Price', description: 'Get extra 5% off (price inclusive of cashback/coupon)' },
      ],
      // The 10kg pack IS the product above; only the additional size is a variant.
      variants: [
        {
          name: '5kg Bag',
          sku: 'DT-ATTA-5KG',
          mrp: 260,
          b2cPrice: 240,
          images: ['/images/cat_atta_flour.jpg', '/images/premium_atta.jpg'],
        },
      ],
    },
    {
      slug: 'aloo-bhujia-500g',
      name: 'Aloo Bhujia (500g)',
      // The mock carried no SKU for this one; invented so the column can be unique.
      sku: 'BJ-ALO-500G',
      unit: 'PACK',
      categorySlug: 'bhujia',
      brand: 'Balaji',
      packLabel: '500g',
      mrp: 200,
      b2cPrice: 180,
      images: ['/images/aloo_bhujia.jpg'],
      description:
        'Crispy and spicy potato noodles, perfect for snacking. Made with real potatoes and traditional Indian spices.',
      disclaimer:
        'Actual product packaging and materials may contain more and different information than what is shown.',
      manufacturer: 'Balaji Agro Industries',
      countryOfOrigin: 'India',
      shelfLife: '6 Months',
      deliveryTerms: 'Dispatch within 48 hrs.',
      specifications: [
        { label: 'Brand', value: 'Balaji' },
        { label: 'Type', value: 'Namkeen' },
        { label: 'Net Weight', value: '500g' },
      ],
    },
    {
      slug: 'santa-cruz',
      name: 'Santa Cruz Organic Fruit Spread',
      sku: 'SC-SPR-95OZ',
      unit: 'PIECE',
      packLabel: '9.5 oz',
      b2cPrice: 750,
      images: ['/images/santa_cruz.jpg'],
      description: 'Delicious organic fruit spread made with fresh apricots.',
      manufacturer: 'Santa Cruz Organic',
      countryOfOrigin: 'USA',
      shelfLife: '12 Months',
      isDailyStaple: true,
      specifications: [
        { label: 'Brand', value: 'Santa Cruz' },
        { label: 'Flavor', value: 'Apricot' },
      ],
    },
    {
      slug: 'tony-bs',
      name: "Tony B's Steak Chips Gochu Bang!",
      sku: 'TB-CHP-125OZ',
      unit: 'PIECE',
      categorySlug: 'tortilla',
      packLabel: '1.25 oz',
      b2cPrice: 550,
      images: ['/images/tonys_chips.jpg'],
      description: 'Crispy and savory steak chips with a spicy gochujang kick.',
      manufacturer: "Tony B's",
      countryOfOrigin: 'USA',
      shelfLife: '6 Months',
      isDailyStaple: true,
      specifications: [
        { label: 'Brand', value: "Tony B's" },
        { label: 'Type', value: 'Chips' },
      ],
    },
    {
      slug: 'califia-farms',
      name: 'Califia Farms Pure Black Medium Roast',
      sku: 'CF-COF-48FLOZ',
      unit: 'PIECE',
      packLabel: '48 fl oz',
      b2cPrice: 500,
      images: ['/images/califia.jpg'],
      description: 'Smooth, rich, and pure black medium roast cold brew coffee.',
      manufacturer: 'Califia Farms',
      countryOfOrigin: 'USA',
      shelfLife: '6 Months',
      isDailyStaple: true,
      specifications: [
        { label: 'Brand', value: 'Califia' },
        { label: 'Roast', value: 'Medium' },
      ],
    },
  ];

  let created = 0;
  for (const p of products) {
    const exists = await prisma.product.findFirst({
      where: { OR: [{ sku: p.sku }, { slug: p.slug }] },
      select: { id: true },
    });
    if (exists) {
      console.log(`  product ${p.sku} already present - leaving it alone`);
      continue;
    }

    // The old page fell back to price x 1.25 when a product carried no MRP, and
    // showed the invented figure as a struck-through price. The MRP column is
    // left empty for those (an MRP is a legal figure printed on the pack), but
    // the wholesale ladder is still derived from the same reference so the
    // B2B rates a retailer sees do not move.
    const reference = p.mrp ?? Math.round(p.b2cPrice * 1.25);

    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: p.name,
          sku: p.sku,
          slug: p.slug,
          unit: p.unit,
          categoryId: await categoryId(p.categorySlug),
          brand: p.brand,
          packLabel: p.packLabel,
          mrp: p.mrp,
          badge: p.badge,
          hsnCode: p.hsnCode,
          images: p.images,
          rating: p.rating,
          reviewCount: p.reviewCount,
          highlights: p.highlights ?? [],
          description: p.description,
          disclaimer: p.disclaimer,
          manufacturer: p.manufacturer,
          countryOfOrigin: p.countryOfOrigin,
          shelfLife: p.shelfLife,
          returnPolicy: p.returnPolicy,
          warranty: p.warranty,
          deliveryTerms: p.deliveryTerms,
          bulkAvailable: p.bulkAvailable ?? false,
          isTopPick: p.isTopPick ?? false,
          isDailyStaple: p.isDailyStaple ?? false,
          showOnStorefront: true,
          ...COMMON,
          specifications: {
            create: (p.specifications ?? []).map((s, displayOrder) => ({ ...s, displayOrder })),
          },
          faqs: { create: (p.faqs ?? []).map((f, displayOrder) => ({ ...f, displayOrder })) },
          offers: { create: (p.offers ?? []).map((o, displayOrder) => ({ ...o, displayOrder })) },
          variants: {
            create: (p.variants ?? []).map((v, displayOrder) => ({
              name: v.name,
              sku: v.sku,
              mrp: v.mrp,
              images: v.images,
              displayOrder,
            })),
          },
        },
        include: { variants: { orderBy: { displayOrder: 'asc' } } },
      });

      const rule = (
        variantId: string | null,
        channel: 'B2C' | 'B2B',
        minQuantity: number,
        unitPrice: number,
      ) => ({
        productId: product.id,
        variantId,
        channel,
        minQuantity,
        unitPrice,
        gstRatePercent: GST_PERCENT,
        effectiveFrom: new Date(),
        createdById: admin.id,
      });

      await tx.priceList.createMany({
        data: [
          rule(null, 'B2C', 1, exclusive(p.b2cPrice)),
          ...ladderFor(reference).map((t) => rule(null, 'B2B', t.minQuantity, t.unitPrice)),
        ],
      });

      for (const [index, v] of (p.variants ?? []).entries()) {
        const variantId = product.variants[index].id;
        await tx.priceList.createMany({
          data: [
            rule(variantId, 'B2C', 1, exclusive(v.b2cPrice)),
            ...ladderFor(v.mrp).map((t) => rule(variantId, 'B2B', t.minQuantity, t.unitPrice)),
          ],
        });
      }
    });

    created += 1;
    console.log(`  migrated product ${p.sku} (${p.name})`);
  }

  console.log(
    created > 0
      ? `Migrated ${created} storefront product(s) into the catalogue`
      : 'Storefront products already present - nothing to migrate',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
