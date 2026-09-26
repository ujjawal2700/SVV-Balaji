import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryZone, Prisma, WarehouseKind, ZoneFallback, ZoneProductScope } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { availableByProduct } from '../../checkout/stock-holds';
import {
  isOpen,
  normalisePincode,
  parseBoundary,
  pickZone,
  productEligible,
  quickEta,
  quickFee,
  todaysHours,
  validWindow,
  type OpeningWindow,
  type ZoneShape,
} from './zone.logic';

export class OpeningWindowDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = Sunday' }) @IsInt() @Min(0) @Max(6) day!: number;
  @ApiProperty({ example: '08:00' }) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) open!: string;
  @ApiProperty({ example: '22:00' }) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) close!: string;
}

export class ZoneDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @ApiProperty({ example: 'NGP-CENTRAL' }) @IsString() @Matches(/^[A-Z0-9-]{2,30}$/, { message: 'Code: 2-30 capital letters, digits or dashes' }) code!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() quickEnabled?: boolean;
  @ApiProperty({ description: 'Outlet/warehouse that serves Quick Delivery here' }) @IsString() warehouseId!: string;

  @ApiPropertyOptional({ description: '[[lat, lng], ...], 3-500 points', type: 'array' })
  @IsOptional() @IsArray() @ArrayMaxSize(500)
  boundary?: Array<[number, number]> | null;

  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) pincodes?: string[];
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.1) @Max(100) maxRadiusKm?: number | null;

  @ApiProperty({ example: 15 }) @Type(() => Number) @IsInt() @Min(1) @Max(240) targetMinMinutes!: number;
  @ApiProperty({ example: 20 }) @Type(() => Number) @IsInt() @Min(1) @Max(240) targetMaxMinutes!: number;

  @ApiPropertyOptional({ type: [OpeningWindowDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => OpeningWindowDto)
  operatingHours?: OpeningWindowDto[];
  @ApiPropertyOptional({ example: 'Asia/Kolkata' }) @IsOptional() @IsString() @MaxLength(60) timezone?: string;

  @ApiPropertyOptional({ enum: ZoneProductScope }) @IsOptional() @IsEnum(ZoneProductScope) productScope?: ZoneProductScope;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) categoryIds?: string[];
  @ApiPropertyOptional({ enum: ZoneFallback }) @IsOptional() @IsEnum(ZoneFallback) fallback?: ZoneFallback;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) quickFee?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) quickFreeAbove?: number | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(-100) @Max(100) priority?: number;
}

export class TestAddressDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() pincode?: string;
}

/** What checkout needs to know about Quick Delivery for one cart and address. */
export interface QuickDecision {
  /** A Quick-enabled zone covers this address - show the option (possibly disabled). */
  offered: boolean;
  /** It can actually be promised for this cart right now. */
  available: boolean;
  reason: string;
  zone: { id: string; name: string; code: string; fallback: ZoneFallback } | null;
  node: { id: string; name: string; kind: WarehouseKind; branchId: string; city: string | null } | null;
  distanceKm: number | null;
  eta: { min: Date; max: Date; label: string } | null;
  fee: number | null;
  /** The zone's fee rule; checkout applies it to the post-discount goods total. */
  feeRule: { fee: number; freeAbove: number | null } | null;
}

const ZONE_INCLUDE = {
  warehouse: { select: { id: true, name: true, kind: true, branchId: true, city: true, latitude: true, longitude: true, isActive: true } },
} satisfies Prisma.DeliveryZoneInclude;

type ZoneRow = Prisma.DeliveryZoneGetPayload<{ include: typeof ZONE_INCLUDE }>;

/** Stored opening hours, keeping only well-formed windows. */
const windowsOf = (raw: unknown): OpeningWindow[] => (Array.isArray(raw) ? raw : []).filter((w): w is OpeningWindow => validWindow(w));

/**
 * Super Admin-defined delivery zones and the Quick Delivery decision.
 *
 *   customer location -> zone -> quick enabled? -> open now? -> products in
 *   scope? -> stocked at the zone's outlet? -> ETA + fee from the zone.
 *
 * Kept apart from the generic order code: checkout asks this service one
 * question and falls back to its normal routing whenever the answer is no.
 */
