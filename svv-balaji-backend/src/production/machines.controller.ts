import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { scopedBranchId } from '../common/branch-scope';
import { CreateMachineDto, MachinesService, UpdateMachineDto } from './machines.service';
import { ProductionCostService, RecordProductionCostDto } from './production-cost.service';

@ApiTags('production')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class MachinesController {
  constructor(private readonly machines: MachinesService, private readonly cost: ProductionCostService) {}

  // --- Machine master -------------------------------------------------------

  @Get('machines')
  @RequirePermission('machines.view')
  list(@CurrentUser() user: JwtPayload, @Query('branchId') branchId?: string, @Query('activeOnly') activeOnly?: string) {
    return this.machines.list(user, { branchId, activeOnly: activeOnly === 'true' });
  }

  @Get('machines/utilisation')
  @RequirePermission('machines.view')
  @ApiOperation({ summary: 'Runs, run hours, output and utilisation % per machine over an IST date range (from/to YYYY-MM-DD)' })
  utilisation(@CurrentUser() user: JwtPayload, @Query('from') from?: string, @Query('to') to?: string, @Query('branchId') branchId?: string) {
    return this.machines.utilisation(user, { from, to, branchId });
  }

  @Post('machines')
  @RequirePermission('machines.manage')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateMachineDto) {
    this.assertOwnBranch(user, dto.branchId);
    return this.machines.create(dto);
  }

  @Patch('machines/:id')
  @RequirePermission('machines.manage')
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateMachineDto) {
    if (dto.branchId) this.assertOwnBranch(user, dto.branchId);
    return this.machines.update(id, dto);
  }

  @Delete('machines/:id')
  @RequirePermission('machines.manage')
  @ApiOperation({ summary: 'Delete a machine no run was booked on (otherwise deactivate it)' })
  remove(@Param('id') id: string) {
    return this.machines.remove(id);
  }

  // --- Production cost ------------------------------------------------------

  @Get('production-cost/report')
  @RequirePermission('production.cost.view')
  @ApiOperation({ summary: 'Production cost report: completed runs in an IST range with raw / labour / machine / loss / other cost' })
  report(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
    @Query('productId') productId?: string,
  ) {
    return this.cost.report(user, { from, to, branchId, productId });
  }

  @Get('production-batches/:id/cost')
  @RequirePermission('production.cost.view')
  @ApiOperation({ summary: 'Cost sheet of a run. Raw material is calculated from the purchase rate of every batch consumed.' })
  getCost(@Param('id') id: string) {
    return this.cost.get(id);
  }

  @Put('production-batches/:id/cost')
  @RequirePermission('production.cost.edit')
  @ApiOperation({ summary: 'Record labour / machine / loss / other cost of a run (raw material is automatic unless overridden)' })
  recordCost(@Param('id') id: string, @Body() dto: RecordProductionCostDto, @CurrentUser() user: JwtPayload) {
    return this.cost.record(id, dto, user.sub);
  }

  private assertOwnBranch(user: JwtPayload, branchId: string) {
    const scope = scopedBranchId(user);
    if (scope && scope !== branchId) throw new ForbiddenException('You can only manage machines of your own branch');
  }
}
