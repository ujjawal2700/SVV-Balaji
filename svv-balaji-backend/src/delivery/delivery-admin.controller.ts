import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, PartialType } from '@nestjs/swagger';
import { DeliveryTaskStatus, RiderStatus } from '@prisma/client';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { DeliverySettingsService, FailureReasonDto, FailureReasonsService, UpdateDeliverySettingsDto } from './core/delivery-core';
import { DispatchService } from './dispatch/dispatch.service';
import { EarningAdjustmentDto, EarningRuleDto, EarningsService } from './earnings/earnings.service';
import { ApproveRiderDto, CashDepositDto, ReasonDto, RidersService, UpdateRiderDto } from './riders/riders.service';

class AssignDto {
  @IsString() riderId!: string;
}
class NoteDto {
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}
class UpdateEarningRuleDto extends PartialType(EarningRuleDto) {}
class UpdateFailureReasonDto extends PartialType(FailureReasonDto) {}

@ApiTags('riders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('riders')
export class RidersAdminController {
  constructor(
    private readonly riders: RidersService,
    private readonly earnings: EarningsService,
  ) {}

  @Get()
  @RequirePermission('riders.view')
  list(@Query('status') status?: RiderStatus, @Query('warehouseId') warehouseId?: string, @Query('q') q?: string) {
    return this.riders.list({ status, warehouseId, q });
  }

  @Get('live')
  @RequirePermission('riders.view')
  @ApiOperation({ summary: 'Online riders with their last position and what they hold' })
  live(@Query('warehouseId') warehouseId?: string) {
    return this.riders.live(warehouseId);
  }

  @Get('earnings-report')
  @RequirePermission('riders.view')
  @ApiOperation({ summary: "Every rider's pay for a period (default this week): deliveries, failures, split by earning type" })
  earningsReport(@Query('from') from?: string, @Query('to') to?: string, @Query('warehouseId') warehouseId?: string) {
    return this.earnings.report({ from, to }, warehouseId);
  }

  @Get('cash-report')
  @RequirePermission('riders.view')
  @ApiOperation({ summary: 'Cash held by each rider and the deposits recorded in a period (default last 30 days)' })
  cashReport(@Query('from') from?: string, @Query('to') to?: string, @Query('warehouseId') warehouseId?: string) {
    return this.riders.cashReport({ from, to, warehouseId });
  }

  @Get(':id')
  @RequirePermission('riders.view')
  get(@Param('id') id: string) {
    return this.riders.get(id);
  }

  @Post(':id/approve')
  @RequirePermission('riders.manage')
  @ApiOperation({ summary: 'Approve a verified sign-up and assign the home outlet' })
  approve(@Param('id') id: string, @Body() dto: ApproveRiderDto, @CurrentUser() u: JwtPayload) {
    return this.riders.approve(id, dto, u.sub);
  }

  @Post(':id/reject')
  @RequirePermission('riders.manage')
  reject(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: JwtPayload) {
    return this.riders.reject(id, dto, u.sub);
  }

  @Post(':id/suspend')
  @RequirePermission('riders.manage')
  suspend(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: JwtPayload) {
    return this.riders.suspend(id, dto, u.sub);
  }

  @Post(':id/reactivate')
  @RequirePermission('riders.manage')
  reactivate(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    return this.riders.reactivate(id, u.sub);
  }

  @Patch(':id')
  @RequirePermission('riders.manage')
  update(@Param('id') id: string, @Body() dto: UpdateRiderDto) {
    return this.riders.update(id, dto);
  }

  @Get(':id/cash')
  @RequirePermission('riders.view')
  cash(@Param('id') id: string) {
    return this.riders.cashLedger(id);
  }

  @Post(':id/cash/deposits')
  @RequirePermission('riderCash.record')
  @ApiOperation({ summary: 'Record cash the rider handed over to the outlet' })
  deposit(@Param('id') id: string, @Body() dto: CashDepositDto, @CurrentUser() u: JwtPayload) {
    return this.riders.deposit(id, dto, u.sub);
  }

  @Get(':id/earnings')
  @RequirePermission('riders.view')
  riderEarnings(@Param('id') id: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.earnings.summary(id, { from, to });
  }

  @Post(':id/earnings/adjustments')
  @RequirePermission('deliverySettings.manage')
  adjust(@Param('id') id: string, @Body() dto: EarningAdjustmentDto, @CurrentUser() u: JwtPayload) {
    return this.earnings.adjust(id, dto, u.sub);
  }
}

@ApiTags('delivery')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('delivery')
export class DeliveryAdminController {
  constructor(
    private readonly riders: RidersService,
    private readonly dispatch: DispatchService,
    private readonly settings: DeliverySettingsService,
    private readonly reasons: FailureReasonsService,
    private readonly earnings: EarningsService,
  ) {}

  // ------------------------------------------------------------ tasks

  @Get('tasks')
  @RequirePermission('deliveryTasks.view')
  tasks(
    @Query('status') status?: DeliveryTaskStatus,
    @Query('warehouseId') warehouseId?: string,
    @Query('needsAssignment') needsAssignment?: string,
    @Query('riderId') riderId?: string,
    @Query('orderId') orderId?: string,
  ) {
    return this.riders.tasks({ status, warehouseId, needsAssignment: needsAssignment === 'true', riderId, orderId });
  }

  @Get('tasks/:id')
  @RequirePermission('deliveryTasks.view')
  task(@Param('id') id: string) {
    return this.riders.task(id);
  }

  @Post('orders/:orderId/task')
  @RequirePermission('deliveryTasks.manage')
  @ApiOperation({ summary: 'Create the delivery task for a packed local order now (normally automatic)' })
  ensure(@Param('orderId') orderId: string, @CurrentUser() u: JwtPayload) {
    return this.dispatch.ensureTaskForOrder(orderId, u.sub);
  }

  @Post('tasks/:id/assign')
  @RequirePermission('deliveryTasks.manage')
  assign(@Param('id') id: string, @Body() dto: AssignDto, @CurrentUser() u: JwtPayload) {
    return this.dispatch.assignManually(id, dto.riderId, u.sub);
  }

  @Post('tasks/:id/unassign')
  @RequirePermission('deliveryTasks.manage')
  unassign(@Param('id') id: string, @Body() dto: NoteDto, @CurrentUser() u: JwtPayload) {
    return this.dispatch.unassign(id, u.sub, dto.reason);
  }

  @Post('tasks/:id/redispatch')
  @RequirePermission('deliveryTasks.manage')
  @ApiOperation({ summary: 'Try auto-offer again for a task waiting on staff' })
  async redispatch(@Param('id') id: string) {
    return this.dispatch.dispatch(id, { ignoreRoundLimit: true });
  }

  @Post('tasks/:id/reattempt')
  @RequirePermission('deliveryTasks.manage')
  @ApiOperation({ summary: 'New delivery attempt for a failed task whose goods are back at the store' })
  reattempt(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    return this.dispatch.reattempt(id, u.sub);
  }

  // ------------------------------------------------------------ settings

  @Get('settings')
  @RequirePermission('deliveryTasks.view')
  getSettings() {
    return this.settings.get();
  }

  @Patch('settings')
  @RequirePermission('deliverySettings.manage')
  updateSettings(@Body() dto: UpdateDeliverySettingsDto, @CurrentUser() u: JwtPayload) {
    return this.settings.update(dto, u.sub);
  }

  @Get('failure-reasons')
  @RequirePermission('deliveryTasks.view')
  listReasons() {
    return this.reasons.list();
  }

  @Post('failure-reasons')
  @RequirePermission('deliverySettings.manage')
  createReason(@Body() dto: FailureReasonDto) {
    return this.reasons.create(dto);
  }

  @Patch('failure-reasons/:id')
  @RequirePermission('deliverySettings.manage')
  updateReason(@Param('id') id: string, @Body() dto: UpdateFailureReasonDto) {
    return this.reasons.update(id, dto);
  }

  // ------------------------------------------------------------ rider pay rules

  @Get('earning-rules')
  @RequirePermission('deliveryTasks.view')
  rules() {
    return this.earnings.listRules();
  }

  @Post('earning-rules')
  @RequirePermission('deliverySettings.manage')
  @ApiOperation({ summary: 'Create a rider pay rule (base, distance slabs, peak, zone, targets, waiting, cancel/fail pay)' })
  createRule(@Body() dto: EarningRuleDto, @CurrentUser() u: JwtPayload) {
    return this.earnings.createRule(dto, u.sub);
  }

  @Patch('earning-rules/:id')
  @RequirePermission('deliverySettings.manage')
  updateRule(@Param('id') id: string, @Body() dto: UpdateEarningRuleDto) {
    return this.earnings.updateRule(id, dto);
  }

  @Delete('earning-rules/:id')
  @RequirePermission('deliverySettings.manage')
  removeRule(@Param('id') id: string) {
    return this.earnings.removeRule(id);
  }
}