@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  // --- CRUD --------------------------------------------------------------------

  list() {
    return this.prisma.deliveryZone.findMany({
      include: { ...ZONE_INCLUDE, _count: { select: { orders: true } } },
      orderBy: [{ isActive: 'desc' }, { priority: 'desc' }, { name: 'asc' }],
    });
  }

  async get(id: string) {
    const z = await this.prisma.deliveryZone.findUnique({ where: { id }, include: { ...ZONE_INCLUDE, _count: { select: { orders: true } } } });
    if (!z) throw new NotFoundException('Zone not found');
    return z;
  }

  private async validate(dto: Partial<ZoneDto>, current?: DeliveryZone) {
    const min = dto.targetMinMinutes ?? current?.targetMinMinutes;
    const max = dto.targetMaxMinutes ?? current?.targetMaxMinutes;
    if (min !== undefined && max !== undefined && min > max) {
      throw new BadRequestException('The minimum delivery time cannot be more than the maximum');
    }
    if (dto.boundary !== undefined && dto.boundary !== null && !parseBoundary(dto.boundary)) {
      throw new BadRequestException('The zone boundary needs at least 3 valid points');
    }
    if (dto.pincodes) {
      const bad = dto.pincodes.filter((p) => !normalisePincode(p));
      if (bad.length) throw new BadRequestException(`Not a 6-digit pincode: ${bad.slice(0, 5).join(', ')}`);
    }
    if (dto.operatingHours && !dto.operatingHours.every(validWindow)) {
      throw new BadRequestException('Each operating window needs a day (0-6) and different open/close times (HH:mm)');
    }
    if (dto.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: dto.timezone });
      } catch {
        throw new BadRequestException(`Unknown timezone ${dto.timezone}`);
      }
    }
    const scope = dto.productScope ?? current?.productScope;
    const cats = dto.categoryIds ?? current?.categoryIds ?? [];
    if (scope === ZoneProductScope.SELECTED_CATEGORIES && cats.length === 0) {
      throw new BadRequestException('Choose at least one category, or cover all products');
    }
    if (dto.warehouseId) {
      const w = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
      if (!w || !w.isActive) throw new BadRequestException('The serving outlet must be an active warehouse');
    }
    // A zone must be able to match something.
    const boundary = dto.boundary !== undefined ? dto.boundary : (current?.boundary as unknown);
    const pins = dto.pincodes ?? current?.pincodes ?? [];
    const radius = dto.maxRadiusKm !== undefined ? dto.maxRadiusKm : current?.maxRadiusKm;
    if (!boundary && pins.length === 0 && (radius === null || radius === undefined)) {
      throw new BadRequestException('Draw a boundary, list pincodes, or set a maximum radius - otherwise the zone covers nothing');
    }
  }

  private data(dto: Partial<ZoneDto>) {
    const { boundary, pincodes, operatingHours, ...rest } = dto;
    return {
      ...rest,
      ...(boundary !== undefined ? { boundary: boundary === null ? Prisma.DbNull : (boundary as Prisma.InputJsonValue) } : {}),
      ...(pincodes !== undefined ? { pincodes: [...new Set(pincodes.map((p) => normalisePincode(p)!))] } : {}),
      ...(operatingHours !== undefined ? { operatingHours: operatingHours as unknown as Prisma.InputJsonValue } : {}),
    };
  }

  async create(dto: ZoneDto, userId: string) {
    await this.validate(dto);
    try {
      return await this.prisma.deliveryZone.create({ data: { ...(this.data(dto) as ZoneDto & Record<string, unknown>), createdById: userId } as Prisma.DeliveryZoneUncheckedCreateInput });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`Zone code ${dto.code} is already used`);
      throw e;
    }
  }

  async update(id: string, dto: Partial<ZoneDto>) {
    const current = await this.prisma.deliveryZone.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Zone not found');
    await this.validate(dto, current);
    try {
      return await this.prisma.deliveryZone.update({ where: { id }, data: this.data(dto) as Prisma.DeliveryZoneUncheckedUpdateInput });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`Zone code ${dto.code} is already used`);
      throw e;
    }
  }

  /** Zones that served orders are deactivated, never deleted (orders keep their zone). */
  async remove(id: string) {
    const z = await this.get(id);
    if (z._count.orders > 0) {
      await this.prisma.deliveryZone.update({ where: { id }, data: { isActive: false, quickEnabled: false } });
      return { deleted: false, deactivated: true };
    }
    await this.prisma.deliveryZone.delete({ where: { id } });
    return { deleted: true, deactivated: false };
  }

  // --- Eligibility -----------------------------------------------------------

  private shape(z: ZoneRow): ZoneShape {
    const w = z.warehouse;
    return {
      id: z.id,
      priority: z.priority,
      boundary: parseBoundary(z.boundary),
      pincodes: z.pincodes,
      maxRadiusKm: z.maxRadiusKm === null ? null : Number(z.maxRadiusKm),
      outlet: w.latitude !== null && w.longitude !== null ? { lat: Number(w.latitude), lng: Number(w.longitude) } : null,
    };
  }

  /** The active zone covering an address (whether or not Quick is on there). */
  async zoneFor(client: Prisma.TransactionClient | PrismaService, addr: { latitude: number | null; longitude: number | null; pincode: string | null }) {
    const zones = await client.deliveryZone.findMany({ where: { isActive: true }, include: ZONE_INCLUDE });
    const match = pickZone(zones.map((z) => this.shape(z)), { lat: addr.latitude, lng: addr.longitude, pincode: addr.pincode });
    if (!match) return null;
    return { zone: zones.find((z) => z.id === match.zoneId)!, match };
  }

  /**
   * Can this cart be promised Quick Delivery to this address right now?
   * `offered` false means the option is not shown at all.
   */
  async quickDecision(
    client: Prisma.TransactionClient | PrismaService,
    input: {
      address: { latitude: number | null; longitude: number | null; pincode: string | null };
      items: Array<{ productId: string; quantity: number }>;
      goodsTotal: number | null;
      excludeNodeIds?: string[];
      now?: Date;
    },
  ): Promise<QuickDecision> {
    const now = input.now ?? new Date();
    const none = (reason: string, extra: Partial<QuickDecision> = {}): QuickDecision => ({
      offered: false, available: false, reason, zone: null, node: null, distanceKm: null, eta: null, fee: null, feeRule: null, ...extra,
    });

    const hit = await this.zoneFor(client, input.address);
    if (!hit) return none('Quick Delivery is not available at this address');
    const { zone, match } = hit;
    const zoneRef = { id: zone.id, name: zone.name, code: zone.code, fallback: zone.fallback };
    if (!zone.quickEnabled) return none('Quick Delivery is not offered in your area', { zone: zoneRef });

    const w = zone.warehouse;
    const node = { id: w.id, name: w.name, kind: w.kind, branchId: w.branchId, city: w.city };
    const unavailable = (reason: string): QuickDecision => ({
      offered: true, available: false, reason, zone: zoneRef, node, distanceKm: match.distanceKm, eta: null, fee: null, feeRule: null,
    });

    if (!w.isActive) return unavailable('Quick Delivery is paused in your area');
    const windows = windowsOf(zone.operatingHours);
    if (!isOpen(windows, now, zone.timezone)) {
      const hours = todaysHours(windows, now, zone.timezone);
      return unavailable(`Quick Delivery is closed right now${hours ? ` (today: ${hours})` : ''}`);
    }
    if (input.excludeNodeIds?.includes(w.id)) return unavailable('Items just sold out at your nearby store');

    const ids = input.items.map((i) => i.productId);
    if (zone.productScope === ZoneProductScope.SELECTED_CATEGORIES) {
      const products = await client.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, categoryId: true, category: { select: { parentId: true } } },
      });
      const outOfScope = products.filter((p) => !productEligible(zone.productScope, zone.categoryIds, [p.categoryId, p.category?.parentId ?? null]));
      if (outOfScope.length) {
        return unavailable(`${outOfScope.map((p) => p.name).slice(0, 2).join(', ')}${outOfScope.length > 2 ? ' and more' : ''} not available for Quick Delivery`);
      }
    }

    const stock = await availableByProduct(client as Prisma.TransactionClient, w.id, ids, { now });
    const short = input.items.filter((i) => (stock.get(i.productId) ?? 0) < i.quantity);
    if (short.length) {
      const names = await client.product.findMany({ where: { id: { in: short.map((s) => s.productId) } }, select: { name: true } });
      return unavailable(`${names.map((n) => n.name).slice(0, 2).join(', ')}${names.length > 2 ? ' and more' : ''} not in stock at your nearby store`);
    }

    const feeRule = { fee: Number(zone.quickFee), freeAbove: zone.quickFreeAbove === null ? null : Number(zone.quickFreeAbove) };
    const fee = input.goodsTotal === null ? null : quickFee(input.goodsTotal, feeRule.fee, feeRule.freeAbove);
    return {
      offered: true,
      available: true,
      reason: `Quick Delivery from ${w.name}`,
      zone: zoneRef,
      node,
      distanceKm: match.distanceKm === null ? null : Math.round(match.distanceKm * 100) / 100,
      eta: quickEta(now, zone.targetMinMinutes, zone.targetMaxMinutes),
      fee,
      feeRule,
    };
  }

  /** Admin tool: which zone would this address land in, and why. */
  async test(dto: TestAddressDto) {
    const addr = { latitude: dto.latitude ?? null, longitude: dto.longitude ?? null, pincode: dto.pincode ?? null };
    const hit = await this.zoneFor(this.prisma, addr);
    if (!hit) return { zone: null, matchedBy: null, distanceKm: null, quickEnabled: false, openNow: false };
    const windows = windowsOf(hit.zone.operatingHours);
    return {
      zone: { id: hit.zone.id, name: hit.zone.name, code: hit.zone.code },
      matchedBy: hit.match.by,
      distanceKm: hit.match.distanceKm === null ? null : Math.round(hit.match.distanceKm * 100) / 100,
      quickEnabled: hit.zone.quickEnabled,
      openNow: isOpen(windows, new Date(), hit.zone.timezone),
      servingOutlet: hit.zone.warehouse.name,
    };
  }
}
