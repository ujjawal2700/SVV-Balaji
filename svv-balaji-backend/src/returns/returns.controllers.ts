import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, Type, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SalesChannel } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CustomerContextService } from '../checkout/customer-context.service';
import { CurrentRider, RiderJwtAuthGuard, type RiderJwtPayload } from '../delivery/riders/rider-auth';
import { CurrentCustomer } from '../storefront/decorators/current-customer.decorator';
import { CustomerJwtAuthGuard } from '../storefront/guards/customer-jwt-auth.guard';
import type { CustomerJwtPayload } from '../storefront/strategies/customer-jwt.strategy';
import { StorageService, type UploadedFileLike } from '../uploads/storage.service';
import {
  ApproveDto, CompleteRefundDto, ConfirmDifferenceDto, CreateReturnRequestDto, ListReturnsQueryDto, NoteDto, PayDifferenceDto, QcDto, ReasonDto,
  RecordDifferenceDto, ReturnReasonDto, RiderFailDto, RiderLocDto, RiderOtpDto, StaffCreateReturnRequestDto, UpdateReturnReasonDto,
  UpdateReturnSettingsDto,
} from './dto/returns.dto';
import { ReturnRiderFlowService } from './return-rider-flow.service';
import { ReturnSettingsService } from './return-settings.service';
import { ReturnsService } from './returns.service';

const MEDIA = /^(image\/(jpeg|png|webp|heic|heif)|video\/(mp4|quicktime))$/;

// =================================================================== storefront

/**
 * Customers (B2C) and retailers (B2B) raising and following their own
 * requests. Every route is scoped to the signed-in account's Customer - an
 * order or request number from the client is only ever looked up "and is mine".
 */
@ApiTags('storefront-returns')
@ApiBearerAuth()
@UseGuards(CustomerJwtAuthGuard)
@Controller('storefront/returns')
export class StorefrontReturnsController {
  constructor(
    private readonly ctx: CustomerContextService,
    private readonly returns: ReturnsService,
    private readonly storage: StorageService,
  ) {}

  @Get('orders/:orderNumber/eligibility')
  @ApiOperation({ summary: 'Per item: can it be returned / exchanged, how many, until when, and why not' })
  async eligibility(@CurrentCustomer() s: CustomerJwtPayload, @Param('orderNumber') orderNumber: string) {
    return this.returns.eligibility(await this.ctx.forAccount(s.sub), orderNumber);
  }

  @Get('orders/:orderNumber/items/:orderItemId/replacements')
  @ApiOperation({ summary: 'What this item can be exchanged for (policy-filtered), with price and live availability' })
  async replacements(@CurrentCustomer() s: CustomerJwtPayload, @Param('orderNumber') orderNumber: string, @Param('orderItemId') orderItemId: string) {
    return this.returns.replacementOptions(await this.ctx.forAccount(s.sub), orderNumber, orderItemId);
  }

  @Post('media')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a photo or short video of the product; send the returned url in mediaUrls' })
  async media(@CurrentCustomer() s: CustomerJwtPayload, @UploadedFile() file: UploadedFileLike) {
    await this.ctx.forAccount(s.sub);
    if (!file || !MEDIA.test(file.mimetype)) throw new BadRequestException('Send a photo (JPEG, PNG, WebP, HEIC) or a video (MP4, MOV) as field "file"');
    const stored = await this.storage.put(file, 'return-media');
    return { url: stored.url, mimeType: stored.mimeType };
  }

  @Post()
  @ApiOperation({
    summary: 'Raise a return or exchange for one order item',
    description: 'Send an `Idempotency-Key` header: a retried request with the same key returns the request already raised.',
  })
  async create(@CurrentCustomer() s: CustomerJwtPayload, @Body() dto: CreateReturnRequestDto, @Headers('idempotency-key') key?: string) {
    return this.returns.create(await this.ctx.forAccount(s.sub), dto, { idempotencyKey: key?.slice(0, 100) });
  }

  @Get()
  async list(@CurrentCustomer() s: CustomerJwtPayload) {
    return this.returns.listMine((await this.ctx.forAccount(s.sub)).id);
  }

  @Get(':requestNumber')
  async detail(@CurrentCustomer() s: CustomerJwtPayload, @Param('requestNumber') n: string) {
    return this.returns.detailMine((await this.ctx.forAccount(s.sub)).id, n);
  }

