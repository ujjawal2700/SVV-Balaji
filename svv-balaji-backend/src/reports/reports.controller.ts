import { BadRequestException, Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SalesChannel } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ReportsService, type ReportFilters } from './reports.service';

const FILTER_HELP =
  'from / to: YYYY-MM-DD, IST, inclusive (default: the last 30 days; at most one year). channel: B2B | B2C. ' +
  'branchId: Super Admin only - everyone else is held to their own branch.';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  private filters(q: Record<string, string | undefined>): ReportFilters {
    if (q.channel && !(Object.values(SalesChannel) as string[]).includes(q.channel)) {
      throw new BadRequestException(`Unknown channel "${q.channel}"`);
    }
    return { from: q.from || undefined, to: q.to || undefined, channel: (q.channel as SalesChannel) || undefined, branchId: q.branchId || undefined };
  }

  @Get('sales')
  @RequirePermission('reports.sales')
  @ApiOperation({
    summary: 'Sales analytics: KPIs vs the previous period, trend, sources, products, categories, regions, B2B reorder cycles, cohorts',
    description:
      FILTER_HELP +
      ' Revenue is GST-inclusive order value of orders placed in the range and not cancelled, plus completed POS sales ' +
      '(POS is left out when channel=B2B). Gross margin is not available: there is no product cost in the system yet.',
  })
  sales(@CurrentUser() user: JwtPayload, @Query() q: Record<string, string | undefined>) {
    return this.reports.sales(user, this.filters(q));
  }

  @Get('sales/export')
  @RequirePermission('reports.sales')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="sales-orders.csv"')
  @ApiOperation({ summary: 'Every order placed in the range (same filters) as CSV, up to 20,000 rows' })
  salesCsv(@CurrentUser() user: JwtPayload, @Query() q: Record<string, string | undefined>) {
    return this.reports.salesCsv(user, this.filters(q));
  }

  @Get('finance')
  @RequirePermission('reports.finance')
  @ApiOperation({
    summary: 'Earnings & financial MIS: billed vs collected per channel, collections by mode, refunds, GST, receivables, payables',
    description:
      FILTER_HELP +
      ' (channel is ignored here - every channel is shown side by side.) "Billed" is accrual (orders placed in the range); ' +
      '"collections" are cash basis (money received in the range, whatever order it was for).',
  })
  finance(@CurrentUser() user: JwtPayload, @Query() q: Record<string, string | undefined>) {
    return this.reports.finance(user, { ...this.filters(q), channel: undefined });
  }
}
