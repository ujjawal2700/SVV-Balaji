import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { Prisma, RefundMethod, ReturnSettings, SalesChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ReturnReasonDto, UpdateReturnReasonDto, UpdateReturnSettingsDto } from './dto/returns.dto';

/** Seeded once, on an empty table - Super Admin edits them from then on. */
const DEFAULT_REASONS: Array<Omit<Prisma.ReturnReasonCreateInput, 'requests'>> = [
  { code: 'DAMAGED', label: 'Product arrived damaged', companyFault: true, requiresMedia: true, sortOrder: 10 },
  { code: 'WRONG_ITEM', label: 'Wrong product received', companyFault: true, requiresMedia: true, sortOrder: 20 },
  { code: 'QUALITY_ISSUE', label: 'Quality issue / defective', companyFault: true, requiresMedia: true, sortOrder: 30 },
  { code: 'EXPIRED', label: 'Expired or near expiry', companyFault: true, requiresMedia: true, sortOrder: 40 },
  { code: 'MISSING_PARTS', label: 'Seal broken / quantity short', companyFault: true, requiresMedia: true, sortOrder: 50 },
  { code: 'NOT_AS_DESCRIBED', label: 'Not as described', companyFault: false, sortOrder: 60 },
  { code: 'CHANGED_MIND', label: 'No longer needed', forExchange: false, companyFault: false, sortOrder: 70 },
  { code: 'DIFFERENT_PACK', label: 'Want a different pack size / variant', forReturn: false, companyFault: false, sortOrder: 80 },
];

/**
 * Return & exchange policy, one row per channel - B2C customers and B2B
 * retailers are configured (and handled) separately - plus the reason list.
 */
@Injectable()
export class ReturnSettingsService implements OnModuleInit {
  private readonly logger = new Logger(ReturnSettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      if ((await this.prisma.returnReason.count()) === 0) {
        await this.prisma.returnReason.createMany({ data: DEFAULT_REASONS as Prisma.ReturnReasonCreateManyInput[], skipDuplicates: true });
      }
    } catch (e) {
      // A database not migrated yet must not stop the API booting.
      this.logger.warn(`Return reasons not seeded: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async get(channel: SalesChannel): Promise<ReturnSettings> {
    const existing = await this.prisma.returnSettings.findUnique({ where: { channel } });
    if (existing) return existing;
    return this.prisma.returnSettings.upsert({
      where: { channel },
      create: {
        channel,
        // Retailers settle on account: a credit note is the natural default for them.
        ...(channel === SalesChannel.B2B
          ? { allowedRefundMethods: [RefundMethod.CREDIT_NOTE, RefundMethod.WALLET, RefundMethod.BANK], defaultRefundMethod: RefundMethod.CREDIT_NOTE }
          : {}),
      },
      update: {},
    });
  }

  async both() {
    return { B2C: this.view(await this.get(SalesChannel.B2C)), B2B: this.view(await this.get(SalesChannel.B2B)) };
  }

  view(s: ReturnSettings) {
    return { ...s, returnShippingFee: Number(s.returnShippingFee), restockingFeePercent: Number(s.restockingFeePercent) };
  }

  async update(channel: SalesChannel, dto: UpdateReturnSettingsDto, userId: string) {
    const current = await this.get(channel);
    const allowed = dto.allowedRefundMethods ?? current.allowedRefundMethods;
    const def = dto.defaultRefundMethod ?? current.defaultRefundMethod;
    if (allowed.length === 0) throw new BadRequestException('Allow at least one refund method');
    if (!allowed.includes(def)) throw new BadRequestException('The default refund method must be one of the allowed ones');
    if (channel === SalesChannel.B2C && allowed.includes(RefundMethod.CREDIT_NOTE)) {
      throw new BadRequestException('Credit notes apply to B2B credit accounts only');
    }
    const min = dto.minMediaCount ?? current.minMediaCount;
    const max = dto.maxMediaCount ?? current.maxMediaCount;
    if (min > max) throw new BadRequestException('Minimum photos/videos cannot exceed the maximum');

    const updated = await this.prisma.returnSettings.update({
      where: { channel },
      data: { ...dto, allowedRefundMethods: allowed, defaultRefundMethod: def, updatedById: userId },
    });
    return this.view(updated);
  }

  // ---------------------------------------------------------------- reasons

  reasons(opts: { channel?: SalesChannel; activeOnly?: boolean } = {}) {
    return this.prisma.returnReason.findMany({
      where: {
        ...(opts.activeOnly ? { isActive: true } : {}),
        ...(opts.channel ? { OR: [{ channel: null }, { channel: opts.channel }] } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async createReason(dto: ReturnReasonDto) {
    try {
      return await this.prisma.returnReason.create({ data: { ...dto, channel: dto.channel ?? null } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`Reason code ${dto.code} already exists`);
      throw e;
    }
  }

  async updateReason(id: string, dto: UpdateReturnReasonDto) {
    const r = await this.prisma.returnReason.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Reason not found');
    return this.prisma.returnReason.update({ where: { id }, data: dto });
  }
}
