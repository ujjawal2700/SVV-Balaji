import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Get dashboard summary metrics',
    description: 'Returns aggregated metrics and recent activity for the dashboard. Scoped by branch if user is not a Super Admin.',
  })
  getSummary(@CurrentUser() user: JwtPayload) {
    // If user is SUPER_ADMIN, branchId will be null so they see everything.
    // If user is branch-scoped, we pass the branchId.
    const branchId = user.role === 'SUPER_ADMIN' ? undefined : user.branchId ?? undefined;
    return this.dashboardService.getSummary(branchId);
  }
}
