/**
 * Mock data for the retailer home screen.
 *
 * FRD 29 is written for an end shopper; this screen is the B2B ordering
 * surface a retailer sees when they open the app — reorder shortcuts, running
 * schemes, and the outstanding/credit position staff give them over the
 * counter today. None of it has a backend endpoint yet (WS2.5 sales module is
 * still a placeholder — see PROJECT_STATE.md), so everything here is static
 * mock data to build the UI against. Swap this module out, not the
 * components, once `/api/v1/sales/*` exists.
 */

export interface RetailerProfile {
  storeName: string;
  retailerId: string;
  repName: string;
  outstanding: number;
  creditLimit: number;
}

export const retailerProfile: RetailerProfile = {
  storeName: 'Sharma General Store',
  retailerId: 'SVV8892',
  repName: 'Rahul Sharma',
  outstanding: 12500,
  creditLimit: 50000,
};

export interface MockCategory {
  id: string;
  name: string;
  color: string;
  image: string;
  subcategories?: { id: string; name: string; image: string }[];
}

export const categories: MockCategory[] = [
  {
    id: 'atta-flour',
    name: 'Atta & Flour',
    color: '#f5e9d8',
    image: '/images/cat_atta_flour.jpg',
    subcategories: [
      { id: 'chakki-atta', name: 'Chakki Atta', image: '/images/premium_atta.jpg' },
      { id: 'maida', name: 'Maida', image: '/images/cat_atta_flour.jpg' },
      { id: 'besan', name: 'Besan', image: '/images/cat_spices.jpg' },
    ],
  },
  {
    id: 'namkeen',
    name: 'Namkeen',
    color: '#fde3cf',
    image: '/images/cat_namkeen.jpg',
    subcategories: [
      { id: 'bhujia', name: 'Bhujia', image: '/images/aloo_bhujia.jpg' },
      { id: 'mixtures', name: 'Mixtures', image: '/images/classic_namkeen.jpg' },
      { id: 'sev', name: 'Sev & Gathiya', image: '/images/cat_namkeen.jpg' },
    ],
  },
  {
    id: 'wafers',
    name: 'Wafers',
    color: '#f3e6d0',
    image: '/images/cat_wafers.jpg',
    subcategories: [
      { id: 'potato-chips', name: 'Potato Chips', image: '/images/cat_wafers.jpg' },
      { id: 'banana-chips', name: 'Banana Chips', image: '/images/cat_wafers.jpg' },
      { id: 'tortilla', name: 'Tortilla Chips', image: '/images/tonys_chips.jpg' },
    ],
  },
  {
    id: 'spices',
    name: 'Spices',
    color: '#f6dede',
    image: '/images/cat_spices.jpg',
    subcategories: [
      { id: 'whole-spices', name: 'Whole Spices', image: '/images/cat_spices.jpg' },
      { id: 'powdered-spices', name: 'Powdered Spices', image: '/images/cat_spices.jpg' },
      { id: 'blended-spices', name: 'Blended Masalas', image: '/images/cat_spices.jpg' },
    ],
  },
];

export interface MockScheme {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
  cta: string;
  background: string;
  foreground: string;
  badgeBg: string;
  badgeFg: string;
  btnBg: string;
  btnFg: string;
  subtitleFg: string;
}

export const schemes: MockScheme[] = [
  {
    id: 'buy-10-get-1',
    tag: 'LIMITED TIME',
    title: 'Buy 10 Get 1 Free',
    subtitle: 'on Selected Namkeen',
    cta: 'SHOP NOW',
    background: '#fce3cd',
    foreground: '#452b0d',
    badgeBg: '#965a0b',
    badgeFg: '#ffffff',
    btnBg: '#8a4b08',
    btnFg: '#ffffff',
    subtitleFg: '#a37145',
  },
  {
    id: 'bulk-discount',
    tag: 'BULK DISCOUNT',
    title: '₹300 Off',
    subtitle: 'on orders above ₹5,000',
    cta: 'VIEW OFFER',
    background: '#e0e7ff',
    foreground: '#1e3a8a',
    badgeBg: '#1e3a8a',
    badgeFg: '#ffffff',
    btnBg: '#1e3a8a',
    btnFg: '#ffffff',
    subtitleFg: '#5a6fb3',
  },
];

export interface MockBuyAgainProduct {
  id: string;
  name: string;
  lastOrdered: string;
  price: number;
  mrp?: number | null;
  unit: string;
  image: string;
  description?: string;
  disclaimer?: string;
  manufacturer?: string;
  countryOfOrigin?: string;
  shelfLife?: string;
  orderQuantityLimits?: { min: number; max: number };
  specifications?: { label: string; value: string }[];
  businessInfo?: { gstInvoice: boolean; businessSupport: boolean; deliveryTerms: string };
}

