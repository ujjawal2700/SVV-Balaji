import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Optional, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { Prisma, SalesChannel, SupportMessageAuthor, SupportResolutionAction, SupportTicketPriority, SupportTicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { AdminOrdersGateway } from '../realtime/admin-orders.gateway';

export class StaffReplyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;
}

export class UpdateTicketDto {
  @ApiPropertyOptional({ enum: SupportTicketStatus })
  @IsOptional()
  @IsIn(Object.values(SupportTicketStatus))
  status?: SupportTicketStatus;

  @ApiPropertyOptional({ enum: SupportTicketPriority })
  @IsOptional()
  @IsIn(Object.values(SupportTicketPriority))
  priority?: SupportTicketPriority;
}

export class ResolveTicketDto {
  @IsIn(Object.values(SupportResolutionAction))
  action!: SupportResolutionAction;

  @IsOptional()
  @IsNumber()
  refundAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  replacementOrderNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalAuditNote?: string;
}

const CUSTOMER_SELECT = { id: true, name: true, phone: true, customerCode: true, channel: true } as const;

export interface SupportTicketProductInfo {
  id: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  price: number | null;
  quantity: number | null;
}

async function resolveTicketProduct(
  prisma: PrismaService,
  subject: string,
  orderNumber: string | null,
  cachedOrder?: any,
): Promise<SupportTicketProductInfo | null> {
  let product: SupportTicketProductInfo | null = null;

  if (orderNumber) {
    try {
      const order =
        cachedOrder !== undefined
          ? cachedOrder
          : await prisma.order.findUnique({
              where: { orderNumber },
              include: {
                items: {
                  include: {
                    product: { select: { id: true, name: true, sku: true, images: true } },
                  },
                },
              },
            });

      if (order && order.items && order.items.length > 0) {
        const subLower = subject.toLowerCase();
        const matched =
          order.items.find((it: any) => it.product && subLower.includes(it.product.name.toLowerCase().slice(0, 15))) ??
          order.items[0];
        if (matched?.product) {
          product = {
            id: matched.product.id,
            name: matched.product.name,
            sku: matched.product.sku ?? null,
            imageUrl: matched.product.images?.[0] ?? '/images/cat_spices.jpg',
            price: Number(matched.unitPrice ?? 0),
            quantity: matched.quantity ?? 1,
          };
        }
      }
    } catch {
      /* proceed to subject extraction */
    }
  }

  if (!product) {
    // Extract candidate product name from subject
    // Example: "[DesiTokri Support] Refund request for Premium Whole Spices Combo – Dalchini, Black Cardamom, Green Cardamom, Black Pepper & Cloves (Damaged / Spoiled)"
    const match = subject.match(/(?:request for|issue with|regarding|for)\s+(.*?)(?:\s*\([^)]*\))?$/i);
    let extracted = match && match[1] ? match[1].trim() : null;
    if (extracted && /^for\s+/i.test(extracted)) {
      extracted = extracted.replace(/^for\s+/i, '').trim();
    }
    if (extracted) {
      try {
        const firstWord = extracted.split(/[\s–-]/)[0];
        const prod = await prisma.product.findFirst({
          where: {
            OR: [
              { name: { contains: extracted.slice(0, 25), mode: 'insensitive' } },
              { name: { contains: firstWord, mode: 'insensitive' } },
            ],
          },
          select: { id: true, name: true, sku: true, images: true },
        });
        if (prod) {
          product = {
            id: prod.id,
            name: extracted.length > prod.name.length ? extracted : prod.name,
            sku: prod.sku ?? null,
            imageUrl: prod.images?.[0] ?? '/images/cat_spices.jpg',
            price: null,
            quantity: null,
          };
        }
      } catch {
        /* fallback to synthesized product below */
      }
      if (!product) {
        const lower = extracted.toLowerCase();
        const fallbackImage = lower.includes('spice')
          ? '/images/cat_spices.jpg'
          : lower.includes('atta') || lower.includes('flour')
          ? '/images/premium_atta.jpg'
          : lower.includes('namkeen') || lower.includes('bhujia')
          ? '/images/aloo_bhujia.jpg'
          : lower.includes('chip') || lower.includes('wafer')
          ? '/images/cat_wafers.jpg'
          : '/images/cat_spices.jpg';
        product = {
          id: '',
          name: extracted,
          sku: null,
          imageUrl: fallbackImage,
          price: null,
          quantity: null,
        };
      }
    }
  }

  return product;
}

