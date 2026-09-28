import { Injectable, Logger } from '@nestjs/common';
import { PolicyAudience, PolicyType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertLegalPolicyDto } from './dto/upsert-legal-policy.dto';

const DEFAULT_POLICIES: Record<string, { title: string; content: string; version: string }> = {
  'RIDER:PRIVACY_POLICY': {
    title: 'SVV Balaji Delivery Partner Privacy Policy',
    version: '1.0',
    content: `## Delivery Partner Privacy Policy

**Effective Date:** September 2026

At **SVV Balaji**, we respect the privacy of our delivery partners. This Privacy Policy describes how we collect, use, and share information about you when you use the SVV Balaji Rider mobile application and delivery network.

### 1. Information We Collect
- **Personal Information:** Name, mobile number, email address, city, vehicle details, and government identification/driving licence photos.
- **Location Data:** Precise real-time location data when you are online or delivering orders. This is required to match you with nearby orders, compute earnings, and provide live customer order tracking.
- **Device & App Usage:** IP address, operating system, and performance metrics.

### 2. How We Use Your Information
- To dispatch nearby store pickup and customer drop-off tasks to you.
- To calculate distance-based payouts, incentives, and total earnings.
- To communicate order updates, safety guidelines, and support notices.
- To verify your identity and ensure delivery partner security.

### 3. Data Protection & Sharing
We do not sell your personal data. Your name and masked mobile contact may be shared with customers solely for completing live deliveries.

### 4. Your Rights & Account Management
You can update your profile, check your earnings history, or request account deactivation by contacting your nearest SVV Balaji branch or support team.`,
  },
  'RIDER:TERMS_AND_CONDITIONS': {
    title: 'SVV Balaji Delivery Partner Terms & Conditions',
    version: '1.0',
    content: `## Delivery Partner Terms of Service

**Effective Date:** September 2026

Welcome to the **SVV Balaji Delivery Partner Network**. By registering as an independent delivery partner, you agree to comply with these Terms & Conditions.

### 1. Delivery Responsibilities
- Delivery partners must maintain valid vehicle registration, driving licence, and insurance as required by applicable laws.
- Orders must be collected promptly from assigned SVV Balaji stores and delivered safely to customers.
- Cash collected on Cash-On-Delivery (COD) orders must be reported accurately in the app and deposited at the store as directed.

### 2. Earnings and Payouts
- Earnings are calculated based on completed deliveries, distance, peak-hour incentives, and target bonuses.
- Fraudulent activity, false GPS spoofing, or unreturned COD amounts will lead to immediate suspension and forfeiture of bonuses.

### 3. Code of Conduct
- Maintain professional conduct with customers, store staff, and fellow delivery partners.
- Ensure safe driving practices and compliance with traffic regulations at all times.

### 4. Termination
Either party may terminate this agreement at any time. SVV Balaji reserves the right to suspend or terminate accounts for policy violations, fraud, or misconduct.`,
  },
  'RETAILER:PRIVACY_POLICY': {
    title: 'SVV Balaji Retailer & B2B Partner Privacy Policy',
    version: '1.0',
    content: `## Retailer & B2B Partner Privacy Policy

**Effective Date:** September 2026

This Privacy Policy explains how **SVV Balaji** processes business and personal data collected from retailer and wholesale B2B partners.

### 1. Data Collection
- Business name, GSTIN, store address, contact person name, mobile number, and email.
- Order history, credit limits, invoices, and transaction records.

### 2. Data Usage
- Processing wholesale product orders, dispatch, and delivery.
- Managing credit accounts, receivables, and invoices.
- Providing customer support and order notifications.

### 3. Data Security
We implement strict access controls and encrypted database storage to protect your commercial transactions and business information.`,
  },
  'RETAILER:TERMS_AND_CONDITIONS': {
    title: 'SVV Balaji Retailer & B2B Partner Terms of Supply',
    version: '1.0',
    content: `## Retailer & B2B Partner Terms of Supply

**Effective Date:** September 2026

These Terms govern wholesale purchases, product distribution, and credit agreements between retail partners and **SVV Balaji**.

### 1. Ordering and Deliveries
- Minimum order quantities (MOQ) and wholesale pricing apply as displayed in the catalog.
- Delivery timelines depend on store proximity and stock availability.

### 2. Credit & Payment Terms
- Approved retailers may access credit facilities subject to credit checks and credit limits.
- Payments must be settled within the agreed invoice due period. Late payments may incur interest or credit lock.

### 3. Quality & Returns
- Goods received must be inspected at time of delivery. Any damaged items must be reported within 24 hours for replacement or credit note issuing.`,
  },
  'CUSTOMER:PRIVACY_POLICY': {
    title: 'SVV Balaji Customer Privacy Policy',
    version: '1.0',
    content: `## Customer Privacy Policy

**Effective Date:** September 2026

Your privacy is important to **SVV Balaji**. This Privacy Policy explains how we handle your personal data when using our storefront app or web store.

### 1. Information We Collect
- Contact details: Name, mobile number, email address, and delivery address.
- Order history, preferred store, payment methods, and app interaction logs.

### 2. Usage of Data
- Fulfilling D2C orders and delivering fresh farm produce to your doorstep.
- Communicating order status, delivery notifications, and customer support updates.
- Operating the SVV Balaji loyalty program and referral rewards.

### 3. Data Safety
We store customer data securely and do not share your contact details with third-party marketers.`,
  },
  'CUSTOMER:TERMS_AND_CONDITIONS': {
    title: 'SVV Balaji Customer Terms of Service',
    version: '1.0',
    content: `## Customer Terms of Service

**Effective Date:** September 2026

Welcome to **SVV Balaji**! By placing orders through our customer application, you agree to these Terms of Service.

### 1. Ordering and Pricing
- Product availability and prices are determined by your selected nearest SVV Balaji store branch.
- Prices are inclusive of applicable taxes. Delivery charges may apply based on order total and distance.

### 2. Deliveries and Cancellations
- Estimated delivery times are indicative. Delivery partners will deliver to the address specified during checkout.
- Orders may be cancelled prior to dispatch. Once out for delivery, cancellations are subject to store policy.

### 3. Contact & Customer Support
For any questions regarding your orders or refunds, please reach out via the in-app Help & Support section or contact customer service.`,
  },
};

