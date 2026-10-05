import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, PartialType } from '@nestjs/swagger';
import { DeliveryTaskStatus, RiderStatus } from '@prisma/client';
import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { DeliverySettingsService, FailureReasonDto, FailureReasonsService, UpdateDeliverySettingsDto } from './core/delivery-core';
import { DispatchService } from './dispatch/dispatch.service';
import { EarningAdjustmentDto, EarningRuleDto, EarningsService } from './earnings/earnings.service';
import { ApproveRiderDto, CashDepositDto, ReasonDto, RidersService, UpdateRiderDto } from './riders/riders.service';
import { DocumentTypeDto, RecordDepositDto, RejectDocumentDto, ReviewDocumentDto, RiderVerificationService } from './verification/verification.service';

class AssignDto {
  @IsString() riderId!: string;
}
class AutoDispatchDto {
  @IsBoolean() paused!: boolean;
}
class NoteDto {
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}
class UpdateEarningRuleDto extends PartialType(EarningRuleDto) {}
class UpdateFailureReasonDto extends PartialType(FailureReasonDto) {}
class UpdateDocumentTypeDto extends PartialType(DocumentTypeDto) {}

@ApiTags('riders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('riders')
export class RidersAdminController {
  constructor(
    private readonly riders: RidersService,
    private readonly earnings: EarningsService,
    private readonly verification: RiderVerificationService,
  ) {}

  // ------------------------------------------------------------ verification (static paths before :id)

  @Get('verification-queue')
  @RequirePermission('riders.view')
  @ApiOperation({ summary: 'Rider documents (incl. PCC) waiting for review, oldest first' })
  verificationQueue(@Query('type') typeCode?: string, @Query('warehouseId') warehouseId?: string) {
    return this.verification.queue({ typeCode, warehouseId });
  }

  @Get('document-types')
  @RequirePermission('riders.view')
  @ApiOperation({ summary: 'Documents riders must upload (PCC is built in and always mandatory)' })
  documentTypes() {
    return this.verification.listTypes();
  }

  @Post('document-types')
  @RequirePermission('deliverySettings.manage')
  createDocumentType(@Body() dto: DocumentTypeDto) {
    return this.verification.createType(dto);
  }

  @Patch('document-types/:typeId')
  @RequirePermission('deliverySettings.manage')
  updateDocumentType(@Param('typeId') typeId: string, @Body() dto: UpdateDocumentTypeDto) {
    return this.verification.updateType(typeId, dto);
  }

  @Post('documents/:docId/approve')
  @RequirePermission('riders.verify')
  @ApiOperation({ summary: "Approve one uploaded document; returns the rider's updated checklist" })
  approveDocument(@Param('docId') docId: string, @Body() dto: ReviewDocumentDto, @CurrentUser() u: JwtPayload) {
    return this.verification.approve(docId, dto, u.sub);
  }

  @Post('documents/:docId/reject')
  @RequirePermission('riders.verify')
  @ApiOperation({ summary: 'Reject an upload (or withdraw an approval) with a reason the rider sees; the rider re-uploads' })
  rejectDocument(@Param('docId') docId: string, @Body() dto: RejectDocumentDto, @CurrentUser() u: JwtPayload) {
    return this.verification.reject(docId, dto, u.sub);
  }

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

  @Get(':id/verification')
  @RequirePermission('riders.view')
  @ApiOperation({ summary: "The rider's checklist (documents, PCC, deposit) plus every upload ever made" })
  async riderVerification(@Param('id') id: string) {
    const [summary, history] = await Promise.all([this.verification.summary(id), this.verification.history(id)]);
    return { ...summary, history };
  }

  @Get(':id/deposit')
  @RequirePermission('riders.view')
  riderDeposit(@Param('id') id: string) {
    return this.verification.deposit(id);
  }

  @Post(':id/deposit/entries')
  @RequirePermission('riderDeposit.record')
  @ApiOperation({ summary: 'Record a security deposit payment, refund, forfeit or adjustment' })
  recordDeposit(@Param('id') id: string, @Body() dto: RecordDepositDto, @CurrentUser() u: JwtPayload) {
    return this.verification.recordDeposit(id, dto, u.sub);
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
    private readonly verification: RiderVerificationService,
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

  @Get('availability')
  @RequirePermission('deliveryTasks.view')
  @ApiOperation({ summary: 'Riders per outlet right now: available (would be offered work), busy, not responding, offline' })
  availability(@Query('warehouseId') warehouseId?: string) {
    return this.dispatch.availability(warehouseId);
  }

  @Get('tasks/:id')
  @RequirePermission('deliveryTasks.view')
  task(@Param('id') id: string) {
    return this.riders.task(id);
  }

  @Get('tasks/:id/candidates')
  @RequirePermission('deliveryTasks.view')
  @ApiOperation({ summary: "The outlet's riders ranked as the dispatcher would offer this task, with why anyone is skipped" })
  candidates(@Param('id') id: string) {
    return this.dispatch.candidates(id);
  }

  @Post('tasks/:id/auto-dispatch')
  @RequirePermission('deliveryTasks.manage')
  @ApiOperation({ summary: 'Override for one waiting task: paused = staff assign it (open offers withdrawn); resumed = offer to riders again' })
  autoDispatch(@Param('id') id: string, @Body() dto: AutoDispatchDto, @CurrentUser() u: JwtPayload) {
    return this.dispatch.setAutoDispatch(id, dto.paused, u.sub);
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
  @ApiOperation({ summary: 'Try auto-offer again for a task waiting on staff (also resumes a paused one)' })
  async redispatch(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    return this.dispatch.setAutoDispatch(id, false, u.sub);
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
  async updateSettings(@Body() dto: UpdateDeliverySettingsDto, @CurrentUser() u: JwtPayload) {
    const before = await this.settings.get();
    const saved = await this.settings.update(dto, u.sub);
    // The deposit rule decides who may take orders: re-check every rider when it moves.
    if (before.securityDepositRequired !== saved.securityDepositRequired || !before.securityDepositAmount.equals(saved.securityDepositAmount)) {
      await this.verification.recomputeAll('Security deposit rule changed');
    }
    return saved;
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
