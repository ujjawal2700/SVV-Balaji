export interface FranchiseStore {
  id: string;
  code: string;
  name: string;
  partnerName: string;
  phone: string;
  city: string;
  state: string;
  address: string;
  gstin: string;
  totalOrdersCount: number;
  totalVolumeTonnes: number;
  totalSuppliedAmount: number;
  creditLimit: number;
  outstandingBalance: number;
  status: 'ACTIVE' | 'ON_HOLD';
}

export interface FranchiseSupplyOrderItem {
  id: string;
  productName: string;
  sku: string;
  packSize: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  weightKg: number;
}

export interface FranchiseSupplyOrder {
  id: string;
  orderNumber: string;
  poNumber: string;
  franchiseId: string;
  franchiseName: string;
  franchiseCode: string;
  partnerName: string;
  phone: string;
  city: string;
  state: string;
  orderDate: string;
  dispatchDate: string;
  deliveredDate?: string;
  assignedWarehouse: string;
  items: FranchiseSupplyOrderItem[];
  itemsSummary: string;
  totalItemUnits: number;
  totalWeightKg: number;
  subtotal: number;
  taxTotal: number;
  totalAmount: number;
  paymentTerms: 'PREPAID' | 'CREDIT_15D' | 'CREDIT_30D';
  paymentStatus: 'PAID' | 'UNPAID' | 'PARTIAL' | 'OVERDUE';
  fulfillmentStatus: 'DELIVERED' | 'DISPATCHED' | 'IN_TRANSIT' | 'PACKED' | 'ALLOCATED' | 'PENDING';
  freightPartner: string;
  truckNumber: string;
  driverPhone: string;
  notes?: string;
}

export const INITIAL_FRANCHISES: FranchiseStore[] = [
  {
    id: 'fr-pat-01',
    code: 'SVV-FR-PAT-01',
    name: 'Balaji Express Franchise — Patna City Hub',
    partnerName: 'Rajeev Singhania',
    phone: '9835012340',
    city: 'Patna',
    state: 'Bihar',
    address: 'Plot 14, New Mandi Complex, Patna City, Bihar - 800008',
    gstin: '10AABCB9912F1Z1',
    totalOrdersCount: 28,
    totalVolumeTonnes: 42.5,
    totalSuppliedAmount: 1420000,
    creditLimit: 300000,
    outstandingBalance: 70000,
    status: 'ACTIVE',
  },
  {
    id: 'fr-rnc-02',
    code: 'SVV-FR-RNC-02',
    name: 'Balaji Agro Mart — Ranchi Central',
    partnerName: 'Sanjay Verma',
    phone: '9431098220',
    city: 'Ranchi',
    state: 'Jharkhand',
    address: 'Station Road, Ranchi, Jharkhand - 834001',
    gstin: '20AACPV9921E1Z4',
    totalOrdersCount: 19,
    totalVolumeTonnes: 29.2,
    totalSuppliedAmount: 980000,
    creditLimit: 250000,
    outstandingBalance: 120000,
    status: 'ACTIVE',
  },
  {
    id: 'fr-ind-03',
    code: 'SVV-FR-IND-03',
    name: 'Vighnaharta Mart Franchise — Indore',
    partnerName: 'Alok Pandey',
    phone: '9835990011',
    city: 'Indore',
    state: 'Madhya Pradesh',
    address: 'Scheme 54, Vijay Nagar, Indore, MP - 452010',
    gstin: '23AACPV8812C1Z8',
    totalOrdersCount: 22,
    totalVolumeTonnes: 34.0,
    totalSuppliedAmount: 1150000,
    creditLimit: 250000,
    outstandingBalance: 35000,
    status: 'ACTIVE',
  },
  {
    id: 'fr-muz-04',
    code: 'SVV-FR-MUZ-04',
    name: 'SVV Balaji Partner Store — Muzaffarpur',
    partnerName: 'Kishan Agarwal',
    phone: '9122334455',
    city: 'Muzaffarpur',
    state: 'Bihar',
    address: 'Brahmpura Main Road, Muzaffarpur, Bihar - 842003',
    gstin: '10AAACA9940K1Z9',
    totalOrdersCount: 14,
    totalVolumeTonnes: 21.8,
    totalSuppliedAmount: 740000,
    creditLimit: 200000,
    outstandingBalance: 85000,
    status: 'ACTIVE',
  },
  {
    id: 'fr-dhn-05',
    code: 'SVV-FR-DHN-05',
    name: 'Balaji Express Store — Dhanbad',
    partnerName: 'Manoj Tiwari',
    phone: '9771122334',
    city: 'Dhanbad',
    state: 'Jharkhand',
    address: 'Bank More, Dhanbad, Jharkhand - 826001',
    gstin: '20AACST5512B1Z6',
    totalOrdersCount: 11,
    totalVolumeTonnes: 16.4,
    totalSuppliedAmount: 570000,
    creditLimit: 150000,
    outstandingBalance: 70000,
    status: 'ACTIVE',
  },
];