export const buyAgainProducts: MockBuyAgainProduct[] = [
  {
    id: 'aloo-bhujia-500g',
    name: 'Aloo Bhujia (500g)',
    lastOrdered: '5 Boxes',
    price: 180,
    unit: 'Box',
    image: '/images/aloo_bhujia.jpg',
    description: 'Crispy and spicy potato noodles, perfect for snacking. Made with real potatoes and traditional Indian spices.',
    disclaimer: 'Actual product packaging and materials may contain more and different information than what is shown.',
    manufacturer: 'Balaji Agro Industries',
    countryOfOrigin: 'India',
    shelfLife: '6 Months',
    orderQuantityLimits: { min: 1, max: 20 },
    specifications: [
      { label: 'Brand', value: 'Balaji' },
      { label: 'Type', value: 'Namkeen' },
      { label: 'Net Weight', value: '500g' },
    ],
    businessInfo: { gstInvoice: true, businessSupport: true, deliveryTerms: 'Dispatch within 48 hrs.' }
  },
];

/**
 * Current live product catalog — used to simulate price & stock checks on reorder.
 * Intentionally has some price changes and an OOS item vs. order history prices.
 */
export const currentProductCatalog: Record<string, {
  price: number;
  mrp: number | null;
  stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK' | 'LOW_STOCK';
}> = {
  'premium-atta':         { price: 470, mrp: 500, stockStatus: 'IN_STOCK' },       // price up from 450
  'aloo-bhujia-500g':     { price: 180, mrp: 200, stockStatus: 'OUT_OF_STOCK' },   // out of stock
  'classic-namkeen-100x20': { price: 600, mrp: 650, stockStatus: 'LOW_STOCK' },    // price down from 620
  'tata-salt':            { price: 25,  mrp: 30,  stockStatus: 'IN_STOCK' },
  'santa-cruz':           { price: 750, mrp: 850, stockStatus: 'IN_STOCK' },
};

export interface MockProductVariant {
  id: string;
  name: string;
  sku: string;
  price: number;
  mrp: number | null;
  images: string[];
}

export interface MockPopularProduct {
  id: string;
  name: string;
  variant: string;
  price: number;
  mrp: number | null;
  badge: string | null;
  image: string; // thumbnail
  images?: string[]; // full gallery
  brand?: string;
  sku?: string;
  rating?: number;
  reviewCount?: number;
  stockStatus?: 'IN_STOCK' | 'OUT_OF_STOCK' | 'LOW_STOCK';
  maxQuantity?: number;
  highlights?: string[];
  description?: string;
  disclaimer?: string;
  manufacturer?: string;
  countryOfOrigin?: string;
  shelfLife?: string;
  orderQuantityLimits?: { min: number; max: number };
  specifications?: { label: string; value: string }[];
  businessInfo?: { gstInvoice: boolean; businessSupport: boolean; deliveryTerms: string };
  returnPolicy?: string;
  warranty?: string;
  bulkAvailable?: boolean;
  minOrderQuantity?: number;
  faqs?: { question: string; answer: string }[];
  offers?: { title: string; description: string }[];
  variants?: MockProductVariant[];
}

