import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Prisma, SalesChannel, SupportMessageAuthor, SupportTicketPriority, SupportTicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

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

const CUSTOMER_SELECT = { id: true, name: true, phone: true, customerCode: true, channel: true } as const;

/**
 * The staff help desk over tickets raised from the storefront apps. Replies land
 * in the same thread the customer reads in their app; a customer follow-up
 * shows here as "awaiting reply".
 */
@Injectable()
export class SupportTicketsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return {
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<Record<SupportTicketStatus, number>>,
      tickets: rows.map((t) => {
        const last = t.messages[0];
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
          lastMessage: last
            ? { author: last.author, preview: last.body.slice(0, 140), at: last.createdAt }
            : { author: SupportMessageAuthor.CUSTOMER, preview: t.description.slice(0, 140), at: t.createdAt },
          // The ball is in staff's court when the customer spoke last on a still-open ticket.
          awaitingReply:
            (t.status === SupportTicketStatus.OPEN || t.status === SupportTicketStatus.IN_PROGRESS) &&
            (!last || last.author === SupportMessageAuthor.CUSTOMER),
        };
      }),
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
      messages: t.messages.map((m) => ({
        id: m.id,
        author: m.author,
        body: m.body,
        createdAt: m.createdAt,
        staffName: m.staffUser?.fullName ?? null,
      })),
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
    return this.get(id);
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
    return this.get(id);
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
}

@Module({
  controllers: [SupportTicketsController],
  providers: [SupportTicketsService],
})
export class SupportTicketsModule {}
