import { Body, Controller, ForbiddenException, Get, Injectable, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { CustomerJwtAuthGuard } from './guards/customer-jwt-auth.guard';
import { CurrentCustomer } from './decorators/current-customer.decorator';
import type { CustomerJwtPayload } from './strategies/customer-jwt.strategy';

const CATEGORIES = ['ORDER_ISSUE', 'PAYMENT_REFUND', 'DELIVERY_DELAY', 'ACCOUNT_GST', 'OTHER'] as const;

export class CreateSupportTicketDto {
  @IsIn(CATEGORIES)
  category!: (typeof CATEGORIES)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  orderNumber?: string;
}

/** A customer/retailer's own help-desk tickets - raised from the storefront Help & Support page. */
@Injectable()
export class StorefrontSupportTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
  ) {}

  private customerIdOf(c: CustomerJwtPayload): string {
    if (!c.customerId) throw new ForbiddenException('Your account has no customer record yet.');
    return c.customerId;
  }

  async list(c: CustomerJwtPayload) {
    return this.prisma.supportTicket.findMany({
      where: { customerId: this.customerIdOf(c) },
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
        createdAt: true,
      },
    });
  }

  async create(c: CustomerJwtPayload, dto: CreateSupportTicketDto) {
    const customerId = this.customerIdOf(c);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const ticketNumber = await this.sequence.next(tx, 'TKT', now, 3);
      return tx.supportTicket.create({
        data: {
          ticketNumber,
          customerId,
          category: dto.category,
          subject: dto.subject.trim(),
          description: dto.description.trim(),
          orderNumber: dto.orderNumber?.trim() || null,
        },
      });
    });
  }
}

@ApiTags('storefront-support-tickets')
@ApiBearerAuth()
@UseGuards(CustomerJwtAuthGuard)
@Controller('storefront/support-tickets')
export class StorefrontSupportTicketsController {
  constructor(private readonly service: StorefrontSupportTicketsService) {}

  @Get()
  @ApiOperation({ summary: 'My raised support tickets, newest first' })
  list(@CurrentCustomer() c: CustomerJwtPayload) {
    return this.service.list(c);
  }

  @Post()
  @ApiOperation({ summary: 'Raise a new support ticket' })
  create(@CurrentCustomer() c: CustomerJwtPayload, @Body() dto: CreateSupportTicketDto) {
    return this.service.create(c, dto);
  }
}
