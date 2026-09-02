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
}

export const categories: MockCategory[] = [
  { id: 'atta-flour', name: 'Atta & Flour', color: '#f5e9d8', image: '/images/cat_atta_flour.jpg' },
  { id: 'namkeen', name: 'Namkeen', color: '#fde3cf', image: '/images/cat_namkeen.jpg' },
  { id: 'wafers', name: 'Wafers', color: '#f3e6d0', image: '/images/cat_wafers.jpg' },
  { id: 'spices', name: 'Spices', color: '#f6dede', image: '/images/cat_spices.jpg' },
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
  unit: string;
  image: string;
}

export const buyAgainProducts: MockBuyAgainProduct[] = [
  {
    id: 'aloo-bhujia-500g',
    name: 'Aloo Bhujia (500g)',
    lastOrdered: '5 Boxes',
    price: 180,
    unit: 'Box',
    image: '/images/aloo_bhujia.jpg',
  },
];

export interface MockPopularProduct {
  id: string;
  name: string;
  variant: string;
  price: number;
  mrp: number | null;
  badge: string | null;
  image: string;
}

export const popularProducts: MockPopularProduct[] = [
  {
    id: 'classic-namkeen-100x20',
    name: 'Classic Namkeen',
    variant: '100g x 20',
    price: 180,
    mrp: 200,
    badge: 'Buy 10 Get 1',
    image: '/images/classic_namkeen.jpg',
  },
  {
    id: 'premium-atta-10kg',
    name: 'Premium Atta',
    variant: '10kg Bag',
    price: 450,
    mrp: 480,
    badge: null,
    image: '/images/premium_atta.jpg',
  },
];

export interface MockBasicProduct {
  id: string;
  name: string;
  weight: string;
  price: number;
  image: string;
}

export const bestOfBasics: MockBasicProduct[] = [
  {
    id: 'santa-cruz',
    name: 'Santa Cruz Organic Fruit Spread Apric...',
    weight: '9.5 oz',
    price: 750,
    image: '/images/santa_cruz.jpg',
  },
  {
    id: 'tony-bs',
    name: 'Tony B\'s Steak Chips Gochu Bang!',
    weight: '1.25 oz',
    price: 550,
    image: '/images/tonys_chips.jpg',
  },
  {
    id: 'califia-farms',
    name: 'Califia Farms Pure Black Medium Roa...',
    weight: '48 fl oz',
    price: 500,
    image: '/images/califia.jpg',
  },
];