/**
 * The staff help desk over tickets raised from the storefront apps. Replies land
 * in the same thread the customer reads in their app; a customer follow-up
 * shows here as "awaiting reply".
 */
@Injectable()
export class SupportTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly gateway?: AdminOrdersGateway,
  ) {}

  async list(filters: { status?: SupportTicketStatus; channel?: SalesChannel; search?: string }) {
    const search = filters.search?.trim();
    const where: Prisma.SupportTicketWhereInput = {
      status: filters.status,
      customer: filters.channel ? { channel: filters.channel } : undefined,
      ...(search
        ? {
            OR: [
              { ticketNumber: { contains: search, mode: 'insensitive' } },
              { subject: { contains: search, mode: 'insensitive' } },
              { orderNumber: { contains: search, mode: 'insensitive' } },
              { customer: { name: { contains: search, mode: 'insensitive' } } },
              { customer: { phone: { contains: search } } },
            ],
          }
        : {}),
    };

    const [rows, counts] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { lastActivityAt: 'desc' },
        take: 200,
        include: {
          customer: { select: CUSTOMER_SELECT },
          messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { author: true, body: true, createdAt: true } },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.supportTicket.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    // Batch query orders to resolve product details quickly
    const orderNumbers = [...new Set(rows.map((r) => r.orderNumber).filter(Boolean))] as string[];
    const orders =
      orderNumbers.length > 0
        ? await this.prisma.order.findMany({
            where: { orderNumber: { in: orderNumbers } },
            include: {
              items: {
                include: {
                  product: { select: { id: true, name: true, sku: true, images: true } },
                },
              },
            },
          })
        : [];
    const orderMap = new Map(orders.map((o) => [o.orderNumber, o]));

    const tickets = await Promise.all(
      rows.map(async (t) => {
        const last = t.messages[0];
        const cachedOrder = t.orderNumber ? orderMap.get(t.orderNumber) : null;
        const product = await resolveTicketProduct(this.prisma, t.subject, t.orderNumber, cachedOrder);

        return {
          id: t.id,
          ticketNumber: t.ticketNumber,
          category: t.category,
          subject: t.subject,
          orderNumber: t.orderNumber,
          status: t.status,
          priority: t.priority,
          customer: t.customer,
          createdAt: t.createdAt,
          lastActivityAt: t.lastActivityAt,
          messageCount: t._count.messages + 1, // + the opening description
          product,
          lastMessage: last
            ? { author: last.author, preview: last.body.slice(0, 140), at: last.createdAt }
            : { author: SupportMessageAuthor.CUSTOMER, preview: t.description.slice(0, 140), at: t.createdAt },
          // The ball is in staff's court when the customer spoke last on a still-open ticket.
          awaitingReply:
            (t.status === SupportTicketStatus.OPEN || t.status === SupportTicketStatus.IN_PROGRESS) &&
            (!last || last.author === SupportMessageAuthor.CUSTOMER),
          resolutionAction: t.resolutionAction ?? null,
        };
      }),
    );

    return {
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<Record<SupportTicketStatus, number>>,
      tickets,
    };
  }

  async get(id: string) {
    const t = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        customer: { select: { ...CUSTOMER_SELECT, email: true } },
        resolvedBy: { select: { id: true, fullName: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { staffUser: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!t) throw new NotFoundException('Ticket not found');

    const product = await resolveTicketProduct(this.prisma, t.subject, t.orderNumber);

    // Enrich with order details for the resolution drawer
    let orderDetails: { amount: number; date: string; items: Array<{ productName: string; quantity: number; unitPrice: number; sku: string | null; imageUrl: string | null }> } | null = null;
    if (t.orderNumber) {
      try {
        const order = await this.prisma.order.findUnique({
          where: { orderNumber: t.orderNumber },
          select: {
            total: true,
            createdAt: true,
            items: {
              select: {
                quantity: true,
                unitPrice: true,
                product: { select: { name: true, sku: true, images: true } },
              },
            },
          },
        });
        if (order) {
          orderDetails = {
            amount: Number(order.total ?? 0),
            date: order.createdAt?.toISOString() ?? '',
            items: order.items.map((it: any) => ({
              productName: it.product?.name ?? 'Unknown Product',
              quantity: it.quantity ?? 1,
              unitPrice: Number(it.unitPrice ?? 0),
              sku: it.product?.sku ?? null,
              imageUrl: it.product?.images?.[0] ?? null,
            })),
          };
        }
      } catch { /* order not found or query error - skip enrichment */ }
    }

    return {
      id: t.id,
      ticketNumber: t.ticketNumber,
      category: t.category,
      subject: t.subject,
      description: t.description,
      orderNumber: t.orderNumber,
      status: t.status,
      priority: t.priority,
      customer: t.customer,
      createdAt: t.createdAt,
      resolvedAt: t.resolvedAt,
      resolvedBy: t.resolvedBy,
      product,
      messages: t.messages.map((m) => ({
        id: m.id,
        author: m.author,
        body: m.body,
        createdAt: m.createdAt,
        staffName: m.staffUser?.fullName ?? null,
      })),
      // Resolution / complaint fields
      evidenceImages: t.evidenceImages ?? [],
      resolutionAction: t.resolutionAction ?? null,
      refundAmount: t.refundAmount ? Number(t.refundAmount) : null,
      replacementOrderNumber: t.replacementOrderNumber ?? null,
      resolutionNote: t.resolutionNote ?? null,
      internalAuditNote: t.internalAuditNote ?? null,
      orderDetails,
    };
  }

  async reply(id: string, staffUserId: string, body: string) {
    const text = body.trim();
    if (!text) throw new BadRequestException('Reply cannot be empty');
    const t = await this.prisma.supportTicket.findUnique({ where: { id }, select: { status: true } });
    if (!t) throw new NotFoundException('Ticket not found');
    if (t.status === SupportTicketStatus.CLOSED) {
      throw new BadRequestException('This ticket is closed. Reopen it before replying.');
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.supportTicketMessage.create({
        data: { ticketId: id, author: SupportMessageAuthor.STAFF, staffUserId, body: text, createdAt: now },
      }),
      this.prisma.supportTicket.update({
        where: { id },
        // First staff reply moves an open ticket to "in progress".
        data: { lastActivityAt: now, ...(t.status === SupportTicketStatus.OPEN ? { status: SupportTicketStatus.IN_PROGRESS } : {}) },
      }),
    ]);

    const thread = await this.get(id);
    const lastMsg = thread.messages[thread.messages.length - 1];
    this.gateway?.broadcastTicket('tickets:message', {
      ticketId: id,
      message: lastMsg,
      status: thread.status,
      lastActivityAt: now.toISOString(),
      awaitingReply: false,
    });

    return thread;
  }

  async update(id: string, staffUserId: string, dto: UpdateTicketDto) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id }, select: { id: true } });
    if (!t) throw new NotFoundException('Ticket not found');
    const closing = dto.status === SupportTicketStatus.RESOLVED || dto.status === SupportTicketStatus.CLOSED;
    const reopening = dto.status === SupportTicketStatus.OPEN || dto.status === SupportTicketStatus.IN_PROGRESS;
    await this.prisma.supportTicket.update({
      where: { id },
      data: {
        status: dto.status,
        priority: dto.priority,
        ...(closing ? { resolvedAt: new Date(), resolvedById: staffUserId } : {}),
        ...(reopening ? { resolvedAt: null, resolvedById: null } : {}),
        ...(dto.status ? { lastActivityAt: new Date() } : {}),
      },
    });

    const thread = await this.get(id);
    this.gateway?.broadcastTicket('tickets:updated', {
      ticketId: id,
      status: thread.status,
      priority: thread.priority,
      resolvedAt: thread.resolvedAt,
      resolvedBy: thread.resolvedBy,
    });

    return thread;
  }

  /** Process a formal resolution action: refund, replacement, reverse pickup, or reject. */
  async resolve(id: string, staffUserId: string, dto: ResolveTicketDto) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!t) throw new NotFoundException('Ticket not found');
    if (t.status === SupportTicketStatus.CLOSED) {
      throw new BadRequestException('Cannot resolve a closed ticket. Reopen it first.');
    }

    // Map action to appropriate final status
    const resolvedStatus =
      dto.action === SupportResolutionAction.REJECTED
        ? SupportTicketStatus.CLOSED
        : SupportTicketStatus.RESOLVED;

    const now = new Date();
    await this.prisma.supportTicket.update({
      where: { id },
      data: {
        resolutionAction: dto.action,
        refundAmount: dto.refundAmount != null ? new Prisma.Decimal(dto.refundAmount) : undefined,
        replacementOrderNumber: dto.replacementOrderNumber ?? undefined,
        internalAuditNote: dto.internalAuditNote ?? undefined,
        resolutionNote: dto.internalAuditNote ?? undefined,
        status: resolvedStatus,
        resolvedAt: now,
        resolvedById: staffUserId,
        lastActivityAt: now,
      },
    });

    const thread = await this.get(id);
    this.gateway?.broadcastTicket('tickets:resolved', {
      ticketId: id,
      status: thread.status,
      resolutionAction: thread.resolutionAction,
      resolvedAt: thread.resolvedAt,
      resolvedBy: thread.resolvedBy,
    });

    return thread;
  }
}

