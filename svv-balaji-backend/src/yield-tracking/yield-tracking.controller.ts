import { Controller, Get, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { YieldTrackingService } from './yield-tracking.service';
import { YieldChainQueryDto } from './dto/yield-tracking-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * Loss / Yield Tracking (Supply Chain / Processing).
 *
 * Read-only. Aggregates figures already recorded by the existing Cleaning &
 * Grading, Production and Finished Goods phases - it does not add a phase or
 * change how any of those endpoints behave.
 */
@ApiTags('supply-chain-yield')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('supply-chain/yield')
export class YieldTrackingController {
  constructor(private readonly yieldTracking: YieldTrackingService) {}

  @Get()
  @RequirePermission('supplyChain.yieldView')
  @ApiOperation({
    summary: 'List loss/yield chains, one row per completed production run',
    description:
      'Stage-wise loss (Cleaning & Grading -> Production -> Finished Goods), chain totals and the ' +
      '>8% high-loss alert flag. Filterable by date range, product and branch; paginated.',
  })
  list(@CurrentUser() user: JwtPayload, @Query() query: YieldChainQueryDto) {
    return this.yieldTracking.list(user, query);
  }

  @Get('chain')
  @RequirePermission('supplyChain.yieldView')
  @ApiOperation({
    summary: 'Full stage-wise chain for one production run',
    description: 'Resolve by productionBatchId or fgBatchNumber - exactly one must be given.',
  })
  async detail(
    @Query('productionBatchId') productionBatchId?: string,
    @Query('fgBatchNumber') fgBatchNumber?: string,
  ) {
    if (!productionBatchId && !fgBatchNumber) {
      throw new NotFoundException('Provide either productionBatchId or fgBatchNumber');
    }
    return this.yieldTracking.detail({ productionBatchId, fgBatchNumber });
  }

  @Get('farmer-quality')
  @RequirePermission('supplyChain.yieldView')
  @ApiOperation({
    summary: 'Average loss % per farmer/supplier, highest first',
    description:
      'Pools cleaning wastage and the production loss of runs that consumed their raw material ' +
      'batches, so a repeatedly high-loss source stands out. Extends the FRD 7.6 farmer ' +
      'performance pattern rather than duplicating it.',
  })
  farmerQuality(@CurrentUser() user: JwtPayload) {
    return this.yieldTracking.farmerQuality(user);
  }

  @Get('machine-health')
  @RequirePermission('supplyChain.yieldView')
  @ApiOperation({
    summary: 'Machine loss history and maintenance-review flags',
    description:
      'Per machine, its historical average production loss %, and any run whose loss is more ' +
      'than 1.5x that average - a candidate for maintenance review.',
  })
  machineHealth(@CurrentUser() user: JwtPayload) {
    return this.yieldTracking.machineHealth(user);
  }
}
