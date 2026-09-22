import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SupportFaqItem {
  id?: string;
  category?: string;
  question: string;
  answer: string;
}

export interface SupportSettingsData {
  id: string;
  tollFreeNumber: string;
  whatsappNumber: string;
  supportEmail: string;
  operatingHours: string;
  officeAddress: string;
  isPhoneSupportActive: boolean;
  isWhatsappSupportActive: boolean;
  isEmailSupportActive: boolean;
  helpCategories: string[];
  customerFaqs: SupportFaqItem[];
  retailerFaqs: SupportFaqItem[];
  updatedAt: string;
  updatedById: string | null;
}

const DEFAULT_CATEGORIES = [
  'Orders & Live Tracking',
  'Delivery & Dispatch Timing',
  'Payments, GST & Invoices',
  'Returns, Refunds & Damaged Items',
  'Account, KYC & Wholesale Margins',
];

const DEFAULT_CUSTOMER_FAQS: SupportFaqItem[] = [
  {
    category: 'Orders & Live Tracking',
    question: 'How can I track the live status of my grocery order?',
    answer:
      'You can track your order in real-time by going to the Orders tab in your profile. You will see stage-by-stage updates: Placed, Packed, Out for Delivery, and Delivered with live driver ETA.',
  },
  {
    category: 'Delivery & Dispatch Timing',
    question: 'What are the delivery slots and how fast do you deliver?',
    answer:
      'We offer express same-day and scheduled next-day morning slots (7:00 AM - 11:00 AM & 5:00 PM - 9:00 PM). Fast local orders within outlet radius are typically fulfilled within 45 to 90 minutes.',
  },
  {
    category: 'Payments, GST & Invoices',
    question: 'What payment modes are accepted on SVV Balaji?',
    answer:
      'We accept UPI (Google Pay, PhonePe, Paytm), Credit/Debit Cards, Net Banking, Desi Reward Coins, and Cash on Delivery (COD up to allowable limit).',
  },
  {
    category: 'Returns, Refunds & Damaged Items',
    question: 'What if I receive a damaged or missing item in my package?',
    answer:
      'We have a 100% No-Questions-Asked fresh guarantee! Simply raise an issue from the order details page or WhatsApp our support line with a photo within 24 hours for instant refund or replacement.',
  },
  {
    category: 'Account, KYC & Wholesale Margins',
    question: 'How do I redeem my Desi Reward Coins on checkout?',
    answer:
      'Your earned loyalty and referral coins are available right on the checkout payment screen. Simply tick "Redeem Desi Coins" to deduct the balance from your final payable total.',
  },
];

const DEFAULT_RETAILER_FAQS: SupportFaqItem[] = [
  {
    category: 'Account, KYC & Wholesale Margins',
    question: 'How long does Kirana / Retailer account approval take after submission?',
    answer:
      'Our trade compliance team verifies your GSTIN and business address within 2 to 4 business hours. You will receive an SMS and WhatsApp notification once approved.',
  },
  {
    category: 'Orders & Live Tracking',
    question: 'What is the Minimum Order Quantity (MOQ) for wholesale delivery?',
    answer:
      'Wholesale bulk pricing is unlocked on orders starting from ₹3,000 or specific master crate quantities per SKU.',
  },
  {
    category: 'Payments, GST & Invoices',
    question: 'How do I download B2B Tax Invoices with Input Tax Credit (ITC)?',
    answer:
      'GST-compliant B2B invoices are auto-generated upon dispatch. You can download PDF copies with GST breakdowns anytime from your Wholesale Orders history.',
  },
  {
    category: 'Delivery & Dispatch Timing',
    question: 'How are bulk consignments and heavy pallet deliveries handled?',
    answer:
      'Bulk trade orders are dispatched via our direct refrigerated and covered fleet to your shop doorstep with verified digital Proof of Delivery (POD).',
  },
  {
    category: 'Returns, Refunds & Damaged Items',
    question: 'What is the procedure for wholesale batch return or mandi transit shrinkage?',
    answer:
      'For trade consignments, report any damaged crates at the time of delivery on the driver POD terminal or raise a B2B Dispute in your portal within 48 hours for immediate credit note issuance.',
  },
];

@Injectable()
export class SupportSettingsService {
  private readonly logger = new Logger(SupportSettingsService.name);

  // In-memory persistent state (seeded with production defaults)
  private state: SupportSettingsData = {
    id: 'default-support-config',
    tollFreeNumber: '1800-209-DESI (1800-209-3374)',
    whatsappNumber: '+91 98765 43210',
    supportEmail: 'support@svvbalaji.com',
    operatingHours: 'Mon - Sat: 8:00 AM - 9:00 PM IST (Sunday: 9:00 AM - 6:00 PM)',
    officeAddress: 'SVV Balaji Food & Beverages Pvt. Ltd., Agritech Industrial Park, Sector 4, Mandi Hub, India',
    isPhoneSupportActive: true,
    isWhatsappSupportActive: true,
    isEmailSupportActive: true,
    helpCategories: DEFAULT_CATEGORIES,
    customerFaqs: DEFAULT_CUSTOMER_FAQS,
    retailerFaqs: DEFAULT_RETAILER_FAQS,
    updatedAt: new Date().toISOString(),
    updatedById: null,
  };

  async getSettings(): Promise<SupportSettingsData> {
    return this.state;
  }

  async updateSettings(
    input: Partial<SupportSettingsData>,
    updatedById?: string,
  ): Promise<SupportSettingsData> {
    this.state = {
      ...this.state,
      ...input,
      customerFaqs: input.customerFaqs || this.state.customerFaqs,
      retailerFaqs: input.retailerFaqs || this.state.retailerFaqs,
      helpCategories: input.helpCategories || this.state.helpCategories,
      updatedAt: new Date().toISOString(),
      updatedById: updatedById || this.state.updatedById,
    };
    this.logger.log(`Support settings updated by ${updatedById || 'system'}`);
    return this.state;
  }

  async getStorefrontSupport(role?: string) {
    const isRetailer = role === 'RETAILER' || role === 'B2B';
    return {
      tollFreeNumber: this.state.tollFreeNumber,
      whatsappNumber: this.state.whatsappNumber,
      supportEmail: this.state.supportEmail,
      operatingHours: this.state.operatingHours,
      officeAddress: this.state.officeAddress,
      isPhoneSupportActive: this.state.isPhoneSupportActive,
      isWhatsappSupportActive: this.state.isWhatsappSupportActive,
      isEmailSupportActive: this.state.isEmailSupportActive,
      helpCategories: this.state.helpCategories,
      faqs: isRetailer ? this.state.retailerFaqs : this.state.customerFaqs,
      customerFaqs: this.state.customerFaqs,
      retailerFaqs: this.state.retailerFaqs,
    };
  }
}