  @Post(':requestNumber/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel before the item is collected' })
  async cancel(@CurrentCustomer() s: CustomerJwtPayload, @Param('requestNumber') n: string, @Body() dto: NoteDto) {
    return this.returns.cancelMine((await this.ctx.forAccount(s.sub)).id, n, dto.note);
  }

  @Post(':requestNumber/pay-difference')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange costs more: pay the difference (Refund Wallet first if asked, rest online)' })
  async pay(@CurrentCustomer() s: CustomerJwtPayload, @Param('requestNumber') n: string, @Body() dto: PayDifferenceDto) {
    return this.returns.payDifference(await this.ctx.forAccount(s.sub), n, dto.useWallet === true);
  }

  @Post(':requestNumber/pay-difference/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Gateway callback for the difference payment (signature verified server-side)' })
  async confirm(@CurrentCustomer() s: CustomerJwtPayload, @Param('requestNumber') n: string, @Body() dto: ConfirmDifferenceDto) {
    return this.returns.confirmDifference(await this.ctx.forAccount(s.sub), n, dto);
  }
}

// =================================================================== staff (one queue per channel)

/**
 * Customer (B2C) and retailer (B2B) returns are separate queues with separate
 * permissions: the same endpoints exist under /returns/customers and
 * /returns/retailers, and a request from one channel is a 404 in the other.
 */
