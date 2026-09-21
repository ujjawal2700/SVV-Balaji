import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Coupon, CouponType, Prisma, SalesChannel } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { couponDiscount } from './checkout.calculator';

export class CreateCouponDto {
  @ApiProperty({ example: 'WELCOME100' }) @Matches(/^[A-Za-z0-9_-]{3,24}$/, { message: 'Code: 3-24 letters, digits, - or _' }) code!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ApiProperty({ enum: CouponType }) @IsEnum(CouponType) type!: CouponType;
  @ApiProperty() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) value!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minOrderValue?: number;
  @ApiPropertyOptional({ description: 'Cap for percent coupons' }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) maxDiscount?: number | null;
  @ApiPropertyOptional({ enum: ['ALL', 'B2C', 'B2B'] }) @IsOptional() @IsIn(['ALL', 'B2C', 'B2B']) audience?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validFrom?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) usageLimit?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) perCustomerLimit?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateCouponDto extends PartialType(CreateCouponDto) {}

export interface AppliedCoupon {
  id: string;
  code: string;
  discount: number;
}

/** Cancelled order: the coupon is usable again. A function, not a method, so SalesService can call it without importing this module. */
export async function refundCouponForOrder(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const r = await tx.couponRedemption.findUnique({ where: { orderId } });
  if (!r) return;
  await tx.couponRedemption.delete({ where: { orderId } });
  await tx.coupon.update({ where: { id: r.couponId }, data: { usedCount: { decrement: 1 } } });
}

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(dto: CreateCouponDto) {
    if (dto.type === CouponType.PERCENT && dto.value > 100) throw new BadRequestException('A percent coupon cannot exceed 100%');
    const code = dto.code.trim().toUpperCase();
    if (await this.prisma.coupon.findUnique({ where: { code } })) throw new ConflictException(`Coupon ${code} already exists`);
    return this.prisma.coupon.create({ data: this.data({ ...dto, code }) });
  }

  async update(id: string, dto: UpdateCouponDto) {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Coupon not found');
    const { code: _code, ...rest } = dto; // a code is an identity: never re-pointed after customers hold it
    return this.prisma.coupon.update({ where: { id }, data: this.data(rest) });
  }

  private data(dto: Partial<CreateCouponDto>): Prisma.CouponUncheckedCreateInput {
    return {
      ...(dto as Prisma.CouponUncheckedCreateInput),
      validFrom: dto.validFrom ? new Date(dto.validFrom) : dto.validFrom === null ? null : undefined,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : dto.expiresAt === null ? null : undefined,
    } as Prisma.CouponUncheckedCreateInput;
  }

  /** Coupons a shopper of this channel could use right now (for the "available offers" list). */
  async available(channel: SalesChannel, now = new Date()) {
    const rows = await this.prisma.coupon.findMany({
      where: {
        isActive: true,
        audience: { in: ['ALL', channel] },
        AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.filter((c) => c.usageLimit === null || c.usedCount < c.usageLimit);
  }

  /**
   * Every rule, checked against the SERVER's subtotal. Throws with the specific
   * reason - "invalid coupon" alone does not tell a shopper what to fix.
   */
  async validate(
    client: Prisma.TransactionClient | PrismaService,
    input: { code: string; customerId: string; channel: SalesChannel; subtotal: number; now?: Date },
  ): Promise<AppliedCoupon> {
    const now = input.now ?? new Date();
    const coupon = await client.coupon.findUnique({ where: { code: input.code.trim().toUpperCase() } });
    if (!coupon || !coupon.isActive) throw new BadRequestException('That coupon code is not valid');
    if (coupon.validFrom && coupon.validFrom > now) throw new BadRequestException('That coupon is not active yet');
    if (coupon.expiresAt && coupon.expiresAt <= now) throw new BadRequestException('That coupon has expired');
    if (coupon.audience !== 'ALL' && coupon.audience !== input.channel) {
      throw new BadRequestException(`That coupon is for ${coupon.audience} customers only`);
    }
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) throw new BadRequestException('That coupon has been fully redeemed');
    if (input.subtotal < Number(coupon.minOrderValue)) {
      throw new BadRequestException(`Add ₹${(Number(coupon.minOrderValue) - input.subtotal).toFixed(2)} more to use this coupon (minimum order ₹${Number(coupon.minOrderValue)})`);
    }
    if (coupon.perCustomerLimit !== null) {
      const used = await client.couponRedemption.count({ where: { couponId: coupon.id, customerId: input.customerId } });
      if (used >= coupon.perCustomerLimit) throw new BadRequestException('You have already used this coupon');
    }

    const discount = couponDiscount(
      { type: coupon.type, value: Number(coupon.value), maxDiscount: coupon.maxDiscount === null ? null : Number(coupon.maxDiscount) },
      input.subtotal,
    );
    return { id: coupon.id, code: coupon.code, discount };
  }

  /**
   * Record the use inside the order transaction. The conditional update is the
   * race guard: two orders racing for the last redemption cannot both win.
   */
  async redeem(tx: Prisma.TransactionClient, input: { coupon: AppliedCoupon; customerId: string; orderId: string; limit: Coupon['usageLimit'] }) {
    const res = await tx.coupon.updateMany({
      where: { id: input.coupon.id, ...(input.limit !== null ? { usedCount: { lt: input.limit } } : {}) },
      data: { usedCount: { increment: 1 } },
    });
    if (res.count === 0) throw new BadRequestException('That coupon has just been fully redeemed');
    await tx.couponRedemption.create({
      data: { couponId: input.coupon.id, customerId: input.customerId, orderId: input.orderId, amount: input.coupon.discount },
    });
  }

  /** Cancelled order: the coupon is usable again. */
  refundForOrder(tx: Prisma.TransactionClient, orderId: string) {
    return refundCouponForOrder(tx, orderId);
  }
}
