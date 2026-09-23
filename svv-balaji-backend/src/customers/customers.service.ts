import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CustomerAccountStatus,
  CustomerStatus,
  CustomerType,
  PaymentTerms,
  Prisma,
  SalesChannel,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { scopedBranchId } from '../common/branch-scope';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { SequenceService } from '../common/sequence.service';
import { ReferralService } from '../common/referral.service';
import { normalisePhone } from '../storefront/phone.util';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  UpdateCustomerStatusDto,
} from './dto/customer.dto';

/** Standard 15-character GSTIN: state code, PAN, entity number, Z, checksum. */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const B2B_TYPES: CustomerType[] = [
  CustomerType.DISTRIBUTOR,
  CustomerType.RETAILER,
  CustomerType.INSTITUTIONAL,
];

/**
 * Customer registry for both sales channels (client decision, 11-Aug-2026).
 *
 * The two channels are genuinely different commercial relationships, and the
 * rules that separate them are enforced here rather than in the database, so
 * that they are testable and produce a readable error rather than a constraint
 * violation:
 *
 *   B2B - distributor, retailer or institution. Must carry a GSTIN because it
 *         goes on the tax invoice. May hold credit terms and a credit limit.
 *         Belongs to a sales executive.
 *   B2C - a consumer. No GSTIN, no credit, no assigned executive. Pays up front.
 */
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly referrals: ReferralService,
  ) {}

  async create(dto: CreateCustomerDto) {
    this.assertChannelRules(dto, dto.channel, true);

    // Normalised once, up front, and reused for both the Customer row and the
    // CustomerAccount below - the two must agree byte-for-byte or the OTP
    // login this account creates will not find the customer it belongs to.
    const phone = normalisePhone(dto.phone);

    if (dto.branchId) {
      const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
      if (!branch) throw new NotFoundException('Branch not found');
    }

    if (dto.assignedToId) {
      const user = await this.prisma.user.findUnique({ where: { id: dto.assignedToId } });
      if (!user) throw new NotFoundException('Assigned sales executive not found');
    }

    if (dto.gstin) {
      const clash = await this.prisma.customer.findFirst({
        where: { gstin: dto.gstin, status: { not: CustomerStatus.INACTIVE } },
      });
      if (clash) {
        throw new BadRequestException(
          `GSTIN ${dto.gstin} is already registered to ${clash.name} (${clash.customerCode})`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // A staff-registered person may already have a self-service storefront
      // account (they downloaded the app before staff got to them) - that
      // account, not a second one, is what must end up linked, so this stops
      // rather than silently creating a Customer nothing can ever log into.
      const existingAccount = await tx.customerAccount.findUnique({ where: { phone } });
      if (existingAccount) {
        throw new BadRequestException(
          existingAccount.customerId
            ? `A storefront account already exists for ${dto.phone} - it is already linked to a customer record. Edit that one instead.`
            : `A storefront account already exists for ${dto.phone} (${existingAccount.status}). Resolve it from Retailer Approvals before registering a new record.`,
        );
      }

      // Validated before the customer row exists - `referrals.validate` only
      // needs the applicant's phone/email, and failing fast here means a bad
      // code rejects the whole registration rather than silently dropping it.
      const referrer = dto.referredByCode
        ? await this.referrals.validate(tx, dto.referredByCode, { phone, email: dto.email })
        : null;

      const customerCode = await this.sequence.nextInSeries(tx, `CUST-${dto.channel}`);
      const referralCode = await this.referrals.generateCode(tx, dto.name);

      const customer = await tx.customer.create({
        data: {
          customerCode,
          referralCode,
          channel: dto.channel,
          type: dto.type,
          name: dto.name,
          contactName: dto.contactName,
          phone,
          email: dto.email,
          gstin: dto.gstin,
          billingAddress: dto.billingAddress ?? '',
          shippingAddress: dto.shippingAddress ?? dto.billingAddress ?? '',
          city: dto.city,
          district: dto.district,
          state: dto.state,
          pincode: dto.pincode,
          creditLimit: dto.creditLimit,
          paymentTerms: dto.paymentTerms ?? PaymentTerms.PREPAID,
          branchId: dto.branchId,
          assignedToId: dto.assignedToId,
          status: dto.status ?? CustomerStatus.ACTIVE,
        },
      });

      if (referrer) {
        await this.referrals.createRelationship(tx, referrer, customer.id, dto.referredByCode!);
      }

      // The point of all of the above: this customer can sign in on the
      // storefront immediately, with the same phone number staff just typed,
      // and land on the exact record just created - not provision a second,
      // empty one on first OTP verify (see StorefrontAuthService.verifyOtp).
      await tx.customerAccount.create({
        data: {
          phone,
          email: dto.email,
          fullName: dto.contactName || dto.name,
          channel: dto.channel,
          status: CustomerAccountStatus.ACTIVE,
          phoneVerifiedAt: new Date(),
          customerId: customer.id,
          businessName: dto.channel === SalesChannel.B2B ? dto.name : undefined,
          gstin: dto.gstin,
          addressLine: dto.billingAddress || undefined,
          city: dto.city,
          district: dto.district,
          state: dto.state,
          pincode: dto.pincode,
        },
      });

      return customer;
    });
  }

  /**
   * The channel rules. Every one of these exists because getting it wrong
   * produces either an unusable invoice or an uncollectable debt.
   */
  private assertChannelRules(
    dto: CreateCustomerDto | UpdateCustomerDto,
    channel: SalesChannel,
    isCreate: boolean,
  ) {
    if (channel === SalesChannel.B2B) {
      if (dto.type && !B2B_TYPES.includes(dto.type)) {
        throw new BadRequestException(
          `A B2B customer must be ${B2B_TYPES.join(', ')} - not ${dto.type}`,
        );
      }
      if (isCreate && !dto.gstin) {
        throw new BadRequestException(
          'A B2B customer needs a GSTIN - it is required on the tax invoice',
        );
      }
      if (dto.gstin && !GSTIN_PATTERN.test(dto.gstin)) {
        throw new BadRequestException(
          `"${dto.gstin}" is not a valid GSTIN - expected 15 characters, e.g. 29ABCDE1234F1Z5`,
        );
      }
    }

    if (channel === SalesChannel.B2C) {
      if (dto.type && dto.type !== CustomerType.CONSUMER) {
        throw new BadRequestException(
          `A B2C customer must be of type CONSUMER - not ${dto.type}`,
        );
      }
      if (dto.gstin) {
        throw new BadRequestException(
          'A B2C consumer does not carry a GSTIN. Register them as B2B if they are a business.',
        );
      }
      if (dto.creditLimit) {
        throw new BadRequestException('Credit limits apply to B2B customers only');
      }
      if (dto.paymentTerms && dto.paymentTerms !== PaymentTerms.PREPAID) {
        throw new BadRequestException('Consumers pay up front - B2C payment terms must be PREPAID');
      }
      if (dto.assignedToId) {
        throw new BadRequestException('A sales executive is assigned to B2B accounts only');
      }
    }
  }

  async findAll(user: JwtPayload, filters: {
    channel?: SalesChannel;
    type?: CustomerType;
    status?: CustomerStatus;
    branchId?: string;
    search?: string;
  }) {
    const where: Prisma.CustomerWhereInput = {
      channel: filters.channel,
      type: filters.type,
      status: filters.status,
      // FRD 5.2 - the caller's branch wins over whatever was asked for.
      branchId: scopedBranchId(user, filters.branchId),
    };

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { customerCode: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search } },
        { gstin: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        branch: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, fullName: true } },
        referredAs: { select: { referrer: { select: { id: true, name: true, customerCode: true, referralCode: true } } } },
      },
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, fullName: true, email: true } },
        referredAs: { select: { referrer: { select: { id: true, name: true, customerCode: true, referralCode: true } } } },
        orders: {
          orderBy: { orderDate: 'desc' },
          take: 20,
          select: {
            id: true,
            orderNumber: true,
            orderDate: true,
            status: true,
            total: true,
            paymentStatus: true,
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Customer not found');

    if (dto.channel && dto.channel !== existing.channel) {
      throw new BadRequestException(
        'A customer cannot be moved between channels - the pricing and invoicing history ' +
          'would no longer make sense. Register a separate account instead.',
      );
    }

    this.assertChannelRules(dto, existing.channel, false);

    return this.prisma.customer.update({
      where: { id },
      data: {
        type: dto.type,
        name: dto.name,
        contactName: dto.contactName,
        phone: dto.phone,
        email: dto.email,
        gstin: dto.gstin,
        billingAddress: dto.billingAddress,
        shippingAddress: dto.shippingAddress,
        city: dto.city,
        district: dto.district,
        state: dto.state,
        pincode: dto.pincode,
        creditLimit: dto.creditLimit,
        paymentTerms: dto.paymentTerms,
        branchId: dto.branchId,
        assignedToId: dto.assignedToId,
      },
    });
  }

  async setStatus(id: string, dto: UpdateCustomerStatusDto) {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Customer not found');

    return this.prisma.customer.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  /**
   * What this customer currently owes us, against what they are allowed to owe.
   *
   * Exposure counts every order that has not been cancelled and has not been
   * paid in full - a dispatched-but-unpaid order is money at risk just as much
   * as an unshipped one.
   */
  async creditPosition(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');

    const openOrders = await this.prisma.order.findMany({
      where: {
        customerId: id,
        status: { not: 'CANCELLED' },
        paymentStatus: { not: 'PAID' },
      },
      select: { orderNumber: true, total: true, orderDate: true, paymentStatus: true },
    });

    const exposure = openOrders.reduce((sum, o) => sum + Number(o.total), 0);
    const limit = customer.creditLimit ? Number(customer.creditLimit) : null;

    return {
      customerCode: customer.customerCode,
      channel: customer.channel,
      paymentTerms: customer.paymentTerms,
      creditLimit: limit,
      currentExposure: exposure,
      availableCredit: limit === null ? null : Math.max(limit - exposure, 0),
      overLimit: limit !== null && exposure > limit,
      openOrders,
    };
  }

  /**
   * Reward-coin wallet: the running ledger behind `Customer.coinBalance`, split
   * into earned vs. used so admins can see how much of the balance has actually
   * been redeemed rather than just the current total.
   */
  async walletLedger(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: { coinBalance: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const transactions = await this.prisma.coinTransaction.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amount: true,
        reason: true,
        note: true,
        createdAt: true,
        order: { select: { orderNumber: true } },
      },
    });

    const earned = transactions.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
    const used = transactions.filter((t) => t.amount < 0).reduce((sum, t) => sum + -t.amount, 0);

    return {
      balance: customer.coinBalance,
      totalEarned: earned,
      totalUsed: used,
      transactions,
    };
  }

  /** A customer's raised support tickets, for the admin detail view. */
  async supportTickets(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id }, select: { id: true } });
    if (!customer) throw new NotFoundException('Customer not found');

    return this.prisma.supportTicket.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ticketNumber: true,
        category: true,
        subject: true,
        description: true,
        orderNumber: true,
        status: true,
        priority: true,
        resolutionNote: true,
        resolvedAt: true,
        resolvedBy: { select: { id: true, fullName: true } },
        createdAt: true,
      },
    });
  }

  /** A customer's saved-for-later products, with the current product name/price for display. */
  async wishlist(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id }, select: { id: true } });
    if (!customer) throw new NotFoundException('Customer not found');

    return this.prisma.customerWishlistItem.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        productId: true,
        createdAt: true,
        product: { select: { id: true, name: true, sku: true, unit: true, images: true } },
      },
    });
  }

  /** Every product review this customer has left, for the admin detail view. */
  async reviews(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id }, select: { id: true } });
    if (!customer) throw new NotFoundException('Customer not found');

    return this.prisma.productReview.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        product: { select: { id: true, name: true, sku: true } },
        order: { select: { orderNumber: true } },
      },
    });
  }
}