function staffController(channel: SalesChannel, path: string, view: string, manage: string): Type<unknown> {
  @ApiTags(`returns-${path}`)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Controller(`returns/${path}`)
  class StaffReturnsController {
    constructor(readonly returns: ReturnsService) {}

    private actor(u: JwtPayload) {
      return { kind: 'STAFF' as const, id: u.sub };
    }

    @Get() @RequirePermission(view)
    list(@Query() q: ListReturnsQueryDto) { return this.returns.list(channel, q); }

    @Get(':id') @RequirePermission(view)
    async detail(@Param('id') id: string) { return this.returns.staffView(await this.returns.forChannel(channel, id)); }

    @Post('on-behalf/:customerId') @RequirePermission(manage)
    @ApiOperation({ summary: "Raise a request on the customer's behalf (optional window override, note required then)" })
    createFor(@Param('customerId') customerId: string, @Body() dto: StaffCreateReturnRequestDto, @CurrentUser() u: JwtPayload) {
      return this.returns.createForCustomer(channel, customerId, dto, u.sub);
    }

    @Post(':id/approve') @HttpCode(200) @RequirePermission(manage)
    @ApiOperation({ summary: 'Approve: an exchange reserves its replacement atomically; the pickup is booked straight away' })
    approve(@Param('id') id: string, @Body() dto: ApproveDto, @CurrentUser() u: JwtPayload) { return this.returns.approve(channel, id, dto, this.actor(u)); }

    @Post(':id/reject') @HttpCode(200) @RequirePermission(manage)
    reject(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: JwtPayload) { return this.returns.reject(channel, id, dto.reason, this.actor(u)); }

    @Post(':id/cancel') @HttpCode(200) @RequirePermission(manage)
    async cancel(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: JwtPayload) {
      await this.returns.cancel(await this.returns.forChannel(channel, id), dto.reason, this.actor(u));
      return this.returns.staffView(await this.returns.load(id));
    }

    @Post(':id/schedule-pickup') @HttpCode(200) @RequirePermission(manage)
    @ApiOperation({ summary: 'Book (or re-book after a failure) the rider pickup / Shiprocket reverse pickup' })
    schedule(@Param('id') id: string, @CurrentUser() u: JwtPayload) { return this.returns.schedulePickup(channel, id, this.actor(u)); }

    @Post(':id/picked-up') @HttpCode(200) @RequirePermission(manage)
    pickedUp(@Param('id') id: string, @Body() dto: NoteDto, @CurrentUser() u: JwtPayload) { return this.returns.markPickedUp(channel, id, this.actor(u), dto.note); }

    @Post(':id/pickup-failed') @HttpCode(200) @RequirePermission(manage)
    pickupFailed(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: JwtPayload) { return this.returns.markPickupFailed(channel, id, dto.reason, this.actor(u)); }

    @Post(':id/receive') @HttpCode(200) @RequirePermission('returns.qc')
    @ApiOperation({ summary: 'The item is at the warehouse (QC pending; auto-passes when QC is off for the channel)' })
    async receive(@Param('id') id: string, @Body() dto: NoteDto, @CurrentUser() u: JwtPayload) {
      await this.returns.receive(await this.returns.forChannel(channel, id), this.actor(u), dto.note);
      return this.returns.staffView(await this.returns.load(id));
    }

    @Post(':id/qc') @HttpCode(200) @RequirePermission('returns.qc')
    @ApiOperation({ summary: 'Record inspection: good packs to stock, damaged to the damaged bucket; accept or reject the claim' })
    async qc(@Param('id') id: string, @Body() dto: QcDto, @CurrentUser() u: JwtPayload) {
      await this.returns.qc(await this.returns.forChannel(channel, id), dto, this.actor(u));
      return this.returns.staffView(await this.returns.load(id));
    }

    @Post(':id/lost-in-transit') @HttpCode(200) @RequirePermission(manage)
    lost(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: JwtPayload) { return this.returns.markLostInTransit(channel, id, dto.reason, this.actor(u)); }

    @Post(':id/refund') @HttpCode(200) @RequirePermission('returns.refund')
    @ApiOperation({ summary: 'Pay the refund: Refund Wallet (instant), UPI / bank (manual, reference required) or B2B credit note' })
    refund(@Param('id') id: string, @Body() dto: CompleteRefundDto, @CurrentUser() u: JwtPayload) { return this.returns.completeRefund(channel, id, dto, this.actor(u)); }

    @Post(':id/difference/record') @HttpCode(200) @RequirePermission(manage)
    recordDiff(@Param('id') id: string, @Body() dto: RecordDifferenceDto, @CurrentUser() u: JwtPayload) { return this.returns.recordDifference(channel, id, dto.reference, this.actor(u)); }

    @Post(':id/difference/waive') @HttpCode(200) @RequirePermission(manage)
    waiveDiff(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: JwtPayload) { return this.returns.waiveDifference(channel, id, dto.reason, this.actor(u)); }

    @Post(':id/dispatch-replacement') @HttpCode(200) @RequirePermission(manage)
    @ApiOperation({ summary: 'Send the replacement: rider task (Quick) or forward Shiprocket shipment' })
    dispatchReplacement(@Param('id') id: string, @CurrentUser() u: JwtPayload) { return this.returns.dispatchReplacement(channel, id, this.actor(u)); }

    @Post(':id/replacement-delivered') @HttpCode(200) @RequirePermission(manage)
    async delivered(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
      const req = await this.returns.forChannel(channel, id);
      if (req.logistics !== 'SHIPROCKET') throw new BadRequestException('Rider deliveries are closed with the customer\'s code in the rider app');
      if (req.status !== 'SHIPPED') throw new BadRequestException('Only a shipped replacement can be marked delivered');
      await this.returns.replacementDelivered(req, this.actor(u));
      return this.returns.staffView(await this.returns.load(id));
    }

    @Post(':id/replacement-failed') @HttpCode(200) @RequirePermission(manage)
    async failed(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: JwtPayload) {
      const req = await this.returns.forChannel(channel, id);
      if (req.logistics !== 'SHIPROCKET') throw new BadRequestException('Rider deliveries are failed from the rider app');
      await this.returns.replacementFailed(req, dto.reason, this.actor(u));
      return this.returns.staffView(await this.returns.load(id));
    }

    @Post(':id/replacement-returned') @HttpCode(200) @RequirePermission(manage)
    @ApiOperation({ summary: 'The undelivered replacement is back at the warehouse: stock in, ready to re-send' })
    async back(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
      await this.returns.replacementReturned(await this.returns.forChannel(channel, id), this.actor(u));
      return this.returns.staffView(await this.returns.load(id));
    }

    @Post(':id/convert-to-refund') @HttpCode(200) @RequirePermission(manage)
    convert(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() u: JwtPayload) { return this.returns.convertToRefund(channel, id, dto.reason, this.actor(u)); }
  }
  Object.defineProperty(StaffReturnsController, 'name', { value: `${channel === 'B2C' ? 'Customer' : 'Retailer'}ReturnsController` });
  return StaffReturnsController;
}

