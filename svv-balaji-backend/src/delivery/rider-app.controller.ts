import { BadRequestException, Body, ConflictException, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsArray, IsEmail, IsEnum, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { VehicleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService, type UploadedFileLike } from '../uploads/storage.service';
import { FailureReasonsService } from './core/delivery-core';
import { DispatchService } from './dispatch/dispatch.service';
import { CollectCodDto, DeliverDto, FailDto, LocationDto, ReleaseDto, TaskFlowService } from './dispatch/task-flow.service';
import { RiderPayoutsService } from './earnings/payouts.service';
import { EarningsService } from './earnings/earnings.service';
import {
  CurrentRider,
  RiderAuthService,
  RiderJwtAuthGuard,
  RiderLoginDto,
  RiderPhoneDto,
  RiderRefreshDto,
  RiderResetPasswordDto,
  RiderSignupDto,
  RiderVerifyDto,
  type RiderJwtPayload,
} from './riders/rider-auth';
import { AvailabilityDto, CreateCashSettlementOrderDto, RidersService, VerifyCashSettlementDto } from './riders/riders.service';
import { CreateDepositOrderDto, RiderVerificationService, SubmitRiderDocumentDto, VerifyDepositPaymentDto } from './verification/verification.service';

class RejectOfferDto {
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}
class MarkReadDto {
  @IsOptional() @IsArray() @IsString({ each: true }) ids?: string[];
}
export class UpdateRiderProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(80) @Matches(/^[a-zA-Z\s.'-]+$/, { message: 'Full name should only contain letters' }) fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail({}, { message: 'Enter a valid email address' }) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) @Matches(/^[a-zA-Z\s.'-]+$/, { message: 'City should only contain letters' }) city?: string;
  @ApiPropertyOptional({ enum: VehicleType }) @IsOptional() @IsEnum(VehicleType) vehicleType?: VehicleType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) @Matches(/^[A-Z0-9\s-]{5,15}$/i, { message: 'Enter a valid vehicle number' }) vehicleNumber?: string;
  @ApiPropertyOptional({ description: 'Heaviest load (kg) you can carry at once - deliveries heavier than what is left are not offered to you', example: 15 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(500) maxCarryKg?: number;
}

const IMAGE = /^image\/(jpeg|png|webp|heic|heif)$/;
const IMAGE_OR_PDF = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;

/**
 * Everything the rider app calls. A rider only ever sees their own offers and
 * tasks: every read and action is scoped by the rider id in the token.
 */
@ApiTags('rider-app')
@Controller('rider')
export class RiderAppController {
  constructor(
    private readonly auth: RiderAuthService,
    private readonly riders: RidersService,
    private readonly dispatch: DispatchService,
    private readonly flow: TaskFlowService,
    private readonly earnings: EarningsService,
    private readonly payouts: RiderPayoutsService,
    private readonly reasons: FailureReasonsService,
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
    private readonly verification: RiderVerificationService,
  ) {}

  // ------------------------------------------------------------ auth (public)

  @Post('auth/signup')
  @ApiOperation({ summary: 'Rider self sign-up; sends an OTP to the phone' })
  signup(@Body() dto: RiderSignupDto) {
    return this.auth.signup(dto);
  }

  @Post('auth/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify the phone OTP - completes sign-up (PENDING_APPROVAL) and signs in' })
  verify(@Body() dto: RiderVerifyDto, @Headers('user-agent') ua?: string) {
    return this.auth.verifyPhone(dto, ua);
  }

  @Post('auth/resend')
  @HttpCode(HttpStatus.OK)
  resend(@Body() dto: RiderPhoneDto) {
    return this.auth.resendVerification(dto);
  }

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mobile/email + password' })
  login(@Body() dto: RiderLoginDto, @Headers('user-agent') ua?: string) {
    return this.auth.login(dto, ua);
  }

  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RiderRefreshDto) {
    return this.auth.refresh(dto);
  }

  @Post('auth/forgot-password')
  @HttpCode(HttpStatus.OK)
  forgot(@Body() dto: RiderPhoneDto) {
    return this.auth.forgotPassword(dto);
  }

  @Post('auth/reset-password')
  @HttpCode(HttpStatus.OK)
  reset(@Body() dto: RiderResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  // ------------------------------------------------------------ session

  @Post('auth/logout')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  logout(@CurrentRider() r: RiderJwtPayload) {
    return this.auth.logout(r.sid);
  }

  @Get('me')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  async me(@CurrentRider() r: RiderJwtPayload) {
    const rider = await this.prisma.rider.findUnique({ where: { id: r.sub }, include: { warehouse: { select: { id: true, name: true } } } });
    return this.auth.publicRider(rider!);
  }

  @Patch('me')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update personal profile details (fullName, email, city, vehicleType, vehicleNumber, maxCarryKg)' })
  async updateProfile(@CurrentRider() r: RiderJwtPayload, @Body() dto: UpdateRiderProfileDto) {
    if (dto.email) {
      const email = dto.email.trim().toLowerCase();
      const existing = await this.prisma.rider.findFirst({ where: { email, id: { not: r.sub } } });
      if (existing) throw new ConflictException('This email is already registered with another account');
    }
    const updated = await this.prisma.rider.update({
      where: { id: r.sub },
      data: {
        ...(dto.fullName ? { fullName: dto.fullName.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email ? dto.email.trim().toLowerCase() : null } : {}),
        ...(dto.city !== undefined ? { city: dto.city ? dto.city.trim() : null } : {}),
        ...(dto.vehicleType !== undefined ? { vehicleType: dto.vehicleType } : {}),
        ...(dto.vehicleNumber !== undefined ? { vehicleNumber: dto.vehicleNumber ? dto.vehicleNumber.trim().toUpperCase() : null } : {}),
        ...(dto.maxCarryKg !== undefined ? { maxCarryKg: dto.maxCarryKg } : {}),
      },
      include: { warehouse: { select: { id: true, name: true } } },
    });
    return this.auth.publicRider(updated);
  }

  /** Photo of the licence / ID for approval (pending riders), or a profile photo. */
  @Post('me/document')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async document(@CurrentRider() r: RiderJwtPayload, @UploadedFile() file: UploadedFileLike, @Query('kind') kind?: string) {
    if (!file || !IMAGE.test(file.mimetype)) throw new BadRequestException('Send a photo (JPEG, PNG, WebP or HEIC) as field "file"');
    const stored = await this.storage.put(file, 'rider-documents');
    await this.prisma.rider.update({ where: { id: r.sub }, data: kind === 'photo' ? { photoUrl: stored.url } : { documentUrl: stored.url } });
    return stored;
  }

  // ------------------------------------------------------------ verification: documents, PCC, deposit

  @Get('verification')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Onboarding checklist: every required document (incl. PCC) with its status, the security deposit, and what is still missing' })
  myVerification(@CurrentRider() r: RiderJwtPayload) {
    return this.verification.summary(r.sub);
  }

  @Post('verification/files')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload one page of a document (photo or PDF); send the returned url with POST verification/documents' })
  async verificationFile(@UploadedFile() file: UploadedFileLike) {
    if (!file || !IMAGE_OR_PDF.test(file.mimetype)) throw new BadRequestException('Send a photo (JPEG, PNG, WebP or HEIC) or a PDF as field "file"');
    return this.storage.put(file, 'rider-documents');
  }

  @Post('verification/documents')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit (or re-submit after rejection) a document for review' })
  submitDocument(@CurrentRider() r: RiderJwtPayload, @Body() dto: SubmitRiderDocumentDto) {
    return this.verification.submit(r.sub, dto);
  }

  @Get('deposit')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Security deposit: required, paid, pending, status and the ledger' })
  myDeposit(@CurrentRider() r: RiderJwtPayload) {
    return this.verification.deposit(r.sub);
  }

  @Post('deposit/pay-order')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start an online payment of the pending deposit (or part of it)' })
  depositOrder(@CurrentRider() r: RiderJwtPayload, @Body() dto: CreateDepositOrderDto) {
    return this.verification.createDepositOrder(r.sub, dto);
  }

  @Post('deposit/pay-verify')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm an online deposit payment (gateway signature checked; safe to retry)' })
  depositVerify(@CurrentRider() r: RiderJwtPayload, @Body() dto: VerifyDepositPaymentDto) {
    return this.verification.verifyDepositPayment(r.sub, dto);
  }

  // ------------------------------------------------------------ availability & home

  @Post('availability')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Go online / offline (online needs an ACTIVE account with an outlet)' })
  availability(@CurrentRider() r: RiderJwtPayload, @Body() dto: AvailabilityDto) {
    return this.riders.setAvailability(r.sub, dto);
  }

  @Post('location')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  location(@CurrentRider() r: RiderJwtPayload, @Body() dto: LocationDto) {
    return this.riders.location(r.sub, dto);
  }

  @Get('dashboard')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Today's counters, active deliveries, open requests, cash in hand" })
  dashboard(@CurrentRider() r: RiderJwtPayload) {
    return this.riders.dashboard(r.sub);
  }

  // ------------------------------------------------------------ offers

  @Get('offers')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  offers(@CurrentRider() r: RiderJwtPayload) {
    return this.riders.offers(r.sub);
  }

  @Post('offers/:id/accept')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  accept(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string) {
    return this.dispatch.respond(r.sub, id, true);
  }

  @Post('offers/:id/reject')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  reject(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string, @Body() dto: RejectOfferDto) {
    return this.dispatch.respond(r.sub, id, false, dto.reason);
  }

  // ------------------------------------------------------------ tasks

  @Get('tasks')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  tasks(@CurrentRider() r: RiderJwtPayload, @Query('scope') scope?: string, @Query('page') page?: string) {
    return this.riders.tasksForRider(r.sub, scope === 'history' ? 'history' : 'active', Number(page) || 1);
  }

  @Get('tasks/:id')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  task(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string) {
    return this.riders.taskForRider(r.sub, id);
  }

  @Post('tasks/:id/arrived-pickup')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  arrivedPickup(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string, @Body() dto: LocationDto) {
    return this.flow.arrivedAtPickup(r.sub, id, dto);
  }

  @Post('tasks/:id/picked-up')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pickup confirmation - the order is dispatched' })
  pickedUp(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string, @Body() dto: LocationDto) {
    return this.flow.pickedUp(r.sub, id, dto);
  }

  @Post('tasks/:id/start')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Out for delivery' })
  start(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string, @Body() dto: LocationDto) {
    return this.flow.startTrip(r.sub, id, dto);
  }

  @Post('tasks/:id/arrived')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  arrived(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string, @Body() dto: LocationDto) {
    return this.flow.arrivedAtDrop(r.sub, id, dto);
  }

  @Post('tasks/:id/cod')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm the COD amount was collected (exact amount, cash or UPI)' })
  cod(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string, @Body() dto: CollectCodDto) {
    return this.flow.collectCod(r.sub, id, dto);
  }

  @Post('tasks/:id/deliver')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Complete with the customer's OTP (COD must be collected first when configured)" })
  deliver(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string, @Body() dto: DeliverDto) {
    return this.flow.deliver(r.sub, id, dto);
  }

  @Post('tasks/:id/fail')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Could not deliver: reason (+ note / photo as the reason requires)' })
  fail(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string, @Body() dto: FailDto) {
    return this.flow.fail(r.sub, id, dto);
  }

  @Post('tasks/:id/returned')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  returned(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string, @Body() dto: LocationDto) {
    return this.flow.returnedToStore(r.sub, id, dto);
  }

  @Post('tasks/:id/release')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hand a task back before pickup (it goes to another rider)' })
  release(@CurrentRider() r: RiderJwtPayload, @Param('id') id: string, @Body() dto: ReleaseDto) {
    return this.flow.release(r.sub, id, dto);
  }

  @Post('uploads/proof')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Photo proof for a failed delivery; send the returned url with /fail' })
  async proof(@UploadedFile() file: UploadedFileLike) {
    if (!file || !IMAGE.test(file.mimetype)) throw new BadRequestException('Send a photo (JPEG, PNG, WebP or HEIC) as field "file"');
    return this.storage.put(file, 'delivery-proofs');
  }

  @Get('failure-reasons')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  failureReasons() {
    return this.reasons.list(true);
  }

  // ------------------------------------------------------------ money & inbox

  @Get('earnings')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Today / this week / range totals and lines' })
  myEarnings(@CurrentRider() r: RiderJwtPayload, @Query('from') from?: string, @Query('to') to?: string) {
    return this.earnings.summary(r.sub, { from, to });
  }

  @Get('payouts')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'My pay settled so far and what is still unpaid' })
  myPayouts(@CurrentRider() r: RiderJwtPayload) {
    return this.payouts.forRider(r.sub);
  }

  @Get('cash')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  cash(@CurrentRider() r: RiderJwtPayload) {
    return this.riders.cashLedger(r.sub);
  }

  @Post('cash/settle-order')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Razorpay order to self-settle cash in hand' })
  createCashSettlementOrder(@CurrentRider() r: RiderJwtPayload, @Body() dto: CreateCashSettlementOrderDto) {
    return this.riders.createCashSettlementOrder(r.sub, dto.amount);
  }

  @Post('cash/settle-verify')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify Razorpay payment and settle rider cash' })
  verifyCashSettlement(@CurrentRider() r: RiderJwtPayload, @Body() dto: VerifyCashSettlementDto) {
    return this.riders.verifyCashSettlement(r.sub, dto);
  }

  @Get('notifications')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  notifications(@CurrentRider() r: RiderJwtPayload) {
    return this.riders.notifications(r.sub);
  }

  @Patch('notifications/read')
  @UseGuards(RiderJwtAuthGuard)
  @ApiBearerAuth()
  markRead(@CurrentRider() r: RiderJwtPayload, @Body() dto: MarkReadDto) {
    return this.riders.markRead(r.sub, dto.ids);
  }
}