export const INITIAL_FRANCHISE_ORDERS: FranchiseSupplyOrder[] = [
  {
    id: 'fr-ord-101',
    orderNumber: 'FR-SUP-20260918-01',
    poNumber: 'PO-PAT-8812',
    franchiseId: 'fr-pat-01',
    franchiseName: 'Balaji Express Franchise — Patna City Hub',
    franchiseCode: 'SVV-FR-PAT-01',
    partnerName: 'Rajeev Singhania',
    phone: '9835012340',
    city: 'Patna',
    state: 'Bihar',
    orderDate: '18 Sept 2026, 09:30 AM',
    dispatchDate: '18 Sept 2026, 14:00 PM',
    deliveredDate: '18 Sept 2026, 17:30 PM',
    assignedWarehouse: 'Patna Central Silo & Processing Hub',
    itemsSummary: 'Chakki Atta 10kg x 150 bags, Mustard Oil 1L x 80 boxes, Sonamasuri Rice 5kg x 60 bags',
    totalItemUnits: 290,
    totalWeightKg: 2600,
    subtotal: 122000,
    taxTotal: 6100,
    totalAmount: 128100,
    paymentTerms: 'CREDIT_15D',
    paymentStatus: 'PAID',
    fulfillmentStatus: 'DELIVERED',
    freightPartner: 'SVV Express Fleet',
    truckNumber: 'BR-01-GB-4421',
    driverPhone: '9835123999',
    notes: 'Weekly standard store bulk replenishment. Verified batch QR provenance intact.',
    items: [
      { id: 'it-1', productName: 'Shree Vighnaharta Chakki Atta (10 KG)', sku: 'FG-ATT-10KG', packSize: '10 KG Bag', quantity: 150, unitPrice: 420, lineTotal: 63000, weightKg: 1500 },
      { id: 'it-2', productName: 'Pure Kachi Ghani Mustard Oil (1 Litre)', sku: 'FG-OIL-01L', packSize: '1 L Bottle (12/Box)', quantity: 80, unitPrice: 165, lineTotal: 13200, weightKg: 800 },
      { id: 'it-3', productName: 'Organic Sonamasuri Rice (5 KG Pack)', sku: 'FG-RIC-05KG', packSize: '5 KG Bag', quantity: 60, unitPrice: 380, lineTotal: 22800, weightKg: 300 },
    ],
  },
  {
    id: 'fr-ord-102',
    orderNumber: 'FR-SUP-20260917-02',
    poNumber: 'PO-RNC-9910',
    franchiseId: 'fr-rnc-02',
    franchiseName: 'Balaji Agro Mart — Ranchi Central',
    franchiseCode: 'SVV-FR-RNC-02',
    partnerName: 'Sanjay Verma',
    phone: '9431098220',
    city: 'Ranchi',
    state: 'Jharkhand',
    orderDate: '17 Sept 2026, 11:15 AM',
    dispatchDate: '17 Sept 2026, 16:30 PM',
    assignedWarehouse: 'Ranchi Regional Distribution Hub',
    itemsSummary: 'Sharbati Atta 5kg x 200 bags, Organic Arhar Dal 1kg x 120 bags, Desi A2 Ghee 1L x 40 jars',
    totalItemUnits: 360,
    totalWeightKg: 1840,
    subtotal: 138000,
    taxTotal: 6900,
    totalAmount: 144900,
    paymentTerms: 'CREDIT_15D',
    paymentStatus: 'UNPAID',
    fulfillmentStatus: 'IN_TRANSIT',
    freightPartner: 'Jharkhand Logistics Cargo',
    truckNumber: 'JH-01-AK-9920',
    driverPhone: '9431001188',
    notes: 'In-transit: Expected to reach Ranchi franchise store by tonight 21:00 PM.',
    items: [
      { id: 'it-4', productName: 'Pure Sharbati Premium Atta (5 KG)', sku: 'FG-ATT-05KG', packSize: '5 KG Bag', quantity: 200, unitPrice: 245, lineTotal: 49000, weightKg: 1000 },
      { id: 'it-5', productName: 'Organic Arhar / Toor Dal (1 KG)', sku: 'FG-PUL-01KG', packSize: '1 KG Pouch', quantity: 120, unitPrice: 145, lineTotal: 17400, weightKg: 120 },
      { id: 'it-6', productName: 'Pure Desi A2 Cow Ghee (1 Litre Jar)', sku: 'FG-GHE-01L', packSize: '1 L Glass Jar', quantity: 40, unitPrice: 1150, lineTotal: 46000, weightKg: 720 },
    ],
  },
  {
    id: 'fr-ord-103',
    orderNumber: 'FR-SUP-20260916-03',
    poNumber: 'PO-IND-5521',
    franchiseId: 'fr-ind-03',
    franchiseName: 'Vighnaharta Mart Franchise — Indore',
    franchiseCode: 'SVV-FR-IND-03',
    partnerName: 'Alok Pandey',
    phone: '9835990011',
    city: 'Indore',
    state: 'Madhya Pradesh',
    orderDate: '16 Sept 2026, 14:20 PM',
    dispatchDate: '16 Sept 2026, 18:00 PM',
    deliveredDate: '17 Sept 2026, 15:45 PM',
    assignedWarehouse: 'Central Sourcing & Mandi Hub',
    itemsSummary: 'Chakki Atta 10kg x 300 bags, Turmeric Powder 500g x 150 pkts',
    totalItemUnits: 450,
    totalWeightKg: 3075,
    subtotal: 148500,
    taxTotal: 7425,
    totalAmount: 155925,
    paymentTerms: 'PREPAID',
    paymentStatus: 'PAID',
    fulfillmentStatus: 'DELIVERED',
    freightPartner: 'BlueDart Surface Cargo',
    truckNumber: 'MP-09-CD-1102',
    driverPhone: '9826019283',
    notes: 'Full bulk truckload delivered & verified with store manager sign-off.',
    items: [
      { id: 'it-7', productName: 'Shree Vighnaharta Chakki Atta (10 KG)', sku: 'FG-ATT-10KG', packSize: '10 KG Bag', quantity: 300, unitPrice: 420, lineTotal: 126000, weightKg: 3000 },
      { id: 'it-8', productName: 'Organic Haldi / Turmeric Powder (500g)', sku: 'FG-SP-0500', packSize: '500g Pouch', quantity: 150, unitPrice: 150, lineTotal: 22500, weightKg: 75 },
    ],
  },
  {
    id: 'fr-ord-104',
    orderNumber: 'FR-SUP-20260915-04',
    poNumber: 'PO-MUZ-7719',
    franchiseId: 'fr-muz-04',
    franchiseName: 'SVV Balaji Partner Store — Muzaffarpur',
    franchiseCode: 'SVV-FR-MUZ-04',
    partnerName: 'Kishan Agarwal',
    phone: '9122334455',
    city: 'Muzaffarpur',
    state: 'Bihar',
    orderDate: '15 Sept 2026, 10:00 AM',
    dispatchDate: '15 Sept 2026, 15:30 PM',
    deliveredDate: '16 Sept 2026, 11:20 AM',
    assignedWarehouse: 'Patna Central Silo & Processing Hub',
    itemsSummary: 'Organic Arhar Dal 1kg x 200 pkts, Mustard Oil 1L x 100 boxes',
    totalItemUnits: 300,
    totalWeightKg: 1200,
    subtotal: 94000,
    taxTotal: 4700,
    totalAmount: 98700,
    paymentTerms: 'CREDIT_15D',
    paymentStatus: 'OVERDUE',
    fulfillmentStatus: 'DELIVERED',
    freightPartner: 'SVV Express Fleet',
    truckNumber: 'BR-06-EA-7712',
    driverPhone: '9835123999',
    notes: 'Delivered. Invoice overdue by 3 days. Reminder dispatched.',
    items: [
      { id: 'it-9', productName: 'Organic Arhar / Toor Dal (1 KG)', sku: 'FG-PUL-01KG', packSize: '1 KG Pouch', quantity: 200, unitPrice: 145, lineTotal: 29000, weightKg: 200 },
      { id: 'it-10', productName: 'Pure Kachi Ghani Mustard Oil (1 Litre)', sku: 'FG-OIL-01L', packSize: '1 L Bottle (12/Box)', quantity: 100, unitPrice: 165, lineTotal: 16500, weightKg: 1000 },
    ],
  },
];

const STORAGE_ORDERS_KEY = 'svv_balaji_franchise_orders_v1';
const STORAGE_FRANCHISES_KEY = 'svv_balaji_franchises_v1';

export function getStoredFranchises(): FranchiseStore[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_FRANCHISES_KEY) : null;
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return INITIAL_FRANCHISES;
}

export function saveStoredFranchises(franchises: FranchiseStore[]) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_FRANCHISES_KEY, JSON.stringify(franchises));
    }
  } catch {}
}

export function getStoredFranchiseOrders(): FranchiseSupplyOrder[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_ORDERS_KEY) : null;
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return INITIAL_FRANCHISE_ORDERS;
}

export function saveStoredFranchiseOrders(orders: FranchiseSupplyOrder[]) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(orders));
    }
  } catch {}
}