export const popularProducts: MockPopularProduct[] = [
  {
    id: 'classic-namkeen-100x20',
    name: 'Classic Namkeen',
    brand: 'Balaji',
    sku: 'BJ-NAM-100G',
    variant: '100g x 20',
    price: 180,
    mrp: 200,
    badge: 'Buy 10 Get 1',
    image: '/images/classic_namkeen.jpg',
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
    description: 'Our classic Namkeen is made with the finest ingredients, perfectly spiced and crisped to deliver an authentic taste. Ideal for parties, snacks, and bulk retail.',
  },
  {
    id: 'premium-atta',
    name: 'Premium Chakki Atta',
    brand: 'Desi Tokri',
    sku: 'DT-ATTA-10KG',
    variant: '10kg Bag',
    price: 450,
    mrp: 480,
    badge: '100% Sharbati',
    image: '/images/premium_atta.jpg',
    images: ['/images/premium_atta.jpg', '/images/cat_atta_flour.jpg'],
    rating: 4.8,
    reviewCount: 1240,
    stockStatus: 'IN_STOCK',
    maxQuantity: 20,
    highlights: [
      '100% MP Sharbati Wheat',
      'Ground using traditional stone chakki',
      'No added preservatives or colors',
      'High in fiber and nutrients',
    ],
    description: 'Our Premium Chakki Atta is made from the finest quality MP Sharbati wheat grains, carefully selected and ground using traditional stone chakki to retain its natural aroma, texture, and nutritional value. Perfect for making soft, fluffy, and delicious rotis that stay fresh longer.',
    disclaimer: 'Every effort is made to maintain accuracy of all information. However, actual product packaging and materials may contain more and/or different information. It is recommended not to solely rely on the information presented.',
    manufacturer: 'Balaji Agro Industries Pvt Ltd',
    countryOfOrigin: 'India',
    shelfLife: '12 Months',
    orderQuantityLimits: { min: 1, max: 50 },
    specifications: [
      { label: 'Brand', value: 'Balaji' },
      { label: 'Product Type', value: 'Whole Wheat Atta' },
      { label: 'Net Weight', value: '10 KG' },
      { label: 'Packaging', value: 'PP Bag' },
      { label: 'Country of Origin', value: 'India' },
      { label: 'Shelf Life', value: '12 Months' }
    ],
    businessInfo: {
      gstInvoice: true,
      businessSupport: true,
      deliveryTerms: 'Dispatch within 24 hours. Wholesale rates applied automatically.'
    },
    returnPolicy: '7 Days Replacement Policy',
    warranty: 'Not Applicable',
    bulkAvailable: true,
    minOrderQuantity: 1,
    faqs: [
      { question: 'Is this 100% whole wheat?', answer: 'Yes, it is made from 100% MP Sharbati wheat without any mixing or maida.' },
      { question: 'How long does the atta stay fresh?', answer: 'It is best consumed within 3 months of packaging if stored in an airtight container.' }
    ],
    offers: [
      { title: 'Bank Offer', description: '5% Unlimited Cashback on Axis Bank Credit Card' },
      { title: 'Special Price', description: 'Get extra 5% off (price inclusive of cashback/coupon)' }
    ],
    variants: [
      {
        id: 'premium-atta-5kg',
        name: '5kg Bag',
        sku: 'DT-ATTA-5KG',
        price: 240,
        mrp: 260,
        images: ['/images/cat_atta_flour.jpg', '/images/premium_atta.jpg'],
      },
      {
        id: 'premium-atta-10kg',
        name: '10kg Bag',
        sku: 'DT-ATTA-10KG',
        price: 450,
        mrp: 480,
        images: ['/images/premium_atta.jpg', '/images/cat_atta_flour.jpg'],
      },
    ],
  },
];

export interface MockBasicProduct {
  id: string;
  name: string;
  weight: string;
  variant?: string;
  price: number;
  mrp?: number | null;
  badge?: string | null;
  image: string;
  description?: string;
  disclaimer?: string;
  manufacturer?: string;
  countryOfOrigin?: string;
  shelfLife?: string;
  orderQuantityLimits?: { min: number; max: number };
  specifications?: { label: string; value: string }[];
  businessInfo?: { gstInvoice: boolean; businessSupport: boolean; deliveryTerms: string };
}

export const bestOfBasics: MockBasicProduct[] = [
  {
    id: 'santa-cruz',
    name: 'Santa Cruz Organic Fruit Spread',
    weight: '9.5 oz',
    price: 750,
    image: '/images/santa_cruz.jpg',
    description: 'Delicious organic fruit spread made with fresh apricots.',
    manufacturer: 'Santa Cruz Organic',
    countryOfOrigin: 'USA',
    shelfLife: '12 Months',
    specifications: [{ label: 'Brand', value: 'Santa Cruz' }, { label: 'Flavor', value: 'Apricot' }],
  },
  {
    id: 'tony-bs',
    name: 'Tony B\'s Steak Chips Gochu Bang!',
    weight: '1.25 oz',
    price: 550,
    image: '/images/tonys_chips.jpg',
    description: 'Crispy and savory steak chips with a spicy gochujang kick.',
    manufacturer: 'Tony B\'s',
    countryOfOrigin: 'USA',
    shelfLife: '6 Months',
    specifications: [{ label: 'Brand', value: 'Tony B\'s' }, { label: 'Type', value: 'Chips' }],
  },
  {
    id: 'califia-farms',
    name: 'Califia Farms Pure Black Medium Roast',
    weight: '48 fl oz',
    price: 500,
    image: '/images/califia.jpg',
    description: 'Smooth, rich, and pure black medium roast cold brew coffee.',
    manufacturer: 'Califia Farms',
    countryOfOrigin: 'USA',
    shelfLife: '6 Months',
    specifications: [{ label: 'Brand', value: 'Califia' }, { label: 'Roast', value: 'Medium' }],
  },
];
