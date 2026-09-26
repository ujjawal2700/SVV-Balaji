import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DeliverySettings, FailureCategory, FailureFollowUp, Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { EventEmitter } from 'node:events';
import { PrismaService } from '../../prisma/prisma.service';

// ------------------------------------------------------------------ settings

export class UpdateDeliverySettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoOffer?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(600) offerTimeoutSeconds?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) maxOfferRounds?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(120) locationFreshMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(20) @Max(5000) geofenceMeters?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requireCodBeforeDelivery?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) maxCashInHand?: number | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1440) reattemptDelayMinutes?: number;
}

/** Single row, lazily created (same pattern as CheckoutSettings). */
@Injectable()
export class DeliverySettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<DeliverySettings> {
    const found = await this.prisma.deliverySettings.findFirst();
    return found ?? this.prisma.deliverySettings.create({ data: {} });
  }

  async update(dto: UpdateDeliverySettingsDto, userId: string) {
    const current = await this.get();
    return this.prisma.deliverySettings.update({ where: { id: current.id }, data: { ...dto, updatedById: userId } });
  }
}

// ------------------------------------------------------------------ failure reasons

export class FailureReasonDto {
  @ApiPropertyOptional({ example: 'CUSTOMER_UNAVAILABLE' }) @IsString() @Matches(/^[A-Z0-9_]{3,40}$/) code!: string;
  @ApiPropertyOptional() @IsString() @MinLength(3) @MaxLength(80) label!: string;
  @ApiPropertyOptional({ enum: FailureCategory }) @IsEnum(FailureCategory) category!: FailureCategory;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresNote?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresPhoto?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresArrival?: boolean;
  @ApiPropertyOptional({ enum: FailureFollowUp }) @IsOptional() @IsEnum(FailureFollowUp) followUp?: FailureFollowUp;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

/**
 * Starting set, created once when the table is empty. Super Admin edits,
 * disables or adds to these; nothing in code depends on the codes.
 */
const DEFAULT_REASONS: Array<Omit<Prisma.DeliveryFailureReasonCreateInput, 'id'>> = [
  { code: 'CUSTOMER_UNAVAILABLE', label: 'Customer not available', category: 'CUSTOMER_UNAVAILABLE', requiresArrival: true, sortOrder: 1 },
  { code: 'CUSTOMER_REFUSED', label: 'Customer refused the order', category: 'CUSTOMER_REFUSED', requiresArrival: true, requiresNote: true, sortOrder: 2 },
  { code: 'WRONG_ADDRESS', label: 'Wrong address', category: 'ADDRESS_ISSUE', requiresNote: true, sortOrder: 3 },
  { code: 'ADDRESS_UNREACHABLE', label: 'Address unreachable', category: 'ADDRESS_ISSUE', requiresNote: true, sortOrder: 4 },
  { code: 'RIDER_UNABLE', label: 'I am unable to deliver (vehicle / safety)', category: 'RIDER_ISSUE', requiresNote: true, sortOrder: 5 },
  { code: 'OTHER', label: 'Other', category: 'OTHER', requiresNote: true, sortOrder: 9 },
];

@Injectable()
export class FailureReasonsService implements OnModuleInit {
  private readonly logger = new Logger(FailureReasonsService.name);
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      if ((await this.prisma.deliveryFailureReason.count()) === 0) {
        await this.prisma.deliveryFailureReason.createMany({ data: DEFAULT_REASONS as Prisma.DeliveryFailureReasonCreateManyInput[], skipDuplicates: true });
        this.logger.log('Created the default failed-delivery reasons (editable by Super Admin)');
      }
    } catch (e) {
      this.logger.warn(`Could not seed failure reasons: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  list(activeOnly = false) {
    return this.prisma.deliveryFailureReason.findMany({ where: activeOnly ? { isActive: true } : {}, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] });
  }

  async create(dto: FailureReasonDto) {
    try {
      return await this.prisma.deliveryFailureReason.create({ data: dto });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`Reason code ${dto.code} exists`);
      throw e;
    }
  }

  async update(id: string, dto: Partial<FailureReasonDto>) {
    if (!(await this.prisma.deliveryFailureReason.findUnique({ where: { id } }))) throw new NotFoundException('Reason not found');
    if (dto.code) throw new BadRequestException('A reason code cannot be changed; disable it and add a new one');
    return this.prisma.deliveryFailureReason.update({ where: { id }, data: dto });
  }
}

// ------------------------------------------------------------------ events

export type DeliveryEvent =
  | { kind: 'offer:new'; riderId: string; offerId: string; taskId: string }
  | { kind: 'offer:closed'; riderId: string; offerId: string; taskId: string; status: string }
  | { kind: 'task:updated'; riderId: string | null; taskId: string; orderId: string | null; status: string }
  | { kind: 'notification'; riderId: string; notificationId: string };

/**
 * In-process bus for delivery changes. The rider socket gateway listens; order
 * changes still go through OrderEventsService so the admin feed and customer
 * tracking stay on the one existing pipeline.
 */
@Injectable()
export class DeliveryEventsService {
  private readonly emitter = new EventEmitter();

  publish(event: DeliveryEvent): void {
    setImmediate(() => {
      try {
        this.emitter.emit('event', event);
      } catch {
        /* best-effort */
      }
    });
  }

  on(handler: (e: DeliveryEvent) => void): void {
    this.emitter.on('event', handler);
  }
}
