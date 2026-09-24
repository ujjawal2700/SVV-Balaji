import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { SupportMessageAuthor, SupportTicketStatus } from '@prisma/client';
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

export class CustomerReplyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;
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
      orderBy: { lastActivityAt: 'desc' },
      select: {
        lastActivityAt: true,
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { author: true, body: true, createdAt: true } },
        _count: { select: { messages: true } },
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
    }).then((rows) =>
      rows.map(({ messages, _count, ...t }) => ({
        ...t,
        messageCount: _count.messages + 1,
        lastMessage: messages[0]
          ? { author: messages[0].author, preview: messages[0].body.slice(0, 140), at: messages[0].createdAt }
          : null,
        // Support replied and the customer hasn't answered yet.
        hasNewReply: messages[0]?.author === SupportMessageAuthor.STAFF,
      })),
    );
  }

  /** One of MY tickets, with the whole conversation. */
  async get(c: CustomerJwtPayload, id: string) {
    const t = await this.prisma.supportTicket.findFirst({
      where: { id, customerId: this.customerIdOf(c) },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!t) throw new NotFoundException('Ticket not found');
    return {
      id: t.id,
      ticketNumber: t.ticketNumber,
      category: t.category,
      subject: t.subject,
      description: t.description,
      orderNumber: t.orderNumber,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt,
      resolvedAt: t.resolvedAt,
      // Staff are shown as "Support team" - a customer never sees an employee's name.
      messages: t.messages.map((m) => ({ id: m.id, author: m.author, body: m.body, createdAt: m.createdAt })),
    };
  }

  /** A follow-up from the customer. Replying to a resolved ticket reopens it. */
  async reply(c: CustomerJwtPayload, id: string, body: string) {
    const customerId = this.customerIdOf(c);
    const text = body.trim();
    if (!text) throw new BadRequestException('Message cannot be empty');
    const t = await this.prisma.supportTicket.findFirst({ where: { id, customerId }, select: { status: true } });
    if (!t) throw new NotFoundException('Ticket not found');
    if (t.status === SupportTicketStatus.CLOSED) {
      throw new BadRequestException('This ticket is closed. Please raise a new request if you still need help.');
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.supportTicketMessage.create({
        data: { ticketId: id, author: SupportMessageAuthor.CUSTOMER, body: text, createdAt: now },
      }),
      this.prisma.supportTicket.update({
        where: { id },
        data: {
          lastActivityAt: now,
          ...(t.status === SupportTicketStatus.RESOLVED
            ? { status: SupportTicketStatus.OPEN, resolvedAt: null, resolvedById: null }
            : {}),
        },
      }),
    ]);
    return this.get(c, id);
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
          lastActivityAt: now,
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

  @Get(':id')
  @ApiOperation({ summary: 'One of my tickets with the full conversation' })
  get(@CurrentCustomer() c: CustomerJwtPayload, @Param('id') id: string) {
    return this.service.get(c, id);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Reply on one of my tickets (reopens it if it was resolved)' })
  reply(@CurrentCustomer() c: CustomerJwtPayload, @Param('id') id: string, @Body() dto: CustomerReplyDto) {
    return this.service.reply(c, id, dto.body);
  }
}