@ApiTags('support-tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('support-tickets')
export class SupportTicketsController {
  constructor(private readonly service: SupportTicketsService) {}

  @Get()
  @RequirePermission('supportTickets.view')
  @ApiOperation({ summary: 'Help-desk inbox - every storefront ticket, most recent activity first, with per-status counts' })
  @ApiQuery({ name: 'status', enum: SupportTicketStatus, required: false })
  @ApiQuery({ name: 'channel', enum: SalesChannel, required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Ticket no., subject, order no., customer name or phone' })
  list(@Query('status') status?: SupportTicketStatus, @Query('channel') channel?: SalesChannel, @Query('search') search?: string) {
    return this.service.list({
      status: status && Object.values(SupportTicketStatus).includes(status) ? status : undefined,
      channel: channel && Object.values(SalesChannel).includes(channel) ? channel : undefined,
      search: search?.slice(0, 80),
    });
  }

  @Get(':id')
  @RequirePermission('supportTickets.view')
  @ApiOperation({ summary: 'One ticket with its full conversation' })
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post(':id/messages')
  @RequirePermission('supportTickets.reply')
  @ApiOperation({ summary: 'Reply to the customer - they see it in their app' })
  reply(@Param('id') id: string, @Body() dto: StaffReplyDto, @CurrentUser() user: JwtPayload) {
    return this.service.reply(id, user.sub, dto.body);
  }

  @Patch(':id')
  @RequirePermission('supportTickets.reply')
  @ApiOperation({ summary: 'Change status (open / in progress / resolved / closed) or priority' })
  update(@Param('id') id: string, @Body() dto: UpdateTicketDto, @CurrentUser() user: JwtPayload) {
    return this.service.update(id, user.sub, dto);
  }

  @Post(':id/resolve')
  @RequirePermission('supportTickets.reply')
  @ApiOperation({ summary: 'Process formal resolution action: approve refund, dispatch replacement, assign reverse pickup, or reject' })
  resolve(@Param('id') id: string, @Body() dto: ResolveTicketDto, @CurrentUser() user: JwtPayload) {
    return this.service.resolve(id, user.sub, dto);
  }
}

@Module({
  controllers: [SupportTicketsController],
  providers: [SupportTicketsService],
})
export class SupportTicketsModule {}