@Injectable()
export class LegalPoliciesService {
  private readonly logger = new Logger(LegalPoliciesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Public query: get active policy by audience and type */
  async getPublicPolicy(audience: PolicyAudience, type: PolicyType) {
    const policy = await this.prisma.legalPolicy.findUnique({
      where: {
        audience_type: { audience, type },
      },
    });

    if (policy && policy.isActive) {
      return policy;
    }

    // Fallback to default policy definition
    const key = `${audience}:${type}`;
    const def = DEFAULT_POLICIES[key] ?? {
      title: `${audience} ${type.replace(/_/g, ' ')}`,
      version: '1.0',
      content: `Terms and Privacy Policy content for ${audience} will be loaded here.`,
    };

    return {
      id: `default-${key.toLowerCase().replace(/:/g, '-')}`,
      audience,
      type,
      title: def.title,
      content: def.content,
      version: def.version,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /** Public query: get both Privacy Policy & Terms for an audience */
  async getPublicPoliciesByAudience(audience: PolicyAudience) {
    const privacy = await this.getPublicPolicy(audience, PolicyType.PRIVACY_POLICY);
    const terms = await this.getPublicPolicy(audience, PolicyType.TERMS_AND_CONDITIONS);
    return {
      audience,
      privacyPolicy: privacy,
      termsAndConditions: terms,
    };
  }

  /** Admin query: list all policies stored or default structure */
  async getAllPoliciesAdmin() {
    const list = await this.prisma.legalPolicy.findMany({
      orderBy: [{ audience: 'asc' }, { type: 'asc' }],
    });

    const audiences = [PolicyAudience.RIDER, PolicyAudience.RETAILER, PolicyAudience.CUSTOMER];
    const types = [PolicyType.PRIVACY_POLICY, PolicyType.TERMS_AND_CONDITIONS];

    const result: Array<Record<string, any>> = [];
    for (const aud of audiences) {
      for (const typ of types) {
        const found = list.find((item) => item.audience === aud && item.type === typ);
        if (found) {
          result.push(found);
        } else {
          const fallback = await this.getPublicPolicy(aud, typ);
          result.push(fallback);
        }
      }
    }

    return result;
  }

  /** Admin mutation: upsert policy */
  async upsertPolicy(dto: UpsertLegalPolicyDto, userId?: string) {
    const { audience, type, title, content, version, isActive } = dto;
    return this.prisma.legalPolicy.upsert({
      where: {
        audience_type: { audience, type },
      },
      create: {
        audience,
        type,
        title,
        content,
        version: version ?? '1.0',
        isActive: isActive ?? true,
        updatedById: userId ?? null,
      },
      update: {
        title,
        content,
        version: version ?? '1.0',
        isActive: isActive ?? true,
        updatedById: userId ?? null,
      },
    });
  }
}