export const CustomerReturnsController = staffController(SalesChannel.B2C, 'customers', 'returns.b2c.view', 'returns.b2c.manage');
export const RetailerReturnsController = staffController(SalesChannel.B2B, 'retailers', 'returns.b2b.view', 'returns.b2b.manage');

// =================================================================== settings

@ApiTags('return-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('return-settings')
export class ReturnSettingsController {
  constructor(private readonly settings: ReturnSettingsService) {}

  @Get() @RequirePermission('returnSettings.view')
  @ApiOperation({ summary: 'Both policies: B2C (customers) and B2B (retailers)' })
  both() { return this.settings.both(); }

  @Patch(':channel') @RequirePermission('returnSettings.manage')
  update(@Param('channel') channel: string, @Body() dto: UpdateReturnSettingsDto, @CurrentUser() u: JwtPayload) {
    if (channel !== 'B2C' && channel !== 'B2B') throw new BadRequestException('Channel is B2C or B2B');
    return this.settings.update(channel, dto, u.sub);
  }

  @Get('reasons') @RequirePermission('returnSettings.view')
  reasons() { return this.settings.reasons(); }

  @Post('reasons') @RequirePermission('returnSettings.manage')
  createReason(@Body() dto: ReturnReasonDto) { return this.settings.createReason(dto); }

  @Patch('reasons/:id') @RequirePermission('returnSettings.manage')
  updateReason(@Param('id') id: string, @Body() dto: UpdateReturnReasonDto) { return this.settings.updateReason(id, dto); }
}

// =================================================================== rider

/** Rider actions on RETURN_PICKUP / REPLACEMENT_DELIVERY tasks (listing and offers use the normal /rider routes). */
@ApiTags('rider-app')
@ApiBearerAuth()
@UseGuards(RiderJwtAuthGuard)
@Controller('rider/return-tasks')
export class RiderReturnTasksController {
  constructor(private readonly flow: ReturnRiderFlowService) {}

  @Post(':id/arrived-pickup') @HttpCode(200)
  arrivedPickup(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string, @Body() dto: RiderLocDto) { return this.flow.arrivedAtPickup(r.sub, id, dto); }

  @Post(':id/start') @HttpCode(200)
  start(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string, @Body() dto: RiderLocDto) { return this.flow.startTrip(r.sub, id, dto); }

  @Post(':id/arrived') @HttpCode(200)
  arrived(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string, @Body() dto: RiderLocDto) { return this.flow.arrivedAtCustomer(r.sub, id, dto); }

  @Post(':id/collect') @HttpCode(200)
  @ApiOperation({ summary: 'RETURN_PICKUP: item handed over, customer reads the pickup code' })
  collect(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string, @Body() dto: RiderOtpDto) { return this.flow.collectFromCustomer(r.sub, id, dto); }

  @Post(':id/hand-in') @HttpCode(200)
  @ApiOperation({ summary: 'RETURN_PICKUP: item handed in at the store (goes to QC)' })
  handIn(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string, @Body() dto: RiderLocDto) { return this.flow.handInAtStore(r.sub, id, dto); }

  @Post(':id/picked-up') @HttpCode(200)
  @ApiOperation({ summary: 'REPLACEMENT_DELIVERY: replacement collected from the store' })
  pickedUp(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string, @Body() dto: RiderLocDto) { return this.flow.collectReplacement(r.sub, id, dto); }

  @Post(':id/deliver') @HttpCode(200)
  @ApiOperation({ summary: "REPLACEMENT_DELIVERY: delivered, customer reads the delivery code" })
  deliver(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string, @Body() dto: RiderOtpDto) { return this.flow.deliverReplacement(r.sub, id, dto); }

  @Post(':id/fail') @HttpCode(200)
  fail(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string, @Body() dto: RiderFailDto) { return this.flow.fail(r.sub, id, dto); }

  @Post(':id/returned') @HttpCode(200)
  @ApiOperation({ summary: 'REPLACEMENT_DELIVERY: undelivered replacement back at the store' })
  returned(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string, @Body() dto: RiderLocDto) { return this.flow.replacementBackAtStore(r.sub, id, dto); }
}
